/**
 * Koywe API Client
 *
 * A standalone, framework-agnostic client for the Koywe crypto fiat on/off ramp
 * API (`https://api-sandbox.koywe.com`, docs at https://docs-crypto.koywe.com).
 * Depends only on `@stellar/stellar-sdk` for Stellar public-key validation; copy
 * `client.ts`, `types.ts`, and `index.ts` together into any TypeScript project.
 *
 * **Server-side only** — authenticates with a `clientId`/`secret` pair that must
 * never be exposed to the browser. Exchanges them for a 24h JWT (`POST /rest/auth`)
 * and caches one token per user email (plus an email-less "app" token for
 * catalogue/quote calls that aren't user-scoped). Email is optional on `/auth`;
 * per-user operations (`createAccount`, `checkAccount`, order creation) take an
 * `email` argument so a single client can serve many users.
 *
 * On-ramp: Argentine pesos (ARS) → USDC on Stellar via WIREAR (CVU bank
 * transfer), QRI-AR (QR), or Khipu. Off-ramp: USDC → ARS to a registered bank
 * account.
 *
 * @example
 * ```ts
 * import { KoyweClient } from 'path/to/anchors/koywe';
 *
 * const koywe = new KoyweClient({
 *     clientId: process.env.KOYWE_CLIENT_ID!,
 *     secret: process.env.KOYWE_SECRET!,
 *     baseUrl: process.env.KOYWE_BASE_URL!,
 *     usdcIssuer: process.env.PUBLIC_USDC_ISSUER!,
 * });
 *
 * // Catalogue + pricing need no user identity.
 * const quote = await koywe.getQuote({ ramp: 'onramp', fiatCurrency: 'ARS', amount: '10000' });
 * // Per-user operations take the end-user's email.
 * const check = await koywe.checkAccount('alice@example.com'); // { canOperate, accountStatus, missing }
 * ```
 */

import { StrKey } from '@stellar/stellar-sdk';
import {
    KoyweError,
    type KoyweConfig,
    type KoyweRail,
    type KoyweTokenInfo,
    type KoyweAccountCheck,
    type KoyweCheckAccountResponse,
    type KoywePaymentMethod,
    type KoyweQuote,
    type KoyweDepositInstructions,
    type KoyweOnRampOrder,
    type KoyweOffRampOrder,
    type KoyweOrder,
    type GetQuoteArgs,
    type CreateOnRampOrderArgs,
    type CreateOffRampOrderArgs,
    type CreateAccountArgs,
    type CreateBankAccountArgs,
    type GetBankAccountsArgs,
    type KoyweBankAccount,
    type KoyweBankAccountRequest,
    type KoyweBankAccountResponse,
    type KoyweAccountRequest,
    type KoyweAuthResponse,
    type KoyweTokenCurrency,
    type KoywePaymentProvider,
    type KoyweQuoteResponse,
    type KoyweOrderResponse,
    type KoyweErrorResponse,
} from './types';

/** Koywe's symbol for USDC on Stellar in quote/order requests. */
const USDC_STELLAR_SYMBOL = 'USDC Stellar';
/** The display symbol we expose to the host app for the Stellar leg. */
const USDC_DISPLAY_SYMBOL = 'USDC';

/**
 * Client for the Koywe crypto fiat on/off ramp API.
 *
 * Handles per-user auth-token caching, currency/rail discovery, executable
 * quotes, delegated-KYC account registration, order creation (on- and
 * off-ramp), order polling, and KYC status. Request/response shapes are
 * confirmed against `koywe.openapi.yaml`.
 */
export class KoyweClient {
    /** Machine-readable provider identifier. */
    readonly name = 'koywe';
    /** Human-readable provider name. */
    readonly displayName = 'Koywe';
    /** Tokens Koywe can deliver on Stellar. The issuer is injected from host config. */
    readonly supportedTokens: readonly KoyweTokenInfo[];
    /** ISO 4217 fiat currency codes supported by Koywe (crypto product). */
    readonly supportedCurrencies: readonly string[] = ['ARS', 'CLP', 'MXN', 'COP', 'PEN', 'BRL'];
    /** Local payment rails this app surfaces for Koywe (per market). */
    readonly supportedRails: readonly KoyweRail[] = ['wirear', 'qri', 'spei', 'pse'];

    private readonly config: KoyweConfig;
    /**
     * Cached JWTs keyed by email. The empty-string key holds the email-less
     * "app" token used for catalogue/quote calls. Lazily populated by
     * {@link authToken}.
     */
    private readonly tokens = new Map<string, string>();

    constructor(config: KoyweConfig) {
        this.config = config;
        this.supportedTokens = [
            {
                symbol: USDC_DISPLAY_SYMBOL,
                name: 'USD Coin',
                issuer: config.usdcIssuer,
                koyweSymbol: USDC_STELLAR_SYMBOL,
                decimals: 6,
            },
        ];
    }

    /** Console-log when `config.debug` is set. Never passed credentials. */
    private debugLog(...args: unknown[]): void {
        if (this.config.debug) console.log(...args);
    }

    /** Console-error when `config.debug` is set. */
    private debugError(...args: unknown[]): void {
        if (this.config.debug) console.error(...args);
    }

    // =========================================================================
    // Discovery
    // =========================================================================

    /** List Koywe's token/currency catalogue (`GET /rest/token-currencies`). */
    async getTokenCurrencies(): Promise<KoyweTokenCurrency[]> {
        return this.request<KoyweTokenCurrency[]>('GET', '/rest/token-currencies');
    }

    /**
     * List the payment providers (rails) available for a fiat currency, mapped to
     * UI-friendly {@link KoywePaymentMethod} options.
     *
     * `GET /rest/payment-providers?symbol={fiat}`.
     */
    async getPaymentProviders(fiatCurrency: string): Promise<KoywePaymentMethod[]> {
        const providers = await this.request<KoywePaymentProvider[]>(
            'GET',
            `/rest/payment-providers?symbol=${encodeURIComponent(fiatCurrency)}`,
        );
        return providers.map((p) => ({
            id: p._id,
            name: p.name,
            label: labelForProvider(p.name),
            rail: railForProvider(p.name),
            fee: p.fee,
        }));
    }

    // =========================================================================
    // Quote
    // =========================================================================

    /**
     * Request an executable conversion quote.
     *
     * On-ramp prices `fiatCurrency` → USDC and requires a `paymentMethodId`;
     * off-ramp prices USDC → `fiatCurrency`. Executable quotes return a
     * `quoteId` and expire in ~2-5 minutes.
     *
     * @throws {KoyweError} On API failure.
     */
    async getQuote(args: GetQuoteArgs): Promise<KoyweQuote> {
        const isOnRamp = args.ramp === 'onramp';
        const symbolIn = isOnRamp ? args.fiatCurrency : USDC_STELLAR_SYMBOL;
        const symbolOut = isOnRamp ? USDC_STELLAR_SYMBOL : args.fiatCurrency;

        const body: Record<string, unknown> = {
            amountIn: Number(args.amount),
            symbolIn,
            symbolOut,
            executable: true,
        };
        if (isOnRamp && args.paymentMethodId) {
            body.paymentMethodId = args.paymentMethodId;
        }

        const response = await this.request<KoyweQuoteResponse>('POST', '/rest/quotes', body);

        const expiresAt = response.validUntil
            ? new Date(response.validUntil * 1000).toISOString()
            : new Date(Date.now() + 120_000).toISOString();

        return {
            id: response.quoteId ?? '',
            ramp: args.ramp,
            sourceAsset: displayAsset(response.symbolIn),
            targetAsset: displayAsset(response.symbolOut),
            sourceAmount: String(response.amountIn),
            destinationAmount: String(response.amountOut),
            exchangeRate: String(response.exchangeRate),
            fee: String((response.koyweFee ?? 0) + (response.networkFee ?? 0)),
            expiresAt,
            paymentMethodId: response.paymentMethodId,
        };
    }

    // =========================================================================
    // On-ramp
    // =========================================================================

    /**
     * Create an on-ramp order (fiat → USDC on Stellar) from an executable quote.
     *
     * For WIREAR the response carries inline CVU/alias/bank instructions; for
     * QRI / Khipu it carries a `providedAction` hosted redirect URL the user
     * must open to pay.
     *
     * @throws {KoyweError} If `stellarAddress` is missing/invalid or on API failure.
     */
    async createOnRampOrder(args: CreateOnRampOrderArgs): Promise<KoyweOnRampOrder> {
        if (!args.stellarAddress) {
            throw new KoyweError(
                'stellarAddress is required to create a Koywe on-ramp order',
                'MISSING_STELLAR_ADDRESS',
                400,
            );
        }
        if (!StrKey.isValidEd25519PublicKey(args.stellarAddress)) {
            throw new KoyweError(
                `Invalid Stellar public key: ${args.stellarAddress}`,
                'INVALID_STELLAR_ADDRESS',
                400,
            );
        }

        const email = args.email ?? this.config.email;
        const response = await this.request<KoyweOrderResponse>(
            'POST',
            '/rest/orders',
            {
                quoteId: args.quoteId,
                destinationAddress: args.stellarAddress,
                ...(email ? { email } : {}),
                documentNumber: args.documentNumber,
            },
            email,
        );

        return {
            id: response.orderId,
            quoteId: response.quoteId ?? args.quoteId,
            status: response.status ?? 'WAITING',
            sourceAmount: String(response.amountIn),
            destinationAmount: String(response.amountOut),
            sourceAsset: displayAsset(response.symbolIn),
            targetAsset: displayAsset(response.symbolOut),
            stellarAddress: args.stellarAddress,
            deposit: parseDepositInstructions(response.providedAddress),
            interactiveUrl: response.providedAction,
        };
    }

    // =========================================================================
    // Off-ramp
    // =========================================================================

    /**
     * Register a bank account to receive an off-ramp payout
     * (`POST /rest/bank-accounts`).
     *
     * Off-ramp orders reference the payout account by id, so this must run
     * before {@link createOffRampOrder}: the returned {@link KoyweBankAccount.id}
     * is what you pass as `bankAccountId`. In the live sandbox the
     * `accountNumber` must be one of Koywe's validated test accounts for the
     * country and correspond to the user's document number.
     *
     * @throws {KoyweError} On API failure (e.g. an unvalidated account number, or
     *   `"this bank account is already registered"` — use {@link getBankAccounts}
     *   to recover the existing id).
     */
    async createBankAccount(args: CreateBankAccountArgs): Promise<KoyweBankAccount> {
        const body: KoyweBankAccountRequest = {
            accountNumber: args.accountNumber,
            countryCode: args.countryCode,
            currencySymbol: args.currencySymbol,
            email: args.email,
            ...(args.documentNumber ? { documentNumber: args.documentNumber } : {}),
            ...(args.bankCode ? { bankCode: args.bankCode } : {}),
            ...(args.accountType ? { accountType: args.accountType } : {}),
        };
        const response = await this.request<KoyweBankAccountResponse>(
            'POST',
            '/rest/bank-accounts',
            body,
            args.email,
        );
        return mapBankAccount(response);
    }

    /**
     * List a user's registered bank accounts for a country/currency
     * (`GET /rest/bank-accounts`).
     *
     * Useful to make {@link createBankAccount} idempotent: look up an existing
     * account by `accountNumber` before registering, since re-registering the
     * same account returns a `"this bank account is already registered"` error.
     *
     * @throws {KoyweError} On API failure.
     */
    async getBankAccounts(args: GetBankAccountsArgs): Promise<KoyweBankAccount[]> {
        const params = new URLSearchParams({
            countryCode: args.countryCode,
            currencySymbol: args.currencySymbol,
            email: args.email,
        });
        const response = await this.request<KoyweBankAccountResponse[]>(
            'GET',
            `/rest/bank-accounts?${params}`,
            undefined,
            args.email,
        );
        return response.map(mapBankAccount);
    }

    /**
     * Create an off-ramp order (USDC on Stellar → fiat) from an executable quote.
     *
     * The user then sends USDC to the returned {@link KoyweOffRampOrder.depositAddress}
     * and submits the resulting Stellar tx hash via {@link submitTxHash}.
     *
     * Per the `orders_body` schema, off-ramp orders carry the bank-account id in
     * `destinationAddress`.
     *
     * @throws {KoyweError} On API failure.
     */
    async createOffRampOrder(args: CreateOffRampOrderArgs): Promise<KoyweOffRampOrder> {
        const email = args.email ?? this.config.email;
        const response = await this.request<KoyweOrderResponse>(
            'POST',
            '/rest/orders',
            {
                quoteId: args.quoteId,
                destinationAddress: args.bankAccountId,
                ...(email ? { email } : {}),
                documentNumber: args.documentNumber,
            },
            email,
        );

        return {
            id: response.orderId,
            quoteId: response.quoteId ?? args.quoteId,
            status: response.status ?? 'WAITING',
            sourceAmount: String(response.amountIn),
            destinationAmount: String(response.amountOut),
            sourceAsset: displayAsset(response.symbolIn),
            targetAsset: displayAsset(response.symbolOut),
            bankAccountId: args.bankAccountId,
            depositAddress: response.providedAddress,
            interactiveUrl: response.providedAction,
        };
    }

    /**
     * Attach the Stellar transaction hash to an off-ramp order so Koywe can
     * reconcile the on-chain USDC transfer (`POST /rest/orders/{orderId}/txHash`).
     *
     * @throws {KoyweError} On API failure.
     */
    async submitTxHash(orderId: string, txHash: string, email?: string): Promise<void> {
        await this.request(
            'POST',
            `/rest/orders/${encodeURIComponent(orderId)}/txHash`,
            { txHash },
            email ?? this.config.email,
        );
    }

    // =========================================================================
    // Order polling
    // =========================================================================

    /**
     * Fetch the current state of an order (on- or off-ramp).
     *
     * @returns The order, or `null` if not found.
     * @throws {KoyweError} On non-404 API errors.
     */
    async getOrder(orderId: string, email?: string): Promise<KoyweOrder | null> {
        try {
            const response = await this.request<KoyweOrderResponse>(
                'GET',
                `/rest/orders/${encodeURIComponent(orderId)}`,
                undefined,
                email ?? this.config.email,
            );
            return {
                id: response.orderId,
                status: response.status,
                sourceAmount: String(response.amountIn),
                destinationAmount: String(response.amountOut),
                sourceAsset: displayAsset(response.symbolIn),
                targetAsset: displayAsset(response.symbolOut),
                deposit: parseDepositInstructions(response.providedAddress),
                depositAddress: response.providedAddress,
                interactiveUrl: response.providedAction,
                dates: response.dates,
                txHash: response.txHash,
                statusDetails: response.statusDetails,
                isDeliveryExpired: Boolean(response.dates?.expiredByRetriesDate),
            };
        } catch (error) {
            if (error instanceof KoyweError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    // =========================================================================
    // KYC
    // =========================================================================

    /**
     * Register a delegated-KYC account (`POST /rest/accounts`).
     *
     * This is the "submit KYC" step: the integrator collects the end-user's
     * identity details and posts them to Koywe, which performs verification.
     * There is no hosted KYC widget in the delegated-KYC model. The JWT is
     * scoped to `args.email`, which the account is registered under.
     *
     * @throws {KoyweError} On API failure (e.g. validation errors).
     */
    async createAccount(args: CreateAccountArgs): Promise<void> {
        const body: KoyweAccountRequest = {
            email: args.email,
            document: {
                documentNumber: args.document.documentNumber,
                documentType: args.document.documentType,
                country: args.document.country,
                isCompany: args.document.isCompany ?? false,
                ...(args.document.others ? { others: args.document.others } : {}),
            },
            address: {
                addressCountry: args.address.country,
                addressZipCode: args.address.zipCode,
                addressState: args.address.state,
                addressCity: args.address.city,
                addressStreet: args.address.street,
                ...(args.address.neighborhood
                    ? { addressNeighborhood: args.address.neighborhood }
                    : {}),
            },
            personalInfo: { ...args.personalInfo },
        };
        await this.request('POST', '/rest/accounts', body, args.email);
    }

    /**
     * Check whether a user's account can actually operate
     * (`GET /rest/accounts/{email}/check`).
     *
     * This is Koywe's real verdict — `canOperate` plus the list of still-missing
     * requirements — not an inference from whether a document was submitted.
     * Prefer this over assuming "document present ⇒ approved": delegated-KYC
     * accounts can have a document on file yet still be unverified (e.g. pending
     * document uploads via `POST /upload-delegated-kyc-files`). A 404 (no
     * account) maps to a non-operable `not_started` check.
     *
     * @param email The user's email; falls back to `config.email`.
     * @throws {KoyweError} If no email is available, or on non-404 API errors.
     */
    async checkAccount(email?: string): Promise<KoyweAccountCheck> {
        const resolved = email ?? this.config.email;
        if (!resolved) {
            throw new KoyweError(
                'An email is required to check a Koywe account',
                'MISSING_EMAIL',
                400,
            );
        }
        try {
            const result = await this.request<KoyweCheckAccountResponse>(
                'GET',
                `/rest/accounts/${encodeURIComponent(resolved)}/check`,
                undefined,
                resolved,
            );
            return {
                canOperate: result.canOperate ?? false,
                accountStatus: result.accountStatus ?? 'unknown',
                missing: (result.errors ?? []).map((e) => ({
                    field: e.field,
                    message: e.message,
                })),
                nextVerificationDate: result.nextVerificationDate,
            };
        } catch (error) {
            if (error instanceof KoyweError && error.statusCode === 404) {
                return { canOperate: false, accountStatus: 'not_started', missing: [] };
            }
            throw error;
        }
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * Return a cached JWT for `email` (or an email-less app token when omitted),
     * signing in via `POST /rest/auth` on first use. Tokens are valid for 24h
     * and kept for the lifetime of the (lazily-instantiated) client. Email is
     * optional on `/auth`; including it scopes the JWT to that user's account.
     */
    private async authToken(email?: string): Promise<string> {
        const key = email ?? '';
        const cached = this.tokens.get(key);
        if (cached) return cached;

        const url = `${this.config.baseUrl}/rest/auth`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: this.config.clientId,
                secret: this.config.secret,
                ...(email ? { email } : {}),
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new KoyweError(
                text || `Koywe auth failed: ${response.status}`,
                'AUTH_FAILED',
                response.status,
            );
        }

        const data = (await response.json()) as KoyweAuthResponse;
        this.tokens.set(key, data.token);
        return data.token;
    }

    /**
     * Send an authenticated JSON request, mapping Koywe errors to
     * {@link KoyweError}. Pass `email` to use that user's JWT; omit it for
     * catalogue/quote calls that aren't user-scoped.
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
        email?: string,
    ): Promise<T> {
        const token = await this.authToken(email);
        const url = `${this.config.baseUrl}${endpoint}`;
        this.debugLog(`[Koywe] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.debugError(`[Koywe] Error ${response.status}:`, errorText);

            let parsed: KoyweErrorResponse | undefined;
            try {
                parsed = JSON.parse(errorText) as KoyweErrorResponse;
            } catch {
                // Not JSON.
            }

            const message = parsed
                ? Array.isArray(parsed.message)
                    ? parsed.message.join('; ')
                    : parsed.message
                : errorText || `Koywe API error: ${response.status}`;

            throw new KoyweError(
                message || `Koywe API error: ${response.status}`,
                parsed?.error || 'KOYWE_ERROR',
                response.status,
            );
        }

        const text = await response.text();
        this.debugLog(`[Koywe] Response:`, text || '(empty)');
        if (!text) return undefined as T;
        return JSON.parse(text) as T;
    }
}

// ===========================================================================
// Exported helpers
// ===========================================================================

/**
 * Resolve a ramp's transaction limits from a {@link KoyweClient.getTokenCurrencies}
 * catalogue (Koywe's `GET /rest/token-currencies` — the documented "currency
 * tokens" discovery step).
 *
 * Returns the `{ min, max }` figures for the `fiatCurrency` under the given
 * crypto `tokenSymbol` (default `"USDC Stellar"`), or `null` when the pair is
 * not offered — i.e. the token is absent, or the fiat is not listed under it.
 * `min`/`max` are omitted individually when the API did not provide them.
 */
export function resolveFiatLimits(
    tokens: KoyweTokenCurrency[],
    fiatCurrency: string,
    tokenSymbol: string = USDC_STELLAR_SYMBOL,
): { min?: number; max?: number } | null {
    const token = tokens.find((t) => t.symbol === tokenSymbol);
    const fiat = token?.currencies.find((c) => c.symbol === fiatCurrency);
    if (!fiat) return null;
    const limits: { min?: number; max?: number } = {};
    if (fiat.minimum !== undefined) limits.min = fiat.minimum;
    if (fiat.maximum !== undefined) limits.max = fiat.maximum;
    return limits;
}

// ===========================================================================
// Module-private mapping helpers
// ===========================================================================

/** Map a raw Koywe asset symbol to the display code we expose to the host app. */
function displayAsset(symbol: string | undefined): string {
    if (!symbol) return '';
    return symbol === USDC_STELLAR_SYMBOL ? USDC_DISPLAY_SYMBOL : symbol;
}

/** Map a raw Koywe `BankAccount` to the client-facing {@link KoyweBankAccount}. */
function mapBankAccount(response: KoyweBankAccountResponse): KoyweBankAccount {
    return {
        id: response._id,
        accountNumber: response.accountNumber,
        countryCode: response.countryCode,
        currencySymbol: response.currencySymbol,
        bankCode: response.bankCode,
        bankName: response.name,
    };
}

/** Friendly UI label for a Koywe payment-provider name. */
function labelForProvider(name: string): string {
    switch (name.toUpperCase()) {
        case 'WIREAR':
            return 'Bank transfer (CVU)';
        case 'QRI-AR':
            return 'QR transfer';
        case 'KHIPU':
            return 'Khipu';
        case 'WIREMX':
            return 'Bank transfer (SPEI)';
        case 'STP':
            return 'SPEI (STP)';
        case 'PSE':
            return 'PSE';
        case 'BANCOLOMBIA':
            return 'Bancolombia';
        case 'NEQUI':
            return 'Nequi';
        case 'PALOMMA':
            return 'Palomma';
        case 'WIRECO':
            return 'Bank transfer';
        default:
            return name;
    }
}

/** Map a Koywe provider name to a shared local rail id, if one exists. */
function railForProvider(name: string): KoyweRail | undefined {
    switch (name.toUpperCase()) {
        case 'WIREAR':
            return 'wirear';
        case 'QRI-AR':
            return 'qri';
        case 'WIREMX':
            return 'spei';
        case 'PSE':
            return 'pse';
        default:
            return undefined;
    }
}

/**
 * Parse a WIREAR `providedAddress` multi-line string into structured deposit
 * fields. The sandbox returns lines like:
 *
 *   ` CVU 0000053600000017871248 \n alias 30718280229.KOYWE1 \n Banco Coinag \n tef@koywe.com `
 *
 * Returns `undefined` when there is no inline instruction string (e.g. QRI/Khipu
 * orders, which use `providedAction` instead).
 */
function parseDepositInstructions(
    providedAddress: string | undefined,
): KoyweDepositInstructions | undefined {
    if (!providedAddress || !providedAddress.trim()) return undefined;

    const result: KoyweDepositInstructions = { raw: providedAddress.trim() };
    const lines = providedAddress
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('cvu')) {
            result.cvu = line.replace(/cvu/i, '').trim();
        } else if (lower.startsWith('alias')) {
            result.alias = line.replace(/alias/i, '').trim();
        } else if (line.includes('@')) {
            result.email = line;
        } else {
            // Remaining free-text line is the bank name.
            result.bankName = result.bankName ?? line;
        }
    }

    return result;
}
