/**
 * Manteca API Client
 *
 * A standalone, framework-agnostic client for the Manteca v2 REST API
 * (`https://sandbox.manteca.dev` / `https://api.manteca.dev`, docs at
 * https://developers.manteca.dev). Depends only on `@stellar/stellar-sdk` for
 * Stellar public-key validation; copy `client.ts`, `types.ts`, and `index.ts`
 * together into any TypeScript project.
 *
 * **Server-side only** — authenticates with a single static API key sent in the
 * `md-api-key` header, which must never be exposed to the browser. There is no
 * token exchange and no OAuth (per Manteca's auth docs: "one header, every
 * request"). A single client serves many end-users; per-user operations take a
 * `userAnyId` (Manteca's id / numberId / externalId resolver).
 *
 * Targets Brazil first: BRL → USDC on Stellar via PIX (on-ramp), and USDC on
 * Stellar → BRL to a PIX key (off-ramp), orchestrated by Manteca "synthetics".
 *
 * NOTE: shapes are modeled from Manteca's published API reference, not yet
 * verified against a live sandbox. Fields awaiting live confirmation are flagged
 * with `TODO`.
 *
 * @example
 * ```ts
 * import { MantecaClient } from 'path/to/anchors/manteca';
 *
 * const manteca = new MantecaClient({
 *     apiKey: process.env.MANTECA_API_KEY!,
 *     baseUrl: process.env.MANTECA_BASE_URL!,
 *     usdcIssuer: process.env.PUBLIC_USDC_ISSUER!,
 *     defaultExchange: 'BRAZIL',
 * });
 *
 * const user = await manteca.createUser({ email: 'maria@example.com' });
 * await manteca.submitOnboarding({ email: 'maria@example.com', legalId: '11144477735' });
 * const synthetic = await manteca.createRampOn({
 *     userAnyId: user.numberId, asset: 'USDC', against: 'BRL',
 *     againstAmount: 100, stellarAddress: 'G...',
 * });
 * ```
 */

import { StrKey } from '@stellar/stellar-sdk';
import {
    MantecaError,
    MANTECA_TERMINAL_SYNTHETIC_STATUSES,
    type MantecaConfig,
    type MantecaExchange,
    type MantecaTokenInfo,
    type MantecaUser,
    type MantecaPrice,
    type MantecaQuote,
    type MantecaSynthetic,
    type MantecaWithdrawDestination,
    type CreateUserArgs,
    type SubmitOnboardingArgs,
    type GetQuoteArgs,
    type CreateRampOnArgs,
    type CreateRampOffArgs,
    type MantecaUserResponse,
    type MantecaSyntheticResponse,
    type MantecaPriceResponse,
    type MantecaWithdrawDestinationResponse,
    type MantecaErrorResponse,
} from './types';

/** Stellar uses 7 decimals for classic assets. */
const STELLAR_DECIMALS = 7;

/**
 * Client for the Manteca v2 crypto fiat on/off ramp API.
 *
 * Handles user onboarding, pricing, ramp-on/ramp-off synthetic creation, and
 * synthetic polling. All requests carry the static `md-api-key` header; the key
 * is never logged.
 */
export class MantecaClient {
    /** Machine-readable provider identifier. */
    readonly name = 'manteca';
    /** Human-readable provider name. */
    readonly displayName = 'Manteca';
    /** Tokens Manteca can deliver on Stellar. The issuer is injected from host config. */
    readonly supportedTokens: readonly MantecaTokenInfo[];
    /** ISO 4217 fiat currency codes this integration surfaces for Manteca. */
    readonly supportedCurrencies: readonly string[] = ['BRL', 'ARS', 'MXN', 'COP', 'CLP', 'PEN'];

    private readonly config: MantecaConfig;

    constructor(config: MantecaConfig) {
        this.config = config;
        this.supportedTokens = [
            {
                symbol: 'USDC',
                name: 'USD Coin',
                issuer: config.usdcIssuer,
                network: 'STELLAR',
                decimals: STELLAR_DECIMALS,
            },
        ];
    }

    /** Console-log when `config.debug` is set. Never passed the API key. */
    private debugLog(...args: unknown[]): void {
        if (this.config.debug) console.log(...args);
    }

    /** Console-error when `config.debug` is set. */
    private debugError(...args: unknown[]): void {
        if (this.config.debug) console.error(...args);
    }

    private get exchange(): MantecaExchange {
        return this.config.defaultExchange ?? 'BRAZIL';
    }

    // =========================================================================
    // Users & onboarding
    // =========================================================================

    /**
     * Create an end-user (`POST /crypto/v2/users`). The user starts in `CREATED`
     * / `ONBOARDING` and must finish onboarding to become `ACTIVE`. Manteca
     * assigns a per-user crypto deposit address per network (including Stellar)
     * on creation — see {@link MantecaUser.stellarAddress}.
     *
     * @throws {MantecaError} On API failure (e.g. `USER_EXISTS_EMAIL`).
     */
    async createUser(args: CreateUserArgs): Promise<MantecaUser> {
        const response = await this.request<MantecaUserResponse>('POST', '/crypto/v2/users', {
            email: args.email,
            exchange: args.exchange ?? this.exchange,
            type: args.type ?? 'INDIVIDUAL',
            ...(args.externalId ? { externalId: args.externalId } : {}),
            ...(args.sessionId ? { sessionId: args.sessionId } : {}),
        });
        return mapUser(response);
    }

    /**
     * Fetch an end-user by any id (`GET /crypto/v2/users/{userAnyId}`). Use this
     * to read onboarding progress and `canOperate`.
     *
     * @returns The user, or `null` if not found.
     * @throws {MantecaError} On non-404 API errors.
     */
    async getUser(userAnyId: string): Promise<MantecaUser | null> {
        try {
            const response = await this.request<MantecaUserResponse>(
                'GET',
                `/crypto/v2/users/${encodeURIComponent(userAnyId)}`,
            );
            return mapUser(response);
        } catch (error) {
            if (error instanceof MantecaError && error.statusCode === 404) return null;
            throw error;
        }
    }

    /**
     * Submit (or incrementally update) onboarding identity data
     * (`POST /crypto/v2/onboarding-actions/initial`). Supports incremental
     * updates — only provided fields are stored. In Brazil, supplying `legalId`
     * (CPF) auto-populates personal data, so the minimal Brazil call is email +
     * legalId.
     *
     * @throws {MantecaError} On API failure.
     */
    async submitOnboarding(args: SubmitOnboardingArgs): Promise<MantecaUser> {
        const exchange = args.exchange ?? this.exchange;
        const response = await this.request<MantecaUserResponse>(
            'POST',
            '/crypto/v2/onboarding-actions/initial',
            {
                email: args.email,
                legalId: args.legalId,
                exchange,
                legalIdType: args.legalIdType ?? 'NATIONAL_ID',
                legalIdNationality: args.legalIdNationality ?? exchange,
                type: args.type ?? 'INDIVIDUAL',
                ...(args.externalId ? { externalId: args.externalId } : {}),
                ...(args.sessionId ? { sessionId: args.sessionId } : {}),
                // personalData is a nested object per the create-user recipe —
                // NOT spread to the top level.
                ...(args.personalData ? { personalData: args.personalData } : {}),
                ...(args.banking ? { banking: args.banking } : {}),
            },
        );
        return mapUser(response);
    }

    /**
     * List the onboarding personal-data fields still missing for a user
     * (`GET /crypto/v2/stats/onboarding/missing-personal-data/{userAnyId}`).
     * Returns field paths (e.g. `surname`, `address.street`) that must be
     * submitted via {@link submitOnboarding} before the user can reach `ACTIVE`.
     *
     * @throws {MantecaError} On API failure.
     */
    async getMissingPersonalData(userAnyId: string): Promise<string[]> {
        const response = await this.request<{ missingData?: string[] } | string[]>(
            'GET',
            `/crypto/v2/stats/onboarding/missing-personal-data/${encodeURIComponent(userAnyId)}`,
        );
        if (Array.isArray(response)) return response;
        return response.missingData ?? [];
    }

    // =========================================================================
    // Pricing
    // =========================================================================

    /**
     * Current price for a ticker, e.g. `USDC_BRL`
     * (`GET /crypto/v2/prices/direct/{ticker}`). Returns both the nominal
     * `buy`/`sell` and the fee/spread-inclusive `effectiveBuy`/`effectiveSell`
     * (falling back to nominal when the effective fields are absent).
     */
    async getPrice(ticker: string): Promise<MantecaPrice> {
        const response = await this.request<MantecaPriceResponse>(
            'GET',
            `/crypto/v2/prices/direct/${encodeURIComponent(ticker)}`,
        );
        return {
            ticker: response.ticker,
            buy: response.buy,
            sell: response.sell,
            // Live wire nests the fee-inclusive price under `effectivePrice`;
            // fall back to the flat field, then to nominal.
            effectiveBuy: response.effectivePrice?.buy ?? response.effectiveBuy ?? response.buy,
            effectiveSell: response.effectivePrice?.sell ?? response.effectiveSell ?? response.sell,
            timestamp: response.timestamp,
        };
    }

    /**
     * Compose a normalized conversion quote from the crypto price. Manteca has no
     * single ramp "quote" endpoint and no crypto fee endpoint — the spread/fee is
     * already baked into the price's `effectiveBuy`/`effectiveSell`. On-ramp
     * (user buys crypto) transacts at the effective buy; off-ramp at the
     * effective sell. The ticker is `{asset}_{against}`.
     */
    async getQuote(args: GetQuoteArgs): Promise<MantecaQuote> {
        const ticker = `${args.asset}_${args.against}`;
        const price = await this.getPrice(ticker);
        const onramp = args.ramp === 'onramp';
        const effective = onramp ? price.effectiveBuy : price.effectiveSell;
        const nominal = onramp ? price.buy : price.sell;
        const nominalNum = parseFloat(nominal);
        const effectiveNum = parseFloat(effective);
        // Spread fraction = how far the effective price is from nominal, in the
        // direction that costs the user (above buy on-ramp, below sell off-ramp).
        const spreadFraction =
            nominalNum > 0
                ? onramp
                    ? (effectiveNum - nominalNum) / nominalNum
                    : (nominalNum - effectiveNum) / nominalNum
                : 0;
        return {
            ramp: args.ramp,
            ticker,
            asset: args.asset,
            against: args.against,
            price: effective,
            nominalPrice: nominal,
            spreadFraction,
            quotedAt: price.timestamp,
        };
    }

    // =========================================================================
    // Ramps (synthetics)
    // =========================================================================

    /**
     * Create a ramp-on synthetic (fiat → crypto): receives a fiat deposit,
     * converts to crypto, and withdraws to the given Stellar address in one
     * orchestrated operation (`POST /crypto/v2/synthetics/ramp-on`).
     *
     * The returned synthetic carries the fiat deposit instructions the user must
     * fund (`details.depositAddress` / `details.depositAlias` — a PIX
     * key/alias in Brazil). Poll {@link getSynthetic} until `isTerminal`.
     *
     * @throws {MantecaError} If `stellarAddress` is missing/invalid, or on API failure.
     */
    async createRampOn(args: CreateRampOnArgs): Promise<MantecaSynthetic> {
        this.assertStellarAddress(args.stellarAddress);
        const response = await this.request<MantecaSyntheticResponse>(
            'POST',
            '/crypto/v2/synthetics/ramp-on',
            {
                userAnyId: args.userAnyId,
                asset: args.asset,
                against: args.against,
                ...amountBody(args),
                destination: { address: args.stellarAddress, network: 'STELLAR' },
                ...(args.priceCode ? { priceCode: args.priceCode } : {}),
                ...(args.externalId ? { externalId: args.externalId } : {}),
                ...(args.sessionId ? { sessionId: args.sessionId } : {}),
            },
        );
        return mapSynthetic(response);
    }

    /**
     * Create a ramp-off synthetic (crypto → fiat): the user deposits crypto (USDC
     * on Stellar) to the address on the returned synthetic, Manteca sells it and
     * pays out fiat to `destinationAddress` (a PIX key in Brazil)
     * (`POST /crypto/v2/synthetics/ramp-off`).
     *
     * The returned synthetic's `details.depositAddress` is the crypto address the
     * user funds. Poll {@link getSynthetic} until `isTerminal`.
     *
     * @throws {MantecaError} On API failure (e.g. `INVALID_DESTINATION`).
     */
    async createRampOff(args: CreateRampOffArgs): Promise<MantecaSynthetic> {
        const response = await this.request<MantecaSyntheticResponse>(
            'POST',
            '/crypto/v2/synthetics/ramp-off',
            {
                userAnyId: args.userAnyId,
                asset: args.asset,
                against: args.against,
                ...amountBody(args),
                destination: {
                    address: args.destinationAddress,
                    ...(args.bankCode ? { bankCode: args.bankCode } : {}),
                    ...(args.accountType ? { accountType: args.accountType } : {}),
                },
                ...(args.priceCode ? { priceCode: args.priceCode } : {}),
                ...(args.externalId ? { externalId: args.externalId } : {}),
                ...(args.sessionId ? { sessionId: args.sessionId } : {}),
            },
        );
        return mapSynthetic(response);
    }

    /**
     * Fetch a synthetic by any id (`GET /crypto/v2/synthetics/{syntheticAnyId}`).
     * Use this to poll ramp progress; stop once {@link MantecaSynthetic.isTerminal}.
     *
     * @returns The synthetic, or `null` if not found.
     * @throws {MantecaError} On non-404 API errors.
     */
    async getSynthetic(syntheticAnyId: string): Promise<MantecaSynthetic | null> {
        try {
            const response = await this.request<MantecaSyntheticResponse>(
                'GET',
                `/crypto/v2/synthetics/${encodeURIComponent(syntheticAnyId)}`,
            );
            return mapSynthetic(response);
        } catch (error) {
            if (error instanceof MantecaError && error.statusCode === 404) return null;
            throw error;
        }
    }

    // =========================================================================
    // Destinations
    // =========================================================================

    /**
     * Resolve and validate a withdraw destination — a PIX key (Brazil), CBU/CVU/
     * alias (Argentina), or account (Colombia) — returning the recipient name and
     * masked legal ID (`GET /crypto/v2/info/withdraw-destination/{destination}`).
     *
     * A `400` (e.g. `WITHDRAW_DESTINATION`) is treated as an invalid-but-handled
     * destination (`valid: false`) rather than thrown, so callers can show a
     * validation message inline.
     *
     * @throws {MantecaError} On non-400 API errors.
     */
    async getWithdrawDestinationInfo(
        destination: string,
        country: MantecaExchange,
    ): Promise<MantecaWithdrawDestination> {
        try {
            const response = await this.request<MantecaWithdrawDestinationResponse>(
                'GET',
                `/crypto/v2/info/withdraw-destination/${encodeURIComponent(destination)}?country=${encodeURIComponent(country)}`,
            );
            return {
                address: response.destination ?? response.address ?? destination,
                name: response.recipientName ?? response.name,
                legalId: response.recipientLegalId ?? response.legalId,
                accountType: response.accountType,
                exchange: response.exchange,
                asset: response.asset,
                valid: true,
            };
        } catch (error) {
            if (error instanceof MantecaError && error.statusCode === 400) {
                return { address: destination, valid: false };
            }
            throw error;
        }
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /** Throw a {@link MantecaError} unless `address` is a valid Stellar public key. */
    private assertStellarAddress(address: string): void {
        if (!address) {
            throw new MantecaError(
                'stellarAddress is required to create a Manteca on-ramp',
                'MISSING_STELLAR_ADDRESS',
                400,
            );
        }
        if (!StrKey.isValidEd25519PublicKey(address)) {
            throw new MantecaError(
                `Invalid Stellar public key: ${address}`,
                'INVALID_STELLAR_ADDRESS',
                400,
            );
        }
    }

    /**
     * Send an authenticated JSON request, mapping Manteca's error envelope to
     * {@link MantecaError}. The static API key travels in `md-api-key`.
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        this.debugLog(`[Manteca] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'md-api-key': this.config.apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.debugError(`[Manteca] Error ${response.status}:`, errorText);

            let parsed: MantecaErrorResponse | undefined;
            try {
                parsed = JSON.parse(errorText) as MantecaErrorResponse;
            } catch {
                // Not JSON.
            }

            throw new MantecaError(
                parsed?.message || errorText || `Manteca API error: ${response.status}`,
                parsed?.internalStatus || 'MANTECA_ERROR',
                response.status,
            );
        }

        const text = await response.text();
        this.debugLog(`[Manteca] Response:`, text || '(empty)');
        if (!text) return undefined as T;
        return JSON.parse(text) as T;
    }
}

// ===========================================================================
// Module-private mapping helpers
// ===========================================================================

/** Map a raw Manteca user to the client-facing {@link MantecaUser}. */
function mapUser(raw: MantecaUserResponse): MantecaUser {
    // `/onboarding-actions/initial` wraps the user in a `{ user, person }`
    // envelope; the plain user endpoints return the user fields at top level.
    const response = ((raw as { user?: MantecaUserResponse }).user ?? raw) as MantecaUserResponse;
    const depositAddresses = (response.addresses?.depositAddresses ??
        {}) as MantecaUser['depositAddresses'];
    return {
        id: response.id,
        numberId: response.numberId,
        externalId: response.externalId,
        email: response.email,
        status: response.status,
        exchange: response.exchange,
        depositAddresses,
        stellarAddress: depositAddresses.STELLAR,
        onboarding: response.onboarding ?? {},
        canOperate: response.status === 'ACTIVE',
    };
}

/** Map a raw Manteca synthetic to the client-facing {@link MantecaSynthetic}. */
function mapSynthetic(response: MantecaSyntheticResponse): MantecaSynthetic {
    const details = response.details ?? {};
    // Brazil on-ramp deposit instructions arrive as a PIX QR under
    // `depositAddresses.PIX` (no scalar depositAddress).
    const pixRaw = details.depositAddresses?.PIX as
        | { code?: string; url?: string; expiresAt?: string }
        | undefined;
    const pix =
        pixRaw?.code && pixRaw?.url
            ? { code: pixRaw.code, url: pixRaw.url, expiresAt: pixRaw.expiresAt }
            : undefined;
    return {
        id: response.id,
        numberId: response.numberId,
        externalId: response.externalId,
        userId: response.userId,
        status: response.status,
        type: response.type,
        currentStage: response.currentStage,
        stages: response.stages ?? {},
        details: {
            depositAddress: details.depositAddress,
            depositAlias: details.depositAlias,
            depositAddresses: details.depositAddresses,
            pix,
            depositAvailableNetworks: details.depositAvailableNetworks,
            withdrawCostInAsset: details.withdrawCostInAsset,
            withdrawCostInAgainst: details.withdrawCostInAgainst,
            effectiveWithdrawAmount: details.effectiveWithdrawAmount,
            price: details.price,
            effectivePrice: details.effectivePrice,
            priceExpireAt: details.priceExpireAt,
        },
        creationTime: response.creationTime,
        updatedAt: response.updatedAt,
        isTerminal: MANTECA_TERMINAL_SYNTHETIC_STATUSES.includes(response.status),
    };
}

/**
 * Build the amount field for a synthetic body. Manteca accepts exactly one of
 * `assetAmount` (crypto units) or `againstAmount` (fiat units).
 */
function amountBody(args: {
    assetAmount?: number;
    againstAmount?: number;
}): Record<string, number> {
    if (args.assetAmount != null) return { assetAmount: args.assetAmount };
    if (args.againstAmount != null) return { againstAmount: args.againstAmount };
    return {};
}
