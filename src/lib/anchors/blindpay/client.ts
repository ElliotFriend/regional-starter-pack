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
    private readonly config: BlindPayConfig;
    private readonly network: string;

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

    /** Map a BlindPay receiver KYC status to the shared KycStatus. */
    private mapReceiverStatus(status: BlindPayReceiverStatus): KycStatus {
        const statusMap: Record<BlindPayReceiverStatus, KycStatus> = {
            verifying: 'pending',
            approved: 'approved',
            rejected: 'rejected',
        };
        return statusMap[status] || 'pending';
    }

    /** Map a BlindPay payout status to the shared TransactionStatus. */
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

    /** Map a BlindPay payin status to the shared TransactionStatus. */
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

    /** Map a payin response to OnRampTransaction, extracting SPEI payment instructions. */
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
                      bankName: '',
                      accountNumber: '',
                      clabe: response.clabe,
                      beneficiary: '',
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

    /** Map a payout response to OffRampTransaction. */
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
            bankAccount: {
                id: '',
                bankName: '',
                accountNumber: '',
                clabe: '',
                beneficiary: '',
            },
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
     * BlindPay's actual receiver creation requires tos_id + full KYC data,
     * which doesn't fit the simple CreateCustomerInput. The real receiver is
     * created via {@link createReceiver} called from the KYC API route.
     */
    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const now = new Date().toISOString();
        return {
            id: crypto.randomUUID(),
            email: input.email,
            kycStatus: 'not_started',
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch a receiver by ID.
     * @param customerId - The receiver's BlindPay ID (e.g. `re_000000000000`).
     */
    async getCustomer(customerId: string): Promise<Customer | null> {
        try {
            const response = await this.request<BlindPayReceiverResponse>(
                'GET',
                this.instancePath(`/receivers/${customerId}`),
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
     * Look up a customer by email.
     *
     * BlindPay does not support receiver lookup by email.
     * @throws {AnchorError} Always — NOT_SUPPORTED.
     */
    async getCustomerByEmail(
        _email: string,
        _country?: string,
    ): Promise<Customer | null> {
        throw new AnchorError(
            'BlindPay does not support customer lookup by email',
            'NOT_SUPPORTED',
            501,
        );
    }

    /**
     * Get a price quote.
     *
     * Detects direction from currencies: if fromCurrency is fiat (MXN),
     * creates a payin quote (on-ramp); otherwise creates a payout quote (off-ramp).
     *
     * Note: This method requires additional context (blockchain_wallet_id for payins
     * or bank_account_id for payouts) which must be passed via the customerId field
     * as a colon-delimited string: `receiverId:resourceId`.
     */
    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const fiatCurrencies = ['MXN', 'USD', 'BRL', 'ARS', 'COP'];
        const isOnRamp = fiatCurrencies.includes(input.fromCurrency.toUpperCase());

        // Parse customerId — expecting "receiverId:resourceId" format
        const [, resourceId] = (input.customerId || '').split(':');

        if (isOnRamp) {
            // Payin quote: fiat → crypto
            const response = await this.request<BlindPayPayinQuoteResponse>(
                'POST',
                this.instancePath('/payin-quotes'),
                {
                    blockchain_wallet_id: resourceId || '',
                    currency_type: 'sender',
                    cover_fees: false,
                    request_amount: this.toCents(input.fromAmount || input.toAmount || '0'),
                    payment_method: 'spei',
                    token: input.toCurrency === 'USDC' ? 'USDC' : 'USDB',
                },
            );

            const totalFee = (response.flat_fee ?? 0) + (response.partner_fee_amount ?? 0) + (response.billing_fee_amount ?? 0);

            return {
                id: response.id,
                fromCurrency: input.fromCurrency,
                toCurrency: input.toCurrency,
                fromAmount: this.fromCents(response.sender_amount),
                toAmount: this.fromCents(response.receiver_amount),
                exchangeRate: String(response.blindpay_quotation ?? response.commercial_quotation ?? '0'),
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
                    bank_account_id: resourceId || '',
                    currency_type: 'sender',
                    cover_fees: false,
                    request_amount: this.toCents(input.fromAmount || input.toAmount || '0'),
                    network: this.network,
                    token: input.fromCurrency === 'USDC' ? 'USDC' : 'USDB',
                },
            );

            const totalFee = (response.flat_fee ?? 0) + (response.partner_fee_amount ?? 0) + (response.billing_fee_amount ?? 0);

            return {
                id: response.id,
                fromCurrency: input.fromCurrency,
                toCurrency: input.toCurrency,
                fromAmount: this.fromCents(response.sender_amount),
                toAmount: this.fromCents(response.receiver_amount),
                exchangeRate: String(response.blindpay_quotation ?? response.commercial_quotation ?? '0'),
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
     */
    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const response = await this.request<BlindPayBankAccountResponse>(
            'POST',
            this.instancePath(`/receivers/${input.customerId}/bank-accounts`),
            {
                type: 'spei_bitso',
                name: input.bankAccount.beneficiary,
                beneficiary_name: input.bankAccount.beneficiary,
                spei_protocol: 'clabe',
                spei_institution_code: `40${input.bankAccount.clabe.slice(0, 3)}`,
                spei_clabe: input.bankAccount.clabe,
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
            bankAccount: {
                id: input.fiatAccountId,
                bankName: input.bankAccountInfo?.bankName || '',
                accountNumber: input.bankAccountInfo?.accountNumber || '',
                clabe: input.bankAccountInfo?.clabe || '',
                beneficiary: input.bankAccountInfo?.beneficiary || '',
            },
            signableTransaction: response.transaction_hash,
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch the current state of a payout (off-ramp) transaction.
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
     * For BlindPay, the "KYC iframe" is actually a redirect to the ToS page.
     * The user accepts ToS first, then submits KYC data via createReceiver.
     */
    async getKycIframeUrl(_customerId: string, _publicKey?: string, _bankAccountId?: string): Promise<string> {
        return this.generateTosUrl();
    }

    /**
     * Get the KYC status for a receiver.
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
     * in a single step. Requires a tos_id from prior ToS acceptance.
     *
     * @param data - Full receiver creation payload including KYC fields.
     * @returns The created receiver response.
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
     * Since our users connect via Freighter, the address is wallet-verified.
     *
     * TODO: Confirm with BlindPay whether Stellar message signing is supported.
     * If so, implement the secure method (GET sign-message → sign with Freighter
     * → POST with signature_tx_hash) as the primary path.
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
     * 1. `createOffRamp` → authorize → get XDR
     * 2. User signs XDR with Freighter
     * 3. `submitSignedPayout` → submit signed XDR back to BlindPay
     */
    async submitSignedPayout(
        quoteId: string,
        signedTransaction: string,
        senderWalletAddress: string,
    ): Promise<BlindPayPayoutResponse> {
        return this.request<BlindPayPayoutResponse>(
            'POST',
            this.instancePath('/payouts/stellar'),
            {
                quote_id: quoteId,
                signed_transaction: signedTransaction,
                sender_wallet_address: senderWalletAddress,
            },
        );
    }

    /**
     * Create a payin quote (on-ramp).
     *
     * @param blockchainWalletId - The blockchain wallet ID to receive stablecoins.
     * @param amountCents - Amount in cents.
     * @param token - Stablecoin token (defaults to USDC).
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
     * @param amountCents - Amount in cents.
     * @param network - Blockchain network (defaults to instance network).
     * @param token - Stablecoin token (defaults to USDC).
     */
    async createPayoutQuote(
        bankAccountId: string,
        amountCents: number,
        network?: string,
        token: string = 'USDC',
    ): Promise<BlindPayQuoteResponse> {
        return this.request<BlindPayQuoteResponse>(
            'POST',
            this.instancePath('/quotes'),
            {
                bank_account_id: bankAccountId,
                currency_type: 'sender',
                cover_fees: false,
                request_amount: amountCents,
                network: network || this.network,
                token,
            },
        );
    }
}
