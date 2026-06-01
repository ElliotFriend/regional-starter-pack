/**
 * Koywe client types
 *
 * This module is self-contained: it defines both the client surface (the shapes
 * returned by {@link KoyweClient}) and the raw HTTP API shapes (the
 * request/response bodies of the Koywe crypto REST API) that the client maps
 * between. Copy this file alongside `client.ts` and `index.ts` into any
 * TypeScript project — the only cross-anchor dependency is `@stellar/stellar-sdk`.
 *
 * Shapes were captured against the Koywe sandbox (`https://api-sandbox.koywe.com`,
 * docs at https://docs-crypto.koywe.com). Fields/paths still awaiting live
 * confirmation are called out with `TODO` in `client.ts`.
 */

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

/** Configuration required to instantiate a {@link KoyweClient}. */
export interface KoyweConfig {
    /** Integration Client Id (the `clientId` for `POST /rest/auth`; doubles as `metaAccount`). */
    clientId: string;
    /** Integration secret for `POST /rest/auth`. */
    secret: string;
    /** Base URL of the Koywe crypto API (e.g. `https://api-sandbox.koywe.com`). */
    baseUrl: string;
    /**
     * Optional default end-user email.
     *
     * Email is **optional** on `POST /rest/auth` (the docs only *recommend* it
     * "to use the JWT in the following calls"), so the client no longer requires
     * a baked-in identity. Per-user operations (`createAccount`, `getKycStatus`,
     * order creation) take an `email` argument and authenticate a JWT scoped to
     * that user; catalogue/quote calls use an email-less app token. This field,
     * if set, is only a fallback for those per-user calls.
     */
    email?: string;
    /**
     * Stellar issuer for the USDC that Koywe delivers, for this network. Koywe's
     * API does not return a Stellar issuer, and it differs by network (Circle's
     * testnet vs mainnet issuer), so the host app supplies the
     * network-appropriate value (`PUBLIC_USDC_ISSUER`).
     */
    usdcIssuer: string;
}

/**
 * Error thrown by {@link KoyweClient} operations.
 *
 * Wraps Koywe API errors with a machine-readable `code` and HTTP `statusCode`.
 */
export class KoyweError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'KoyweError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

// ---------------------------------------------------------------------------
// Token & rail metadata
// ---------------------------------------------------------------------------

/** Payment rail identifiers shared with `$lib/config/rails.ts`. */
export type KoyweRail = 'wirear' | 'qri';

/** A token Koywe can deliver on Stellar. */
export interface KoyweTokenInfo {
    /** Display ticker symbol (e.g. `"USDC"`). */
    symbol: string;
    /** Human-readable token name. */
    name: string;
    /** Stellar asset issuer public key (injected from host config). */
    issuer: string;
    /** The symbol Koywe expects in quote/order requests (e.g. `"USDC Stellar"`). */
    koyweSymbol: string;
    /** Token decimals. */
    decimals: number;
}

// ---------------------------------------------------------------------------
// Client surface — output types
// ---------------------------------------------------------------------------

/** Internal KYC status values derived from the Koywe account profile. */
export type KoyweKycStatus = 'not_started' | 'approved';

/** Koywe order lifecycle states (passed through verbatim from the API). */
export type KoyweOrderStatus =
    | 'WAITING'
    | 'PENDING'
    | 'EXECUTING'
    | 'IN_PROGRESS'
    | 'DELIVERED'
    | 'REJECTED'
    | 'INVALID_WITHDRAWALS_DETAILS';

/** A selectable payment method (rail) for a given fiat currency. */
export interface KoywePaymentMethod {
    /** Koywe provider `_id`, passed back as `paymentMethodId` on executable quotes. */
    id: string;
    /** Raw Koywe provider name (e.g. `"WIREAR"`, `"QRI-AR"`, `"KHIPU"`). */
    name: string;
    /** Friendly label for the UI. */
    label: string;
    /** Shared local-rail id (from `$lib/config/rails.ts`), if this provider maps to one. */
    rail?: KoyweRail;
    /** Provider fee figure (provider-defined units). */
    fee: number;
}

/** A currency conversion quote from Koywe. */
export interface KoyweQuote {
    /** Executable quote id (used to create an order). */
    id: string;
    /** Ramp direction. */
    ramp: 'onramp' | 'offramp';
    /** Source asset display code — fiat for on-ramp, `"USDC"` for off-ramp. */
    sourceAsset: string;
    /** Target asset display code — `"USDC"` for on-ramp, fiat for off-ramp. */
    targetAsset: string;
    /** Amount in the source asset. */
    sourceAmount: string;
    /** Amount in the destination asset. */
    destinationAmount: string;
    /** Exchange rate (units of fiat per unit of USDC), as a decimal string. */
    exchangeRate: string;
    /** Total fee (Koywe service fee + network fee), denominated in the fiat leg. */
    fee: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
    /** Chosen payment method id (on-ramp). */
    paymentMethodId?: string;
}

/** Parsed WIREAR (CVU bank transfer) deposit instructions for an on-ramp order. */
export interface KoyweDepositInstructions {
    /** CVU (uniform virtual key) to transfer ARS to. */
    cvu?: string;
    /** Alias for the CVU. */
    alias?: string;
    /** Receiving bank name. */
    bankName?: string;
    /** Beneficiary contact email, if present. */
    email?: string;
    /** Raw multi-line `providedAddress` string, preserved for display fallback. */
    raw: string;
}

/** An on-ramp (fiat → USDC on Stellar) order. */
export interface KoyweOnRampOrder {
    /** Order id. */
    id: string;
    /** Quote id that priced this order. */
    quoteId: string;
    /** Current Koywe order status. */
    status: KoyweOrderStatus;
    /** Fiat amount being sent. */
    sourceAmount: string;
    /** USDC amount to be received. */
    destinationAmount: string;
    /** Source fiat code. */
    sourceAsset: string;
    /** Target display asset code (`"USDC"`). */
    targetAsset: string;
    /** Stellar address that will receive the USDC. */
    stellarAddress: string;
    /** Parsed inline WIREAR deposit instructions, if returned. */
    deposit?: KoyweDepositInstructions;
    /** Koywe-hosted redirect URL (QRI / Khipu / tracking). */
    interactiveUrl?: string;
}

/** An off-ramp (USDC on Stellar → fiat) order. */
export interface KoyweOffRampOrder {
    /** Order id. */
    id: string;
    /** Quote id that priced this order. */
    quoteId: string;
    /** Current Koywe order status. */
    status: KoyweOrderStatus;
    /** USDC amount being sent. */
    sourceAmount: string;
    /** Fiat amount to be received. */
    destinationAmount: string;
    /** Source display asset code (`"USDC"`). */
    sourceAsset: string;
    /** Target fiat code. */
    targetAsset: string;
    /** Bank account id receiving the payout. */
    bankAccountId: string;
    /** Koywe Stellar deposit address the user must send USDC to. */
    depositAddress?: string;
    /** Koywe-hosted tracking URL. */
    interactiveUrl?: string;
}

/**
 * A registered bank account (off-ramp payout destination).
 *
 * Off-ramp orders reference a bank account by its {@link id} — that `id` is what
 * {@link CreateOffRampOrderArgs.bankAccountId} carries into the order's
 * `destinationAddress`. Register a CVU/account number with
 * {@link KoyweClient.createBankAccount} to obtain one.
 */
export interface KoyweBankAccount {
    /** Koywe bank-account id (`_id`) — passed as an off-ramp order's `destinationAddress`. */
    id: string;
    /** The local account number (e.g. an Argentine CVU). */
    accountNumber: string;
    /** ISO-3 country code (e.g. `"ARG"`). */
    countryCode: string;
    /** Fiat currency symbol (e.g. `"ARS"`). */
    currencySymbol: string;
    /** Provider/bank code, if Koywe returned one. */
    bankCode?: string;
    /** Human-readable bank name, if Koywe returned one. */
    bankName?: string;
}

/** Unified order shape returned by {@link KoyweClient.getOrder}. */
export interface KoyweOrder {
    id: string;
    status: KoyweOrderStatus;
    sourceAmount: string;
    destinationAmount: string;
    /** Source asset display code. */
    sourceAsset: string;
    /** Target asset display code. */
    targetAsset: string;
    /** Inline WIREAR deposit instructions (on-ramp), if present. */
    deposit?: KoyweDepositInstructions;
    /** Koywe deposit address (off-ramp), if present. */
    depositAddress?: string;
    /** Koywe-hosted redirect / tracking URL. */
    interactiveUrl?: string;
}

// ---------------------------------------------------------------------------
// Client surface — input args
// ---------------------------------------------------------------------------

/** Args for {@link KoyweClient.getQuote}. */
export interface GetQuoteArgs {
    /** Ramp direction. */
    ramp: 'onramp' | 'offramp';
    /** Fiat currency code (the local leg, e.g. `"ARS"`). */
    fiatCurrency: string;
    /** Amount of the input asset (fiat for on-ramp, USDC for off-ramp). */
    amount: string;
    /** Required for executable on-ramp quotes: the chosen payment-provider id. */
    paymentMethodId?: string;
}

/** Args for {@link KoyweClient.createOnRampOrder}. */
export interface CreateOnRampOrderArgs {
    /** Executable quote id from {@link KoyweClient.getQuote}. */
    quoteId: string;
    /** Stellar address that will receive the USDC. */
    stellarAddress: string;
    /** End-user email; the order's JWT is scoped to it (falls back to config). */
    email?: string;
    /** End-user national document number (some flows require it). */
    documentNumber?: string;
}

/** Args for {@link KoyweClient.createOffRampOrder}. */
export interface CreateOffRampOrderArgs {
    /** Executable quote id from {@link KoyweClient.getQuote}. */
    quoteId: string;
    /** Registered bank-account id receiving the fiat payout. */
    bankAccountId: string;
    /** End-user email; the order's JWT is scoped to it (falls back to config). */
    email?: string;
    /** End-user national document number (some flows require it). */
    documentNumber?: string;
}

/**
 * Args for {@link KoyweClient.createBankAccount} — registers an off-ramp payout
 * account.
 *
 * The `accountNumber` must be one of Koywe's validated test accounts for the
 * country (in the live sandbox), and must correspond to the registered user's
 * document number. `documentNumber` is required only when the user is not yet
 * KYC'd; for a KYC'd user it can be omitted.
 */
export interface CreateBankAccountArgs {
    /** Email the account is registered under; scopes the auth token. */
    email: string;
    /** Local account number (e.g. an Argentine CVU). */
    accountNumber: string;
    /** Fiat currency symbol (e.g. `"ARS"`). */
    currencySymbol: string;
    /** ISO-3 country code (e.g. `"ARG"`). */
    countryCode: string;
    /** National document number — required when the user is not KYC'd. */
    documentNumber?: string;
    /** Provider/bank code, when the rail requires one. */
    bankCode?: string;
    /** `"checking"` or `"savings"`, when the rail requires one. */
    accountType?: 'checking' | 'savings';
}

/** Args for {@link KoyweClient.getBankAccounts}. */
export interface GetBankAccountsArgs {
    /** Email whose bank accounts to list; scopes the auth token. */
    email: string;
    /** Fiat currency symbol (e.g. `"ARS"`). */
    currencySymbol: string;
    /** ISO-3 country code (e.g. `"ARG"`). */
    countryCode: string;
}

/**
 * Args for {@link KoyweClient.createAccount} — the delegated-KYC registration.
 *
 * This is the "submit KYC" step: the integrator collects the end-user's identity
 * details and POSTs them to Koywe (`POST /rest/accounts`), which then performs
 * verification. There is no hosted KYC widget for delegated KYC.
 *
 * Field names mirror the Koywe glossary. `country` codes are ISO-3 (`ARG`,
 * `CHL`, `COL`, `MEX`, `PER`).
 */
export interface CreateAccountArgs {
    /** Email the account is registered under; scopes the auth token. */
    email: string;
    /** National-identity document. */
    document: {
        /** Document number. */
        documentNumber: string;
        /** Document type (e.g. `"DNI"`). */
        documentType: string;
        /** ISO-3 country of issuance (`ARG`, `CHL`, `COL`, `MEX`, `PER`). */
        country: string;
        /** `true` for a legal entity; defaults to `false` (natural person). */
        isCompany?: boolean;
        /** Optional secondary documents. */
        others?: Array<{ documentNumber: string; documentType: string; country: string }>;
    };
    /** Residential address (must match the document's country of issuance). */
    address: {
        /** ISO-3 country of residence. */
        country: string;
        /** Postal code. */
        zipCode: string;
        /** First subdivision (state/province). */
        state: string;
        /** City. */
        city: string;
        /** Street address with numbering. */
        street: string;
        /** City subdivision (neighborhood). */
        neighborhood?: string;
    };
    /** Personal / legal-entity information. */
    personalInfo: {
        /** Given names, or the legal entity's trade name. */
        names: string;
        /** Date of birth, `YYYY-MM-DD`. */
        dob: string;
        /** Contact phone number. */
        phoneNumber: string;
        /** Profession or business activity. */
        activity: string;
        /** First surname (natural persons). */
        firstLastname?: string;
        /** Second surname, if any. */
        secondLastname?: string;
        /** Nationality code. */
        nationality?: string;
        /** `M`, `F`, or `O`. */
        gender?: 'M' | 'F' | 'O';
    };
}

// ===========================================================================
// Raw API request/response types
// ===========================================================================

/** Request body for `POST /rest/auth`. */
export interface KoyweAuthRequest {
    clientId: string;
    secret: string;
    email: string;
}

/** Response from `POST /rest/auth`. */
export interface KoyweAuthResponse {
    /** JWT bearer token (24h). */
    token: string;
}

/** A fiat currency entry inside `GET /rest/token-currencies`. */
export interface KoyweFiatCurrency {
    _id: string;
    symbol: string;
    name: string;
    decimals: number;
    locale?: string;
    countryCode?: string;
    minimum?: number;
    maximum?: number;
}

/** A crypto token entry from `GET /rest/token-currencies`. */
export interface KoyweTokenCurrency {
    _id: string;
    name: string;
    /** Asset+network symbol used in quotes (e.g. `"USDC Stellar"`). */
    symbol: string;
    decimals: number;
    currencies: KoyweFiatCurrency[];
}

/** An entry from `GET /rest/payment-providers?symbol={fiat}`. */
export interface KoywePaymentProvider {
    _id: string;
    /** Provider/rail code (e.g. `"WIREAR"`, `"QRI-AR"`, `"KHIPU"`). */
    name: string;
    fee: number;
    description?: string;
}

/** Request body for `POST /rest/quotes`. */
export interface KoyweQuoteRequest {
    amountIn: number;
    symbolIn: string;
    symbolOut: string;
    executable: boolean;
    paymentMethodId?: string;
}

/** Response from `POST /rest/quotes`. `quoteId`/`validUntil` only when executable. */
export interface KoyweQuoteResponse {
    quoteId?: string;
    amountIn: number;
    amountOut: number;
    symbolIn: string;
    symbolOut: string;
    exchangeRate: number;
    koyweFee: number;
    networkFee: number;
    paymentMethodId?: string;
    validFor?: number;
    validUntil?: number;
}

/** Request body for `POST /rest/orders`. */
export interface KoyweOrderRequest {
    quoteId: string;
    /**
     * On-ramp: the end-user's destination Stellar address.
     * Off-ramp: the registered bank-account id receiving the payout.
     */
    destinationAddress: string;
    email?: string;
    documentNumber?: string;
}

/** Response from `POST /rest/orders` (creation) and `GET /rest/orders/{orderId}`. */
export interface KoyweOrderResponse {
    orderId: string;
    quoteId?: string;
    status: KoyweOrderStatus;
    symbolIn: string;
    symbolOut: string;
    amountIn: number;
    amountOut: number;
    /**
     * On-ramp: inline payment target (for WIREAR a multi-line CVU/alias/bank
     * string). Off-ramp: the Koywe crypto deposit address.
     */
    providedAddress?: string;
    /** Koywe-hosted redirect / tracking URL. */
    providedAction?: string;
    email?: string;
    documentNumber?: string;
}

/** Request body for `POST /rest/orders/{orderId}/txHash`. */
export interface KoyweTxHashRequest {
    txHash: string;
}

/**
 * Request body for `POST /rest/bank-accounts` (the `bankaccounts_body` schema).
 * `accountNumber`, `countryCode`, and `currencySymbol` are required; `bankCode`
 * and `documentNumber` are optional (the latter only required when the user is
 * not KYC'd).
 */
export interface KoyweBankAccountRequest {
    accountNumber: string;
    countryCode: string;
    currencySymbol: string;
    email?: string;
    documentNumber?: string;
    bankCode?: string;
    accountType?: string;
}

/**
 * A bank account as returned by `POST`/`GET /rest/bank-accounts` (the `BankAccount`
 * schema). The identifier is `_id`.
 */
export interface KoyweBankAccountResponse {
    _id: string;
    bankCode?: string;
    countryCode: string;
    currencySymbol: string;
    accountNumber: string;
    /** Owning account reference. */
    account?: string;
    /** Human-readable bank name. */
    name?: string;
}

/**
 * Request body for `POST /rest/accounts` (delegated-KYC registration), matching
 * the `NewAccount` schema in `koywe.openapi.yaml`. The fields are grouped under
 * `document` / `address` / `personalInfo`, and the address fields keep their
 * `address*` prefix even when nested.
 */
export interface KoyweAccountRequest {
    email?: string;
    document: {
        documentNumber: string;
        documentType: string;
        country: string;
        isCompany: boolean;
        others?: Array<{ documentNumber: string; documentType: string; country: string }>;
    };
    address: {
        addressCountry: string;
        addressZipCode: string;
        addressState: string;
        addressCity: string;
        addressStreet: string;
        addressNeighborhood?: string;
    };
    personalInfo: {
        names: string;
        dob: string;
        phoneNumber: string;
        activity: string;
        firstLastname?: string;
        secondLastname?: string;
        nationality?: string;
        gender?: string;
    };
}

/** Response from `GET /rest/accounts/{email}`. */
export interface KoyweAccountResponse {
    email?: string;
    document?: {
        documentNumber?: string;
        documentType?: string;
        country?: string;
    };
    address?: Record<string, unknown>;
    personalInfo?: Record<string, unknown>;
}

/** Standard error response shape returned by the Koywe API. */
export interface KoyweErrorResponse {
    statusCode: number;
    /** Human-readable message, or an array of validation messages. */
    message: string | string[];
    error?: string;
    path?: string;
}
