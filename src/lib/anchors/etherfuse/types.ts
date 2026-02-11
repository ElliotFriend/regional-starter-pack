/**
 * Etherfuse-specific API types
 *
 * These types model the raw request and response shapes of the Etherfuse REST API.
 * They are consumed internally by {@link EtherfuseClient} and mapped to the shared
 * Anchor types defined in `../types.ts`.
 */

/** Configuration required to instantiate an {@link EtherfuseClient}. */
export interface EtherfuseConfig {
    /** API key provided by Etherfuse. */
    apiKey: string;
    /** Base URL of the Etherfuse API (e.g. `https://api.etherfuse.com` or `https://api.sand.etherfuse.com`). */
    baseUrl: string;
    /** Default blockchain for operations. Defaults to `"stellar"`. */
    defaultBlockchain?: string;
    /** Default Stellar public key for KYC operations. */
    defaultPublicKey?: string;
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** Request body for `POST /ramp/onboarding-url`. */
export interface EtherfuseOnboardingRequest {
    /** Partner-generated UUID for the customer. */
    customerId: string;
    /** Customer's email address. */
    email: string;
    /** Stellar public key for the customer's wallet. */
    publicKey: string;
    /** Blockchain identifier (e.g. `"stellar"`). */
    blockchain: string;
}

/** Request body for `POST /ramp/quote`. */
export interface EtherfuseQuoteRequest {
    /** Partner-generated UUID for this quote. */
    quoteId: string;
    /** Source currency code (e.g. `"MXN"`). */
    fromCurrency: string;
    /** Destination asset in `CODE:ISSUER` format (e.g. `"CETES:GCRYUGD5..."`). */
    toCurrency: string;
    /** Amount in the source currency. */
    fromAmount?: string;
    /** Amount in the destination currency. */
    toAmount?: string;
    /** Blockchain identifier (e.g. `"stellar"`). */
    blockchain: string;
}

/** Request body for `POST /ramp/order` (on-ramp). */
export interface EtherfuseOnRampOrderRequest {
    /** Partner-generated UUID for this order. */
    orderId: string;
    /** Customer ID associated with this order. */
    customerId: string;
    /** Quote ID for pricing. */
    quoteId: string;
    /** Order type. */
    orderType: 'on-ramp';
    /** Fiat currency being sent (e.g. `"MXN"`). */
    fromCurrency: string;
    /** Crypto asset being received in `CODE:ISSUER` format. */
    toCurrency: string;
    /** Fiat amount to convert. */
    amount: string;
    /** Stellar address to receive the crypto asset. */
    stellarAddress: string;
    /** Blockchain identifier. */
    blockchain: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
}

/** Request body for `POST /ramp/order` (off-ramp). */
export interface EtherfuseOffRampOrderRequest {
    /** Partner-generated UUID for this order. */
    orderId: string;
    /** Customer ID associated with this order. */
    customerId: string;
    /** Quote ID for pricing. */
    quoteId: string;
    /** Order type. */
    orderType: 'off-ramp';
    /** Crypto asset being sent in `CODE:ISSUER` format. */
    fromCurrency: string;
    /** Fiat currency to receive (e.g. `"MXN"`). */
    toCurrency: string;
    /** Crypto amount to convert. */
    amount: string;
    /** Stellar address sending the crypto. */
    stellarAddress: string;
    /** Registered bank account ID for fiat payout. */
    bankAccountId: string;
    /** Blockchain identifier. */
    blockchain: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
}

/** Request body for `POST /ramp/bank-account`. */
export interface EtherfuseBankAccountRequest {
    /** Partner-generated UUID for this bank account. */
    bankAccountId: string;
    /** Customer ID to register the account under. */
    customerId: string;
    /** Name of the bank. */
    bankName: string;
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
}

/** Request body for programmatic KYC identity submission. */
export interface EtherfuseKycIdentityRequest {
    /** Customer's first name. */
    firstName: string;
    /** Customer's last name. */
    lastName: string;
    /** ISO 8601 date string (e.g. `"1990-01-15"`). */
    dateOfBirth: string;
    /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`). */
    country: string;
    /** City of residence. */
    city: string;
    /** State/province of residence. */
    state: string;
    /** Street address. */
    address: string;
    /** Postal/ZIP code. */
    zipCode: string;
    /** Phone number. */
    phoneNumber: string;
    /** National identity number (e.g. CURP in Mexico). */
    nationalId: string;
}

/** Request body for programmatic KYC document submission. */
export interface EtherfuseKycDocumentRequest {
    /** Document type. */
    documentType: 'national_id_front' | 'national_id_back' | 'selfie' | 'proof_of_address';
    /** Base64-encoded document image. */
    documentData: string;
    /** File format (e.g. `"image/jpeg"`, `"image/png"`). */
    contentType: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/** Response from `POST /ramp/onboarding-url`. */
export interface EtherfuseOnboardingResponse {
    /** Customer ID echoed back. */
    customerId: string;
    /** Presigned onboarding URL for KYC and agreement acceptance. */
    onboardingUrl: string;
}

/** Response from `POST /ramp/quote`. */
export interface EtherfuseQuoteResponse {
    /** Quote ID echoed back. */
    quoteId: string;
    /** Source currency code. */
    fromCurrency: string;
    /** Destination asset in `CODE:ISSUER` format. */
    toCurrency: string;
    /** Amount in the source currency. */
    fromAmount: string;
    /** Amount in the destination currency. */
    toAmount: string;
    /** Exchange rate as a decimal string. */
    exchangeRate: string;
    /** Total fee as a decimal string. */
    fee: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
}

/** Etherfuse order status values. */
export type EtherfuseOrderStatus =
    | 'created'
    | 'funded'
    | 'completed'
    | 'failed'
    | 'expired';

/** SPEI payment details included in on-ramp order responses. */
export interface EtherfuseDepositDetails {
    /** 18-digit CLABE to send the SPEI transfer to. */
    depositClabe: string;
    /** Name of the receiving bank. */
    bankName: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
    /** Payment reference to include in the SPEI transfer. */
    reference: string;
    /** Amount to transfer in fiat currency. */
    amount: string;
    /** Currency of the transfer. */
    currency: string;
}

/** Response from `POST /ramp/order` (on-ramp). */
export interface EtherfuseOnRampOrderResponse {
    /** Order ID echoed back. */
    orderId: string;
    /** Customer ID. */
    customerId: string;
    /** Quote ID. */
    quoteId: string;
    /** Order type. */
    orderType: 'on-ramp';
    /** Current order status. */
    status: EtherfuseOrderStatus;
    /** Fiat amount being sent. */
    fromAmount: string;
    /** Fiat currency code. */
    fromCurrency: string;
    /** Crypto amount to be received. */
    toAmount: string;
    /** Crypto asset in `CODE:ISSUER` format. */
    toCurrency: string;
    /** Stellar address that will receive the crypto. */
    stellarAddress: string;
    /** SPEI deposit instructions for funding the order. */
    depositDetails: EtherfuseDepositDetails;
    /** Stellar transaction hash, if available. */
    stellarTxHash?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** Response from `POST /ramp/order` (off-ramp). */
export interface EtherfuseOffRampOrderResponse {
    /** Order ID echoed back. */
    orderId: string;
    /** Customer ID. */
    customerId: string;
    /** Quote ID. */
    quoteId: string;
    /** Order type. */
    orderType: 'off-ramp';
    /** Current order status. */
    status: EtherfuseOrderStatus;
    /** Crypto amount being sent. */
    fromAmount: string;
    /** Crypto asset in `CODE:ISSUER` format. */
    fromCurrency: string;
    /** Fiat amount to be received. */
    toAmount: string;
    /** Fiat currency code. */
    toCurrency: string;
    /** Stellar address sending the crypto. */
    stellarAddress: string;
    /** Bank account ID for fiat payout. */
    bankAccountId: string;
    /** Base64-encoded Stellar transaction envelope for the user to sign and submit. */
    burnTransaction?: string;
    /** Stellar transaction hash, if available. */
    stellarTxHash?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** Response from `GET /ramp/customer/{id}`. */
export interface EtherfuseCustomerResponse {
    /** Customer ID. */
    customerId: string;
    /** Customer's email address. */
    email: string;
    /** Stellar public key associated with this customer. */
    publicKey: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** Etherfuse KYC status values. */
export type EtherfuseKycStatus =
    | 'not_started'
    | 'proposed'
    | 'approved'
    | 'rejected';

/** Response from `GET /ramp/customer/{id}/kyc/{pubkey}`. */
export interface EtherfuseKycStatusResponse {
    /** Customer ID. */
    customerId: string;
    /** Wallet public key. */
    publicKey: string;
    /** Current KYC status. */
    status: EtherfuseKycStatus;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** Response from `POST /ramp/bank-account`. */
export interface EtherfuseBankAccountResponse {
    /** Bank account ID echoed back. */
    bankAccountId: string;
    /** Customer ID. */
    customerId: string;
    /** Registration status. */
    status: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/** A single bank account in the list response. */
export interface EtherfuseBankAccountListItem {
    /** Bank account ID. */
    bankAccountId: string;
    /** Name of the bank. */
    bankName: string;
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/** Paginated response from `POST /ramp/customer/{id}/bank-accounts`. */
export interface EtherfuseBankAccountListResponse {
    /** List of bank accounts. */
    bankAccounts: EtherfuseBankAccountListItem[];
    /** Total number of bank accounts. */
    total: number;
    /** Current page number. */
    page: number;
    /** Number of items per page. */
    pageSize: number;
}

/** Rampable asset returned by the assets endpoint. */
export interface EtherfuseAsset {
    /** Asset code (e.g. `"CETES"`). */
    code: string;
    /** Asset issuer (Stellar public key). */
    issuer: string;
    /** Human-readable asset name. */
    name: string;
    /** Blockchain identifier. */
    blockchain: string;
    /** Supported fiat currencies for this asset. */
    currencies: string[];
}

/** Response from `GET /ramp/assets`. */
export interface EtherfuseAssetsResponse {
    /** List of rampable assets. */
    assets: EtherfuseAsset[];
}

// ---------------------------------------------------------------------------
// Webhook Types
// ---------------------------------------------------------------------------

/** Webhook event types sent by Etherfuse. */
export type EtherfuseWebhookEventType =
    | 'order_updated'
    | 'kyc_updated'
    | 'swap_updated';

/** Incoming webhook payload sent by Etherfuse. */
export interface EtherfuseWebhookPayload {
    /** Event type. */
    event: EtherfuseWebhookEventType;
    /** Event data. */
    data: {
        /** Resource identifier. */
        id: string;
        /** New status value. */
        status: string;
        [key: string]: unknown;
    };
    /** ISO 8601 timestamp of the event. */
    timestamp: string;
}

// ---------------------------------------------------------------------------
// Error Type
// ---------------------------------------------------------------------------

/** Standard error response shape returned by the Etherfuse API. */
export interface EtherfuseErrorResponse {
    error: {
        /** Machine-readable error code. */
        code: string;
        /** Human-readable error message. */
        message: string;
    };
}
