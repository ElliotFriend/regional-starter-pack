/**
 * BlindPay API Client
 *
 * Server-side only — authenticates with an API key that must never be exposed
 * to the browser. Implements the shared {@link Anchor} interface so it can be
 * swapped with any other anchor provider.
 *
 * Key differences from other anchors:
 * - Amounts are in **cents** (integers) — conversion is handled internally
 * - API paths include an instance ID: `/v1/instances/{instance_id}/...`
 * - Stellar payouts are 2-step: authorize (get XDR) → sign → submit back
 * - Receiver creation IS the KYC submission (all data submitted at once)
 * - ToS acceptance via redirect to `app.blindpay.com` before receiver creation
 */

import type {
    Anchor,
    AnchorCapabilities,
    TokenInfo,
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    CreateCustomerInput,
    GetCustomerInput,
    GetQuoteInput,
    CreateOnRampInput,
    CreateOffRampInput,
    RegisterFiatAccountInput,
    RegisteredFiatAccount,
    SavedFiatAccount,
    KycStatus,
    TransactionStatus,
    KycRequirements,
    KycSubmissionData,
    KycSubmissionResult,
} from '../types';
import { AnchorError } from '../types';
import type {
    BlindPayConfig,
    BlindPayTosResponse,
    BlindPayReceiverResponse,
    BlindPayBankAccountResponse,
    BlindPayBlockchainWalletResponse,
    BlindPayQuoteResponse,
    BlindPayPayinQuoteResponse,
    BlindPayPayoutAuthorizeResponse,
    BlindPayPayoutResponse,
    BlindPayPayinResponse,
    BlindPayErrorResponse,
    BlindPayPayoutStatus,
    BlindPayPayinStatus,
    BlindPayReceiverStatus,
    BlindPayCreateReceiverRequest,
    BlindPayCreateBlockchainWalletRequest,
} from './types';

/**
 * Client for the BlindPay fiat on/off ramp API.
 *
 * Supports receiver (customer) management with KYC, payout quotes,
 * payin quotes, on-ramp (MXN → USDC) and off-ramp (USDC → MXN)
 * transactions on the Stellar network via Mexico's SPEI payment rail.
 */
export class BlindPayClient implements Anchor {
    readonly name = 'blindpay';
    readonly displayName = 'BlindPay';
    readonly capabilities: AnchorCapabilities = {
        kycUrl: true,
        requiresTos: true,
        requiresOffRampSigning: true,
        kycFlow: 'form',
        requiresBankBeforeQuote: true,
        requiresBlockchainWalletRegistration: true,
        requiresAnchorPayoutSubmission: true,
        sandbox: true,
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDB',
            name: 'BlindPay USD',
            issuer: 'GBWXJPZL5ADAH7T5BP3DBW2V2DFT3URN2VXN2MG26OM4CTOJSDDSPYAN',
            description:
                'USDB is a fake ERC20 stablecoin powered by BlindPay to simulate payouts on development instances.',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['MXN'];
    readonly supportedRails: readonly string[] = ['spei'];
    private readonly config: BlindPayConfig;
    private readonly network: string;

    /** @param config - API credentials, instance ID, and base URL. */
    constructor(config: BlindPayConfig) {
        this.config = config;
        this.network = config.network || 'stellar_testnet';
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /** Build an instance-scoped API path. */
    private instancePath(path: string): string {
        return `/v1/instances/${this.config.instanceId}${path}`;
    }

    /** Build an external instance-scoped API path (for ToS). */
    private externalInstancePath(path: string): string {
        return `/v1/e/instances/${this.config.instanceId}${path}`;
    }

    /** Convert a decimal string amount to cents (integer). `"10.50"` → `1050` */
    private toCents(amount: string): number {
        const num = parseFloat(amount);
        return Math.round(num * 100);
    }

    /** Convert cents (integer) to a decimal string. `1050` → `"10.50"` */
    private fromCents(cents: number): string {
        return (cents / 100).toFixed(2);
    }

    /**
     * Map a BlindPay receiver KYC status to the shared {@link KycStatus}.
     * @param status - Raw receiver status from the BlindPay API.
     */
    private mapReceiverStatus(status: BlindPayReceiverStatus): KycStatus {
        const statusMap: Record<BlindPayReceiverStatus, KycStatus> = {
            verifying: 'pending',
            approved: 'approved',
            rejected: 'rejected',
        };
        return statusMap[status] || 'pending';
    }

    /**
     * Map a BlindPay payout status to the shared {@link TransactionStatus}.
     * @param status - Raw payout status from the BlindPay API.
     */
    private mapPayoutStatus(status: BlindPayPayoutStatus): TransactionStatus {
        const statusMap: Record<BlindPayPayoutStatus, TransactionStatus> = {
            pending: 'pending',
            processing: 'processing',
            completed: 'completed',
            failed: 'failed',
            refunded: 'cancelled',
        };
        return statusMap[status] || 'pending';
    }

    /**
     * Map a BlindPay payin status to the shared {@link TransactionStatus}.
     * @param status - Raw payin status from the BlindPay API.
     */
    private mapPayinStatus(status: BlindPayPayinStatus): TransactionStatus {
        const statusMap: Record<BlindPayPayinStatus, TransactionStatus> = {
            pending: 'pending',
            waiting_for_payment: 'pending',
            processing: 'processing',
            completed: 'completed',
            failed: 'failed',
            refunded: 'cancelled',
        };
        return statusMap[status] || 'pending';
    }

    /**
     * Map a payin response to the shared {@link OnRampTransaction} type.
     * @param response - Raw payin response from the BlindPay API.
     * @param receiverId - Receiver (customer) ID to associate with the transaction.
     */
    private mapPayinToOnRampTransaction(
        response: BlindPayPayinResponse,
        receiverId: string,
    ): OnRampTransaction {
        return {
            id: response.id,
            customerId: receiverId || response.receiver_id || '',
            quoteId: response.payin_quote_id,
            status: this.mapPayinStatus(response.status),
            fromAmount: this.fromCents(response.sender_amount),
            fromCurrency: response.currency || 'MXN',
            toAmount: this.fromCents(response.receiver_amount),
            toCurrency: response.token || 'USDB',
            stellarAddress: '',
            paymentInstructions: response.clabe
                ? {
                      type: 'spei',
                      clabe: response.clabe,
                      reference: response.memo_code || '',
                      amount: this.fromCents(response.sender_amount),
                      currency: response.currency || 'MXN',
                  }
                : undefined,
            stellarTxHash: response.tracking_complete?.transaction_hash || undefined,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
        };
    }

    /**
     * Map a payout response to the shared {@link OffRampTransaction} type.
     * @param response - Raw payout response from the BlindPay API.
     * @param receiverId - Receiver (customer) ID to associate with the transaction.
     * @param signableTransaction - Stellar XDR for the user to sign, if available.
     */
    private mapPayoutToOffRampTransaction(
        response: BlindPayPayoutResponse,
        receiverId: string,
        signableTransaction?: string,
    ): OffRampTransaction {
        return {
            id: response.id,
            customerId: receiverId,
            quoteId: response.quote_id,
            status: this.mapPayoutStatus(response.status),
            fromAmount: this.fromCents(response.sender_amount),
            fromCurrency: response.sender_currency,
            toAmount: this.fromCents(response.receiver_amount),
            toCurrency: response.receiver_currency,
            stellarAddress: response.sender_wallet_address,
            stellarTxHash: response.blockchain_tx_hash,
            signableTransaction,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
        };
    }

    /**
     * Send an authenticated JSON request to the BlindPay API.
     *
     * @typeParam T - Expected response body type.
     * @param method - HTTP method.
     * @param endpoint - API path appended to base URL.
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

        console.log(`[BlindPay] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[BlindPay] Error ${response.status}:`, errorText);

            let errorData: BlindPayErrorResponse = {};
            try {
                errorData = JSON.parse(errorText) as BlindPayErrorResponse;
            } catch {
                // Not JSON
            }

            throw new AnchorError(
                errorData.error?.message || errorText || `BlindPay API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const data = await response.json();
        console.log(`[BlindPay] Response:`, JSON.stringify(data));
        return data as T;
    }

    // =========================================================================
    // Anchor interface implementation
    // =========================================================================

    /**
     * Create a local customer stub.
     *
     * BlindPay's actual receiver creation requires `tos_id` + full KYC data,
     * which doesn't fit the simple {@link CreateCustomerInput}. The real receiver
     * is created via {@link createReceiver} called from the KYC API route.
     *
     * Returns an empty `id` because BlindPay receiver IDs (e.g. `re_Du878zVwJKhe`)
     * are assigned by the API. A fake UUID would cause 400 errors in downstream calls.
     *
     * @param input - Customer email (used locally; not sent to BlindPay).
     * @returns A stub {@link Customer} with `kycStatus: "not_started"` and empty `id`.
     */
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const now = new Date().toISOString();
        return {
            id: '',
            email: input.email,
            kycStatus: 'not_started',
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch a receiver by ID.
     * @param input - Must include `customerId`. Email-only lookup is not supported.
     * @returns The {@link Customer}, or `null` if not found.
     * @throws {AnchorError} If `customerId` is not provided or on non-404 API errors.
     */
    async getCustomer(input: GetCustomerInput): Promise<Customer | null> {
        if (!input.customerId) {
            throw new AnchorError(
                'customerId is required for BlindPay customer lookup',
                'MISSING_CUSTOMER_ID',
                400,
            );
        }

        try {
            const response = await this.request<BlindPayReceiverResponse>(
                'GET',
                this.instancePath(`/receivers/${input.customerId}`),
            );
            return {
                id: response.id,
                email: response.email,
                kycStatus: this.mapReceiverStatus(response.kyc_status),
                createdAt: response.created_at,
                updatedAt: response.updated_at,
            };
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get a price quote.
     *
     * Detects direction from currencies: if `fromCurrency` is fiat (MXN),
     * creates a payin quote (on-ramp); otherwise creates a payout quote (off-ramp).
     *
     * @param input - Currency pair, amount, and `resourceId` (blockchain wallet ID
     *   for payins, bank account ID for payouts).
     * @returns A {@link Quote} with rate, fees, and expiration.
     * @throws {AnchorError} On API failure.
     */
    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const fiatCurrencies = ['MXN', 'USD', 'BRL', 'ARS', 'COP'];
        const isOnRamp = fiatCurrencies.includes(input.fromCurrency.toUpperCase());

        if (isOnRamp) {
            // Payin quote: fiat → crypto
            const response = await this.request<BlindPayPayinQuoteResponse>(
                'POST',
                this.instancePath('/payin-quotes'),
                {
                    blockchain_wallet_id: input.resourceId || '',
                    currency_type: 'sender',
                    cover_fees: false,
                    request_amount: this.toCents(input.fromAmount || input.toAmount || '0'),
                    payment_method: 'spei',
                    token: input.toCurrency === 'USDC' ? 'USDC' : 'USDB',
                },
            );

            const totalFee =
                (response.flat_fee ?? 0) +
                (response.partner_fee_amount ?? 0) +
                (response.billing_fee_amount ?? 0);

            return {
                id: response.id,
                fromCurrency: input.fromCurrency,
                toCurrency: input.toCurrency,
                fromAmount: this.fromCents(response.sender_amount),
                toAmount: this.fromCents(response.receiver_amount),
                exchangeRate: String(
                    response.blindpay_quotation ?? response.commercial_quotation ?? '0',
                ),
                fee: this.fromCents(totalFee),
                expiresAt: new Date(response.expires_at).toISOString(),
                createdAt: new Date().toISOString(),
            };
        } else {
            // Payout quote: crypto → fiat
            const response = await this.request<BlindPayQuoteResponse>(
                'POST',
                this.instancePath('/quotes'),
                {
                    bank_account_id: input.resourceId || '',
                    currency_type: 'sender',
                    cover_fees: false,
                    request_amount: this.toCents(input.fromAmount || input.toAmount || '0'),
                    network: this.network,
                    token: input.fromCurrency === 'USDC' ? 'USDC' : 'USDB',
                },
            );

            const totalFee =
                (response.flat_fee ?? 0) +
                (response.partner_fee_amount ?? 0) +
                (response.billing_fee_amount ?? 0);

            return {
                id: response.id,
                fromCurrency: input.fromCurrency,
                toCurrency: input.toCurrency,
                fromAmount: this.fromCents(response.sender_amount),
                toAmount: this.fromCents(response.receiver_amount),
                exchangeRate: String(
                    response.blindpay_quotation ?? response.commercial_quotation ?? '0',
                ),
                fee: this.fromCents(totalFee),
                expiresAt: new Date(response.expires_at).toISOString(),
                createdAt: new Date().toISOString(),
            };
        }
    }

    /**
     * Create an on-ramp (payin) transaction.
     *
     * Creates a payin from a payin quote. Returns SPEI payment instructions
     * (CLABE + memo_code) the user must follow to fund the transaction.
     *
     * @param input - Customer, quote ID, and destination Stellar address.
     * @returns The created {@link OnRampTransaction} with payment instructions.
     * @throws {AnchorError} On API failure.
     */
    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        const response = await this.request<BlindPayPayinResponse>(
            'POST',
            this.instancePath('/payins/evm'),
            {
                payin_quote_id: input.quoteId,
            },
        );

        return this.mapPayinToOnRampTransaction(response, input.customerId);
    }

    /**
     * Fetch the current state of a payin (on-ramp) transaction.
     * @param transactionId - The payin's unique identifier.
     * @returns The {@link OnRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        try {
            const response = await this.request<BlindPayPayinResponse>(
                'GET',
                this.instancePath(`/payins/${transactionId}`),
            );
            return this.mapPayinToOnRampTransaction(response, '');
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Register a bank account (SPEI) for a receiver.
     * @param input - Receiver ID and bank account details (CLABE, beneficiary).
     * @returns The newly registered {@link RegisteredFiatAccount}.
     * @throws {AnchorError} On API failure.
     */
    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        if (input.account.type !== 'spei') {
            throw new AnchorError(
                'BlindPay only supports SPEI bank accounts',
                'UNSUPPORTED_RAIL',
                400,
            );
        }

        const response = await this.request<BlindPayBankAccountResponse>(
            'POST',
            this.instancePath(`/receivers/${input.customerId}/bank-accounts`),
            {
                type: 'spei_bitso',
                name: input.account.beneficiary,
                beneficiary_name: input.account.beneficiary,
                spei_protocol: 'clabe',
                spei_institution_code: `40${input.account.clabe.slice(0, 3)}`,
                spei_clabe: input.account.clabe,
            },
        );

        return {
            id: response.id,
            customerId: input.customerId,
            type: response.type,
            status: 'active',
            createdAt: response.created_at,
        };
    }

    /**
     * List bank accounts for a receiver.
     * @param customerId - The receiver's unique identifier.
     * @returns Array of {@link SavedFiatAccount} objects. Returns an empty array if none found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        try {
            const response = await this.request<BlindPayBankAccountResponse[]>(
                'GET',
                this.instancePath(`/receivers/${customerId}/bank-accounts`),
            );

            return response.map((account) => ({
                id: account.id,
                type: account.type,
                accountNumber: account.spei_clabe || '',
                bankName: '',
                accountHolderName: account.beneficiary_name || account.name,
                createdAt: account.created_at,
            }));
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Create an off-ramp (payout) transaction.
     *
     * For Stellar, this is step 1 of 2: calls the authorize endpoint and returns
     * the XDR as `signableTransaction`. After the user signs, call
     * {@link submitSignedPayout} to complete the payout.
     *
     * @param input - Customer, quote, amount, fiat account, and source Stellar address.
     * @returns The created {@link OffRampTransaction} with `signableTransaction` XDR.
     * @throws {AnchorError} On API failure.
     */
    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const response = await this.request<BlindPayPayoutAuthorizeResponse>(
            'POST',
            this.instancePath('/payouts/stellar/authorize'),
            {
                quote_id: input.quoteId,
                sender_wallet_address: input.stellarAddress,
            },
        );

        const now = new Date().toISOString();
        return {
            id: input.quoteId,
            customerId: input.customerId,
            quoteId: input.quoteId,
            status: 'pending',
            fromAmount: input.amount,
            fromCurrency: input.fromCurrency,
            toAmount: '',
            toCurrency: input.toCurrency,
            stellarAddress: input.stellarAddress,
            signableTransaction: response.transaction_hash,
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch the current state of a payout (off-ramp) transaction.
     * @param transactionId - The payout's unique identifier.
     * @returns The {@link OffRampTransaction}, or `null` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const response = await this.request<BlindPayPayoutResponse>(
                'GET',
                this.instancePath(`/payouts/${transactionId}`),
            );
            return this.mapPayoutToOffRampTransaction(response, '');
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Get the ToS acceptance URL for BlindPay.
     *
     * For BlindPay, the "KYC URL" is actually a redirect to the ToS page.
     * The user accepts ToS first, then submits KYC data via {@link createReceiver}.
     *
     * @param _customerId - Unused (ToS is instance-level, not customer-level).
     * @param _publicKey - Unused.
     * @param _bankAccountId - Unused.
     * @returns The ToS URL string.
     * @throws {AnchorError} On API failure.
     */
    async getKycUrl(
        _customerId: string,
        _publicKey?: string,
        _bankAccountId?: string,
    ): Promise<string> {
        return this.generateTosUrl();
    }

    /**
     * Get the KYC status for a receiver.
     * @param customerId - The receiver's unique identifier.
     * @returns The receiver's {@link KycStatus}. Returns `"not_started"` if not found.
     * @throws {AnchorError} On non-404 API errors.
     */
    async getKycStatus(customerId: string, _publicKey?: string): Promise<KycStatus> {
        try {
            const response = await this.request<BlindPayReceiverResponse>(
                'GET',
                this.instancePath(`/receivers/${customerId}`),
            );
            return this.mapReceiverStatus(response.kyc_status);
        } catch (error) {
            if (error instanceof AnchorError && error.statusCode === 404) {
                return 'not_started';
            }
            throw error;
        }
    }

    /**
     * Get KYC field and document requirements in the shared format.
     *
     * Returns hardcoded requirements matching BlindPay's expected fields.
     *
     * @param _country - Unused (BlindPay uses the same fields for all countries).
     * @returns The {@link KycRequirements} for BlindPay receiver creation.
     */
    async getKycRequirements(_country?: string): Promise<KycRequirements> {
        return {
            fields: [
                { key: 'firstName', label: 'First Name', type: 'text', required: true },
                { key: 'lastName', label: 'Last Name', type: 'text', required: true },
                { key: 'email', label: 'Email', type: 'email', required: true },
                {
                    key: 'phoneNumber',
                    label: 'Phone Number (E.164)',
                    type: 'tel',
                    required: true,
                    placeholder: '+521234567890',
                },
                { key: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
                {
                    key: 'taxId',
                    label: 'Tax ID (CURP)',
                    type: 'text',
                    required: true,
                    placeholder: 'ABCD123456HDFRRN09',
                },
                { key: 'address', label: 'Address', type: 'text', required: true },
                { key: 'city', label: 'City', type: 'text', required: true },
                { key: 'state', label: 'State', type: 'text', required: true },
                {
                    key: 'country',
                    label: 'Country',
                    type: 'select',
                    required: true,
                    options: [{ value: 'MX', label: 'Mexico' }],
                },
                { key: 'postalCode', label: 'Postal Code', type: 'text', required: true },
            ],
            documents: [
                {
                    key: 'idFront',
                    label: 'ID Document - Front',
                    description: 'Front of your government-issued ID',
                    mode: 'url_reference',
                },
                {
                    key: 'idBack',
                    label: 'ID Document - Back',
                    description: 'Back of your government-issued ID',
                    mode: 'url_reference',
                },
                {
                    key: 'selfie',
                    label: 'Selfie',
                    description: 'Clear photo of your face',
                    mode: 'url_reference',
                },
                {
                    key: 'proofOfAddress',
                    label: 'Proof of Address',
                    description: 'Utility bill or bank statement',
                    mode: 'url_reference',
                },
            ],
        };
    }

    /**
     * Submit KYC data by creating a BlindPay receiver.
     *
     * Maps the shared {@link KycSubmissionData} into a {@link createReceiver} payload.
     * Requires `metadata.tosId` from the ToS redirect callback.
     *
     * @param _customerId - Unused (receiver ID is assigned by the API).
     * @param data - KYC fields, document URLs, and `metadata.tosId`.
     * @returns A {@link KycSubmissionResult} with the new receiver's ID and KYC status.
     * @throws {AnchorError} If `tosId` is missing or on API failure.
     */
    async submitKyc(_customerId: string, data: KycSubmissionData): Promise<KycSubmissionResult> {
        const tosId = data.metadata?.tosId;
        if (!tosId) {
            throw new AnchorError(
                'tosId is required for BlindPay KYC submission',
                'MISSING_TOS_ID',
                400,
            );
        }

        const receiverData: BlindPayCreateReceiverRequest = {
            tos_id: tosId,
            type: 'individual',
            kyc_type: 'standard',
            email: data.fields.email || '',
            first_name: data.fields.firstName || '',
            last_name: data.fields.lastName || '',
            phone_number: data.fields.phoneNumber || '',
            date_of_birth: data.fields.dateOfBirth
                ? new Date(data.fields.dateOfBirth).toISOString()
                : '',
            tax_id: data.fields.taxId || '',
            address_line_1: data.fields.address || '',
            city: data.fields.city || '',
            state_province_region: data.fields.state || '',
            country: data.fields.country || 'MX',
            postal_code: data.fields.postalCode || '',
            ip_address: '0.0.0.0',
            id_doc_country: data.fields.country || 'MX',
            id_doc_type: 'ID_CARD',
            id_doc_front_file: (data.documents.idFront as string) || '',
            id_doc_back_file: (data.documents.idBack as string) || '',
            selfie_file: (data.documents.selfie as string) || '',
            proof_of_address_doc_type: 'UTILITY_BILL',
            proof_of_address_doc_file: (data.documents.proofOfAddress as string) || undefined,
        };

        const receiver = await this.createReceiver(receiverData);

        return {
            customerId: receiver.id,
            kycStatus: this.mapReceiverStatus(receiver.kyc_status),
        };
    }

    // =========================================================================
    // BlindPay-specific methods (beyond Anchor interface)
    // =========================================================================

    /**
     * Generate a ToS acceptance URL.
     *
     * The URL must be opened in the user's browser — server-side requests
     * to this URL are ignored by BlindPay.
     *
     * @param redirectUrl - Optional URL to redirect back to after acceptance.
     * @returns The ToS URL for the user to visit.
     */
    async generateTosUrl(redirectUrl?: string): Promise<string> {
        const response = await this.request<BlindPayTosResponse>(
            'POST',
            this.externalInstancePath('/tos'),
            {
                idempotency_key: crypto.randomUUID(),
            },
        );

        let url = response.url;
        if (redirectUrl) {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}redirect_url=${encodeURIComponent(redirectUrl)}`;
        }
        return url;
    }

    /**
     * Create a receiver with full KYC data.
     *
     * This is the BlindPay equivalent of "creating a customer + submitting KYC"
     * in a single step. Requires a `tos_id` from prior ToS acceptance.
     *
     * @param data - Full receiver creation payload including KYC fields.
     * @returns The created {@link BlindPayReceiverResponse}.
     * @throws {AnchorError} On API failure.
     */
    async createReceiver(data: BlindPayCreateReceiverRequest): Promise<BlindPayReceiverResponse> {
        return this.request<BlindPayReceiverResponse>(
            'POST',
            this.instancePath('/receivers'),
            data,
        );
    }

    /**
     * Register a blockchain wallet for a receiver.
     *
     * Uses the direct method (`is_account_abstraction: true`) since Stellar
     * message signing is not natively supported by BlindPay's secure method
     * (which uses EVM-style signing via wagmi/ethers).
     *
     * @param receiverId - The receiver's unique identifier.
     * @param address - Stellar public key to register.
     * @param name - Display name for the wallet. Defaults to `"Stellar Wallet"`.
     * @returns The created {@link BlindPayBlockchainWalletResponse}.
     * @throws {AnchorError} On API failure.
     */
    async registerBlockchainWallet(
        receiverId: string,
        address: string,
        name?: string,
    ): Promise<BlindPayBlockchainWalletResponse> {
        const payload: BlindPayCreateBlockchainWalletRequest = {
            name: name || 'Stellar Wallet',
            network: this.network,
            is_account_abstraction: true,
            address,
        };

        return this.request<BlindPayBlockchainWalletResponse>(
            'POST',
            this.instancePath(`/receivers/${receiverId}/blockchain-wallets`),
            payload,
        );
    }

    /**
     * List blockchain wallets for a receiver.
     * @param receiverId - The receiver's unique identifier.
     * @returns Array of {@link BlindPayBlockchainWalletResponse} objects.
     * @throws {AnchorError} On API failure.
     */
    async getBlockchainWallets(receiverId: string): Promise<BlindPayBlockchainWalletResponse[]> {
        return this.request<BlindPayBlockchainWalletResponse[]>(
            'GET',
            this.instancePath(`/receivers/${receiverId}/blockchain-wallets`),
        );
    }

    /**
     * Submit a signed Stellar payout transaction.
     *
     * This is step 2 of the Stellar payout flow:
     * 1. {@link createOffRamp} → authorize → get XDR
     * 2. User signs XDR with Freighter
     * 3. `submitSignedPayout` → submit signed XDR back to BlindPay
     *
     * @param quoteId - The quote ID used in the authorize step.
     * @param signedTransaction - The signed Stellar transaction XDR.
     * @param senderWalletAddress - The sender's Stellar public key.
     * @returns The created {@link BlindPayPayoutResponse}.
     * @throws {AnchorError} On API failure.
     */
    async submitSignedPayout(
        quoteId: string,
        signedTransaction: string,
        senderWalletAddress: string,
    ): Promise<BlindPayPayoutResponse> {
        return this.request<BlindPayPayoutResponse>('POST', this.instancePath('/payouts/stellar'), {
            quote_id: quoteId,
            signed_transaction: signedTransaction,
            sender_wallet_address: senderWalletAddress,
        });
    }

    /**
     * Create a payin quote (on-ramp).
     *
     * @param blockchainWalletId - The blockchain wallet ID to receive stablecoins.
     * @param amountCents - Amount in cents (integer).
     * @param token - Stablecoin token. Defaults to `"USDC"`.
     * @returns The {@link BlindPayPayinQuoteResponse} with pricing and expiration.
     * @throws {AnchorError} On API failure.
     */
    async createPayinQuote(
        blockchainWalletId: string,
        amountCents: number,
        token: string = 'USDC',
    ): Promise<BlindPayPayinQuoteResponse> {
        return this.request<BlindPayPayinQuoteResponse>(
            'POST',
            this.instancePath('/payin-quotes'),
            {
                blockchain_wallet_id: blockchainWalletId,
                currency_type: 'sender',
                cover_fees: false,
                request_amount: amountCents,
                payment_method: 'spei',
                token,
            },
        );
    }

    /**
     * Create a payout quote (off-ramp).
     *
     * @param bankAccountId - The bank account ID to receive fiat.
     * @param amountCents - Amount in cents (integer).
     * @param network - Blockchain network. Defaults to the instance network.
     * @param token - Stablecoin token. Defaults to `"USDC"`.
     * @returns The {@link BlindPayQuoteResponse} with pricing and expiration.
     * @throws {AnchorError} On API failure.
     */
    async createPayoutQuote(
        bankAccountId: string,
        amountCents: number,
        network?: string,
        token: string = 'USDC',
    ): Promise<BlindPayQuoteResponse> {
        return this.request<BlindPayQuoteResponse>('POST', this.instancePath('/quotes'), {
            bank_account_id: bankAccountId,
            currency_type: 'sender',
            cover_fees: false,
            request_amount: amountCents,
            network: network || this.network,
            token,
        });
    }
}
