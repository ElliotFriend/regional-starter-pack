/**
 * AlfredPay-specific API types
 *
 * These types model the raw request and response shapes of the AlfredPay REST API.
 * They are consumed internally by {@link AlfredPayClient} and mapped to the shared
 * Anchor types defined in `../types.ts`.
 */

/** Configuration required to instantiate an {@link AlfredPayClient}. */
export interface AlfredPayConfig {
    /** API key provided by AlfredPay. */
    apiKey: string;
    /** API secret provided by AlfredPay. */
    apiSecret: string;
    /** Base URL of the AlfredPay API (e.g. `https://api-service-co.alfredpay.app/api/v1/third-party-service/penny`). */
    baseUrl: string;
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** Request body for `POST /customers/create`. */
export interface AlfredPayCreateCustomerRequest {
    /** Customer's email address. */
    email: string;
    /** Account type — individual person or business entity. */
    type: 'INDIVIDUAL' | 'BUSINESS';
    /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`). */
    country: string;
    /** Optional phone number. */
    phoneNumber?: string;
    /** Optional business identifier (required when `type` is `"BUSINESS"`). */
    businessId?: string;
}

/** Request body for `POST /quotes`. */
export interface AlfredPayQuoteRequest {
    /** Source currency code (e.g. `"MXN"`). */
    fromCurrency: string;
    /** Destination currency code (e.g. `"USDC"`). */
    toCurrency: string;
    /** Amount in the source currency. Provide either this or `toAmount`. */
    fromAmount?: string;
    /** Amount in the destination currency. Provide either this or `fromAmount`. */
    toAmount?: string;
    /** Blockchain network — always `"XLM"` for Stellar. */
    chain: 'XLM';
    /** Fiat payment rail — always `"SPEI"` for Mexico. */
    paymentMethodType: 'SPEI';
    /** Optional customer ID to associate with the quote. */
    customerId?: string;
    /** Optional business ID to associate with the quote. */
    businessId?: string;
    /** Optional arbitrary metadata. */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/** Response from `POST /customers/create`. */
export interface AlfredPayCreateCustomerResponse {
    /** Unique customer identifier. */
    customerId: string;
    /** ISO 8601 timestamp. */
    createdAt: string;
}

/** Response from `GET /customers/:id`. */
export interface AlfredPayCustomerResponse {
    /** Unique customer identifier. */
    id: string;
    /** Customer's email address. */
    email: string;
    /** Current KYC verification status. */
    kyc_status: 'pending' | 'approved' | 'rejected' | 'not_started';
    /** ISO 8601 creation timestamp. */
    created_at: string;
    /** ISO 8601 last-update timestamp. */
    updated_at: string;
}

/** A single fee line item within an {@link AlfredPayQuoteResponse}. */
export interface AlfredPayQuoteFee {
    /** Fee category. */
    type: 'commissionFee' | 'processingFee' | 'taxFee' | 'networkFee';
    /** Fee amount as a decimal string. */
    amount: string;
    /** Currency the fee is denominated in. */
    currency: string;
}

/** Response from `POST /quotes`. */
export interface AlfredPayQuoteResponse {
    /** Unique quote identifier. */
    quoteId: string;
    /** Source currency code. */
    fromCurrency: string;
    /** Destination currency code. */
    toCurrency: string;
    /** Amount in the source currency. */
    fromAmount: string;
    /** Amount in the destination currency. */
    toAmount: string;
    /** Blockchain network. */
    chain: string;
    /** Fiat payment rail. */
    paymentMethodType: string;
    /** ISO 8601 expiration timestamp. */
    expiration: string;
    /** Itemized fee breakdown. */
    fees: AlfredPayQuoteFee[];
    /** Exchange rate as a decimal string. */
    rate: string;
}

/** Legacy SPEI payment instruction shape (snake_case fields). */
export interface AlfredPayPaymentInstructions {
    /** Payment rail type. */
    type: 'spei';
    /** Name of the receiving bank. */
    bank_name: string;
    /** Bank account number. */
    account_number: string;
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
    /** Payment reference code. */
    reference: string;
    /** Amount to transfer. */
    amount: string;
    /** Currency of the transfer. */
    currency: string;
}

/** SPEI payment instructions returned with on-ramp transactions (camelCase fields). */
export interface AlfredPayFiatPaymentInstructions {
    /** Payment rail type (e.g. `"SPEI"`). */
    paymentType: string;
    /** 18-digit CLABE interbank code to send the SPEI transfer to. */
    clabe: string;
    /** Payment reference — must be included in the SPEI transfer. */
    reference: string;
    /** ISO 8601 timestamp after which the payment instructions expire. */
    expirationDate: string;
    /** Human-readable description of the payment. */
    paymentDescription: string;
    /** Name of the receiving bank. */
    bankName: string;
    /** Name of the account holder. */
    accountHolderName: string;
}

/** Individual on-ramp transaction fields as returned by the AlfredPay API. */
export interface AlfredPayOnRampTransaction {
    /** Unique transaction identifier. */
    transactionId: string;
    /** Customer that owns this transaction. */
    customerId: string;
    /** Quote used for this transaction. */
    quoteId: string;
    /** Current transaction status. */
    status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    /** Fiat amount being sent. */
    fromAmount: string;
    /** Fiat currency code. */
    fromCurrency: string;
    /** Crypto amount to be received. */
    toAmount: string;
    /** Crypto currency code. */
    toCurrency: string;
    /** Stellar address that will receive the crypto. */
    depositAddress: string;
    /** Blockchain network. */
    chain: string;
    /** Fiat payment rail. */
    paymentMethodType: string;
    /** Stellar transaction hash once the crypto has been sent, or `null` if not yet available. */
    txHash: string | null;
    /** Stellar transaction memo. */
    memo: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** Response from `POST /onramp` — transaction wrapped with payment instructions. */
export interface AlfredPayOnRampResponse {
    /** The created on-ramp transaction. */
    transaction: AlfredPayOnRampTransaction;
    /** SPEI payment instructions the user must follow to fund the transaction. */
    fiatPaymentInstructions: AlfredPayFiatPaymentInstructions;
}

/**
 * Response from `GET /onramp/:id`.
 *
 * Unlike the POST response, the GET endpoint returns a flat structure where
 * transaction fields are at the top level alongside `fiatPaymentInstructions`.
 */
export interface AlfredPayOnRampFlatResponse extends AlfredPayOnRampTransaction {
    /** SPEI payment instructions for the transaction. */
    fiatPaymentInstructions: AlfredPayFiatPaymentInstructions;
}

/** Bank account details as stored by AlfredPay (snake_case fields). */
export interface AlfredPayBankAccount {
    /** Unique bank account identifier. */
    id: string;
    /** Name of the bank. */
    bank_name: string;
    /** Bank account number. */
    account_number: string;
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
}

/** Response from `POST /offramp` and `GET /offramp/:id`. */
export interface AlfredPayOffRampResponse {
    /** Unique transaction identifier. */
    transactionId: string;
    /** Customer that owns this transaction. */
    customerId: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
    /** Crypto currency code being sold. */
    fromCurrency: string;
    /** Fiat currency code being received. */
    toCurrency: string;
    /** Crypto amount being sent. */
    fromAmount: string;
    /** Fiat amount to be received. */
    toAmount: string;
    /** Blockchain network. */
    chain: string;
    /** Current transaction status. */
    status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    /** Registered fiat account ID that will receive the payout. */
    fiatAccountId: string;
    /** Stellar address the user must send crypto to. */
    depositAddress: string;
    /** ISO 8601 expiration timestamp. */
    expiration: string;
    /** Memo to include in the Stellar transaction. */
    memo: string;
    /** Optional external reference ID. */
    externalId?: string;
    /** Optional arbitrary metadata. */
    metadata?: unknown;
    /** Stellar transaction hash, if available. */
    txHash?: string;
    /** Quote details, if included in the response. */
    quote?: AlfredPayQuoteResponse;
}

/** Response from the KYC iframe URL endpoint. */
export interface AlfredPayKycIframeResponse {
    /** URL to render in an iframe for interactive KYC verification. */
    url: string;
}

// ---------------------------------------------------------------------------
// KYC Requirements Types
// ---------------------------------------------------------------------------

/** A single field or document requirement for KYC verification. */
export interface AlfredPayKycRequirement {
    /** Field or document name (e.g. `"firstName"`, `"National ID Front"`). */
    name: string;
    /** Whether this requirement is mandatory. */
    required: boolean;
    /** Data type or format hint (e.g. `"string"`, `"file"`). */
    type: string;
    /** Human-readable description of the requirement. */
    description?: string;
}

/** Response from `GET /kycRequirements`. */
export interface AlfredPayKycRequirementsResponse {
    /** Country code these requirements apply to. */
    country: string;
    /** Grouped requirements. */
    requirements: {
        /** Personal data fields (name, address, etc.). */
        personal: AlfredPayKycRequirement[];
        /** Identity documents (ID photos, selfie). */
        documents: AlfredPayKycRequirement[];
    };
}

// ---------------------------------------------------------------------------
// KYC Submission Types
// ---------------------------------------------------------------------------

/** Request body for `POST /customers/:id/kyc`. */
export interface AlfredPayKycSubmissionRequest {
    /** Personal data to submit for KYC review. */
    kycSubmission: {
        firstName: string;
        lastName: string;
        /** ISO 8601 date string (e.g. `"1990-01-15"`). */
        dateOfBirth: string;
        /** ISO 3166-1 alpha-2 country code. */
        country: string;
        city: string;
        state: string;
        address: string;
        zipCode: string;
        /** List of ISO 3166-1 alpha-2 nationality codes. */
        nationalities: string[];
        email: string;
        /** National identity number (e.g. CURP in Mexico). */
        dni: string;
    };
}

/** Response from `POST /customers/:id/kyc` and `GET /customers/kyc/:id`. */
export interface AlfredPayKycSubmissionResponse {
    /** Unique submission identifier. */
    submissionId: string;
    /** Current submission status. */
    status: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/**
 * KYC status values received via AlfredPay webhook events.
 *
 * - `CREATED` — submission has been created
 * - `IN_REVIEW` — submission is being reviewed
 * - `UPDATE_REQUIRED` — additional information needed
 * - `COMPLETED` — verification approved
 * - `FAILED` — verification rejected
 */
export type AlfredPayKycStatus =
    | 'CREATED'
    | 'IN_REVIEW'
    | 'UPDATE_REQUIRED'
    | 'COMPLETED'
    | 'FAILED';

/** Response from `GET /customers/:customerId/kyc/:submissionId/status`. */
export interface AlfredPayKycSubmissionStatusResponse {
    /** Submission identifier. */
    submissionId?: string;
    /** Current KYC status. */
    status: AlfredPayKycStatus;
    /** ISO 8601 creation timestamp. */
    createdAt?: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt?: string;
}

// ---------------------------------------------------------------------------
// KYC File Upload Types
// ---------------------------------------------------------------------------

/** Accepted document types for KYC file uploads. */
export type AlfredPayKycFileType =
    | 'National ID Front'
    | 'National ID Back'
    | 'Driver Licence Front'
    | 'Driver Licence Back'
    | 'Selfie';

/** Response from `POST /customers/:customerId/kyc/:submissionId/files`. */
export interface AlfredPayKycFileResponse {
    /** Unique file identifier. */
    fileId: string;
    /** Document type that was uploaded. */
    fileType: AlfredPayKycFileType;
    /** Processing status of the uploaded file. */
    status: string;
}

/** Standard error response shape returned by the AlfredPay API. */
export interface AlfredPayErrorResponse {
    error: {
        /** Machine-readable error code. */
        code: string;
        /** Human-readable error message. */
        message: string;
    };
}

// ---------------------------------------------------------------------------
// Fiat Account Types
// ---------------------------------------------------------------------------

/** Supported fiat payment rail types across AlfredPay regions. */
export type AlfredPayFiatAccountType =
    | 'SPEI'
    | 'PIX'
    | 'COELSA'
    | 'ACH'
    | 'ACH_DOM'
    | 'BANK_CN'
    | 'BANK_USA'
    | 'ACH_CHL'
    | 'ACH_BOL'
    | 'B89';

/** Bank account field values for `POST /fiatAccounts`. */
export interface AlfredPayFiatAccountFields {
    /** Bank account number. */
    accountNumber: string;
    /** Account type (e.g. `"CHECKING"`). */
    accountType: string;
    /** Display name for the account. */
    accountName: string;
    /** Bank code identifier. */
    accountBankCode: string;
    /** User-defined alias for the account. */
    accountAlias: string;
    /** Network-specific identifier (e.g. CLABE for SPEI). */
    networkIdentifier: string;
    /** Optional metadata. */
    metadata?: {
        /** Full name of the account holder. */
        accountHolderName: string;
    };
}

/** Request body for `POST /fiatAccounts`. */
export interface AlfredPayCreateFiatAccountRequest {
    /** Customer ID to register the account under. */
    customerId: string;
    /** Payment rail type. */
    type: AlfredPayFiatAccountType;
    /** Bank account field values. */
    fiatAccountFields: AlfredPayFiatAccountFields;
    /** Whether the account is external to AlfredPay. */
    isExternal?: boolean;
}

/** Response from `POST /fiatAccounts`. */
export interface AlfredPayFiatAccountResponse {
    /** Unique fiat account identifier. */
    fiatAccountId: string;
    /** Customer that owns this account. */
    customerId: string;
    /** Payment rail type. */
    type: string;
    /** Registration status. */
    status: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/** A single item in the list returned by `GET /fiatAccounts`. */
export interface AlfredPayFiatAccountListItem {
    /** Unique fiat account identifier. */
    fiatAccountId: string;
    /** Payment rail type. */
    type: string;
    /** Bank account number. */
    accountNumber: string;
    /** Account type (e.g. `"CHECKING"`). */
    accountType: string;
    /** Display name for the account. */
    accountName: string;
    /** User-defined alias. */
    accountAlias: string;
    /** Name of the bank. */
    bankName: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** Whether the account is external to AlfredPay. */
    isExternal: boolean;
    /** Optional metadata. */
    metadata?: {
        /** Full name of the account holder. */
        accountHolderName?: string;
    };
}

// ---------------------------------------------------------------------------
// Webhook Types
// ---------------------------------------------------------------------------

/** Incoming webhook payload sent by AlfredPay to notify of status changes. */
export interface AlfredPayWebhookPayload {
    /** Event name. */
    event: string;
    /** Event data. */
    data: {
        /** Resource identifier (transaction ID, submission ID, etc.). */
        id: string;
        /** New status value. */
        status: string;
        [key: string]: unknown;
    };
    /** ISO 8601 timestamp of the event. */
    timestamp: string;
    /** HMAC signature for verifying authenticity. */
    signature: string;
}

/** Webhook event categories. */
export type AlfredPayWebhookEventType = 'KYC' | 'ONRAMP' | 'OFFRAMP' | 'KYB';

/** Request body for `POST /webhooks` (sandbox only — used to simulate events). */
export interface AlfredPaySandboxWebhookRequest {
    /** ID of the resource to update (transaction ID, submission ID, etc.). */
    referenceId: string;
    /** Category of the webhook event. */
    eventType: AlfredPayWebhookEventType;
    /** New status to set on the resource. */
    status: string;
    /** Optional metadata to include with the event. */
    metadata: Record<string, unknown> | null;
}
