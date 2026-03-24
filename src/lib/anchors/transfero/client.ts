/**
 * Transfero BaaSiC API Client
 *
 * Server-side only — authenticates with OAuth2 client credentials that must
 * never be exposed to the browser. Implements the shared {@link Anchor}
 * interface so it can be swapped with any other anchor provider.
 *
 * Transfero has **no customer, KYC, or fiat account management APIs**.
 * Users are identified by `taxId` passed inline with each ramp request.
 * Customer and fiat account methods use in-memory stores as thin wrappers
 * to satisfy the Anchor interface contract.
 *
 * Adapted from community contribution by @wmendes (https://github.com/wmendes/stellar-ramps-sdk)
 * with corrections based on the official Transfero API docs (https://docs.transfero.com).
 *
 * @example
 * ```ts
 * import { TransferoClient } from 'path/to/anchors/transfero';
 *
 * const transfero = new TransferoClient({
 *     clientId: process.env.TRANSFERO_CLIENT_ID,
 *     clientSecret: process.env.TRANSFERO_CLIENT_SECRET,
 *     scope: process.env.TRANSFERO_SCOPE,
 *     baseUrl: process.env.TRANSFERO_API_URL,
 * });
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
    TransactionStatus,
} from '../types';
import { AnchorError } from '../types';
import type {
    TransferoConfig,
    TransferoTokenResponse,
    TransferoQuoteResponse,
    TransferoV2OrderResponse,
    TransferoV2RampByIdResponse,
    TransferoV2PreviewResponse,
    TransferoErrorResponse,
    TransferoSwapStatus,
} from './types';

// =============================================================================
// In-memory metadata (Transfero has no customer/fiat-account APIs)
// =============================================================================

interface CustomerMeta {
    id: string;
    email?: string;
    name?: string;
    taxId?: string;
    taxIdCountry?: string;
    country?: string;
    createdAt: string;
    updatedAt: string;
}

interface FiatAccountMeta {
    id: string;
    customerId: string;
    pixKey: string;
    accountHolderName?: string;
    createdAt: string;
}

interface SwapOrderMeta {
    customerId: string;
    quoteId: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    stellarAddress: string;
}

export class TransferoClient implements Anchor {
    readonly name = 'transfero';
    readonly displayName = 'Transfero';
    readonly capabilities: AnchorCapabilities = {
        sandbox: true,
        requiresOffRampSigning: true,
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDC',
            name: 'USD Coin',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
        },
        {
            symbol: 'BRZ',
            name: 'Brazilian Digital Token',
            issuer: 'GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2',
            description: 'A stablecoin pegged 1:1 to the Brazilian Real, issued by Transfero',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['BRL'];
    readonly supportedRails: readonly string[] = ['pix'];

    private readonly config: TransferoConfig;
    private tokenCache: { token: string; expiresAt: number } | null = null;

    private readonly customers = new Map<string, CustomerMeta>();
    private readonly fiatAccountsByCustomer = new Map<string, FiatAccountMeta[]>();
    private readonly swapOrderMeta = new Map<string, SwapOrderMeta>();

    constructor(config: TransferoConfig) {
        this.config = config;
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    private async getToken(): Promise<string> {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
            return this.tokenCache.token;
        }

        const formData = new URLSearchParams();
        formData.set('grant_type', 'client_credentials');
        formData.set('client_id', this.config.clientId);
        formData.set('client_secret', this.config.clientSecret);
        formData.set('scope', this.config.scope);

        const response = await fetch(`${this.config.baseUrl}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
        });

        if (!response.ok) {
            const text = await response.text();
            throw new AnchorError(
                `Transfero auth failed: ${text || response.statusText}`,
                'TRANSFERO_AUTH_FAILED',
                response.status,
            );
        }

        const data = (await response.json()) as TransferoTokenResponse;
        const ttlMs = Math.max((data.expires_in - 300) * 1000, 60_000);
        this.tokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + ttlMs,
        };

        return data.access_token;
    }

    private async request<T>(method: 'GET' | 'POST', endpoint: string, body?: unknown): Promise<T> {
        const token = await this.getToken();
        const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new AnchorError('Not found', 'NOT_FOUND', 404);
            }

            const text = await response.text();
            let errorData: TransferoErrorResponse = {};
            try {
                errorData = JSON.parse(text) as TransferoErrorResponse;
            } catch {
                // not JSON
            }

            throw new AnchorError(
                errorData.error?.message ||
                    errorData.message ||
                    text ||
                    `Transfero API error: ${response.status}`,
                errorData.error?.code || 'TRANSFERO_API_ERROR',
                response.status,
            );
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return (await response.json()) as T;
    }

    private mapStatus(status: string | undefined): TransactionStatus {
        const raw = (status ?? 'Pending') as TransferoSwapStatus;
        const map: Record<TransferoSwapStatus, TransactionStatus> = {
            SwapOrderCreated: 'pending',
            DepositReceived: 'processing',
            TradeCompleted: 'processing',
            WithdrawalCompleted: 'processing',
            SwapOrderCompleted: 'completed',
            Pending: 'pending',
            Processing: 'processing',
            Completed: 'completed',
            Canceled: 'cancelled',
            Cancelled: 'cancelled',
            Failed: 'failed',
        };
        return map[raw] ?? 'pending';
    }

    /**
     * Resolve identity fields for a ramp request.
     * Transfero requires taxId, name, and email on every ramp call.
     * These are sourced from the input params or the in-memory customer record.
     */
    private ensureIdentity(input: {
        customerId?: string;
        taxId?: string;
        taxIdCountry?: string;
        name?: string;
        email?: string;
    }): { taxId: string; taxIdCountry: string; name: string; email: string } {
        const customer = input.customerId ? this.customers.get(input.customerId) : undefined;

        const taxId = input.taxId ?? customer?.taxId;
        const taxIdCountry = input.taxIdCountry ?? customer?.taxIdCountry ?? 'BRA';
        const name = input.name ?? customer?.name;
        const email = input.email ?? customer?.email;

        if (!taxId || !name || !email) {
            throw new AnchorError(
                'Transfero requires taxId, name, and email. Provide them via customer creation or ramp input fields.',
                'TRANSFERO_IDENTITY_REQUIRED',
                400,
            );
        }

        return { taxId, taxIdCountry, name, email };
    }

    private normalizeAmount(value: string | undefined): number {
        if (!value) return 0;
        const n = Number.parseFloat(value);
        return Number.isFinite(n) ? n : 0;
    }

    // =========================================================================
    // Customer (in-memory — Transfero has no customer API)
    // =========================================================================

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        const meta: CustomerMeta = {
            id,
            email: input.email,
            name: input.name,
            taxId: input.taxId,
            taxIdCountry: input.taxIdCountry,
            country: input.country,
            createdAt: now,
            updatedAt: now,
        };
        this.customers.set(id, meta);

        return {
            id,
            email: meta.email,
            kycStatus: 'approved',
            createdAt: now,
            updatedAt: now,
        };
    }

    async getCustomer(input: GetCustomerInput): Promise<Customer | null> {
        let meta: CustomerMeta | undefined;

        if (input.customerId) {
            meta = this.customers.get(input.customerId);
        } else if (input.email) {
            meta = Array.from(this.customers.values()).find((c) => c.email === input.email);
        }

        if (!meta) return null;

        return {
            id: meta.id,
            email: meta.email,
            kycStatus: 'approved',
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
        };
    }

    // =========================================================================
    // Quote
    // =========================================================================

    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const baseAmount = this.normalizeAmount(input.fromAmount);
        const quoteAmount = this.normalizeAmount(input.toAmount);

        const raw = await this.request<TransferoQuoteResponse>(
            'POST',
            '/api/quote/v2/requestquote',
            {
                baseCurrency: input.fromCurrency,
                quoteCurrency: input.toCurrency,
                baseCurrencySize: baseAmount,
                quoteCurrencySize: quoteAmount,
                side: input.fromAmount ? 'sell' : 'buy',
            },
        );

        if (!Array.isArray(raw) || raw.length === 0) {
            throw new AnchorError(
                'Transfero quote response is empty',
                'TRANSFERO_QUOTE_INVALID',
                500,
            );
        }

        const item = raw[0];
        if (!item.quoteId || typeof item.price !== 'number' || !item.expireAt) {
            throw new AnchorError(
                'Transfero quote response missing required fields',
                'TRANSFERO_QUOTE_INVALID',
                500,
            );
        }

        const fromAmt = input.fromAmount ? baseAmount : item.price;
        const toAmt = input.fromAmount ? item.price : quoteAmount;
        const exchangeRate = fromAmt > 0 ? toAmt / fromAmt : 0;

        return {
            id: item.quoteId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            fromAmount: String(fromAmt),
            toAmount: String(toAmt),
            exchangeRate: String(exchangeRate),
            fee: '0',
            expiresAt: item.expireAt,
            createdAt: new Date().toISOString(),
        };
    }

    // =========================================================================
    // On-ramp
    // =========================================================================

    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        const identity = this.ensureIdentity({
            customerId: input.customerId,
            taxId: input.taxId,
            taxIdCountry: input.taxIdCountry,
            name: input.name,
            email: input.email,
        });

        const externalId = `onramp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

        const response = await this.request<TransferoV2OrderResponse>(
            'POST',
            '/api/ramp/v2/swaporder',
            {
                taxId: identity.taxId,
                taxIdCountry: identity.taxIdCountry,
                externalId,
                name: identity.name,
                email: identity.email,
                quoteId: input.quoteId,
                cryptoWithdrawalInformation: {
                    blockchain: 'Stellar',
                    key: input.stellarAddress,
                },
            },
        );

        if (!response.id || !response.status) {
            throw new AnchorError(
                'Transfero on-ramp response missing order id',
                'TRANSFERO_ORDER_INVALID',
                500,
            );
        }

        this.swapOrderMeta.set(response.id, {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            stellarAddress: input.stellarAddress,
        });

        return {
            id: response.id,
            customerId: input.customerId,
            quoteId: input.quoteId,
            status: this.mapStatus(response.status),
            fromAmount: input.amount,
            fromCurrency: input.fromCurrency,
            toAmount: input.amount,
            toCurrency: input.toCurrency,
            stellarAddress: input.stellarAddress,
            createdAt: response.createdAt ?? new Date().toISOString(),
            updatedAt: response.updatedAt ?? new Date().toISOString(),
        };
    }

    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        try {
            const order = await this.request<TransferoV2RampByIdResponse>(
                'GET',
                `/api/ramp/v2/id/${encodeURIComponent(transactionId)}`,
            );

            if (!order.id || !order.status) {
                throw new AnchorError(
                    'Transfero ramp response is invalid',
                    'TRANSFERO_ORDER_INVALID',
                    500,
                );
            }

            const meta = this.swapOrderMeta.get(order.id);

            return {
                id: order.id,
                customerId: meta?.customerId ?? '',
                quoteId: meta?.quoteId ?? '',
                status: this.mapStatus(order.status),
                fromAmount: meta?.amount ?? '0',
                fromCurrency: meta?.fromCurrency ?? 'BRL',
                toAmount: meta?.amount ?? '0',
                toCurrency: meta?.toCurrency ?? 'USDC',
                stellarAddress: meta?.stellarAddress ?? '',
                createdAt: order.createdAt,
                updatedAt: order.updatedAt ?? new Date().toISOString(),
            };
        } catch (err) {
            if (err instanceof AnchorError && err.code === 'NOT_FOUND') {
                return null;
            }
            throw err;
        }
    }

    // =========================================================================
    // Fiat accounts (in-memory — Transfero has no fiat account API)
    // =========================================================================

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();

        const pixKey =
            input.account.type === 'pix' ? input.account.pixKey : (input.account as never);

        const meta: FiatAccountMeta = {
            id,
            customerId: input.customerId,
            pixKey: String(pixKey),
            accountHolderName:
                input.account.type === 'pix' ? input.account.accountHolderName : undefined,
            createdAt: now,
        };

        const existing = this.fiatAccountsByCustomer.get(input.customerId) ?? [];
        this.fiatAccountsByCustomer.set(input.customerId, [...existing, meta]);

        return {
            id,
            customerId: input.customerId,
            type: 'pix',
            status: 'active',
            createdAt: now,
        };
    }

    async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
        const accounts = this.fiatAccountsByCustomer.get(customerId) ?? [];
        return accounts.map((a) => ({
            id: a.id,
            type: 'pix',
            accountNumber: a.pixKey,
            bankName: 'PIX',
            accountHolderName: a.accountHolderName || '',
            createdAt: a.createdAt,
        }));
    }

    // =========================================================================
    // Off-ramp (two-step: preview → accept)
    // =========================================================================

    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        const identity = this.ensureIdentity({
            customerId: input.customerId,
            taxId: input.taxId,
            taxIdCountry: input.taxIdCountry,
            name: input.name,
            email: input.email,
        });

        // Resolve PIX key from the registered fiat account
        const accounts = this.fiatAccountsByCustomer.get(input.customerId) ?? [];
        const account = accounts.find((a) => a.id === input.fiatAccountId);
        const pixKey = input.memo || account?.pixKey;

        if (!pixKey) {
            throw new AnchorError(
                'Transfero off-ramp requires a PIX key. Provide it via fiat account registration or as memo.',
                'TRANSFERO_PIX_KEY_REQUIRED',
                400,
            );
        }

        const externalId = `offramp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

        // Step 1: Preview
        const preview = await this.request<TransferoV2PreviewResponse>(
            'POST',
            '/api/ramp/v2/swaporder/preview',
            {
                taxId: identity.taxId,
                taxIdCountry: identity.taxIdCountry,
                depositBlockchain: 'Stellar',
                externalId,
                name: identity.name,
                email: identity.email,
                quoteRequest: {
                    side: 'Sell',
                    baseCurrency: input.fromCurrency,
                    quoteCurrency: input.toCurrency,
                    baseAmount: this.normalizeAmount(input.amount),
                    quoteAmount: 0,
                },
                fiatWithdrawalInformation: {
                    key: pixKey,
                },
            },
        );

        if (!preview.previewId) {
            throw new AnchorError(
                'Transfero preview response missing previewId',
                'TRANSFERO_PREVIEW_INVALID',
                500,
            );
        }

        // Step 2: Accept
        const accepted = await this.request<TransferoV2OrderResponse>(
            'POST',
            '/api/ramp/v2/swaporder/accept',
            { previewId: preview.previewId },
        );

        if (!accepted.id || !accepted.status) {
            throw new AnchorError(
                'Transfero accept response missing order id',
                'TRANSFERO_ORDER_INVALID',
                500,
            );
        }

        const depositInfo = accepted.depositInformation;
        if (!depositInfo?.depositAddress || !depositInfo.memo) {
            throw new AnchorError(
                'Transfero accept response missing deposit information',
                'TRANSFERO_ORDER_INVALID',
                500,
            );
        }

        this.swapOrderMeta.set(accepted.id, {
            customerId: input.customerId,
            quoteId: input.quoteId,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            stellarAddress: depositInfo.depositAddress,
        });

        return {
            id: accepted.id,
            customerId: input.customerId,
            quoteId: input.quoteId,
            status: this.mapStatus(accepted.status),
            fromAmount: input.amount,
            fromCurrency: input.fromCurrency,
            toAmount: String(accepted.quote?.quoteCurrencySize ?? input.amount),
            toCurrency: input.toCurrency,
            stellarAddress: depositInfo.depositAddress,
            memo: depositInfo.memo,
            createdAt: accepted.createdAt,
            updatedAt: accepted.updatedAt ?? new Date().toISOString(),
        };
    }

    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        try {
            const order = await this.request<TransferoV2RampByIdResponse>(
                'GET',
                `/api/ramp/v2/id/${encodeURIComponent(transactionId)}`,
            );

            if (!order.id || !order.status) {
                throw new AnchorError(
                    'Transfero ramp response is invalid',
                    'TRANSFERO_ORDER_INVALID',
                    500,
                );
            }

            const meta = this.swapOrderMeta.get(order.id);

            return {
                id: order.id,
                customerId: meta?.customerId ?? '',
                quoteId: meta?.quoteId ?? '',
                status: this.mapStatus(order.status),
                fromAmount: meta?.amount ?? '0',
                fromCurrency: meta?.fromCurrency ?? 'USDC',
                toAmount: meta?.amount ?? '0',
                toCurrency: meta?.toCurrency ?? 'BRL',
                stellarAddress:
                    order.depositInformation?.depositAddress ?? meta?.stellarAddress ?? '',
                memo: order.depositInformation?.memo,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt ?? new Date().toISOString(),
            };
        } catch (err) {
            if (err instanceof AnchorError && err.code === 'NOT_FOUND') {
                return null;
            }
            throw err;
        }
    }

    // =========================================================================
    // KYC (no-op — Transfero handles KYC at partner level)
    // =========================================================================

    async getKycStatus(_customerId: string): Promise<KycStatus> {
        return 'approved';
    }
}
