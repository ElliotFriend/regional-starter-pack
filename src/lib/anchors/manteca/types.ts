/**
 * Manteca client types
 *
 * This module is self-contained: it defines both the client surface (the shapes
 * returned by {@link MantecaClient}) and the raw HTTP API shapes (the
 * request/response bodies of the Manteca v2 REST API) that the client maps
 * between. Copy this file alongside `client.ts` and `index.ts` into any
 * TypeScript project — the only cross-anchor dependency is `@stellar/stellar-sdk`.
 *
 * Shapes were captured from Manteca's published API reference
 * (https://developers.manteca.dev, markdown mirror + `llms.txt` index) — NOT yet
 * verified against a live sandbox. Fields awaiting live confirmation are called
 * out with `TODO` in `client.ts`. Manteca authenticates with a single static
 * `md-api-key` header; production is `https://api.manteca.dev`, sandbox is
 * `https://sandbox.manteca.dev`.
 */

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

/** Configuration required to instantiate a {@link MantecaClient}. */
export interface MantecaConfig {
    /** Manteca API key, sent verbatim in the `md-api-key` header. NEVER logged. */
    apiKey: string;
    /** Base URL of the Manteca API (e.g. `https://sandbox.manteca.dev`). */
    baseUrl: string;
    /**
     * Stellar issuer for the USDC that Manteca delivers, for this network.
     * Manteca's API does not return a Stellar issuer (it reports the network as
     * `STELLAR` and the asset as `USDC`), and the issuer differs by network, so
     * the host app supplies the network-appropriate value (`PUBLIC_USDC_ISSUER`).
     */
    usdcIssuer: string;
    /**
     * Default `exchange` (country) for user onboarding when an operation doesn't
     * specify one. This integration targets Brazil first, so defaults to
     * `'BRAZIL'`.
     */
    defaultExchange?: MantecaExchange;
    /**
     * Log requests, responses, and errors to the console. Off by default —
     * request bodies include PII (onboarding identity, legal IDs, PIX keys). The
     * API key is never logged either way.
     */
    debug?: boolean;
}

/**
 * Error thrown by {@link MantecaClient} operations.
 *
 * Wraps Manteca API errors with a machine-readable `code` (the API's
 * `internalStatus`) and HTTP `statusCode`.
 */
export class MantecaError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'MantecaError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

// ---------------------------------------------------------------------------
// Shared enums / primitives
// ---------------------------------------------------------------------------

/** Country a user operates in (the `exchange` field). Subset relevant to ramps. */
export type MantecaExchange =
    | 'ARGENTINA'
    | 'BRAZIL'
    | 'CHILE'
    | 'COLOMBIA'
    | 'MEXICO'
    | 'PERU'
    | 'PARAGUAY'
    | 'BOLIVIA'
    | 'GUATEMALA'
    | 'COSTA_RICA'
    | 'PANAMA'
    | 'PHILIPPINES'
    | 'GLOBAL';

/** Blockchain networks Manteca can settle crypto on. */
export type MantecaCryptoNetwork =
    | 'STELLAR'
    | 'ETHEREUM'
    | 'BINANCE'
    | 'POLYGON'
    | 'OPTIMISM'
    | 'WORLDCHAIN'
    | 'BASE'
    | 'ARBITRUM'
    | 'TRON'
    | 'SOLANA'
    | 'TEMPO';

/** Synthetic lifecycle status (`STARTING`/`ACTIVE`/`WAITING` non-terminal). */
export type MantecaSyntheticStatus =
    | 'STARTING'
    | 'ACTIVE'
    | 'WAITING'
    | 'PAUSED'
    | 'COMPLETED'
    | 'CANCELLED';

/** Synthetic kinds; ramps are `RAMP_OPERATION`, Brazil QR/Pix are `PIX_PAYMENT`. */
export type MantecaSyntheticType =
    | 'RAMP_OPERATION'
    | 'PARTIAL_RAMP_OPERATION'
    | 'PIX_PAYMENT'
    | 'QR3_PAYMENT'
    | 'PERU_QR_PAYMENT'
    | 'BOLIVIA_QR_PAYMENT'
    | 'PARAGUAY_QR_PAYMENT'
    | 'BILL_PAYMENT'
    | 'BREB_PAYMENT';

/** Terminal synthetic statuses — stop polling once one is reached. */
export const MANTECA_TERMINAL_SYNTHETIC_STATUSES: readonly MantecaSyntheticStatus[] = [
    'COMPLETED',
    'CANCELLED',
];

// ---------------------------------------------------------------------------
// Client-surface output types
// ---------------------------------------------------------------------------

/** A token Manteca can deliver on Stellar, with the host-supplied issuer. */
export interface MantecaTokenInfo {
    /** Display + API symbol (e.g. `USDC`). */
    symbol: string;
    /** Human-readable name. */
    name: string;
    /** Stellar issuer account, injected from host config. */
    issuer: string;
    /** Settlement network. */
    network: MantecaCryptoNetwork;
    /** On-chain decimals. */
    decimals: number;
}

/** One step in a user's onboarding/KYC checklist. */
export interface MantecaOnboardingStep {
    required: boolean;
    /** e.g. `NOT_DONE`, `DONE`, `PENDING`, `REJECTED`. */
    status: string;
}

/** A Manteca end-user record, normalized for the host app. */
export interface MantecaUser {
    /** Manteca immutable id (24-char hex). */
    id: string;
    /** Numeric id, unique per entity type. */
    numberId: string;
    /** Your business reference, if set. */
    externalId?: string;
    email?: string;
    /** Overall status, e.g. `CREATED`, `ONBOARDING`, `ACTIVE`. */
    status: string;
    exchange?: MantecaExchange;
    /** Per-user crypto deposit addresses, keyed by network. */
    depositAddresses: Partial<Record<MantecaCryptoNetwork, string>>;
    /** Convenience: the per-user Stellar deposit address, if Manteca assigned one. */
    stellarAddress?: string;
    /** Onboarding checklist keyed by step name (e.g. `tycAcceptance`). */
    onboarding: Record<string, MantecaOnboardingStep>;
    /** `true` when status is `ACTIVE` (can operate). */
    canOperate: boolean;
}

/**
 * A current price for an asset pair (`GET /crypto/v2/prices/direct/{ticker}`).
 *
 * Crypto ramp economics live here, NOT in a separate fee endpoint: `buy`/`sell`
 * are the nominal bid/ask, and `effectiveBuy`/`effectiveSell` are the
 * spread/fee-inclusive prices the user actually transacts at. (The
 * `/broker/v1/.../fee/{ticker}` endpoint belongs to Manteca's separate
 * Broker-as-a-Service securities product and does not apply to crypto ramps.)
 */
export interface MantecaPrice {
    /** e.g. `USDC_BRL`. */
    ticker: string;
    /** Nominal price to buy the asset (fiat per unit). */
    buy: string;
    /** Nominal price to sell the asset. */
    sell: string;
    /** Fee/spread-inclusive buy price — what an on-ramp user pays. */
    effectiveBuy: string;
    /** Fee/spread-inclusive sell price — what an off-ramp user receives. */
    effectiveSell: string;
    /** ISO timestamp the price was quoted. */
    timestamp: string;
}

/**
 * A normalized conversion quote the host app can render, composed from the
 * crypto {@link MantecaPrice}: `price` is the effective (fee-inclusive) price
 * for the side the user transacts on, `nominalPrice` is the pre-spread price,
 * and `spreadFraction` is the implied fee fraction between them.
 */
export interface MantecaQuote {
    ramp: 'onramp' | 'offramp';
    ticker: string;
    /** Crypto asset (e.g. `USDC`). */
    asset: string;
    /** Fiat currency (e.g. `BRL`). */
    against: string;
    /** Effective price (fiat per unit of asset) the user transacts at. */
    price: string;
    /** Nominal (pre-spread) price for the same side. */
    nominalPrice: string;
    /** Implied fee fraction between nominal and effective (e.g. `0.0085`). */
    spreadFraction: number;
    /** ISO timestamp of the underlying price. */
    quotedAt: string;
}

/** A synthetic stage (deposit/order/withdraw), shape varies by `stageType`. */
export interface MantecaSyntheticStage {
    stageType: string;
    asset?: string;
    against?: string;
    network?: string;
    amount?: string;
    assetAmount?: string;
    thresholdAmount?: string;
    detectedAmount?: string;
    price?: string;
    to?: string;
    expiresAt?: string;
    [key: string]: unknown;
}

/** A PIX deposit instruction (the QR the on-ramp user pays). */
export interface MantecaPixDeposit {
    /** The PIX EMV "copy-and-paste" code. */
    code: string;
    /** Hosted QR widget URL. */
    url: string;
    /** ISO expiry of the PIX charge. */
    expiresAt?: string;
}

/** Deposit instructions surfaced on a ramp synthetic's `details`. */
export interface MantecaSyntheticDetails {
    /** Fiat (on-ramp) or crypto (off-ramp) deposit address the user funds. */
    depositAddress?: string;
    /** Alias for the deposit address (e.g. a PIX/CVU alias). */
    depositAlias?: string;
    /** Per-network deposit addresses, when the API returns the keyed form. */
    depositAddresses?: Partial<Record<string, unknown>>;
    /** PIX deposit instruction (Brazil on-ramp) — from `depositAddresses.PIX`. */
    pix?: MantecaPixDeposit;
    /** Rails the user may deposit through, e.g. `['PIX']`. */
    depositAvailableNetworks?: string[];
    /** Manteca's withdraw (network) cost, in the crypto asset. */
    withdrawCostInAsset?: string;
    /** Withdraw cost expressed in the fiat `against` currency. */
    withdrawCostInAgainst?: string;
    /** Net crypto amount the user receives after costs. */
    effectiveWithdrawAmount?: string;
    /** Locked price for the order leg. */
    price?: string;
    /** Fee-inclusive effective price for the order leg. */
    effectivePrice?: string;
    /** ISO expiry of the locked price. */
    priceExpireAt?: string;
}

/** A Manteca synthetic (orchestrated ramp), normalized for the host app. */
export interface MantecaSynthetic {
    id: string;
    numberId: string;
    externalId?: string;
    userId?: string;
    status: MantecaSyntheticStatus;
    type: MantecaSyntheticType;
    /** 1-based index of the current stage. */
    currentStage?: number;
    /** Stages keyed by their 1-based index as a string. */
    stages: Record<string, MantecaSyntheticStage>;
    details: MantecaSyntheticDetails;
    creationTime?: string;
    updatedAt?: string;
    /** `true` when status is terminal (`COMPLETED`/`CANCELLED`). */
    isTerminal: boolean;
}

/** Deposit info for an asset (`GET /crypto/v2/info/deposit-info/{coin}`). */
export interface MantecaDepositInfo {
    /** Keyed by network/rail name (e.g. `STELLAR`, `PIX`, `BANK_TRANSFER`). */
    networks: Record<string, { address?: string; alias?: string; network?: string }>;
}

/**
 * Resolved withdraw destination
 * (`GET /crypto/v2/info/withdraw-destination/{destination}`). Validates a PIX
 * key / CBU / CVU before an off-ramp and returns the recipient name + masked ID.
 */
export interface MantecaWithdrawDestination {
    /** The destination as entered (PIX key, CBU, etc.). */
    address: string;
    /** Recipient name returned by the rail, if resolvable. */
    name?: string;
    /** Masked legal ID of the recipient. */
    legalId?: string;
    /** Rail/account type, e.g. `PIX`, `CVU`, `ALIAS`. */
    accountType?: string;
    /** Exchange/country that resolved the destination. */
    exchange?: MantecaExchange;
    /** Asset the destination pays out in (e.g. `BRL`, `ARS`). */
    asset?: string;
    /** `true` when the destination resolved successfully. */
    valid: boolean;
}

// ---------------------------------------------------------------------------
// Client-surface input args
// ---------------------------------------------------------------------------

/** Args for {@link MantecaClient.createUser}. */
export interface CreateUserArgs {
    email: string;
    /** Country; defaults to `config.defaultExchange`. */
    exchange?: MantecaExchange;
    externalId?: string;
    sessionId?: string;
}

/**
 * Args for {@link MantecaClient.submitOnboarding} (the canonical create-user
 * call, `POST /crypto/v2/onboarding-actions/initial`; supports incremental
 * updates — only provided fields are stored).
 *
 * Per the create-user recipe, Brazil auto-populates only SOME fields (name,
 * birthDate, work) from national databases — the integrator must still supply
 * `personalData` with at least `surname`, `phoneNumber`, `nationality`,
 * `address.street`, `sex`, and `maritalStatus` for the user to reach `ACTIVE`.
 * Use {@link MantecaClient.getMissingPersonalData} to discover what's pending.
 */
export interface SubmitOnboardingArgs {
    email: string;
    /** National tax ID — CPF in Brazil, CUIT in Argentina. */
    legalId: string;
    exchange?: MantecaExchange;
    legalIdType?: 'NATIONAL_ID' | 'FOREIGN_ID' | 'TAX_ID' | 'PPT';
    legalIdNationality?: MantecaExchange;
    type?: 'INDIVIDUAL' | 'BUSINESS';
    externalId?: string;
    sessionId?: string;
    /** Personal data, sent inline as a nested `personalData` object. */
    personalData?: MantecaPersonalData;
    /** Optional banking accounts (CBU/CVU) to register during onboarding. */
    banking?: { accounts: Array<Record<string, unknown>> };
}

/**
 * Personal data fields for onboarding. Free-form (Manteca's required set varies
 * by `exchange`), but these are the Brazil-required fields per the recipe.
 */
export interface MantecaPersonalData {
    name?: string;
    surname?: string;
    sex?: string;
    birthDate?: string;
    phoneNumber?: string;
    nationality?: string;
    maritalStatus?: string;
    work?: string;
    isPep?: boolean;
    isFatca?: boolean;
    isFep?: boolean;
    address?: {
        street?: string;
        postalCode?: string;
        locality?: string;
        province?: string;
        numeration?: string;
        floor?: string;
        apartment?: string;
    };
    [key: string]: unknown;
}

/** Args for {@link MantecaClient.getQuote}. */
export interface GetQuoteArgs {
    ramp: 'onramp' | 'offramp';
    /** Crypto asset, e.g. `USDC`. */
    asset: string;
    /** Fiat currency, e.g. `BRL`. */
    against: string;
}

/** Args for {@link MantecaClient.createRampOn} (fiat → USDC on Stellar). */
export interface CreateRampOnArgs {
    userAnyId: string;
    /** Crypto asset to buy, e.g. `USDC`. */
    asset: string;
    /** Fiat the user deposits, e.g. `BRL`. */
    against: string;
    /** The Stellar account that receives the purchased crypto. */
    stellarAddress: string;
    /** Provide exactly one of assetAmount / againstAmount. */
    assetAmount?: number;
    againstAmount?: number;
    priceCode?: string;
    externalId?: string;
    sessionId?: string;
}

/** Args for {@link MantecaClient.createRampOff} (USDC on Stellar → fiat). */
export interface CreateRampOffArgs {
    userAnyId: string;
    /** Crypto asset to sell, e.g. `USDC`. */
    asset: string;
    /** Fiat to receive, e.g. `BRL`. */
    against: string;
    /** Fiat payout destination — a PIX key in Brazil, CBU/CVU/alias in Argentina. */
    destinationAddress: string;
    /** Provide exactly one of assetAmount / againstAmount. */
    assetAmount?: number;
    againstAmount?: number;
    /** Optional bank/account hints for the destination. */
    bankCode?: string;
    accountType?: string;
    priceCode?: string;
    externalId?: string;
    sessionId?: string;
}

// ---------------------------------------------------------------------------
// Raw API shapes (request/response bodies as the Manteca API speaks them)
// ---------------------------------------------------------------------------

/** Manteca's consistent error envelope. */
export interface MantecaErrorResponse {
    status: number;
    internalStatus: string;
    message: string;
    errors?: unknown[];
}

/** Raw user object (`POST /crypto/v2/users`, `GET /crypto/v2/users/{id}`). */
export interface MantecaUserResponse {
    id: string;
    numberId: string;
    externalId?: string;
    email?: string;
    status: string;
    type?: string;
    exchange?: MantecaExchange;
    addresses?: {
        depositAddresses?: Partial<Record<string, string>>;
        knownAddresses?: unknown[];
    };
    banking?: { accounts?: unknown[]; addresses?: unknown[] };
    onboarding?: Record<string, MantecaOnboardingStep>;
    feeInfoId?: string;
    creationTime?: string;
    updatedAt?: string;
}

/** Raw synthetic object (ramp-on/ramp-off create, get-synthetic). */
export interface MantecaSyntheticResponse {
    id: string;
    numberId: string;
    externalId?: string;
    userId?: string;
    userNumberId?: string;
    userExternalId?: string;
    sessionId?: string;
    status: MantecaSyntheticStatus;
    type: MantecaSyntheticType;
    details?: {
        depositAddress?: string;
        depositAlias?: string;
        depositAddresses?: Record<string, unknown>;
        depositAvailableNetworks?: string[];
        withdrawCostInAsset?: string;
        withdrawCostInAgainst?: string;
        effectiveWithdrawAmount?: string;
        price?: string;
        effectivePrice?: string;
        priceExpireAt?: string;
        [key: string]: unknown;
    };
    currentStage?: number;
    stages?: Record<string, MantecaSyntheticStage>;
    creationTime?: string;
    updatedAt?: string;
}

/** Raw price (`GET /crypto/v2/prices/direct/{ticker}`). */
export interface MantecaPriceResponse {
    ticker: string;
    buy: string;
    sell: string;
    /**
     * Fee/spread-inclusive prices. The live wire nests these under
     * `effectivePrice` (with sibling `price` and `spread` objects); the flat
     * `effectiveBuy`/`effectiveSell` form is a tolerated fallback.
     */
    effectivePrice?: { buy?: string; sell?: string };
    price?: { buy?: string; sell?: string };
    spread?: { buy?: string; sell?: string };
    effectiveBuy?: string;
    effectiveSell?: string;
    timestamp: string;
    variation?: unknown;
}

/** Raw supported-assets entry. */
export interface MantecaSupportedAssetsResponse {
    /** Crypto assets keyed by symbol, each listing its networks. */
    [key: string]: unknown;
}

/** Raw withdraw-destination resolution. */
export interface MantecaWithdrawDestinationResponse {
    /** Live wire keys the recipient as recipientName/recipientLegalId. */
    recipientName?: string;
    recipientLegalId?: string;
    /** Resolving exchange + asset of the destination. */
    exchange?: MantecaExchange;
    asset?: string;
    destination?: string;
    /** Legacy/flat aliases, tolerated. */
    name?: string;
    legalId?: string;
    accountType?: string;
    address?: string;
    [key: string]: unknown;
}
