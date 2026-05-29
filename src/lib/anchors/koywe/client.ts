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
 * scoped to a per-user email and caches it for the client's lifetime.
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
 *     email: 'stellar-ar@koywe-test.com',
 *     usdcIssuer: process.env.PUBLIC_USDC_ISSUER!,
 * });
 *
 * const quote = await koywe.getQuote({ ramp: 'onramp', fiatCurrency: 'ARS', amount: '10000' });
 * ```
 */

import { StrKey } from '@stellar/stellar-sdk';
import {
    KoyweError,
    type KoyweConfig,
    type KoyweRail,
    type KoyweTokenInfo,
    type KoyweKycStatus,
    type KoywePaymentMethod,
    type KoyweQuote,
    type KoyweDepositInstructions,
    type KoyweOnRampOrder,
    type KoyweOffRampOrder,
    type KoyweOrder,
    type GetQuoteArgs,
    type CreateOnRampOrderArgs,
    type CreateOffRampOrderArgs,
    type KoyweAuthResponse,
    type KoyweTokenCurrency,
    type KoywePaymentProvider,
    type KoyweQuoteResponse,
    type KoyweOrderResponse,
    type KoyweAccountResponse,
    type KoyweErrorResponse,
} from './types';

/** Koywe's symbol for USDC on Stellar in quote/order requests. */
const USDC_STELLAR_SYMBOL = 'USDC Stellar';
/** The display symbol we expose to the host app for the Stellar leg. */
const USDC_DISPLAY_SYMBOL = 'USDC';

/**
 * Client for the Koywe crypto fiat on/off ramp API.
 *
 * Handles auth-token caching, currency/rail discovery, executable quotes,
 * order creation (on- and off-ramp), order polling, and KYC status. The hosted
 * KYC widget URL and the off-ramp tx-hash submit path are flagged with `TODO`
 * pending live confirmation.
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
    /** Local payment rails this app surfaces for Koywe (Argentina). */
    readonly supportedRails: readonly KoyweRail[] = ['wirear', 'qri'];

    private readonly config: KoyweConfig;
    /** Cached JWT for `config.email`. Lazily populated by {@link authToken}. */
    private token: string | undefined;

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

        const response = await this.request<KoyweOrderResponse>('POST', '/rest/orders', {
            quoteId: args.quoteId,
            destinationAddress: args.stellarAddress,
            email: this.config.email,
            documentNumber: args.documentNumber,
        });

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
     * Create an off-ramp order (USDC on Stellar → fiat) from an executable quote.
     *
     * The user then sends USDC to the returned {@link KoyweOffRampOrder.depositAddress}
     * and submits the resulting Stellar tx hash via {@link submitTxHash}.
     *
     * TODO(koywe): the off-ramp order field name is assumed to be
     * `destinationAddress` carrying the bank-account id (matches the documented
     * OpenAPI shape), but this was not verified against the live sandbox.
     *
     * @throws {KoyweError} On API failure.
     */
    async createOffRampOrder(args: CreateOffRampOrderArgs): Promise<KoyweOffRampOrder> {
        const response = await this.request<KoyweOrderResponse>('POST', '/rest/orders', {
            quoteId: args.quoteId,
            // TODO(koywe): off-ramp uses the bank-account id as destinationAddress
            // per the docs; confirm against a live off-ramp order.
            destinationAddress: args.bankAccountId,
            email: this.config.email,
            documentNumber: args.documentNumber,
        });

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
     * TODO(koywe): this path matches the documented OpenAPI spec but was not
     * exercised against the live sandbox.
     *
     * @throws {KoyweError} On API failure.
     */
    async submitTxHash(orderId: string, txHash: string): Promise<void> {
        await this.request('POST', `/rest/orders/${encodeURIComponent(orderId)}/txHash`, {
            txHash,
        });
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
    async getOrder(orderId: string): Promise<KoyweOrder | null> {
        try {
            const response = await this.request<KoyweOrderResponse>(
                'GET',
                `/rest/orders/${encodeURIComponent(orderId)}`,
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
     * Get a URL for Koywe's hosted KYC flow.
     *
     * TODO(koywe): the hosted KYC widget URL endpoint is unknown — the last
     * sandbox investigation did not surface a documented endpoint. Until it is
     * confirmed, this throws a clear 501 so callers can surface a "contact
     * support / complete KYC out-of-band" affordance rather than guessing.
     *
     * @throws {KoyweError} Always, with code `NOT_IMPLEMENTED` and status 501.
     */
    async getKycUrl(): Promise<string> {
        throw new KoyweError(
            'Koywe hosted KYC widget URL is not yet wired up — endpoint unconfirmed. ' +
                'Complete KYC in the Koywe dashboard for the test user.',
            'NOT_IMPLEMENTED',
            501,
        );
    }

    /**
     * Get the current KYC status for the configured user.
     *
     * Reads the account profile (`GET /rest/accounts/{email}`) and infers
     * approval from the presence of a `document.documentNumber`. A 404 (no
     * account) maps to `not_started`.
     *
     * @throws {KoyweError} On non-404 API errors.
     */
    async getKycStatus(): Promise<KoyweKycStatus> {
        try {
            const account = await this.request<KoyweAccountResponse>(
                'GET',
                `/rest/accounts/${encodeURIComponent(this.config.email)}`,
            );
            return account.document?.documentNumber ? 'approved' : 'not_started';
        } catch (error) {
            if (error instanceof KoyweError && error.statusCode === 404) {
                return 'not_started';
            }
            throw error;
        }
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * Return a cached JWT, signing in via `POST /rest/auth` on first use.
     * The token is scoped to `config.email` and valid for 24h; we keep it for
     * the lifetime of the (lazily-instantiated) client.
     */
    private async authToken(): Promise<string> {
        if (this.token) return this.token;

        const url = `${this.config.baseUrl}/rest/auth`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientId: this.config.clientId,
                secret: this.config.secret,
                email: this.config.email,
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
        this.token = data.token;
        return this.token;
    }

    /** Send an authenticated JSON request, mapping Koywe errors to {@link KoyweError}. */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
    ): Promise<T> {
        const token = await this.authToken();
        const url = `${this.config.baseUrl}${endpoint}`;
        console.log(`[Koywe] ${method} ${url}`, body ? JSON.stringify(body) : '');

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
            console.error(`[Koywe] Error ${response.status}:`, errorText);

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
        console.log(`[Koywe] Response:`, text || '(empty)');
        if (!text) return undefined as T;
        return JSON.parse(text) as T;
    }
}

// ===========================================================================
// Module-private mapping helpers
// ===========================================================================

/** Map a raw Koywe asset symbol to the display code we expose to the host app. */
function displayAsset(symbol: string | undefined): string {
    if (!symbol) return '';
    return symbol === USDC_STELLAR_SYMBOL ? USDC_DISPLAY_SYMBOL : symbol;
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
