/**
 * Anchor API Functions
 *
 * Client-side functions that call the `/api/anchor/[provider]/` route handlers.
 * Used by Svelte components to interact with anchor services without importing
 * server-side code directly.
 *
 * All functions accept a `fetch` parameter — use the one from SvelteKit's
 * load functions or component context for proper SSR support.
 */

import type {
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    SavedFiatAccount,
    RegisteredFiatAccount,
    KycRequirements,
    KycSubmissionData,
    KycSubmissionResult,
    IdentityFields,
} from '$lib/anchors/types';

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
    country: string,
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
    email: string | undefined,
    country: string,
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
    email: string | undefined,
    country: string,
    options?: { supportsEmailLookup?: boolean; publicKey?: string },
): Promise<Customer> {
    const supportsEmailLookup = options?.supportsEmailLookup ?? false;

    if (supportsEmailLookup && email) {
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
    resourceId?: string;
}

/**
 * Get a price quote for currency exchange
 */
export async function getQuote(
    fetch: Fetch,
    provider: string,
    options: GetQuoteOptions,
): Promise<Quote> {
    const {
        fromCurrency,
        toCurrency,
        amount,
        direction = 'from',
        customerId,
        stellarAddress,
        resourceId,
    } = options;

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
    if (resourceId) {
        body.resourceId = resourceId;
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
    /** Identity for providers requiring per-transaction identity (e.g. PDAX). */
    identity?: IdentityFields;
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
    /** Registered fiat account ID to receive the payout. Register first via {@link registerFiatAccount} or the anchor's hosted onboarding UI. */
    fiatAccountId: string;
    memo?: string;
    /** Identity for providers requiring per-transaction identity (e.g. PDAX). */
    identity?: IdentityFields;
}

/**
 * Create an off-ramp transaction (crypto to fiat) using an already-registered fiat account.
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

/**
 * Register a new fiat account (bank account) for a customer
 */
export async function registerFiatAccount(
    fetch: Fetch,
    provider: string,
    customerId: string,
    account:
        | { type?: 'spei'; bankName?: string; clabe: string; beneficiary: string }
        | {
              type: 'pix';
              pixKey: string;
              pixKeyType?: string;
              taxId: string;
              accountHolderName: string;
          }
        | {
              type: 'instapay' | 'pesonet';
              bank_code: string;
              account_name: string;
              account_number: string;
          },
    publicKey?: string,
): Promise<RegisteredFiatAccount> {
    return postJson<RegisteredFiatAccount>(fetch, `/api/anchor/${provider}/fiat-accounts`, {
        customerId,
        publicKey,
        ...account,
    });
}

// =============================================================================
// KYC API
// =============================================================================

/**
 * Get KYC field and document requirements in the shared format
 */
export async function getKycFieldRequirements(
    fetch: Fetch,
    provider: string,
    country?: string,
): Promise<KycRequirements> {
    const params = country ? `&country=${encodeURIComponent(country)}` : '';
    return apiRequest<KycRequirements>(
        fetch,
        `/api/anchor/${provider}/kyc?type=requirements${params}`,
    );
}

/**
 * Submit KYC data and documents via the unified submit-kyc endpoint
 */
export async function submitKyc(
    fetch: Fetch,
    provider: string,
    customerId: string,
    data: KycSubmissionData,
): Promise<KycSubmissionResult> {
    const hasFiles = Object.values(data.documents).some((d) => d instanceof File);

    if (hasFiles) {
        const formData = new FormData();
        formData.append('customerId', customerId);
        formData.append('fields', JSON.stringify(data.fields));
        if (data.metadata) formData.append('metadata', JSON.stringify(data.metadata));
        for (const [key, value] of Object.entries(data.documents)) {
            if (value instanceof File) {
                formData.append(`doc_${key}`, value);
            } else {
                formData.append(`doc_${key}`, value);
            }
        }

        const response = await fetch(`/api/anchor/${provider}/kyc?type=submit-kyc`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const responseData = await response.json().catch(() => ({}));
            throw new ApiError(response.status, responseData.error || 'Failed to submit KYC');
        }

        return response.json();
    } else {
        return postJson<KycSubmissionResult>(fetch, `/api/anchor/${provider}/kyc?type=submit-kyc`, {
            customerId,
            data,
        });
    }
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
 * Get the KYC URL for embedded or redirect-based verification
 */
export async function getKycUrl(
    fetch: Fetch,
    provider: string,
    customerId: string,
    publicKey?: string,
    bankAccountId?: string,
): Promise<string> {
    let url = `/api/anchor/${provider}/kyc?customerId=${customerId}&type=iframe`;
    if (publicKey) url += `&publicKey=${encodeURIComponent(publicKey)}`;
    if (bankAccountId) url += `&bankAccountId=${encodeURIComponent(bankAccountId)}`;
    const data = await apiRequest<{ url: string }>(fetch, url);
    return data.url;
}

// =============================================================================
// Sandbox API (Testing Only)
// =============================================================================

/**
 * Simulate fiat received for an on-ramp order in sandbox mode (testing only).
 * Returns the HTTP status code from the anchor API (200, 400, or 404).
 */
export async function simulateFiatReceived(
    fetch: Fetch,
    provider: string,
    orderId: string,
): Promise<number> {
    const result = await postJson<{ success: boolean; statusCode: number }>(
        fetch,
        `/api/anchor/${provider}/sandbox`,
        { action: 'simulateFiatReceived', orderId },
    );
    return result.statusCode;
}
