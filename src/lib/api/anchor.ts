/**
 * Anchor API Functions
 *
 * Pure functions for interacting with anchor services (AlfredPay, etc.)
 * These are standalone and can be copied into any SvelteKit project.
 *
 * All functions accept a `fetch` parameter - use the one from SvelteKit's
 * load functions or component context for proper SSR support.
 */

import type {
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    SavedFiatAccount,
} from '$lib/anchors/types';
import type {
    AlfredPayKycRequirementsResponse,
    AlfredPayKycSubmissionResponse,
    AlfredPayKycFileType,
    AlfredPayKycFileResponse,
    AlfredPayKycSubmissionStatusResponse,
} from '$lib/anchors/alfredpay/types';

type Fetch = typeof fetch;

/**
 * API Error with status code and message
 */
export class ApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Helper to make API requests with consistent error handling
 */
async function apiRequest<T>(fetch: Fetch, url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, options);

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(response.status, data.error || `Request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Helper for POST requests with JSON body
 */
async function postJson<T>(fetch: Fetch, url: string, body: unknown): Promise<T> {
    return apiRequest<T>(fetch, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// =============================================================================
// Customer API
// =============================================================================

/**
 * Get a customer by email address
 * Returns null if customer doesn't exist
 */
export async function getCustomerByEmail(
    fetch: Fetch,
    provider: string,
    email: string,
    country: string = 'MX',
): Promise<Customer | null> {
    try {
        return await apiRequest<Customer>(
            fetch,
            `/api/anchor/${provider}/customers?email=${encodeURIComponent(email)}&country=${encodeURIComponent(country)}`,
        );
    } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
            return null;
        }
        throw err;
    }
}

/**
 * Create a new customer
 */
export async function createCustomer(
    fetch: Fetch,
    provider: string,
    email: string,
    country: string = 'MX',
    publicKey?: string,
): Promise<Customer> {
    return postJson<Customer>(fetch, `/api/anchor/${provider}/customers`, {
        email,
        country,
        publicKey,
    });
}

/**
 * Get or create a customer - tries to find existing first
 * When supportsEmailLookup is false, skips the GET (email lookup) and goes straight to POST (create).
 */
export async function getOrCreateCustomer(
    fetch: Fetch,
    provider: string,
    email: string,
    country: string = 'MX',
    options?: { supportsEmailLookup?: boolean; publicKey?: string },
): Promise<Customer> {
    const supportsEmailLookup = options?.supportsEmailLookup ?? true;

    if (supportsEmailLookup) {
        const existing = await getCustomerByEmail(fetch, provider, email, country);
        if (existing) {
            return existing;
        }
    }
    return createCustomer(fetch, provider, email, country, options?.publicKey);
}

// =============================================================================
// Quote API
// =============================================================================

export interface GetQuoteOptions {
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    direction?: 'from' | 'to';
    customerId?: string;
    stellarAddress?: string;
}

/**
 * Get a price quote for currency exchange
 */
export async function getQuote(
    fetch: Fetch,
    provider: string,
    options: GetQuoteOptions,
): Promise<Quote> {
    const { fromCurrency, toCurrency, amount, direction = 'from', customerId, stellarAddress } = options;

    const body: Record<string, string> = { fromCurrency, toCurrency };
    if (direction === 'from') {
        body.fromAmount = amount;
    } else {
        body.toAmount = amount;
    }
    if (customerId) {
        body.customerId = customerId;
    }
    if (stellarAddress) {
        body.stellarAddress = stellarAddress;
    }

    return postJson<Quote>(fetch, `/api/anchor/${provider}/quotes`, body);
}

// =============================================================================
// On-Ramp API (Fiat → Crypto)
// =============================================================================

export interface CreateOnRampOptions {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    memo?: string;
    bankAccountId?: string;
}

/**
 * Create an on-ramp transaction (fiat to crypto)
 * Returns payment instructions for the user
 */
export async function createOnRamp(
    fetch: Fetch,
    provider: string,
    options: CreateOnRampOptions,
): Promise<OnRampTransaction> {
    return postJson<OnRampTransaction>(fetch, `/api/anchor/${provider}/onramp`, options);
}

/**
 * Get the current status of an on-ramp transaction
 */
export async function getOnRampTransaction(
    fetch: Fetch,
    provider: string,
    transactionId: string,
): Promise<OnRampTransaction | null> {
    try {
        return await apiRequest<OnRampTransaction>(
            fetch,
            `/api/anchor/${provider}/onramp?transactionId=${transactionId}`,
        );
    } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
            return null;
        }
        throw err;
    }
}

// =============================================================================
// Off-Ramp API (Crypto → Fiat)
// =============================================================================

export interface CreateOffRampOptions {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    memo?: string;
    // For new bank account registration
    bankAccount?: {
        bankName: string;
        accountNumber: string;
        clabe: string;
        beneficiary: string;
    };
    // For existing fiat account
    fiatAccountId?: string;
    bankAccountInfo?: {
        bankName: string;
        accountNumber: string;
        clabe: string;
        beneficiary: string;
    };
}

/**
 * Create an off-ramp transaction (crypto to fiat)
 * If bankAccount is provided, registers a new fiat account first
 * If fiatAccountId is provided, uses existing account
 */
export async function createOffRamp(
    fetch: Fetch,
    provider: string,
    options: CreateOffRampOptions,
): Promise<OffRampTransaction> {
    return postJson<OffRampTransaction>(fetch, `/api/anchor/${provider}/offramp`, options);
}

/**
 * Get the current status of an off-ramp transaction
 */
export async function getOffRampTransaction(
    fetch: Fetch,
    provider: string,
    transactionId: string,
): Promise<OffRampTransaction | null> {
    try {
        return await apiRequest<OffRampTransaction>(
            fetch,
            `/api/anchor/${provider}/offramp?transactionId=${transactionId}`,
        );
    } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
            return null;
        }
        throw err;
    }
}

// =============================================================================
// Fiat Account API
// =============================================================================

/**
 * Get saved fiat accounts (bank accounts) for a customer
 */
export async function getFiatAccounts(
    fetch: Fetch,
    provider: string,
    customerId: string,
): Promise<SavedFiatAccount[]> {
    try {
        return await apiRequest<SavedFiatAccount[]>(
            fetch,
            `/api/anchor/${provider}/fiat-accounts?customerId=${customerId}`,
        );
    } catch {
        return [];
    }
}

// =============================================================================
// KYC API
// =============================================================================

/**
 * Get KYC requirements for a country
 */
export async function getKycRequirements(
    fetch: Fetch,
    provider: string,
    country: string = 'MX',
): Promise<AlfredPayKycRequirementsResponse> {
    return apiRequest<AlfredPayKycRequirementsResponse>(
        fetch,
        `/api/anchor/${provider}/kyc?type=requirements&country=${country}`,
    );
}

/**
 * Get a customer's KYC submission
 */
export async function getKycSubmission(
    fetch: Fetch,
    provider: string,
    customerId: string,
): Promise<AlfredPayKycSubmissionResponse | null> {
    const data = await apiRequest<{ submission: AlfredPayKycSubmissionResponse | null }>(
        fetch,
        `/api/anchor/${provider}/kyc?customerId=${customerId}&type=submission`,
    );
    return data.submission;
}

/**
 * Get the status of a KYC submission
 */
export async function getKycSubmissionStatus(
    fetch: Fetch,
    provider: string,
    customerId: string,
    submissionId: string,
): Promise<AlfredPayKycSubmissionStatusResponse> {
    return apiRequest<AlfredPayKycSubmissionStatusResponse>(
        fetch,
        `/api/anchor/${provider}/kyc?customerId=${customerId}&submissionId=${submissionId}&type=submission-status`,
    );
}

/**
 * Get a customer's current KYC status
 */
export async function getKycStatus(
    fetch: Fetch,
    provider: string,
    customerId: string,
    publicKey?: string,
): Promise<string> {
    let url = `/api/anchor/${provider}/kyc?customerId=${customerId}&type=status`;
    if (publicKey) url += `&publicKey=${encodeURIComponent(publicKey)}`;
    const data = await apiRequest<{ status: string }>(fetch, url);
    return data.status;
}

/**
 * Get the KYC iframe URL for embedded verification
 */
export async function getKycIframeUrl(
    fetch: Fetch,
    provider: string,
    customerId: string,
    publicKey?: string,
): Promise<string> {
    let url = `/api/anchor/${provider}/kyc?customerId=${customerId}&type=iframe`;
    if (publicKey) url += `&publicKey=${encodeURIComponent(publicKey)}`;
    const data = await apiRequest<{ url: string }>(fetch, url);
    return data.url;
}

export interface SubmitKycDataOptions {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    country: string;
    city: string;
    state: string;
    address: string;
    zipCode: string;
    nationalities: string[];
    email: string;
    dni: string;
}

/**
 * Submit KYC personal data
 */
export async function submitKycData(
    fetch: Fetch,
    provider: string,
    customerId: string,
    kycData: SubmitKycDataOptions,
): Promise<AlfredPayKycSubmissionResponse> {
    return postJson<AlfredPayKycSubmissionResponse>(
        fetch,
        `/api/anchor/${provider}/kyc?type=data`,
        { customerId, kycData },
    );
}

/**
 * Upload a KYC document file
 */
export async function submitKycFile(
    fetch: Fetch,
    provider: string,
    customerId: string,
    submissionId: string,
    fileType: AlfredPayKycFileType,
    file: File,
): Promise<AlfredPayKycFileResponse> {
    const formData = new FormData();
    formData.append('customerId', customerId);
    formData.append('submissionId', submissionId);
    formData.append('fileType', fileType);
    formData.append('file', file);

    const response = await fetch(`/api/anchor/${provider}/kyc?type=file`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new ApiError(response.status, data.error || 'Failed to upload file');
    }

    return response.json();
}

/**
 * Finalize/submit a KYC submission for review
 */
export async function finalizeKycSubmission(
    fetch: Fetch,
    provider: string,
    customerId: string,
    submissionId: string,
): Promise<void> {
    await postJson<{ success: boolean }>(fetch, `/api/anchor/${provider}/kyc?type=submit`, {
        customerId,
        submissionId,
    });
}

// =============================================================================
// BlindPay-specific API
// =============================================================================

/**
 * Get a BlindPay ToS acceptance URL
 */
export async function getBlindPayTosUrl(
    fetch: Fetch,
    provider: string,
    redirectUrl?: string,
): Promise<string> {
    let url = `/api/anchor/${provider}/kyc?type=tos`;
    if (redirectUrl) url += `&redirectUrl=${encodeURIComponent(redirectUrl)}`;
    const data = await apiRequest<{ url: string }>(fetch, url);
    return data.url;
}

/**
 * Create a BlindPay receiver (combined customer + KYC submission)
 */
export async function createBlindPayReceiver(
    fetch: Fetch,
    provider: string,
    receiverData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    return postJson<Record<string, unknown>>(
        fetch,
        `/api/anchor/${provider}/kyc?type=receiver`,
        receiverData,
    );
}

/**
 * Register a blockchain wallet for a BlindPay receiver
 */
export async function registerBlockchainWallet(
    fetch: Fetch,
    provider: string,
    receiverId: string,
    address: string,
    name?: string,
): Promise<Record<string, unknown>> {
    return postJson<Record<string, unknown>>(
        fetch,
        `/api/anchor/${provider}/blockchain-wallets`,
        { receiverId, address, name },
    );
}

/**
 * Submit a signed Stellar payout transaction to BlindPay
 */
export async function submitSignedPayout(
    fetch: Fetch,
    provider: string,
    quoteId: string,
    signedTransaction: string,
    senderWalletAddress: string,
): Promise<Record<string, unknown>> {
    return postJson<Record<string, unknown>>(
        fetch,
        `/api/anchor/${provider}/payout-submit`,
        { quoteId, signedTransaction, senderWalletAddress },
    );
}

// =============================================================================
// Sandbox API (Testing Only)
// =============================================================================

/**
 * Complete KYC in sandbox mode (testing only)
 */
export async function completeKycSandbox(
    fetch: Fetch,
    provider: string,
    submissionId: string,
): Promise<void> {
    await postJson<{ success: boolean }>(fetch, `/api/anchor/${provider}/sandbox`, {
        action: 'completeKyc',
        submissionId,
    });
}
