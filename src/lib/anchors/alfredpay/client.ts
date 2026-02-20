/**
 * AlfredPay API Client
 *
 * Server-side only — authenticates with API keys that must never be exposed to
 * the browser. Implements the shared {@link Anchor} interface so it can be
 * swapped with any other anchor provider.
 *
 * @example
 * ```ts
 * import { AlfredPayClient } from '$lib/anchors/alfredpay';
 *
 * const alfred = new AlfredPayClient({
 *     apiKey: process.env.ALFREDPAY_API_KEY,
 *     apiSecret: process.env.ALFREDPAY_API_SECRET,
 *     baseUrl: process.env.ALFREDPAY_BASE_URL,
 * });
 *
 * const customer = await alfred.createCustomer({ email: 'user@example.com' });
 * ```
 */

import type {
    Anchor,
    AnchorCapabilities,
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
    PaymentInstructions,
} from '../types';
import { AnchorError } from '../types';
import type {
    AlfredPayConfig,
    AlfredPayCreateCustomerResponse,
    AlfredPayCustomerResponse,
    AlfredPayQuoteResponse,
    AlfredPayOnRampResponse,
    AlfredPayOnRampFlatResponse,
    AlfredPayOffRampResponse,
    AlfredPayErrorResponse,
    AlfredPayKycRequirementsResponse,
    AlfredPayKycSubmissionRequest,
    AlfredPayKycSubmissionResponse,
    AlfredPayKycFileType,
    AlfredPayKycFileResponse,
    AlfredPayKycSubmissionStatusResponse,
    AlfredPayFiatAccountResponse,
    AlfredPayFiatAccountListItem,
    AlfredPaySandboxWebhookRequest,
} from './types';

/**
 * Client for the AlfredPay fiat on/off ramp API.
 *
 * Supports customer management, KYC verification, currency quotes, on-ramp
 * (MXN → USDC) and off-ramp (USDC → MXN) transactions on the Stellar network
 * via Mexico's SPEI payment rail.
 */
export class AlfredPayClient implements Anchor {
    readonly name = 'alfredpay';
    readonly capabilities: AnchorCapabilities = {
        emailLookup: true,
        kycUrl: true,
    };
    private readonly config: AlfredPayConfig;

    /** @param config - API credentials and base URL. */
    constructor(config: AlfredPayConfig) {
        this.config = config;
    }

    /**
     * Send an authenticated JSON request to the AlfredPay API.
     *
     * @typeParam T - Expected response body type.
     * @param method - HTTP method.
     * @param endpoint - API path appended to {@link AlfredPayConfig.baseUrl}.
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

        console.log(`[AlfredPay] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.config.apiKey,
                'api-secret': this.config.apiSecret,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AlfredPay] Error ${response.status}:`, errorText);

            let errorData: AlfredPayErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as AlfredPayErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `AlfredPay API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const data = await response.json();
        console.log(`[AlfredPay] Response:`, JSON.stringify(data));
        return data as T;
    }

    /**
     * Map an AlfredPay customer response to the shared {@link Customer} type.
     * @param response - Raw API response from `GET /customers/:id`.
     */
    private mapCustomer(response: AlfredPayCustomerResponse): Customer {
        return {
            id: response.id,
            email: response.email,
            kycStatus: response.kyc_status as KycStatus,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
        };
    }

    /**
     * Map an AlfredPay quote response to the shared {@link Quote} type.
     * Sums all fee line items into a single total.
     * @param response - Raw API response from `POST /quotes`.
     */
    private mapQuote(response: AlfredPayQuoteResponse): Quote {
        // Calculate total fee from fees array
        const totalFee = response.fees
            .reduce((sum, fee) => sum + parseFloat(fee.amount), 0)
            .toFixed(2);

        return {
            id: response.quoteId,
            fromCurrency: response.fromCurrency,
            toCurrency: response.toCurrency,
            fromAmount: response.fromAmount,
            toAmount: response.toAmount,
            exchangeRate: response.rate,
            fee: totalFee,
            expiresAt: response.expiration,
            createdAt: new Date().toISOString(),
        };
    }

    /**
     * Map AlfredPay fiat payment instructions to the shared {@link PaymentInstructions} type.
     * @param instructions - Raw SPEI payment instruction fields.
     * @param amount - Transfer amount.
     * @param currency - Transfer currency code.
     */
    private mapPaymentInstructions(
        instructions: AlfredPayOnRampResponse['fiatPaymentInstructions'],
        amount: string,
        currency: string,
    ): PaymentInstructions {
        return {
            type: 'spei',
            clabe: instructions.clabe,
            bankName: instructions.bankName,
            beneficiary: instructions.accountHolderName,
            reference: instructions.reference,
            amount: amount,
            currency: currency,
        };
    }

    /**
     * Map a nested on-ramp response (from `POST /onramp`) to the shared {@link OnRampTransaction} type.
     * @param response - Raw API response containing `transaction` and `fiatPaymentInstructions`.
     */
    private mapOnRampTransaction(response: AlfredPayOnRampResponse): OnRampTransaction {
        const tx = response.transaction;
        const statusMap: Record<string, OnRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: tx.transactionId,
            customerId: tx.customerId,
            quoteId: tx.quoteId,
            status: statusMap[tx.status] || 'pending',
            fromAmount: tx.fromAmount,
            fromCurrency: tx.fromCurrency,
            toAmount: tx.toAmount,
            toCurrency: tx.toCurrency,
            stellarAddress: tx.depositAddress,
            paymentInstructions: this.mapPaymentInstructions(
                response.fiatPaymentInstructions,
                tx.fromAmount,
                tx.fromCurrency,
            ),
            stellarTxHash: tx.txHash || undefined,
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt,
        };
    }

    /**
     * Map a flat on-ramp response (from `GET /onramp/:id`) to the shared {@link OnRampTransaction} type.
     * @param response - Raw API response with transaction fields at the top level.
     */
    private mapOnRampFlatTransaction(response: AlfredPayOnRampFlatResponse): OnRampTransaction {
        const statusMap: Record<string, OnRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: response.transactionId,
            customerId: response.customerId,
            quoteId: response.quoteId,
            status: statusMap[response.status] || 'pending',
            fromAmount: response.fromAmount,
            fromCurrency: response.fromCurrency,
            toAmount: response.toAmount,
            toCurrency: response.toCurrency,
            stellarAddress: response.depositAddress,
            paymentInstructions: this.mapPaymentInstructions(
                response.fiatPaymentInstructions,
                response.fromAmount,
                response.fromCurrency,
            ),
            stellarTxHash: response.txHash || undefined,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    /**
     * Map an off-ramp response to the shared {@link OffRampTransaction} type.
     * @param response - Raw API response from `POST /offramp` or `GET /offramp/:id`.
     */
    private mapOffRampTransaction(response: AlfredPayOffRampResponse): OffRampTransaction {
        const statusMap: Record<string, OffRampTransaction['status']> = {
            CREATED: 'pending',
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed',
            EXPIRED: 'expired',
            CANCELLED: 'cancelled',
        };

        return {
            id: response.transactionId,
            customerId: response.customerId,
            quoteId: response.quote?.quoteId || '',
            status: statusMap[response.status] || 'pending',
            fromAmount: response.fromAmount,
            fromCurrency: response.fromCurrency,
            toAmount: response.toAmount,
            toCurrency: response.toCurrency,
            stellarAddress: response.depositAddress,
            fiatAccount: response.fiatAccountId
                ? {
                      id: response.fiatAccountId,
                      type: 'spei',
                      label: 'SPEI Account',
                  }
                : undefined,
            memo: response.memo,
            stellarTxHash: response.txHash,
            createdAt: response.createdAt,
            updatedAt: response.updatedAt,
        };
    }

    /**
     * Create a new customer in AlfredPay.
     * @param input - Customer email and optional country code (defaults to `"MX"`).
     * @returns A {@link Customer} with `kycStatus` set to `"not_started"`.
     * @throws {AnchorError} On API failure.
     */
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const response = await this.request<AlfredPayCreateCustomerResponse>(
            'POST',
            '/customers/create',
            {
                email: input.email,
                type: 'INDIVIDUAL',
                country: input.country || 'MX',
            },
        );

        // The create response only returns customerId and createdAt
        // We construct a minimal Customer object
        return {
            id: response.customerId,
            email: input.email,
            kycStatus: 'not_started',
            createdAt: response.createdAt,
            updatedAt: response.createdAt,
        };
    }

    /**
     * Fetch a customer by their AlfredPay ID.
     * @param customerId - The customer's unique identifier.
     * @returns The {@link Customer}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getCustomer(customerId: string): Promise<Customer | null> {
        try {
            const response = await this.request<AlfredPayCustomerResponse>(
                'GET',
                `/customers/${customerId}`,
            );
            return this.mapCustomer(response);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Look up a customer by email and country.
     *
     * The API endpoint only returns a `customerId`, so the returned {@link Customer}
     * object has placeholder timestamps and a `"not_started"` KYC status. Use
     * {@link getCustomer} if you need full customer details.
     *
     * @param email - Customer's email address.
     * @param country - ISO 3166-1 alpha-2 country code. Defaults to `"MX"`.
     * @returns A minimal {@link Customer}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getCustomerByEmail(email: string, country: string = 'MX'): Promise<Customer | null> {
        try {
            const response = await this.request<{ customerId: string }>(
                'GET',
                `/customers/find/${encodeURIComponent(email)}/${country}`,
            );

            // The endpoint only returns customerId, construct a minimal Customer object
            return {
                id: response.customerId,
                email: email,
                kycStatus: 'not_started',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Request a currency conversion quote.
     *
     * Hardcoded to the XLM chain and SPEI payment method. Provide either
     * `fromAmount` or `toAmount` in the input — the API will calculate the other.
     *
     * @param input - Currency pair and amount.
     * @returns A {@link Quote} with rate, fees, and expiration.
     * @throws {AnchorError} On API failure.
     */
    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const body: Record<string, string> = {
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            chain: 'XLM',
            paymentMethodType: 'SPEI',
        };

        // Ensure amounts are strings
        if (input.fromAmount) {
            body.fromAmount = String(input.fromAmount);
        }
        if (input.toAmount) {
            body.toAmount = String(input.toAmount);
        }

        const response = await this.request<AlfredPayQuoteResponse>('POST', '/quotes', body);
        return this.mapQuote(response);
    }

    /**
     * Create an on-ramp transaction (fiat MXN → USDC on Stellar).
     *
     * The returned transaction includes SPEI {@link OnRampTransaction.paymentInstructions | paymentInstructions}
     * that the user must follow to fund the transaction.
     *
     * @param input - Customer, quote, amount, and destination Stellar address.
     * @returns The created {@link OnRampTransaction}.
     * @throws {AnchorError} On API failure.
     */
    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        const response = await this.request<AlfredPayOnRampResponse>('POST', '/onramp', {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            chain: 'XLM',
            paymentMethodType: 'SPEI',
            depositAddress: input.stellarAddress,
            memo: input.memo || '',
            onrampTransactionRequiredFieldsJson: {},
        });
        return this.mapOnRampTransaction(response);
    }

    /**
     * Fetch the current state of an on-ramp transaction.
     * @param transactionId - The transaction's unique identifier.
     * @returns The {@link OnRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        try {
            // GET returns flat response (not wrapped in {transaction, fiatPaymentInstructions})
            const response = await this.request<AlfredPayOnRampFlatResponse>(
                'GET',
                `/onramp/${transactionId}`,
            );
            return this.mapOnRampFlatTransaction(response);
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
     * The account must be registered before it can be used in off-ramp transactions.
     *
     * @param input - Customer ID and bank account details (account number, CLABE, beneficiary).
     * @returns The newly registered {@link RegisteredFiatAccount}.
     * @throws {AnchorError} On API failure.
     */
    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const response = await this.request<AlfredPayFiatAccountResponse>('POST', '/fiatAccounts', {
            customerId: input.customerId,
            type: 'SPEI',
            fiatAccountFields: {
                accountNumber: input.account.clabe,
                accountType: 'CHECKING',
                accountName: input.account.beneficiary,
                accountBankCode: input.account.bankName || '',
                accountAlias: input.account.beneficiary,
                networkIdentifier: input.account.clabe,
                metadata: {
                    accountHolderName: input.account.beneficiary,
                },
            },
            isExternal: true,
        });

        return {
            id: response.fiatAccountId,
            customerId: response.customerId,
            type: response.type,
            status: response.status,
            createdAt: response.createdAt,
        };
    }

    /**
     * List all registered fiat accounts for a customer.
     * @param customerId - The customer's unique identifier.
     * @returns Array of {@link SavedFiatAccount} objects. Returns an empty array if none are found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        try {
            const response = await this.request<AlfredPayFiatAccountListItem[]>(
                'GET',
                `/fiatAccounts?customerId=${customerId}`,
            );

            return response.map((account) => ({
                id: account.fiatAccountId,
                type: account.type,
                accountNumber: account.accountNumber,
                bankName: account.bankName,
                accountHolderName:
                    account.metadata?.accountHolderName ||
                    account.accountAlias ||
                    account.accountName,
                createdAt: account.createdAt,
            }));
        } catch (error) {
            // Return empty array if no accounts found
            if (error instanceof AnchorError && error.statusCode === 404) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Create an off-ramp transaction (USDC on Stellar → fiat MXN via SPEI).
     *
     * The returned transaction includes a `stellarAddress` and `memo` that the user
     * must use when sending USDC on the Stellar network.
     *
     * @param input - Customer, quote, amount, fiat account ID, and source Stellar address.
     * @returns The created {@link OffRampTransaction}.
     * @throws {AnchorError} On API failure.
     */
    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const response = await this.request<AlfredPayOffRampResponse>('POST', '/offramp', {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fiatAccountId: input.fiatAccountId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            chain: 'XLM',
            memo: input.memo || '',
            originAddress: input.stellarAddress,
        });
        return this.mapOffRampTransaction(response);
    }

    /**
     * Fetch the current state of an off-ramp transaction.
     * @param transactionId - The transaction's unique identifier.
     * @returns The {@link OffRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const response = await this.request<AlfredPayOffRampResponse>(
                'GET',
                `/offramp/${transactionId}`,
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
     * Get a URL for an interactive KYC verification iframe.
     * @param customerId - The customer's unique identifier.
     * @param country - ISO 3166-1 alpha-2 country code. Defaults to `"MX"`.
     * @returns The iframe URL string.
     * @throws {AnchorError} On API failure.
     */
    async getKycUrl(customerId: string, country: string = 'MX'): Promise<string> {
        const response = await this.request<{ verification_url: string; submissionId: string }>(
            'GET',
            `/customers/${customerId}/kyc/${country}/url`,
        );
        return response.verification_url;
    }

    /**
     * Get the current KYC verification status for a customer.
     *
     * Fetches the full customer record and returns just the KYC status field.
     *
     * @param customerId - The customer's unique identifier.
     * @returns The customer's {@link KycStatus}.
     * @throws {AnchorError} If the customer is not found or the API fails.
     */
    async getKycStatus(customerId: string): Promise<KycStatus> {
        const customer = await this.getCustomer(customerId);
        if (!customer) {
            throw new AnchorError('Customer not found', 'CUSTOMER_NOT_FOUND', 404);
        }
        return customer.kycStatus;
    }

    /**
     * Fetch an existing KYC submission for a customer.
     * @param customerId - The customer's unique identifier.
     * @returns The {@link AlfredPayKycSubmissionResponse}, or `null` if no submission exists.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getKycSubmission(customerId: string): Promise<AlfredPayKycSubmissionResponse | null> {
        try {
            const response = await this.request<AlfredPayKycSubmissionResponse>(
                'GET',
                `/customers/kyc/${customerId}`,
            );
            return response;
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Check the review status of a specific KYC submission.
     * @param customerId - The customer's unique identifier.
     * @param submissionId - The KYC submission identifier.
     * @returns The {@link AlfredPayKycSubmissionStatusResponse} with the current status.
     * @throws {AnchorError} On API failure.
     */
    async getKycSubmissionStatus(
        customerId: string,
        submissionId: string,
    ): Promise<AlfredPayKycSubmissionStatusResponse> {
        const response = await this.request<AlfredPayKycSubmissionStatusResponse>(
            'GET',
            `/customers/${customerId}/kyc/${submissionId}/status`,
        );
        return response;
    }

    /**
     * Fetch the KYC field and document requirements for a country.
     * @param country - ISO 3166-1 alpha-2 country code. Defaults to `"MX"`.
     * @returns Personal data fields and document requirements.
     * @throws {AnchorError} On API failure.
     */
    async getKycRequirements(country: string = 'MX'): Promise<AlfredPayKycRequirementsResponse> {
        const response = await this.request<AlfredPayKycRequirementsResponse>(
            'GET',
            `/kycRequirements?country=${country}`,
        );
        return response;
    }

    /**
     * Submit personal KYC data for a customer.
     *
     * After submitting data, upload required documents with {@link submitKycFile},
     * then call {@link finalizeKycSubmission} to send the submission for review.
     *
     * @param customerId - The customer's unique identifier.
     * @param data - Personal information fields (name, address, DOB, etc.).
     * @returns The created {@link AlfredPayKycSubmissionResponse} with a `submissionId`.
     * @throws {AnchorError} On API failure.
     */
    async submitKycData(
        customerId: string,
        data: AlfredPayKycSubmissionRequest['kycSubmission'],
    ): Promise<AlfredPayKycSubmissionResponse> {
        const response = await this.request<AlfredPayKycSubmissionResponse>(
            'POST',
            `/customers/${customerId}/kyc`,
            { kycSubmission: data },
        );
        return response;
    }

    /**
     * Finalize a KYC submission and send it for review.
     *
     * Call this after uploading all required documents with {@link submitKycFile}.
     *
     * @param customerId - The customer's unique identifier.
     * @param submissionId - The KYC submission identifier returned by {@link submitKycData}.
     * @throws {AnchorError} On API failure.
     */
    async finalizeKycSubmission(customerId: string, submissionId: string): Promise<void> {
        await this.request<{ message: string }>(
            'POST',
            `/customers/${customerId}/kyc/${submissionId}/submit`,
        );
    }

    /**
     * Upload a KYC identity document file.
     *
     * Uses `multipart/form-data` (not JSON) so it bypasses the standard
     * {@link request} method and handles authentication headers directly.
     *
     * @param customerId - The customer's unique identifier.
     * @param submissionId - The KYC submission identifier returned by {@link submitKycData}.
     * @param fileType - Document category (e.g. `"National ID Front"`, `"Selfie"`).
     * @param file - The file contents as a Blob.
     * @param filename - Original filename (e.g. `"id-front.jpg"`).
     * @returns The {@link AlfredPayKycFileResponse} with a `fileId` and processing status.
     * @throws {AnchorError} On API failure.
     */
    async submitKycFile(
        customerId: string,
        submissionId: string,
        fileType: AlfredPayKycFileType,
        file: Blob,
        filename: string,
    ): Promise<AlfredPayKycFileResponse> {
        const url = `${this.config.baseUrl}/customers/${customerId}/kyc/${submissionId}/files`;

        console.log(`[AlfredPay] POST ${url} (file upload: ${fileType})`);

        const formData = new FormData();
        formData.append('fileBody', file, filename);
        formData.append('fileType', fileType);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'api-key': this.config.apiKey,
                'api-secret': this.config.apiSecret,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AlfredPay] Error ${response.status}:`, errorText);

            let errorData: AlfredPayErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as AlfredPayErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `AlfredPay API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const data = await response.json();
        console.log(`[AlfredPay] Response:`, JSON.stringify(data));
        return data as AlfredPayKycFileResponse;
    }

    // ========== Sandbox-only methods ==========

    /**
     * Send a simulated webhook event to AlfredPay. **Sandbox only.**
     *
     * Used to simulate status changes (KYC approval, transaction completion, etc.)
     * during development and testing.
     *
     * @param webhook - The webhook event to simulate.
     * @throws {AnchorError} On API failure.
     */
    async sendSandboxWebhook(webhook: AlfredPaySandboxWebhookRequest): Promise<void> {
        await this.request<{ message: string }>('POST', '/webhooks', webhook);
    }

    /**
     * Mark a KYC submission as completed. **Sandbox only.**
     *
     * Convenience wrapper around {@link sendSandboxWebhook} that sends a
     * `KYC` / `COMPLETED` webhook event for the given submission.
     *
     * @param submissionId - The KYC submission identifier to mark as completed.
     * @throws {AnchorError} On API failure.
     */
    async completeKycSandbox(submissionId: string): Promise<void> {
        await this.sendSandboxWebhook({
            referenceId: submissionId,
            eventType: 'KYC',
            status: 'COMPLETED',
            metadata: null,
        });
    }
}
