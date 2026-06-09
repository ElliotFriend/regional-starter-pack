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
    /**
     * Log requests, responses, and recovery events to the console. Off by
     * default — request bodies include PII (email, KYC identity). The API key
     * is never logged either way.
     */
    debug?: boolean;
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
    /** Off-ramp only: the reversal window has passed and funds cannot be returned. */
    | 'finalized'
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
    /**
     * Stellar claimable balance ID (hex). Present on completed Stellar on-ramp
     * orders where the wallet required setup (no account or no trustline).
     */
    stellarClaimableBalanceId?: string;
    /**
     * Unsigned Stellar transaction XDR (base64) containing `ChangeTrust` +
     * `ClaimClaimableBalance` operations. Present on completed Stellar on-ramp
     * orders that used the claimable-balance flow. The user signs it to add the
     * trustline and claim their tokens in one step.
     */
    stellarClaimTransaction?: string;
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
     * until Etherfuse has prepared the transaction. Always `undefined` in anchor mode.
     */
    burnTransaction?: string;
    /** Whether this order uses anchor mode (Stellar only). */
    isAnchorOrder?: boolean;
    /**
     * Anchor-mode only. Stellar account to send the withdrawal payment to. The
     * app builds a payment to this address carrying {@link anchorMemo} as a hash
     * memo, signs it, and submits it (instead of signing {@link burnTransaction}).
     */
    anchorAccount?: string;
    /** Anchor-mode only. Base64-encoded hash memo to attach to the payment. */
    anchorMemo?: string;
    /** Anchor-mode only. Memo type — always `"hash"`. */
    anchorMemoType?: string;
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
    /**
     * Customer email address. Sent to Etherfuse as `userInfo.email` so they can
     * pre-create the user record and email status updates; also stored locally
     * (Etherfuse does not echo it back on lookup).
     */
    email?: string;
    /** End-user display name, sent as `userInfo.displayName`. Defaults to `email`. */
    displayName?: string;
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
     * Stellar address — used both to resolve token symbols (e.g. `"CETES"`) to
     * full `CODE:ISSUER` identifiers via `/ramp/assets`, and (for on-ramps) sent
     * to the quote as `walletAddress` so the fee can cover one-time account /
     * trustline onboarding for new Stellar wallets.
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
    /**
     * Stellar only. Request **anchor mode** — the order returns anchor payment
     * details (`anchorAccount` / `anchorMemo` / `anchorMemoType`) instead of a
     * `burnTransaction`, and your app builds and submits the payment itself.
     */
    useAnchor?: boolean;
}

/** Args for {@link EtherfuseClient.getKycUrl}. */
export interface GetKycUrlArgs {
    /** Customer ID. */
    customerId: string;
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
    /** Bank account UUID. If omitted, a fresh UUID is generated. */
    bankAccountId?: string;
    /** End-user email, sent as `userInfo.email` when present. */
    email?: string;
    /** End-user display name, sent as `userInfo.displayName`. Defaults to `email`. */
    displayName?: string;
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
    /**
     * End-user info. Recommended by Etherfuse (and slated to become required)
     * so they pre-create the user record and can email status changes.
     */
    userInfo?: {
        email: string;
        displayName: string;
    };
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
    /**
     * Destination wallet public key. Optional but recommended for Stellar
     * on-ramps: when set, the quote fee includes a one-time onboarding cost if
     * the wallet needs an on-chain account or trustline.
     */
    walletAddress?: string;
    /** Optional partner-fee override in basis points (0–500). */
    partnerFeeBps?: number;
}

/** Request body for `POST /ramp/order` (both on-ramp and off-ramp). */
export interface EtherfuseOrderRequest {
    orderId: string;
    bankAccountId: string;
    publicKey: string;
    quoteId: string;
    memo?: string;
    /**
     * Stellar off-ramp only. When `true`, the order uses **anchor mode**: instead
     * of a pre-signed `burnTransaction`, the response returns
     * `withdrawAnchorAccount` / `withdrawMemo` / `withdrawMemoType` and your app
     * builds and submits the payment to the anchor account itself. Rejected on
     * non-Stellar chains.
     */
    useAnchor?: boolean;
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
    blockchain: string;
    quoteAssets: EtherfuseQuoteAssets;
    sourceAmount: string;
    destinationAmount: string;
    /** Fee-inclusive exchange rate (fees already reflected). */
    exchangeRate: string;
    /** Raw mid-market rate before fees (bond price or FX mid). */
    etherfuseMidMarketRate?: string | null;
    feeBps: string | null;
    feeAmount: string | null;
    destinationAmountAfterFee: string | null;
    /** Partner fee in basis points applied to this quote, if configured. */
    partnerFeeBps?: number | null;
    /** Partner fee amount in the source asset currency, if configured. */
    partnerFeeAmount?: string | null;
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
        /** Bank holding the deposit CLABE (e.g. "STP"). */
        depositBankName?: string;
        /** Account holder name for the deposit CLABE (e.g. "Etherfuse MX"). */
        depositAccountHolder?: string;
        /**
         * PIX deposit fields (Brazil). Not part of Etherfuse's documented FX API
         * yet — Brazil/PIX support is undocumented and in progress. Kept so the
         * speculative Brazil flow keeps working once the API ships them.
         */
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
        /** Anchor-mode only (`useAnchor: true`): destination anchor account. */
        withdrawAnchorAccount?: string | null;
        /** Anchor-mode only: base64 hash memo to attach to the payment. */
        withdrawMemo?: string | null;
        /** Anchor-mode only: memo type — always `"hash"`. */
        withdrawMemoType?: string | null;
    };
}

/**
 * Response from `GET /ramp/order/{order_id}`. Unified shape for both on-ramp and
 * off-ramp (also the `order_updated` webhook payload).
 */
export interface EtherfuseOrderResponse {
    orderId: string;
    customerId: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    completedAt?: string | null;
    amountInFiat?: string;
    amountInTokens?: string;
    confirmedTxSignature?: string;
    walletId: string;
    bankAccountId: string;
    burnTransaction?: string;
    /** Anchor-mode fields (Stellar off-ramp, `useAnchor: true`). */
    isAnchorOrder?: boolean | null;
    withdrawAnchorAccount?: string | null;
    withdrawMemo?: string | null;
    withdrawMemoType?: string | null;
    memo?: string;
    depositClabe?: string;
    /** Bank holding the deposit CLABE (on-ramp only). */
    depositBankName?: string | null;
    /** Account holder name for the deposit CLABE (on-ramp only). */
    depositAccountHolder?: string | null;
    /**
     * PIX deposit fields (Brazil) — undocumented/in-progress in Etherfuse's FX
     * API. Retained for the speculative Brazil flow.
     */
    depositPixKey?: string;
    depositPixKeyType?: string;
    depositPixCode?: string;
    orderType: 'onramp' | 'offramp';
    status: EtherfuseOrderStatus;
    statusPage: string;
    feeBps?: number;
    feeAmountInFiat?: string;
    /** Fee-inclusive exchange rate at order creation time. */
    exchangeRate?: string | null;
    /** Raw mid-market rate before fees. */
    etherfuseMidMarketRate?: string | null;
    /** Source asset identifier (fiat for on-ramp, `CODE:ISSUER` for off-ramp). */
    sourceAsset?: string | null;
    /** Target asset identifier (`CODE:ISSUER` for on-ramp, fiat for off-ramp). */
    targetAsset?: string | null;
    /** Stellar claimable balance ID (hex), on completed new-wallet on-ramps. */
    stellarClaimableBalanceId?: string | null;
    /** Unsigned claim transaction XDR, on completed new-wallet on-ramps. */
    stellarClaimTransaction?: string | null;
    /** Partner-fee fields, present when a partner fee was configured. */
    partnerFeeBps?: number | null;
    partnerFeeAmountFiat?: string | null;
    partnerFeeStatus?: 'none' | 'pending' | 'disbursed' | null;
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
