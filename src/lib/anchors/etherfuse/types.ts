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
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

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
    /** Partner-generated UUID for this quote. */
    quoteId: string;
    /** Customer UUID. */
    customerId: string;
    /** Blockchain identifier (e.g. `"stellar"`). */
    blockchain: string;
    /** Asset pair and ramp direction. */
    quoteAssets: EtherfuseQuoteAssets;
    /** Amount of the source asset to convert. */
    sourceAmount: string;
}

/** Request body for `POST /ramp/order` (both on-ramp and off-ramp). */
export interface EtherfuseOrderRequest {
    /** Partner-generated UUID for this order. */
    orderId: string;
    /** Bank account UUID. */
    bankAccountId: string;
    /** Stellar public key. */
    publicKey: string;
    /** Quote ID for pricing (from `POST /ramp/quote`). */
    quoteId: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
}

/** SPEI-shaped account body for Mexican (CLABE) bank-account registration. */
export interface EtherfuseSpeiAccountBody {
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
    /** Name of the bank. */
    bankName?: string;
}

/** PIX-shaped account body for Brazilian bank-account registration. */
export interface EtherfusePixAccountBody {
    /** PIX key (CPF, CNPJ, email, phone, or random/EVP UUID). */
    pixKey: string;
    /** PIX key type: `'evp'` (random UUID), `'cpf'`, `'cnpj'`, `'email'`, or `'phone'`. */
    pixKeyType: string;
    /** First name of the account holder (matches CPF registration). */
    firstName: string;
    /** Last name of the account holder. */
    lastName: string;
    /** 11-digit CPF (Brazilian individual tax ID). */
    cpf: string;
}

/** Request body for `POST /ramp/bank-account`. */
export interface EtherfuseBankAccountRequest {
    /** Presigned onboarding URL that authenticates this request. */
    presignedUrl: string;
    /** Bank account details — discriminated by which fields are present. */
    account: EtherfuseSpeiAccountBody | EtherfusePixAccountBody;
}

/** Request body for `POST /ramp/customer/{id}/kyc` (programmatic KYC identity submission). */
export interface EtherfuseKycIdentityRequest {
    /** Wallet public key. */
    pubkey: string;
    /** Identity data. */
    identity: {
        /** Identity identifier (typically the pubkey). */
        id: string;
        /** Customer name. */
        name: {
            /** First name. */
            givenName: string;
            /** Last name. */
            familyName: string;
        };
        /** ISO 8601 date string (e.g. `"1990-05-15"`). */
        dateOfBirth: string;
        /** Residential address. */
        address: {
            /** Street address. */
            street: string;
            /** City. */
            city: string;
            /** State/region code. */
            region: string;
            /** Postal/ZIP code. */
            postalCode: string;
            /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`). */
            country: string;
        };
        /** National identity numbers (e.g. CURP). */
        idNumbers: Array<{
            /** ID number value. */
            value: string;
            /** ID type (e.g. `"CURP"`). */
            type: string;
        }>;
    };
}

/** Request body for `POST /ramp/customer/{id}/kyc/documents`. */
export interface EtherfuseKycDocumentRequest {
    /** Wallet public key. */
    pubkey: string;
    /** Document category: `"document"` for ID images, `"selfie"` for selfie. */
    documentType: 'document' | 'selfie';
    /** Array of images to upload. */
    images: Array<{
        /** Image label: `"id_front"`, `"id_back"`, or `"selfie"`. */
        label: 'id_front' | 'id_back' | 'selfie';
        /** Base64-encoded data URL (e.g. `"data:image/jpeg;base64,..."` ). */
        image: string;
    }>;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/** Response from `POST /ramp/onboarding-url`. */
export interface EtherfuseOnboardingResponse {
    /** Presigned onboarding URL for KYC and agreement acceptance. */
    presigned_url: string;
}

/** Response from `POST /ramp/quote`. */
export interface EtherfuseQuoteResponse {
    /** Quote ID echoed back. */
    quoteId: string;
    /** Customer ID echoed back. */
    customerId: string;
    /** Blockchain identifier. */
    blockchain: string;
    /** Asset pair and ramp direction. */
    quoteAssets: EtherfuseQuoteAssets;
    /** Amount of the source asset. */
    sourceAmount: string;
    /** Converted amount of the destination asset. */
    destinationAmount: string;
    /** Exchange rate as a decimal string. */
    exchangeRate: string;
    /** Fee in basis points. */
    feeBps: string | null;
    /** Fee amount. */
    feeAmount: string | null;
    /** Destination amount after fee deduction. */
    destinationAmountAfterFee: string | null;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
    /** ISO 8601 expiration timestamp. */
    expiresAt: string;
}

/** Etherfuse order status values. */
export type EtherfuseOrderStatus =
    | 'created'
    | 'funded'
    | 'completed'
    | 'failed'
    | 'refunded'
    | 'canceled';

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

/** Response from `POST /ramp/order` (on-ramp creation). Carries either SPEI or PIX deposit fields. */
export interface EtherfuseCreateOnRampResponse {
    onramp: {
        /** Order ID echoed back. */
        orderId: string;
        /** Amount to deposit (in fiat). */
        depositAmount: string;
        /** CLABE for SPEI deposit (Mexico). */
        depositClabe?: string;
        /** Name of the receiving bank (Mexico). */
        bankName?: string;
        /** Name of the account beneficiary (both rails). */
        beneficiary?: string;
        /** PIX key for direct transfer (Brazil). */
        depositPixKey?: string;
        /** PIX key type (Brazil): `'evp'`, `'cpf'`, `'cnpj'`, `'email'`, or `'phone'`. */
        depositPixKeyType?: string;
        /** PIX BR-Code / EMV copy-paste string (Brazil). */
        depositPixCode?: string;
    };
}

/** Response from `POST /ramp/order` (off-ramp creation). */
export interface EtherfuseCreateOffRampResponse {
    offramp: {
        /** Order ID echoed back. */
        orderId: string;
    };
}

/** Response from `GET /ramp/order/{order_id}`. Unified shape for both on-ramp and off-ramp. */
export interface EtherfuseOrderResponse {
    /** Unique identifier for the order. */
    orderId: string;
    /** ID of the customer who placed the order. */
    customerId: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
    /** ISO 8601 deletion timestamp, if applicable. */
    deletedAt?: string;
    /** ISO 8601 completion timestamp. */
    completedAt?: string;
    /** Amount in the order's fiat currency (MXN or BRL). */
    amountInFiat?: string;
    /** Amount in crypto tokens. */
    amountInTokens?: string;
    /** Blockchain transaction hash when crypto transfer is confirmed. */
    confirmedTxSignature?: string;
    /** ID of the wallet used for the order. */
    walletId: string;
    /** ID of the bank account used for the order. */
    bankAccountId: string;
    /** Encoded transaction for the user to sign (off-ramp orders). */
    burnTransaction?: string;
    /** Optional memo for the order. */
    memo?: string;
    /** CLABE number for deposit (Mexican on-ramp orders only). */
    depositClabe?: string;
    /** PIX key for deposit (Brazilian on-ramp orders only). */
    depositPixKey?: string;
    /** PIX key type for deposit (Brazilian on-ramp orders only). */
    depositPixKeyType?: string;
    /** PIX BR-Code / EMV copy-paste string for deposit (Brazilian on-ramp orders only). */
    depositPixCode?: string;
    /** Order type. */
    orderType: 'onramp' | 'offramp';
    /** Current order status. */
    status: EtherfuseOrderStatus;
    /** URL to the order status page. */
    statusPage: string;
    /** Fee in basis points (e.g. 20 = 0.20%). */
    feeBps?: number;
    /** Fee amount collected in fiat currency. */
    feeAmountInFiat?: string;
}

/** Response from `GET /ramp/customer/{id}`. */
export interface EtherfuseCustomerResponse {
    /** Customer ID. */
    customerId: string;
    /** Display name, if set. */
    displayName: string | null;
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
    | 'approved_chain_deploying'
    | 'rejected';

/** Response from `GET /ramp/customer/{id}/kyc/{pubkey}`. */
export interface EtherfuseKycStatusResponse {
    /** Customer ID. */
    customerId: string;
    /** Wallet public key. */
    walletPublicKey: string;
    /** Current KYC status. */
    status: EtherfuseKycStatus;
    /** Whether KYC approval is marked on-chain. */
    onChainMarked?: boolean;
    /** Reason for rejection, if applicable. */
    currentRejectionReason?: string | null;
    /** Submitted selfie data. */
    selfies?: unknown[];
    /** Submitted document data. */
    documents?: unknown[];
    /** Current KYC identity info. */
    currentKycInfo?: unknown;
    /** ISO 8601 approval timestamp. */
    approvedAt?: string | null;
}

/** Response from `POST /ramp/bank-account`. Carries either SPEI or PIX fields depending on the rail. */
export interface EtherfuseBankAccountResponse {
    /** Bank account ID. */
    bankAccountId: string;
    /** Customer ID. */
    customerId: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
    /** Abbreviated CLABE (Mexico). */
    abbrClabe?: string;
    /** Etherfuse deposit CLABE (Mexico). */
    etherfuseDepositClabe?: string;
    /** PIX key (Brazil). */
    pixKey?: string;
    /** PIX key type (Brazil). */
    pixKeyType?: string;
    /** Account holder full name (Brazil). */
    accountHolderName?: string;
    /** Whether the account is compliant. */
    compliant?: boolean;
    /** Account status. */
    status: string;
}

/** Etherfuse agreement type. */
export type EtherfuseAgreementType =
    | 'electronic_signature'
    | 'terms_and_conditions'
    | 'customer_agreement';

/** Response from agreement acceptance endpoints. */
export interface EtherfuseAgreementResponse {
    /** Whether the agreement was accepted. */
    success: boolean;
    /** ISO 8601 acceptance timestamp. */
    acceptedAt: string;
    /** Agreement type. */
    agreementType: EtherfuseAgreementType;
}

/** A single bank account in the list response from `POST /ramp/customer/{id}/bank-accounts`. */
export interface EtherfuseBankAccountListItem {
    /** Bank account ID. */
    bankAccountId: string;
    /** Customer ID. */
    customerId: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
    /** ISO 8601 deletion timestamp, if applicable. */
    deletedAt?: string | null;
    /** Abbreviated CLABE (Mexico, e.g. "1067...8699"). */
    abbrClabe?: string;
    /** Etherfuse deposit CLABE for receiving funds (Mexico). */
    etherfuseDepositClabe?: string;
    /** PIX key (Brazil). */
    pixKey?: string;
    /** PIX key type (Brazil). */
    pixKeyType?: string;
    /** Account holder full name (Brazil). */
    accountHolderName?: string;
    /** Human-readable label. */
    label?: string | null;
    /** Whether the account is compliant. */
    compliant: boolean;
    /** Account status (e.g. "active"). */
    status: string;
}

/** Paginated response from `POST /ramp/customer/{id}/bank-accounts`. */
export interface EtherfuseBankAccountListResponse {
    /** List of bank accounts. */
    items: EtherfuseBankAccountListItem[];
    /** Total number of bank accounts. */
    totalItems: number;
    /** Number of items per page. */
    pageSize: number;
    /** Current page number (0-indexed). */
    pageNumber: number;
    /** Total number of pages. */
    totalPages: number;
}

/** Rampable asset returned by `GET /ramp/assets`. */
export interface EtherfuseAsset {
    /** Token symbol (e.g. `"CETES"`). */
    symbol: string;
    /** Full asset identifier for use in quotes/orders (e.g. `"CETES:GCRYUGD5..."`). */
    identifier: string;
    /** Human-readable asset name. */
    name: string;
    /** Associated fiat currency, if any. */
    currency: string | null;
    /** Wallet balance for this asset, if a wallet was provided. */
    balance: string | null;
    /** Asset image URL. */
    image: string | null;
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
    | 'bank_account_updated'
    | 'customer_updated'
    | 'order_updated'
    | 'quote_updated'
    | 'swap_updated'
    | 'kyc_updated';

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
