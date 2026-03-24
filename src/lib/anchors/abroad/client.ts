/**
 * Abroad Finance API Client
 *
 * Server-side only — authenticates with an API key that must never be exposed
 * to the browser. Implements the shared {@link Anchor} interface so it can be
 * swapped with any other anchor provider.
 *
 * Abroad Finance is an **off-ramp only** provider. On-ramp methods throw
 * `AnchorError` with code `UNSUPPORTED_OPERATION`.
 *
 * @example
 * ```ts
 * import { AbroadClient } from 'path/to/anchors/abroad';
 *
 * const abroad = new AbroadClient({
 *     apiKey: process.env.ABROAD_API_KEY,
 *     baseUrl: process.env.ABROAD_BASE_URL,
 * });
 *
 * const quote = await abroad.getQuote({ fromCurrency: 'USDC', toCurrency: 'BRL', fromAmount: '100' });
 * ```
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
} from '../types';
import { AnchorError } from '../types';
import type {
    AbroadConfig,
    AbroadQuoteResponse,
    AbroadTransactionResponse,
    AbroadTransactionStatus,
    AbroadCustomerResponse,
    AbroadFiatAccountResponse,
    AbroadSavedFiatAccountResponse,
    AbroadKycUrlResponse,
} from './types';

export class AbroadClient implements Anchor {
    readonly name = 'abroad';
    readonly displayName = 'Abroad Finance';
    readonly capabilities: AnchorCapabilities = {
        kycFlow: 'redirect',
        kycUrl: true,
        requiresOffRampSigning: true,
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDC',
            name: 'USD Coin',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['BRL'];
    readonly supportedRails: readonly string[] = ['pix'];

    private readonly config: AbroadConfig;

    constructor(config: AbroadConfig) {
        this.config = config;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        const headers: Record<string, string> = {
            'X-API-Key': this.config.apiKey,
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new AnchorError('Not found', 'NOT_FOUND', 404);
            }

            let errorMessage: string;
            try {
                const errorData = await response.json();
                errorMessage =
                    (errorData as Record<string, string>).error ||
                    (errorData as Record<string, string>).message ||
                    `Abroad API error: ${response.status}`;
            } catch {
                errorMessage = `Abroad API error: ${response.status}`;
            }

            throw new AnchorError(errorMessage, 'API_ERROR', response.status);
        }

        return response.json() as Promise<T>;
    }

    private mapTransactionStatus(status: AbroadTransactionStatus): OffRampTransaction['status'] {
        switch (status) {
            case 'AWAITING_PAYMENT':
                return 'pending';
            case 'PROCESSING_PAYMENT':
                return 'processing';
            case 'PAYMENT_COMPLETED':
                return 'completed';
            case 'PAYMENT_FAILED':
                return 'failed';
            case 'PAYMENT_EXPIRED':
                return 'expired';
            case 'WRONG_AMOUNT':
                return 'failed';
            default:
                return 'pending';
        }
    }

    private mapTransactionResponse(response: AbroadTransactionResponse): OffRampTransaction {
        return {
            id: response.id,
            customerId: '',
            quoteId: '',
            status: this.mapTransactionStatus(response.status),
            fromAmount: response.crypto_amount,
            fromCurrency: response.crypto_currency,
            toAmount: response.fiat_amount,
            toCurrency: response.target_currency,
            stellarAddress: response.deposit_address,
            memo: response.transaction_reference,
            createdAt: response.created_at,
            updatedAt: response.updated_at,
        };
    }

    private mapKycStatus(status?: string): KycStatus {
        switch (status) {
            case 'approved':
                return 'approved';
            case 'pending':
                return 'pending';
            case 'rejected':
                return 'rejected';
            default:
                return 'not_started';
        }
    }

    // =========================================================================
    // Customer methods
    // =========================================================================

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const response = await this.request<AbroadCustomerResponse>('POST', '/customers', {
            email: input.email,
            country: input.country || 'BR',
        });

        return {
            id: response.id,
            email: response.email,
            kycStatus: 'not_started',
            createdAt: response.created_at,
            updatedAt: response.updated_at || response.created_at,
        };
    }

    async getCustomer(input: GetCustomerInput): Promise<Customer | null> {
        try {
            const response = await this.request<AbroadCustomerResponse>(
                'GET',
                `/customers/${input.customerId}`,
            );

            return {
                id: response.id,
                email: response.email,
                kycStatus: this.mapKycStatus(response.kyc_status),
                createdAt: response.created_at,
                updatedAt: response.updated_at || response.created_at,
            };
        } catch (err) {
            if (err instanceof AnchorError && err.code === 'NOT_FOUND') {
                return null;
            }
            throw err;
        }
    }

    // =========================================================================
    // Quote
    // =========================================================================

    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const amount = input.fromAmount
            ? parseFloat(input.fromAmount)
            : parseFloat(input.toAmount || '0');

        const response = await this.request<AbroadQuoteResponse>('POST', '/quote', {
            amount,
            crypto_currency: 'USDC',
            network: 'stellar',
            payment_method: 'pix',
            target_currency: input.toCurrency || 'BRL',
        });

        return {
            id: response.id,
            fromCurrency: response.crypto_currency,
            toCurrency: response.target_currency,
            fromAmount: response.crypto_amount,
            toAmount: response.fiat_amount,
            exchangeRate: response.exchange_rate,
            fee: response.fee,
            expiresAt: response.expires_at,
            createdAt: response.created_at,
        };
    }

    // =========================================================================
    // On-ramp (NOT SUPPORTED)
    // =========================================================================

    async createOnRamp(_input: CreateOnRampInput): Promise<OnRampTransaction> {
        throw new AnchorError(
            'Abroad Finance does not support on-ramp operations',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async getOnRampTransaction(_transactionId: string): Promise<OnRampTransaction | null> {
        throw new AnchorError(
            'Abroad Finance does not support on-ramp operations',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    // =========================================================================
    // Off-ramp
    // =========================================================================

    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const response = await this.request<AbroadTransactionResponse>('POST', '/transaction', {
            quote_id: input.quoteId,
            user_id: input.customerId,
            account_number: input.fiatAccountId,
            tax_id: '',
        });

        const tx = this.mapTransactionResponse(response);
        tx.customerId = input.customerId;
        tx.quoteId = input.quoteId;
        return tx;
    }

    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const response = await this.request<AbroadTransactionResponse>(
                'GET',
                `/transaction/${transactionId}`,
            );

            return this.mapTransactionResponse(response);
        } catch (err) {
            if (err instanceof AnchorError && err.code === 'NOT_FOUND') {
                return null;
            }
            throw err;
        }
    }

    // =========================================================================
    // Fiat accounts
    // =========================================================================

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const account = input.account;
        let body: Record<string, unknown>;

        if (account.type === 'pix') {
            body = {
                type: 'pix',
                pix_key: account.pixKey,
                pix_key_type: account.pixKeyType,
                tax_id: account.taxId,
                account_holder_name: account.accountHolderName,
            };
        } else {
            throw new AnchorError(
                'Abroad Finance only supports PIX fiat accounts',
                'UNSUPPORTED_ACCOUNT_TYPE',
                400,
            );
        }

        const response = await this.request<AbroadFiatAccountResponse>(
            'POST',
            `/customers/${input.customerId}/fiat-accounts`,
            body,
        );

        return {
            id: response.id,
            customerId: input.customerId,
            type: response.type,
            status: response.status,
            createdAt: response.created_at,
        };
    }

    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        const response = await this.request<AbroadSavedFiatAccountResponse[]>(
            'GET',
            `/customers/${customerId}/fiat-accounts`,
        );

        return response.map((a) => ({
            id: a.id,
            type: a.type,
            accountNumber: a.account_number,
            bankName: a.bank_name,
            accountHolderName: a.account_holder_name,
            createdAt: a.created_at,
        }));
    }

    // =========================================================================
    // KYC
    // =========================================================================

    async getKycUrl(customerId: string): Promise<string> {
        const response = await this.request<AbroadKycUrlResponse>(
            'GET',
            `/customers/${customerId}/kyc-url`,
        );

        return response.kyc_url;
    }

    async getKycStatus(customerId: string): Promise<KycStatus> {
        const customer = await this.getCustomer({ customerId });
        return customer?.kycStatus || 'not_started';
    }
}
