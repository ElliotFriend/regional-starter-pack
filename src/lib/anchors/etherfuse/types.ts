/**
 * Etherfuse client types
 *
 * This module is self-contained: it defines both the client surface (the shapes
 * returned by {@link EtherfuseClient}) and the raw HTTP API shapes (the
 * request/response bodies of the Etherfuse REST API) that the client maps
 * between. Copy this file alongside `client.ts` and `index.ts` into any
 * TypeScript project — there are no cross-anchor dependencies.
 */

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

/** Configuration required to instantiate an {@link EtherfuseClient}. */
export interface EtherfuseConfig {
    /** API key provided by Etherfuse. */
    apiKey: string;
    /** Base URL of the Etherfuse API (e.g. `https://api.etherfuse.com` or `https://api.sand.etherfuse.com`). */
    baseUrl: string;
    /** Default blockchain for operations. Defaults to `"stellar"`. */
    defaultBlockchain?: string;
}

/**
 * Error thrown by {@link EtherfuseClient} operations.
 *
 * Wraps Etherfuse API errors with a machine-readable `code` and HTTP `statusCode`.
 */
export class EtherfuseError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'EtherfuseError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

// ---------------------------------------------------------------------------
// Token & rail metadata
// ---------------------------------------------------------------------------

/** A token issued by Etherfuse on Stellar. */
export interface EtherfuseTokenInfo {
    /** Token ticker symbol (e.g. `"CETES"`, `"TESOURO"`). */
    symbol: string;
    /** Human-readable token name. */
    name: string;
    /** Stellar asset issuer public key. */
    issuer: string;
    /** Short description of the token. */
    description: string;
    /** ISO 4217 fiat currency this token is denominated in. */
    fiatCurrency: 'MXN' | 'BRL';
    /** Payment rail used to fund/payout this token's fiat side. */
    rail: EtherfuseRail;
}

/** Payment rail identifiers supported by Etherfuse. */
export type EtherfuseRail = 'spei' | 'pix';

// ---------------------------------------------------------------------------
// Client surface — output types
// ---------------------------------------------------------------------------

/** Etherfuse KYC status values. */
export type EtherfuseKycStatus =
    | 'not_started'
    | 'proposed'
    | 'approved'
    | 'approved_chain_deploying'
    | 'rejected';

/** Etherfuse order status values. */
export type EtherfuseOrderStatus =
    | 'created'
    | 'funded'
    | 'completed'
    | 'failed'
    | 'refunded'
    | 'canceled';

/** A customer record as returned by {@link EtherfuseClient}. */
export interface EtherfuseCustomer {
    /** Etherfuse customer UUID. */
    id: string;
    /** Email address provided at creation, if any. (Etherfuse does not return this on lookup.) */
    email?: string;
    /** Current KYC status. */
    kycStatus: EtherfuseKycStatus;
    /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`, `"BR"`). */
    country?: string;
    /** Bank account UUID generated at customer registration time. */
    bankAccountId?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** A currency conversion quote from Etherfuse. */
export interface EtherfuseQuote {
    /** Quote UUID. */
    id: string;
    /** Ramp direction. */
    ramp: 'onramp' | 'offramp';
    /** Source asset — fiat code (e.g. `"MXN"`) for on-ramp, `CODE:ISSUER` for off-ramp. */
    sourceAsset: string;
    /** Target asset — `CODE:ISSUER` for on-ramp, fiat code for off-ramp. */
    targetAsset: string;
    /** Amount in the source asset. */
    sourceAmount: string;
    /** Amount in the destination asset (after fee). */
    destinationAmount: string;
    /** Exchange rate as a decimal string. */
    exchangeRate: string;
    /** Fee amount as a decimal string (`"0"` if none). */
    fee: string;
    /** Fee in basis points (e.g. `"20"` = 0.20%), if reported. */
    feeBps?: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/** SPEI deposit instructions (Mexico on-ramp). */
export interface EtherfuseSpeiDeposit {
    rail: 'spei';
    /** 18-digit CLABE to send the SPEI transfer to. */
    clabe: string;
    /** Name of the receiving bank. */
    bankName?: string;
    /** Name of the account beneficiary. */
    beneficiary?: string;
    /** Amount to transfer. */
    amount: string;
    /** Fiat currency code (`"MXN"`). */
    currency: string;
}

/** PIX deposit instructions (Brazil on-ramp). */
export interface EtherfusePixDeposit {
    rail: 'pix';
    /** PIX BR-Code / EMV copy-paste string for QR or pasted entry into a banking app. */
    pixCode: string;
    /** PIX key (CPF, CNPJ, email, phone, or EVP UUID) for manual transfers. */
    pixKey?: string;
    /** PIX key type (e.g. `"cpf"`, `"cnpj"`, `"email"`, `"phone"`, `"evp"`). */
    pixKeyType?: string;
    /** Name of the account beneficiary. */
    beneficiary?: string;
    /** Amount to transfer. */
    amount: string;
    /** Fiat currency code (`"BRL"`). */
    currency: string;
}

/** Discriminated union of Etherfuse deposit instructions. */
export type EtherfuseDeposit = EtherfuseSpeiDeposit | EtherfusePixDeposit;

/** An on-ramp (fiat → token) order. */
export interface EtherfuseOnRampOrder {
    /** Order UUID. */
    id: string;
    /** Customer ID. */
    customerId: string;
    /** Quote ID that priced this order. */
    quoteId: string;
    /** Current order status. */
    status: EtherfuseOrderStatus;
    /** Fiat amount being sent (`""` if not yet known). */
    amountInFiat: string;
    /** Token amount to be received (`""` if not yet known). */
    amountInTokens: string;
    /** Fiat currency code. */
    fiatCurrency: string;
    /** Stellar asset identifier (`CODE:ISSUER`). */
    stellarAsset: string;
    /** Stellar address that will receive the tokens. */
    stellarAddress: string;
    /** Fee in basis points. */
    feeBps?: number;
    /** Fee amount in fiat currency. */
    feeAmountInFiat?: string;
    /** Deposit instructions the user must follow to fund the order. */
    deposit?: EtherfuseDeposit;
    /** Stellar tx hash once the tokens have been delivered. */
    confirmedTxSignature?: string;
    /** URL to Etherfuse's hosted order-status page. */
    statusPage?: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** An off-ramp (token → fiat) order. */
export interface EtherfuseOffRampOrder {
    /** Order UUID. */
    id: string;
    /** Customer ID. */
    customerId: string;
    /** Quote ID that priced this order. */
    quoteId: string;
    /** Current order status. */
    status: EtherfuseOrderStatus;
    /** Token amount being sent. */
    amountInTokens: string;
    /** Fiat amount to be received. */
    amountInFiat: string;
    /** Fiat currency code. */
    fiatCurrency: string;
    /** Stellar asset identifier (`CODE:ISSUER`). */
    stellarAsset: string;
    /** Stellar address sending the tokens. */
    stellarAddress: string;
    /** Bank account UUID receiving the fiat payout. */
    bankAccountId?: string;
    /** Fee in basis points. */
    feeBps?: number;
    /** Fee amount in fiat currency. */
    feeAmountInFiat?: string;
    /**
     * Base64-XDR of the Stellar burn transaction for the user to sign and submit.
     * `undefined` immediately after order creation — poll {@link EtherfuseClient.getOffRampOrder}
     * until Etherfuse has prepared the transaction.
     */
    burnTransaction?: string;
    /** Stellar tx hash once the burn has been confirmed. */
    confirmedTxSignature?: string;
    /** URL to Etherfuse's hosted order-status page. */
    statusPage?: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** A saved bank account belonging to a customer. */
export interface EtherfuseSavedBankAccount {
    /** Bank account UUID. */
    id: string;
    /** Payment rail. */
    rail: EtherfuseRail;
    /** Display label (abbreviated CLABE for SPEI, PIX key for PIX). */
    accountIdentifier: string;
    /** Full name of the account holder, if known. */
    accountHolderName?: string;
    /** Account status (e.g. `"active"`). */
    status: string;
    /** Whether the account is marked compliant. */
    compliant?: boolean;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Client surface — input args
// ---------------------------------------------------------------------------

/** Args for {@link EtherfuseClient.createCustomer}. */
export interface CreateCustomerArgs {
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
    /** Customer email address (stored locally; Etherfuse does not echo this back). */
    email?: string;
    /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`, `"BR"`). */
    country?: string;
}

/** Args for {@link EtherfuseClient.getQuote}. */
export interface GetQuoteArgs {
    /** Source asset — fiat code (e.g. `"MXN"`) for on-ramp, token symbol or `CODE:ISSUER` for off-ramp. */
    fromAsset: string;
    /** Target asset — token symbol or `CODE:ISSUER` for on-ramp, fiat code for off-ramp. */
    toAsset: string;
    /** Amount in the source asset. */
    sourceAmount: string;
    /** Customer ID (some quote responses require it). */
    customerId?: string;
    /**
     * Stellar address — used to resolve token symbols (e.g. `"CETES"`) to full
     * `CODE:ISSUER` identifiers via the Etherfuse `/ramp/assets` endpoint.
     * Required when `fromAsset` or `toAsset` is a symbol rather than `CODE:ISSUER`.
     */
    stellarAddress?: string;
}

/** Args for {@link EtherfuseClient.createOnRampOrder}. */
export interface CreateOnRampOrderArgs {
    /** Customer placing the order. */
    customerId: string;
    /** Quote ID from {@link EtherfuseClient.getQuote}. */
    quoteId: string;
    /** Stellar address that will receive the tokens. */
    publicKey: string;
    /** Bank account UUID. If omitted, falls back to the customer's first registered account. */
    bankAccountId?: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
}

/** Args for {@link EtherfuseClient.createOffRampOrder}. */
export interface CreateOffRampOrderArgs {
    /** Customer placing the order. */
    customerId: string;
    /** Quote ID from {@link EtherfuseClient.getQuote}. */
    quoteId: string;
    /** Stellar address sending the tokens. */
    publicKey: string;
    /** Bank account UUID to receive the fiat payout. */
    bankAccountId: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
}

/** Args for {@link EtherfuseClient.getKycUrl}. */
export interface GetKycUrlArgs {
    /** Customer ID. */
    customerId: string;
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
    /** Bank account UUID. If omitted, a fresh UUID is generated. */
    bankAccountId?: string;
}

/** Args for {@link EtherfuseClient.getKycStatus}. */
export interface GetKycStatusArgs {
    /** Customer ID. */
    customerId: string;
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
}

/** Args for {@link EtherfuseClient.getAssets}. */
export interface GetAssetsArgs {
    /** Blockchain identifier (defaults to `"stellar"`). */
    blockchain?: string;
    /** Fiat currency filter (e.g. `"MXN"`). */
    currency: string;
    /** Wallet public key for personalized results (e.g. balances). */
    wallet: string;
}

// ===========================================================================
// Raw API request types
// ===========================================================================

/** Request body for `POST /ramp/onboarding-url`. */
export interface EtherfuseOnboardingRequest {
    /** Partner-generated UUID for the customer. */
    customerId: string;
    /** Partner-generated UUID for the bank account. */
    bankAccountId: string;
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
    /** Blockchain identifier (e.g. `"stellar"`). */
    blockchain: string;
}

/** Quote asset pair with ramp direction. */
export interface EtherfuseQuoteAssets {
    /** Ramp direction. */
    type: 'onramp' | 'offramp' | 'swap';
    /** Source asset — fiat code for on-ramp, `CODE:ISSUER` for off-ramp. */
    sourceAsset: string;
    /** Target asset — `CODE:ISSUER` for on-ramp, fiat code for off-ramp. */
    targetAsset: string;
}

/** Request body for `POST /ramp/quote`. */
export interface EtherfuseQuoteRequest {
    quoteId: string;
    customerId: string;
    blockchain: string;
    quoteAssets: EtherfuseQuoteAssets;
    sourceAmount: string;
}

/** Request body for `POST /ramp/order` (both on-ramp and off-ramp). */
export interface EtherfuseOrderRequest {
    orderId: string;
    bankAccountId: string;
    publicKey: string;
    quoteId: string;
    memo?: string;
}

/** SPEI-shaped account body for Mexican (CLABE) bank-account registration. */
export interface EtherfuseSpeiAccountBody {
    clabe: string;
    beneficiary: string;
    bankName?: string;
}

/** PIX-shaped account body for Brazilian bank-account registration. */
export interface EtherfusePixAccountBody {
    pixKey: string;
    pixKeyType: string;
    firstName: string;
    lastName: string;
    cpf: string;
}

/** Request body for `POST /ramp/bank-account`. */
export interface EtherfuseBankAccountRequest {
    presignedUrl: string;
    account: EtherfuseSpeiAccountBody | EtherfusePixAccountBody;
}

/** Request body for `POST /ramp/customer/{id}/kyc` (programmatic KYC identity submission). */
export interface EtherfuseKycIdentityRequest {
    pubkey: string;
    identity: {
        id: string;
        name: {
            givenName: string;
            familyName: string;
        };
        dateOfBirth: string;
        address: {
            street: string;
            city: string;
            region: string;
            postalCode: string;
            country: string;
        };
        idNumbers: Array<{
            value: string;
            type: string;
        }>;
    };
}

/** Request body for `POST /ramp/customer/{id}/kyc/documents`. */
export interface EtherfuseKycDocumentRequest {
    pubkey: string;
    documentType: 'document' | 'selfie';
    images: Array<{
        label: 'id_front' | 'id_back' | 'selfie';
        image: string;
    }>;
}

// ===========================================================================
// Raw API response types
// ===========================================================================

/** Response from `POST /ramp/onboarding-url`. */
export interface EtherfuseOnboardingResponse {
    presigned_url: string;
}

/** Response from `POST /ramp/quote`. */
export interface EtherfuseQuoteResponse {
    quoteId: string;
    customerId: string;
    blockchain: string;
    quoteAssets: EtherfuseQuoteAssets;
    sourceAmount: string;
    destinationAmount: string;
    exchangeRate: string;
    feeBps: string | null;
    feeAmount: string | null;
    destinationAmountAfterFee: string | null;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}

/** SPEI payment details included in on-ramp order responses. */
export interface EtherfuseDepositDetails {
    depositClabe: string;
    bankName: string;
    beneficiary: string;
    reference: string;
    amount: string;
    currency: string;
}

/** Response from `POST /ramp/order` (on-ramp creation). */
export interface EtherfuseCreateOnRampResponse {
    onramp: {
        orderId: string;
        depositAmount: string;
        depositClabe?: string;
        bankName?: string;
        beneficiary?: string;
        depositPixKey?: string;
        depositPixKeyType?: string;
        depositPixCode?: string;
    };
}

/** Response from `POST /ramp/order` (off-ramp creation). */
export interface EtherfuseCreateOffRampResponse {
    offramp: {
        orderId: string;
    };
}

/** Response from `GET /ramp/order/{order_id}`. Unified shape for both on-ramp and off-ramp. */
export interface EtherfuseOrderResponse {
    orderId: string;
    customerId: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
    completedAt?: string;
    amountInFiat?: string;
    amountInTokens?: string;
    confirmedTxSignature?: string;
    walletId: string;
    bankAccountId: string;
    burnTransaction?: string;
    memo?: string;
    depositClabe?: string;
    depositPixKey?: string;
    depositPixKeyType?: string;
    depositPixCode?: string;
    orderType: 'onramp' | 'offramp';
    status: EtherfuseOrderStatus;
    statusPage: string;
    feeBps?: number;
    feeAmountInFiat?: string;
}

/** Response from `GET /ramp/customer/{id}`. */
export interface EtherfuseCustomerResponse {
    customerId: string;
    displayName: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Response from `GET /ramp/customer/{id}/kyc/{pubkey}`. */
export interface EtherfuseKycStatusResponse {
    customerId: string;
    walletPublicKey: string;
    status: EtherfuseKycStatus;
    onChainMarked?: boolean;
    currentRejectionReason?: string | null;
    selfies?: unknown[];
    documents?: unknown[];
    currentKycInfo?: unknown;
    approvedAt?: string | null;
}

/** Response from `POST /ramp/bank-account`. */
export interface EtherfuseBankAccountResponse {
    bankAccountId: string;
    customerId: string;
    createdAt: string;
    updatedAt: string;
    abbrClabe?: string;
    etherfuseDepositClabe?: string;
    pixKey?: string;
    pixKeyType?: string;
    accountHolderName?: string;
    compliant?: boolean;
    status: string;
}

/** Etherfuse agreement type. */
export type EtherfuseAgreementType =
    | 'electronic_signature'
    | 'terms_and_conditions'
    | 'customer_agreement';

/** Response from agreement acceptance endpoints. */
export interface EtherfuseAgreementResponse {
    success: boolean;
    acceptedAt: string;
    agreementType: EtherfuseAgreementType;
}

/** A single bank account in the list response from `POST /ramp/customer/{id}/bank-accounts`. */
export interface EtherfuseBankAccountListItem {
    bankAccountId: string;
    customerId: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    abbrClabe?: string;
    etherfuseDepositClabe?: string;
    pixKey?: string;
    pixKeyType?: string;
    accountHolderName?: string;
    label?: string | null;
    compliant: boolean;
    status: string;
}

/** Paginated response from `POST /ramp/customer/{id}/bank-accounts`. */
export interface EtherfuseBankAccountListResponse {
    items: EtherfuseBankAccountListItem[];
    totalItems: number;
    pageSize: number;
    pageNumber: number;
    totalPages: number;
}

/** Rampable asset returned by `GET /ramp/assets`. */
export interface EtherfuseAsset {
    symbol: string;
    identifier: string;
    name: string;
    currency: string | null;
    balance: string | null;
    image: string | null;
}

/** Response from `GET /ramp/assets`. */
export interface EtherfuseAssetsResponse {
    assets: EtherfuseAsset[];
}

/** Webhook event types sent by Etherfuse. */
export type EtherfuseWebhookEventType =
    | 'bank_account_updated'
    | 'customer_updated'
    | 'order_updated'
    | 'quote_updated'
    | 'swap_updated'
    | 'kyc_updated';

/** Incoming webhook payload sent by Etherfuse. */
export interface EtherfuseWebhookPayload {
    event: EtherfuseWebhookEventType;
    data: {
        id: string;
        status: string;
        [key: string]: unknown;
    };
    timestamp: string;
}

/** Standard error response shape returned by the Etherfuse API. */
export interface EtherfuseErrorResponse {
    error: {
        code: string;
        message: string;
    };
}
