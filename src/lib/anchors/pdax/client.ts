/**
 * PDAX (Philippine Digital Asset Exchange) anchor client.
 *
 * PDAX exposes a stateless, per-transaction API: there is no concept of a
 * customer record on PDAX's side. Instead, sender and beneficiary identity
 * fields are submitted with each ramp request. Customer/KYC state is owned
 * by us (this client + the frontend store). Only the ramp-execution methods
 * actually call PDAX over the wire.
 *
 * Multi-step flows (on-ramp and off-ramp) are advanced from `getOnRamp/
 * OffRampTransaction` polls: each call inspects PDAX's per-leg status and
 * triggers the next step (trade, then crypto/withdraw or fiat/withdraw).
 * The orchestration state lives in a pluggable {@link PdaxStateStore} so
 * the public Anchor interface stays clean (`getOnRampTransaction(id)`).
 * Default in-memory store is fine for dev / single-process Node; multi-
 * instance serverless deployments inject a persistent adapter.
 */

import { randomUUID } from 'node:crypto';

import {
    AnchorError,
    type Anchor,
    type AnchorCapabilities,
    type Customer,
    type CreateCustomerInput,
    type CreateOffRampInput,
    type CreateOnRampInput,
    type GetCustomerInput,
    type GetQuoteInput,
    type IdentityFields,
    type KycRequirements,
    type KycStatus,
    type KycSubmissionData,
    type KycSubmissionResult,
    type OffRampTransaction,
    type OnRampTransaction,
    type Quote,
    type RegisterFiatAccountInput,
    type RegisteredFiatAccount,
    type SavedFiatAccount,
    type TokenInfo,
    type TransactionStatus,
} from '../types';
import { API_PREFIX, PdaxAuth, type PdaxAuthOptions } from './auth';
import { InMemoryPdaxStateStore, type PdaxStateStore } from './stateStore';
import {
    BANK_CODES,
    COUNTRIES,
    FEE_TYPES,
    FIAT_DEPOSIT_IDENTITY_FIELDS,
    FIAT_IN_METHODS,
    FIAT_OUT_METHODS,
    FIAT_WITHDRAW_IDENTITY_FIELDS,
    PURPOSES,
    RELATIONSHIPS,
    SEX_VALUES,
    SOURCES_OF_FUNDS,
    type IdentityFieldEnum,
    type IdentityFieldSpec,
} from './reference';
import type {
    CryptoDepositData,
    CryptoTransaction,
    CryptoWithdrawRequest,
    CryptoWithdrawResponse,
    FiatDepositRequest,
    FiatDepositResponse,
    FiatTransaction,
    FiatWithdrawData,
    FiatWithdrawRequest,
    PdaxOffRampState,
    PdaxOnRampState,
    SuccessEnvelope,
    TradeOrderData,
    TradeOrderRequest,
    TradeQuoteData,
    TradeQuoteRequest,
    TradeSide,
} from './types';

type FetchFn = typeof fetch;

export interface PdaxClientOptions extends PdaxAuthOptions {
    /** Optional override of the inner fetch (test / SSR injection). */
    fetchFn?: FetchFn;
    /**
     * Backing store for per-transaction orchestration state. Defaults to
     * {@link InMemoryPdaxStateStore} — fine for dev / single-process Node /
     * tests, but multi-instance serverless deployments must supply a
     * persistent adapter (Vercel KV, Upstash Redis, Postgres, etc.).
     */
    stateStore?: PdaxStateStore;
}

/** Stellar token PDAX supports for the demo. */
const USDC_TOKEN: TokenInfo = {
    symbol: 'USDC',
    name: 'USD Coin',
    description: 'Circle-issued USD-backed stablecoin on Stellar.',
};

/** PDAX-side asset symbol for USDC on Stellar. */
const PDAX_USDC = 'USDCXLM';

/**
 * Per-transaction request fields that should NOT appear in the user-facing
 * KYC form. These are filled by the SDK or the ramp flow at execution time
 * (amount/method/currency/identifier) or by the off-ramp bank-account step
 * (bank code, account name, account number, fee type) — not by the user
 * during identity onboarding.
 */
const TRANSACTIONAL_FIELDS = new Set([
    'identifier',
    'amount',
    'currency',
    'method',
    'beneficiary_bank_code',
    'beneficiary_account_name',
    'beneficiary_account_number',
    'fee_type',
]);

const ENUM_VALUES: Record<IdentityFieldEnum, readonly string[]> = {
    COUNTRIES,
    BANK_CODES: BANK_CODES.map((b) => b.code),
    FIAT_IN_METHODS,
    FIAT_OUT_METHODS,
    SOURCES_OF_FUNDS,
    PURPOSES,
    FEE_TYPES,
    SEX_VALUES,
    RELATIONSHIPS,
};

const ENUM_LABELS: Partial<Record<IdentityFieldEnum, (v: string) => string>> = {
    BANK_CODES: (code: string) => {
        const bank = BANK_CODES.find((b) => b.code === code);
        return bank ? `${bank.name} (${bank.code})` : code;
    },
};

export class PdaxClient implements Anchor {
    readonly name = 'pdax';
    readonly displayName = 'PDAX';
    readonly capabilities: AnchorCapabilities = {
        kycFlow: 'form',
        emailLookup: false,
        sandbox: true,
        requiresOffRampSigning: true,
        deferredOffRampSigning: false,
        fiatAccountRegistration: 'inline',
    };
    readonly supportedTokens: readonly TokenInfo[] = [USDC_TOKEN];
    readonly supportedCurrencies: readonly string[] = ['PHP'];
    readonly supportedRails: readonly string[] = ['instapay', 'pesonet'];

    private readonly auth: PdaxAuth;
    private readonly baseUrl: string;
    private readonly fetchFn: FetchFn;
    private readonly stateStore: PdaxStateStore;

    constructor(opts: PdaxClientOptions) {
        this.auth = new PdaxAuth(opts);
        this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
        this.fetchFn = opts.fetchFn ?? fetch;
        this.stateStore = opts.stateStore ?? new InMemoryPdaxStateStore();
    }

    // -------------------------------------------------------------------
    // Local-only customer/KYC/fiat-account methods
    //
    // PDAX has no customer concept on its side, so these are stateless on
    // the server: the browser is the source of truth (customerStore,
    // kycStore, localStorage). The server's role is to validate inputs and
    // mint identifiers — never to read state back.
    // -------------------------------------------------------------------

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const now = new Date().toISOString();
        return {
            id: randomUUID(),
            email: input.email,
            country: input.country,
            kycStatus: 'not_started',
            createdAt: now,
            updatedAt: now,
        };
    }

    async getCustomer(input: GetCustomerInput): Promise<Customer | null> {
        if (input.email && !input.customerId) {
            throw new AnchorError(
                'PDAX does not support customer lookup by email — provide a customerId instead.',
                'EMAIL_LOOKUP_NOT_SUPPORTED',
                400,
            );
        }
        // Customer records live in the browser (customerStore + localStorage);
        // the server never holds them. Treat any id as unknown.
        return null;
    }

    async getKycRequirements(): Promise<KycRequirements> {
        const merged = new Map<string, IdentityFieldSpec>();
        const consume = (specs: readonly IdentityFieldSpec[]) => {
            for (const s of specs) {
                if (TRANSACTIONAL_FIELDS.has(s.name)) continue;
                const existing = merged.get(s.name);
                if (!existing) {
                    merged.set(s.name, s);
                } else if (s.required && !existing.required) {
                    // Required wins over optional when the same field appears in both.
                    merged.set(s.name, s);
                }
            }
        };
        consume(FIAT_DEPOSIT_IDENTITY_FIELDS);
        consume(FIAT_WITHDRAW_IDENTITY_FIELDS);

        return {
            fields: [...merged.values()].map((spec) => ({
                key: spec.name,
                label: humanizeFieldName(spec.name),
                type: spec.kind === 'date' ? 'date' : spec.enumConst ? 'select' : 'text',
                required: spec.required,
                placeholder: spec.description,
                options: spec.enumConst
                    ? ENUM_VALUES[spec.enumConst].map((v) => ({
                          value: v,
                          label: (ENUM_LABELS[spec.enumConst!] ?? ((x: string) => x))(v),
                      }))
                    : undefined,
            })),
            documents: [],
        };
    }

    async submitKyc(customerId: string, data: KycSubmissionData): Promise<KycSubmissionResult> {
        const requiredFields = new Set<string>();
        for (const spec of FIAT_DEPOSIT_IDENTITY_FIELDS)
            if (spec.required) requiredFields.add(spec.name);
        for (const spec of FIAT_WITHDRAW_IDENTITY_FIELDS)
            if (spec.required) requiredFields.add(spec.name);

        for (const name of requiredFields) {
            if (TRANSACTIONAL_FIELDS.has(name)) continue;
            const value = data.fields[name];
            if (!value || !value.trim()) {
                throw new AnchorError(
                    `Missing required PDAX KYC field: ${name}`,
                    'MISSING_REQUIRED_FIELD',
                    400,
                );
            }
        }

        // Browser persists the submitted fields via kycStore; server is stateless.
        return { customerId, kycStatus: 'approved' };
    }

    async getKycStatus(_customerId: string): Promise<KycStatus> {
        // PDAX has no server-side customer record, so the server can't report
        // status. Throwing lets RampPage.checkAndUpdateKycStatus' catch block
        // preserve whatever the browser store already holds.
        throw new AnchorError(
            'PDAX does not track KYC status server-side; the browser store is authoritative.',
            'KYC_STATUS_NOT_SERVER_TRACKED',
            501,
        );
    }

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        return {
            id: randomUUID(),
            customerId: input.customerId,
            type: input.account.type,
            status: 'active',
            createdAt: new Date().toISOString(),
        };
    }

    async getFiatAccounts(_customerId: string): Promise<SavedFiatAccount[]> {
        // Bank-account records live in the browser; server never holds them.
        return [];
    }

    // -------------------------------------------------------------------
    // PDAX-backed methods
    // -------------------------------------------------------------------

    async getQuote(input: GetQuoteInput): Promise<Quote> {
        const amount = input.fromAmount ?? input.toAmount;
        if (!amount) {
            throw new AnchorError(
                'PDAX getQuote requires fromAmount (or toAmount).',
                'MISSING_AMOUNT',
                400,
            );
        }

        const isOnRamp = input.fromCurrency === 'PHP';
        const side: TradeSide = isOnRamp ? 'buy' : 'sell';
        const quantityCurrency = isOnRamp ? 'PHP' : PDAX_USDC;

        const body: TradeQuoteRequest = {
            side,
            quote_currency: PDAX_USDC,
            base_currency: 'PHP',
            currency: quantityCurrency,
            quantity: amount,
        };

        const data = await this.request<SuccessEnvelope<TradeQuoteData>>(
            'POST',
            '/v2/trade/quote',
            { body },
        ).then((r) => r.data);

        const fromAmount = isOnRamp ? String(data.total_amount) : String(data.base_quantity);
        const toAmount = isOnRamp ? String(data.base_quantity) : String(data.total_amount);

        return {
            id: data.quote_id,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            fromAmount,
            toAmount,
            exchangeRate: String(data.price),
            fee: '0',
            expiresAt: data.expires_at,
            createdAt: new Date().toISOString(),
        };
    }

    async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
        if (!input.identity) {
            throw new AnchorError(
                'PDAX on-ramp requires inline identity fields.',
                'MISSING_IDENTITY',
                400,
            );
        }
        const identity = input.identity;
        const method = (identity.method as FiatDepositRequest['method']) ?? 'instapay_upay_cashin';
        const identifier = randomUUID();

        const body: Record<string, unknown> = {
            ...identity,
            method,
            identifier,
            currency: 'PHP',
            amount: input.amount,
        };

        const response = await this.request<FiatDepositResponse>('POST', '/fiat/deposit', { body });

        const now = new Date().toISOString();
        const state: PdaxOnRampState = {
            id: identifier,
            customerId: input.customerId,
            quoteId: input.quoteId,
            stellarAddress: input.stellarAddress,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            expectedCryptoAmount: '',
            method,
            identity,
            paymentCheckoutUrl: response.payment_checkout_url,
            stage: 'fiat_pending',
            createdAt: now,
            updatedAt: now,
        };
        await this.stateStore.putOnRamp(state);
        return this.onRampStateToTx(state);
    }

    async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
        const state = await this.stateStore.getOnRamp(transactionId);
        if (!state) return null;

        if (state.stage === 'fiat_pending') {
            const fiatTx = await this.findFiatTxn(transactionId);
            if (fiatTx?.status === 'COMPLETED' || fiatTx?.fulfilled_at) {
                state.stage = 'fiat_fulfilled';
            } else if (fiatTx?.status === 'FAILED' || fiatTx?.declined_at) {
                state.stage = 'failed';
            }
        }

        if (state.stage === 'fiat_fulfilled') {
            const order = await this.executeTrade(state.quoteId, 'buy');
            state.orderId = String(order.order_id);
            state.expectedCryptoAmount = String(order.base_quantity);
            state.stage = 'trade_executed';
        }

        if (state.stage === 'trade_executed') {
            await this.cryptoWithdraw({
                identifier: transactionId,
                currency: PDAX_USDC,
                address: state.stellarAddress,
                amount: state.expectedCryptoAmount,
                tag: '',
                beneficiary_first_name: state.identity.beneficiary_first_name ?? '',
                beneficiary_last_name: state.identity.beneficiary_last_name ?? '',
                beneficiary_exchange: 'self',
                send_to_self: 'true',
                beneficiary_wallet: 'decentralized',
            });
            state.stage = 'crypto_dispatched';
        }

        if (state.stage === 'crypto_dispatched') {
            const cryptoTx = await this.findCryptoTxn(transactionId);
            if (cryptoTx?.status === 'completed') {
                state.stage = 'completed';
                state.cryptoWithdrawId = cryptoTx.transaction_id;
                state.cryptoTxHash = cryptoTx.txn_hash;
            } else if (cryptoTx?.status === 'failed') {
                state.stage = 'failed';
            }
        }

        state.updatedAt = new Date().toISOString();
        await this.stateStore.putOnRamp(state);
        return this.onRampStateToTx(state);
    }

    async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
        if (!input.identity) {
            throw new AnchorError(
                'PDAX off-ramp requires inline identity fields.',
                'MISSING_IDENTITY',
                400,
            );
        }

        const identity = input.identity;
        const deposit = await this.request<SuccessEnvelope<CryptoDepositData>>(
            'GET',
            `/crypto/deposit?currency=${PDAX_USDC}`,
        ).then((r) => r.data);

        const identifier = randomUUID();
        const now = new Date().toISOString();

        const state: PdaxOffRampState = {
            id: identifier,
            customerId: input.customerId,
            quoteId: input.quoteId,
            stellarAddress: deposit.address,
            fromCurrency: input.fromCurrency,
            toCurrency: input.toCurrency,
            amount: input.amount,
            expectedFiatAmount: '',
            method: (identity.method as PdaxOffRampState['method']) ?? 'PAY-TO-ACCOUNT-REAL-TIME',
            bankCode: identity.beneficiary_bank_code ?? '',
            accountName: identity.beneficiary_account_name ?? '',
            accountNumber: identity.beneficiary_account_number ?? '',
            identity,
            depositAddress: deposit.address,
            depositMemo: deposit.tag,
            stage: 'crypto_pending',
            createdAt: now,
            updatedAt: now,
        };
        await this.stateStore.putOffRamp(state);
        return this.offRampStateToTx(state);
    }

    async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
        const state = await this.stateStore.getOffRamp(transactionId);
        if (!state) return null;

        if (state.stage === 'crypto_pending') {
            const cryptoTx = await this.findCryptoTxn(transactionId);
            if (cryptoTx?.status === 'completed') {
                state.stage = 'crypto_received';
            } else if (cryptoTx?.status === 'failed') {
                state.stage = 'failed';
            }
        }

        if (state.stage === 'crypto_received') {
            const order = await this.executeTrade(state.quoteId, 'sell');
            state.orderId = String(order.order_id);
            state.expectedFiatAmount = String(order.total_amount);
            state.stage = 'trade_executed';
        }

        if (state.stage === 'trade_executed') {
            const body: FiatWithdrawRequest = {
                ...(state.identity as IdentityFields),
                identifier: transactionId,
                amount: state.expectedFiatAmount || state.amount,
                currency: 'PHP',
                method: state.method,
                fee_type: (state.identity.fee_type as FiatWithdrawRequest['fee_type']) ?? 'Sender',
                beneficiary_bank_code: state.bankCode,
                beneficiary_account_name: state.accountName,
                beneficiary_account_number: state.accountNumber,
            } as FiatWithdrawRequest;
            const res = await this.request<SuccessEnvelope<FiatWithdrawData>>(
                'POST',
                '/fiat/withdraw',
                { body },
            ).then((r) => r.data);
            state.fiatWithdrawId = res.request_id;
            state.stage = 'fiat_dispatched';
        }

        if (state.stage === 'fiat_dispatched') {
            const fiatTx = await this.findFiatTxn(transactionId);
            if (fiatTx?.status === 'COMPLETED' || fiatTx?.fulfilled_at) {
                state.stage = 'completed';
            } else if (fiatTx?.status === 'FAILED' || fiatTx?.declined_at) {
                state.stage = 'failed';
            }
        }

        state.updatedAt = new Date().toISOString();
        await this.stateStore.putOffRamp(state);
        return this.offRampStateToTx(state);
    }

    // -------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------

    private async findFiatTxn(identifier: string): Promise<FiatTransaction | undefined> {
        const res = await this.request<SuccessEnvelope<FiatTransaction[]>>(
            'GET',
            `/fiat/transactions?identifier=${encodeURIComponent(identifier)}`,
        );
        return res.data?.find((t) => t.identifier === identifier) ?? res.data?.[0];
    }

    private async findCryptoTxn(identifier: string): Promise<CryptoTransaction | undefined> {
        const res = await this.request<SuccessEnvelope<CryptoTransaction[]>>(
            'GET',
            `/crypto/transactions?identifier=${encodeURIComponent(identifier)}`,
        );
        return res.data?.[0];
    }

    private async executeTrade(quoteId: string, side: TradeSide): Promise<TradeOrderData> {
        const body: TradeOrderRequest = {
            quote_id: quoteId,
            side,
            idempotency_id: randomUUID(),
        };
        const res = await this.request<SuccessEnvelope<TradeOrderData>>('POST', '/trade', {
            body,
        });
        return res.data;
    }

    private async cryptoWithdraw(body: CryptoWithdrawRequest): Promise<CryptoWithdrawResponse> {
        return this.request<CryptoWithdrawResponse>('POST', '/crypto/withdraw', { body });
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT',
        path: string,
        opts: { body?: unknown } = {},
    ): Promise<T> {
        // `path` may include /v2 already (as in /v2/trade/quote); otherwise it is a v1 path.
        const fullPath = path.startsWith('/v2/')
            ? `/pdax-institution${path}`
            : `${API_PREFIX}${path}`;
        const url = `${this.baseUrl}${fullPath}`;

        const { accessToken, idToken } = await this.auth.getTokens();
        const headers: Record<string, string> = {
            access_token: accessToken,
            id_token: idToken,
        };
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

        const response = await this.fetchFn(url, {
            method,
            headers,
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        const text = await response.text();
        let parsed: unknown = {};
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                // Non-JSON response — fall through.
            }
        }

        if (!response.ok) {
            const err = parsed as { code?: string; message?: string };
            throw new AnchorError(
                err.message || `PDAX request failed: ${response.status} ${url}`,
                err.code || 'PDAX_REQUEST_ERROR',
                response.status,
            );
        }

        return parsed as T;
    }

    private onRampStateToTx(state: PdaxOnRampState): OnRampTransaction {
        return {
            id: state.id,
            customerId: state.customerId,
            quoteId: state.quoteId,
            status: stageToOnRampStatus(state.stage),
            fromAmount: state.amount,
            fromCurrency: state.fromCurrency,
            toAmount: state.expectedCryptoAmount,
            toCurrency: state.toCurrency,
            stellarAddress: state.stellarAddress,
            interactiveUrl: state.paymentCheckoutUrl,
            stellarTxHash: state.cryptoTxHash,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
        };
    }

    private offRampStateToTx(state: PdaxOffRampState): OffRampTransaction {
        return {
            id: state.id,
            customerId: state.customerId,
            quoteId: state.quoteId,
            status: stageToOffRampStatus(state.stage),
            fromAmount: state.amount,
            fromCurrency: state.fromCurrency,
            toAmount: state.expectedFiatAmount,
            toCurrency: state.toCurrency,
            // For PDAX, the user pays USDCXLM into PDAX's deposit address; the
            // off-ramp UI reads this field as the destination of the user-built
            // Stellar payment.
            stellarAddress: state.depositAddress ?? '',
            memo: state.depositMemo,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
        };
    }
}

function stageToOnRampStatus(stage: PdaxOnRampState['stage']): TransactionStatus {
    switch (stage) {
        case 'fiat_pending':
            return 'pending';
        case 'fiat_fulfilled':
        case 'trade_executed':
        case 'crypto_dispatched':
            return 'processing';
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
    }
}

function stageToOffRampStatus(stage: PdaxOffRampState['stage']): TransactionStatus {
    switch (stage) {
        case 'crypto_pending':
            return 'pending';
        case 'crypto_received':
        case 'trade_executed':
        case 'fiat_dispatched':
            return 'processing';
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
    }
}

function humanizeFieldName(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/\bdob\b/i, 'Date of Birth');
}
