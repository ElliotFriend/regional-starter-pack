/**
 * Etherfuse API Client
 *
 * Server-side only — authenticates with an API key that must never be exposed
 * to the browser. Implements the shared {@link Anchor} interface so it can be
 * swapped with any other anchor provider.
 *
 * @example
 * ```ts
 * import { EtherfuseClient } from '$lib/anchors/etherfuse';
 *
 * const etherfuse = new EtherfuseClient({
 *     apiKey: process.env.ETHERFUSE_API_KEY,
 *     baseUrl: process.env.ETHERFUSE_BASE_URL,
 * });
 *
 * const customer = await etherfuse.createCustomer({ email: 'user@example.com' });
 * ```
 */

import type {
    Anchor,
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    CreateCustomerInput,
    GetQuoteInput,
    CreateOnRampInput,
    CreateOffRampInput,
    RegisterFiatAccountInput,
    RegisteredFiatAccount,
    SavedFiatAccount,
    KycStatus,
    TransactionStatus,
} from '../types';
import { AnchorError } from '../types';
import type {
    EtherfuseConfig,
    EtherfuseOnboardingResponse,
    EtherfuseCustomerResponse,
    EtherfuseQuoteResponse,
    EtherfuseCreateOnRampResponse,
    EtherfuseCreateOffRampResponse,
    EtherfuseOrderResponse,
    EtherfuseKycStatusResponse,
    EtherfuseBankAccountResponse,
    EtherfuseBankAccountListResponse,
    EtherfuseAssetsResponse,
    EtherfuseErrorResponse,
    EtherfuseOrderStatus,
    EtherfuseKycIdentityRequest,
    EtherfuseKycDocumentRequest,
} from './types';

/**
 * Client for the Etherfuse fiat on/off ramp API.
 *
 * Supports customer management, KYC verification, currency quotes, on-ramp
 * (MXN → CETES) and off-ramp (CETES → MXN) transactions on the Stellar
 * network via Mexico's SPEI payment rail.
 */
export class EtherfuseClient implements Anchor {
    readonly name = 'etherfuse';
    private readonly config: EtherfuseConfig;
    private readonly blockchain: string;

    /** @param config - API key, base URL, and optional defaults. */
    constructor(config: EtherfuseConfig) {
        this.config = config;
        this.blockchain = config.defaultBlockchain || 'stellar';
    }

    /**
     * Resolve a currency pair for the Etherfuse API by looking up the full
     * asset identifiers via `GET /ramp/assets` (e.g. `CETES` → `CETES:GCRYUGD5...`).
     * Codes that already contain `:` pass through unchanged.
     *
     * @param fromCurrency - Source currency code or `CODE:ISSUER` identifier.
     * @param toCurrency - Destination currency code or `CODE:ISSUER` identifier.
     * @param wallet - Stellar public key used to fetch personalized asset data.
     * @returns A tuple of `[resolvedFrom, resolvedTo]` in `CODE:ISSUER` format.
     */
    private async resolveAssetPair(
        fromCurrency: string,
        toCurrency: string,
        wallet: string,
    ): Promise<[string, string]> {
        if (fromCurrency.includes(':') && toCurrency.includes(':')) {
            return [fromCurrency, toCurrency];
        }

        const response = await this.getAssets(this.blockchain, 'mxn', wallet);
        const identifiers = new Map(
            response.assets.map((a) => [a.symbol, a.identifier]),
        );

        return [
            identifiers.get(fromCurrency) ?? fromCurrency,
            identifiers.get(toCurrency) ?? toCurrency,
        ];
    }

    /**
     * Send an authenticated JSON request to the Etherfuse API.
     *
     * @typeParam T - Expected response body type.
     * @param method - HTTP method.
     * @param endpoint - API path appended to {@link EtherfuseConfig.baseUrl}.
     * @param body - Optional JSON request body.
     * @returns Parsed response body.
     * @throws {AnchorError} On non-2xx responses.
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;

        console.log(`[Etherfuse] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.config.apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Etherfuse] Error ${response.status}:`, errorText);

            let errorData: EtherfuseErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as EtherfuseErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `Etherfuse API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const text = await response.text();
        console.log(`[Etherfuse] Response:`, text || '(empty)');

        if (!text) {
            return undefined as T;
        }

        return JSON.parse(text) as T;
    }

    // =========================================================================
    // Private mapping helpers
    // =========================================================================

    /**
     * Map an Etherfuse order status to the shared {@link TransactionStatus}.
     *
     * @param status - Raw status string from the Etherfuse API.
     * @returns The corresponding shared {@link TransactionStatus}.
     */
    private mapOrderStatus(status: EtherfuseOrderStatus): TransactionStatus {
        const statusMap: Record<EtherfuseOrderStatus, TransactionStatus> = {
            created: 'pending',
            funded: 'processing',
            completed: 'completed',
            failed: 'failed',
            refunded: 'refunded',
            canceled: 'cancelled',
        };
        return statusMap[status] || 'pending';
    }

    /**
     * Map an Etherfuse KYC status to the shared {@link KycStatus}.
     *
     * @param status - Raw KYC status string from the Etherfuse API.
     * @returns The corresponding shared {@link KycStatus}.
     */
    private mapKycStatus(status: string): KycStatus {
        const statusMap: Record<string, KycStatus> = {
            not_started: 'not_started',
            proposed: 'pending',
            approved: 'approved',
            rejected: 'rejected',
        };
        return statusMap[status] || 'not_started';
    }

    /**
     * Map an on-ramp order response to the shared {@link OnRampTransaction} type.
     *
     * @param response - Raw order response from `GET /ramp/order/{id}`.
     * @returns The mapped {@link OnRampTransaction}.
     */
    private mapOnRampTransaction(response: EtherfuseOrderResponse): OnRampTransaction {
        return {
            id: response.orderId,
            customerId: response.customerId,
            quoteId: '',
            status: this.mapOrderStatus(response.status),
            fromAmount: response.amountInFiat || '',
            fromCurrency: '',
            toAmount: response.amountInTokens || '',
            toCurrency: '',
            stellarAddress: '',
            feeBps: response.feeBps,
            feeAmount: response.feeAmountInFiat,
            paymentInstructions: response.depositClabe
                ? {
                      type: 'spei' as const,
                      bankName: '',
                      accountNumber: '',
                      clabe: response.depositClabe,
                      beneficiary: '',
                      reference: '',
                      amount: response.amountInFiat || '',
                      currency: '',
                  }
                : undefined,
            stellarTxHash: response.confirmedTxSignature,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    /**
     * Map an off-ramp order response to the shared {@link OffRampTransaction} type.
     *
     * The `burnTransaction` field from the GET response is mapped to
     * {@link OffRampTransaction.signableTransaction | signableTransaction}. It may be
     * `undefined` if the anchor has not yet prepared the transaction for signing.
     *
     * @param response - Raw order response from `GET /ramp/order/{id}`.
     * @param bankAccountInfo - Optional bank details to attach (not returned by the API).
     * @returns The mapped {@link OffRampTransaction}.
     */
    private mapOffRampTransaction(
        response: EtherfuseOrderResponse,
        bankAccountInfo?: { bankName: string; clabe: string; beneficiary: string },
    ): OffRampTransaction {
        return {
            id: response.orderId,
            customerId: response.customerId,
            quoteId: '',
            status: this.mapOrderStatus(response.status),
            fromAmount: response.amountInTokens || '',
            fromCurrency: '',
            toAmount: response.amountInFiat || '',
            toCurrency: '',
            stellarAddress: '',
            feeBps: response.feeBps,
            feeAmount: response.feeAmountInFiat,
            bankAccount: {
                id: response.bankAccountId,
                bankName: bankAccountInfo?.bankName || '',
                accountNumber: '',
                clabe: bankAccountInfo?.clabe || '',
                beneficiary: bankAccountInfo?.beneficiary || '',
            },
            stellarTxHash: response.confirmedTxSignature,
            signableTransaction: response.burnTransaction,
            statusPage: response.statusPage,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    // =========================================================================
    // Anchor interface implementation
    // =========================================================================

    /**
     * Create a new customer via the Etherfuse onboarding flow.
     *
     * Generates a partner-side UUID for the customer and requests a presigned
     * onboarding URL. The URL is stored internally but not directly returned —
     * use {@link getKycIframeUrl} to retrieve it.
     *
     * @param input - Customer email and Stellar public key.
     * @returns A {@link Customer} with `kycStatus` set to `"not_started"`.
     * @throws {AnchorError} If `publicKey` is missing or on API failure.
     */
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        if (!input.publicKey) {
            throw new AnchorError(
                'publicKey is required to create an Etherfuse customer',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }

        const customerId = crypto.randomUUID();
        const bankAccountId = crypto.randomUUID();
        const publicKey = input.publicKey;

        try {
            await this.request<EtherfuseOnboardingResponse>(
                'POST',
                '/ramp/onboarding-url',
                {
                    customerId,
                    bankAccountId,
                    email: input.email,
                    publicKey,
                    blockchain: this.blockchain,
                },
            );

            const now = new Date().toISOString();
            return {
                id: customerId,
                email: input.email,
                kycStatus: 'not_started',
                bankAccountId,
                createdAt: now,
                updatedAt: now,
            };
        } catch (err) {
            // 409 means this public key is already registered — parse existing customer ID
            if (err instanceof AnchorError && err.statusCode === 409) {
                const match = err.message.match(/see org:\s*([0-9a-f-]+)/i);
                if (match) {
                    const existingCustomerId = match[1];
                    console.log(`[Etherfuse] Public key already registered, using existing customer: ${existingCustomerId}`);

                    // Fetch the customer's existing bank accounts from Etherfuse
                    let existingBankAccountId: string | undefined;
                    try {
                        const accounts = await this.getFiatAccounts(existingCustomerId);
                        if (accounts.length > 0) {
                            existingBankAccountId = accounts[0].id;
                            console.log(`[Etherfuse] Found existing bank account: ${existingBankAccountId}`);
                        }
                    } catch (bankErr) {
                        console.warn(`[Etherfuse] Could not fetch bank accounts for recovered customer:`, bankErr);
                    }

                    const now = new Date().toISOString();
                    return {
                        id: existingCustomerId,
                        email: input.email,
                        kycStatus: 'not_started', // Will be updated by subsequent KYC status check
                        bankAccountId: existingBankAccountId,
                        createdAt: now,
                        updatedAt: now,
                    };
                }
            }
            throw err;
        }
    }

    /**
     * Fetch a customer by their Etherfuse ID.
     * @param customerId - The customer's unique identifier.
     * @returns The {@link Customer}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getCustomer(customerId: string): Promise<Customer | null> {
        try {
            const response = await this.request<EtherfuseCustomerResponse>(
                'GET',
                `/ramp/customer/${customerId}`,
            );
            return {
                id: response.customerId,
                email: response.email,
                kycStatus: 'not_started', // KYC status requires separate call with pubkey
                createdAt: response.createdAt,
                updatedAt: response.updatedAt,
            };
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Look up a customer by email.
     *
     * Etherfuse does not support customer lookup by email. This method always
     * throws an {@link AnchorError} with status 501.
     *
     * @throws {AnchorError} Always — NOT_SUPPORTED.
     */
    async getCustomerByEmail(
        _email: string, // eslint-disable-line @typescript-eslint/no-unused-vars
        _country?: string // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<Customer | null> {
        throw new AnchorError(
            'Etherfuse does not support customer lookup by email',
            'NOT_SUPPORTED',
            501,
        );
    }

    /**
     * Request a currency conversion quote.
     *
     * Generates a partner-side UUID for the quote. Currency codes for crypto
     * assets use the `CODE:ISSUER` format expected by the Etherfuse API.
     *
     * @param input - Currency pair and amount.
     * @returns A {@link Quote} with rate, fee, and expiration.
     * @throws {AnchorError} On API failure.
     */
    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const quoteId = crypto.randomUUID();
        const [sourceAsset, targetAsset] = await this.resolveAssetPair(input.fromCurrency, input.toCurrency, input.stellarAddress || '');

        // Determine ramp direction: if the source resolved to a CODE:ISSUER it's crypto → offramp
        const type = sourceAsset.includes(':') ? 'offramp' : 'onramp';

        const response = await this.request<EtherfuseQuoteResponse>('POST', '/ramp/quote', {
            quoteId,
            customerId: input.customerId || '',
            blockchain: this.blockchain,
            quoteAssets: { type, sourceAsset, targetAsset },
            sourceAmount: String(input.fromAmount || input.toAmount || ''),
        });

        return {
            id: response.quoteId,
            fromCurrency: response.quoteAssets.sourceAsset,
            toCurrency: response.quoteAssets.targetAsset,
            fromAmount: response.sourceAmount,
            toAmount: response.destinationAmountAfterFee || response.destinationAmount,
            exchangeRate: response.exchangeRate,
            fee: response.feeAmount || '0',
            expiresAt: response.expiresAt,
            createdAt: response.createdAt,
        };
    }

    /**
     * Create an on-ramp transaction (fiat MXN → CETES on Stellar).
     *
     * The returned transaction includes SPEI {@link OnRampTransaction.paymentInstructions | paymentInstructions}
     * that the user must follow to fund the transaction.
     *
     * @param input - Customer, quote, amount, and destination Stellar address.
     * @returns The created {@link OnRampTransaction}.
     * @throws {AnchorError} On API failure.
     */
    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        const orderId = crypto.randomUUID();

        let bankAccountId = input.bankAccountId;
        if (!bankAccountId && input.customerId) {
            const accounts = await this.getFiatAccounts(input.customerId);
            if (accounts.length > 0) {
                bankAccountId = accounts[0].id;
            }
        }

        const response = await this.request<EtherfuseCreateOnRampResponse>(
            'POST',
            '/ramp/order',
            {
                orderId,
                bankAccountId,
                publicKey: input.stellarAddress,
                quoteId: input.quoteId,
                memo: input.memo || undefined,
            },
        );

        const { onramp } = response;

        return {
            id: onramp.orderId,
            customerId: input.customerId,
            quoteId: input.quoteId,
            status: 'pending' as const,
            fromAmount: input.amount,
            fromCurrency: input.fromCurrency,
            toAmount: '',
            toCurrency: input.toCurrency,
            stellarAddress: input.stellarAddress,
            paymentInstructions: {
                type: 'spei' as const,
                bankName: '',
                accountNumber: '',
                clabe: onramp.depositClabe,
                beneficiary: '',
                reference: '',
                amount: onramp.depositAmount,
                currency: input.fromCurrency,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    /**
     * Fetch the current state of an on-ramp transaction.
     * @param transactionId - The order's unique identifier.
     * @returns The {@link OnRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        try {
            const response = await this.request<EtherfuseOrderResponse>(
                'GET',
                `/ramp/order/${transactionId}`,
            );
            return this.mapOnRampTransaction(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Register a bank account (SPEI) for a customer.
     *
     * Generates a partner-side UUID for the bank account.
     *
     * @param input - Customer ID and bank account details.
     * @returns The newly registered {@link RegisteredFiatAccount}.
     * @throws {AnchorError} On API failure.
     */
    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const bankAccountId = crypto.randomUUID();

        const response = await this.request<EtherfuseBankAccountResponse>(
            'POST',
            '/ramp/bank-account',
            {
                bankAccountId,
                customerId: input.customerId,
                bankName: input.bankAccount.bankName,
                clabe: input.bankAccount.clabe,
                beneficiary: input.bankAccount.beneficiary,
            },
        );

        return {
            id: response.bankAccountId,
            customerId: response.customerId,
            type: 'SPEI',
            status: response.status,
            createdAt: response.createdAt,
        };
    }

    /**
     * List all registered bank accounts for a customer.
     * @param customerId - The customer's unique identifier.
     * @returns Array of {@link SavedFiatAccount} objects.
     * @throws {AnchorError} On API failure.
     */
    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        try {
            const response = await this.request<EtherfuseBankAccountListResponse>(
                'POST',
                `/ramp/customer/${customerId}/bank-accounts`,
                {},
            );

            return response.items.map((account) => ({
                id: account.bankAccountId,
                type: 'SPEI',
                accountNumber: account.abbrClabe,
                bankName: '',
                accountHolderName: '',
                createdAt: account.createdAt,
            }));
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Create an off-ramp transaction (CETES on Stellar → fiat MXN via SPEI).
     *
     * The returned transaction will have `signableTransaction` set to `undefined`
     * because the Etherfuse API does not include the burn transaction XDR in the
     * creation response. Poll with {@link getOffRampTransaction} until
     * `signableTransaction` becomes available, then have the user sign and submit it.
     *
     * @param input - Customer, quote, amount, fiat account ID, and source Stellar address.
     * @returns The created {@link OffRampTransaction} (with `signableTransaction: undefined`).
     * @throws {AnchorError} On API failure.
     */
    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const orderId = crypto.randomUUID();

        let bankAccountId = input.fiatAccountId;
        if (!bankAccountId && input.customerId) {
            const accounts = await this.getFiatAccounts(input.customerId);
            if (accounts.length > 0) {
                bankAccountId = accounts[0].id;
            }
        }

        const response = await this.request<EtherfuseCreateOffRampResponse>(
            'POST',
            '/ramp/order',
            {
                orderId,
                bankAccountId,
                publicKey: input.stellarAddress,
                quoteId: input.quoteId,
                memo: input.memo || undefined,
            },
        );

        const { offramp } = response;

        return {
            id: offramp.orderId,
            customerId: input.customerId,
            quoteId: input.quoteId,
            status: 'pending' as const,
            fromAmount: input.amount,
            fromCurrency: input.fromCurrency,
            toAmount: '',
            toCurrency: input.toCurrency,
            stellarAddress: input.stellarAddress,
            bankAccount: {
                id: bankAccountId || '',
                bankName: input.bankAccountInfo?.bankName || '',
                accountNumber: '',
                clabe: input.bankAccountInfo?.clabe || '',
                beneficiary: input.bankAccountInfo?.beneficiary || '',
            },
            signableTransaction: undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    /**
     * Fetch the current state of an off-ramp transaction.
     * @param transactionId - The order's unique identifier.
     * @returns The {@link OffRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const response = await this.request<EtherfuseOrderResponse>(
                'GET',
                `/ramp/order/${transactionId}`,
            );
            return this.mapOffRampTransaction(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get a presigned URL for the Etherfuse onboarding/KYC flow.
     *
     * Calls the onboarding endpoint again to generate a fresh presigned URL.
     *
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key for this customer.
     * @param bankAccountId - Bank account to associate; a random UUID is generated if omitted.
     * @returns The onboarding URL string.
     * @throws {AnchorError} If `publicKey` is missing or on API failure.
     */
    async getKycIframeUrl(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string> {
        if (!publicKey) {
            throw new AnchorError(
                'publicKey is required for KYC onboarding',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }

        const resolvedBankAccountId = bankAccountId || crypto.randomUUID();

        const response = await this.request<EtherfuseOnboardingResponse>(
            'POST',
            '/ramp/onboarding-url',
            {
                customerId,
                bankAccountId: resolvedBankAccountId,
                publicKey,
                blockchain: this.blockchain,
            },
        );

        return response.presigned_url;
    }

    /**
     * Get the current KYC status for a customer.
     *
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key for this customer.
     * @returns The customer's {@link KycStatus}.
     * @throws {AnchorError} If `publicKey` is missing or the API fails.
     */
    async getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus> {
        if (!publicKey) {
            throw new AnchorError(
                'publicKey is required for KYC status checks',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }

        const response = await this.request<EtherfuseKycStatusResponse>(
            'GET',
            `/ramp/customer/${customerId}/kyc/${publicKey}`,
        );

        return this.mapKycStatus(response.status);
    }

    // =========================================================================
    // Etherfuse-specific methods (beyond Anchor interface)
    // =========================================================================

    /**
     * List rampable assets available on Etherfuse.
     *
     * @param blockchain - Blockchain filter (e.g. `"stellar"`).
     * @param currency - Fiat currency filter (e.g. `"MXN"`).
     * @param wallet - Optional wallet public key for personalized results.
     * @returns The {@link EtherfuseAssetsResponse} with available assets.
     * @throws {AnchorError} On API failure.
     */
    async getAssets(
        blockchain?: string,
        currency?: string,
        wallet?: string,
    ): Promise<EtherfuseAssetsResponse> {
        const params = new URLSearchParams();
        if (blockchain) params.set('blockchain', blockchain);
        if (currency) params.set('currency', currency);
        if (wallet) params.set('wallet', wallet);

        const query = params.toString();
        const endpoint = `/ramp/assets${query ? `?${query}` : ''}`;

        return this.request<EtherfuseAssetsResponse>('GET', endpoint);
    }

    /**
     * Submit programmatic KYC identity data for a customer.
     *
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key associated with the customer.
     * @param identity - Personal information fields.
     * @returns The API response.
     * @throws {AnchorError} On API failure.
     */
    async submitKycIdentity(
        customerId: string,
        publicKey: string,
        identity: EtherfuseKycIdentityRequest,
    ): Promise<unknown> {
        return this.request(
            'POST',
            `/ramp/customer/${customerId}/kyc/${publicKey}/identity`,
            identity,
        );
    }

    /**
     * Upload KYC identity documents for a customer.
     *
     * Documents should be Base64-encoded images.
     *
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key associated with the customer.
     * @param documents - Array of document submissions.
     * @returns The API response.
     * @throws {AnchorError} On API failure.
     */
    async submitKycDocuments(
        customerId: string,
        publicKey: string,
        documents: EtherfuseKycDocumentRequest[],
    ): Promise<unknown> {
        return this.request(
            'POST',
            `/ramp/customer/${customerId}/kyc/${publicKey}/documents`,
            { documents },
        );
    }

    /**
     * Accept all legal agreements via a presigned onboarding URL.
     *
     * @param presignedUrl - The presigned URL from the onboarding response.
     * @returns The API response.
     * @throws {AnchorError} On API failure.
     */
    async acceptAgreements(presignedUrl: string): Promise<unknown> {
        console.log(`[Etherfuse] POST ${presignedUrl} (accept agreements)`);

        const response = await fetch(presignedUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.config.apiKey,
            },
            body: JSON.stringify({ acceptAll: true }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Etherfuse] Error ${response.status}:`, errorText);
            throw new AnchorError(
                errorText || `Etherfuse API error: ${response.status}`,
                'AGREEMENT_ERROR',
                response.status,
            );
        }

        return response.json();
    }

    /**
     * Simulate a fiat payment received event. **Sandbox only.**
     *
     * Useful for testing on-ramp flows without sending real SPEI transfers.
     *
     * @param orderId - The order to simulate payment for.
     * @returns The HTTP status code from the Etherfuse API (200, 400, or 404).
     */
    async simulateFiatReceived(orderId: string): Promise<number> {
        const url = `${this.config.baseUrl}/ramp/order/fiat_received`;
        console.log(`[Etherfuse] POST ${url}`, JSON.stringify({ orderId }));

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.config.apiKey,
            },
            body: JSON.stringify({ orderId }),
        });

        const text = await response.text();
        console.log(`[Etherfuse] Response (${response.status}):`, text || '(empty)');

        return response.status;
    }
}
