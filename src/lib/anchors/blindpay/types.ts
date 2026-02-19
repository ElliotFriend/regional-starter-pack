/**
 * BlindPay-specific API types
 *
 * These types model the raw request and response shapes of the BlindPay REST API.
 * They are consumed internally by {@link BlindPayClient} and mapped to the shared
 * Anchor types defined in `../types.ts`.
 */

/** Configuration required to instantiate a {@link BlindPayClient}. */
export interface BlindPayConfig {
    /** API key provided by BlindPay. */
    apiKey: string;
    /** Instance ID for API path construction (e.g. `in_000000000000`). */
    instanceId: string;
    /** Base URL of the BlindPay API (e.g. `https://api.blindpay.com`). */
    baseUrl: string;
    /** Stellar network for wallet registration. Defaults to `"stellar_testnet"`. */
    network?: string;
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** Request body for `POST /v1/e/instances/{id}/tos`. */
export interface BlindPayTosRequest {
    /** Idempotency key (UUID). */
    idempotency_key: string;
}

/** Request body for `POST /v1/instances/{id}/receivers` (individual, standard KYC). */
export interface BlindPayCreateReceiverRequest {
    /** TOS acceptance ID from the ToS flow. */
    tos_id: string;
    /** Receiver type. */
    type: 'individual' | 'business';
    /** KYC tier. */
    kyc_type: 'standard' | 'enhanced';
    /** Email address. */
    email: string;
    /** Tax ID (e.g. CURP in Mexico). */
    tax_id: string;
    /** Street address line 1. */
    address_line_1: string;
    /** Street address line 2. */
    address_line_2?: string;
    /** City. */
    city: string;
    /** State/province/region. */
    state_province_region: string;
    /** ISO 3166-1 alpha-2 country code. */
    country: string;
    /** Postal code. */
    postal_code: string;
    /** IP address of the user. */
    ip_address: string;
    /** Phone number in E.164 format. */
    phone_number: string;
    /** First name (individual only). */
    first_name?: string;
    /** Last name (individual only). */
    last_name?: string;
    /** Date of birth in ISO 8601 format (individual only). */
    date_of_birth?: string;
    /** ID document country. */
    id_doc_country?: string;
    /** ID document type. */
    id_doc_type?: 'PASSPORT' | 'ID_CARD' | 'DRIVERS';
    /** URL to front of ID document. */
    id_doc_front_file?: string;
    /** URL to back of ID document. */
    id_doc_back_file?: string;
    /** URL to selfie image. */
    selfie_file?: string;
    /** Proof of address document type. */
    proof_of_address_doc_type?: string;
    /** URL to proof of address document. */
    proof_of_address_doc_file?: string;
    // Enhanced KYC fields
    /** Source of funds document file URL. */
    source_of_funds_doc_file?: string;
    /** Source of funds document type. */
    source_of_funds_doc_type?: string;
    /** Purpose of transactions. */
    purpose_of_transactions?: string;
    /** Explanation for purpose of transactions. */
    purpose_of_transactions_explanation?: string;
}

/** Request body for `POST /v1/instances/{id}/receivers/{id}/bank-accounts` (SPEI). */
export interface BlindPayCreateBankAccountRequest {
    /** Bank account type. */
    type: 'spei_bitso';
    /** Display name. */
    name: string;
    /** Beneficiary name. */
    beneficiary_name: string;
    /** SPEI protocol. */
    spei_protocol: string;
    /** SPEI institution code. */
    spei_institution_code: string;
    /** 18-digit CLABE. */
    spei_clabe: string;
}

/** Request body for `POST /v1/instances/{id}/receivers/{id}/blockchain-wallets`. */
export interface BlindPayCreateBlockchainWalletRequest {
    /** Display name. */
    name: string;
    /** Blockchain network (e.g. `"stellar"`, `"stellar_testnet"`). */
    network: string;
    /** Whether using account abstraction / direct address method. */
    is_account_abstraction: boolean;
    /** Wallet address (required when `is_account_abstraction` is true). */
    address?: string;
    /** Signed message hash (required when `is_account_abstraction` is false). */
    signature_tx_hash?: string;
}

/** Request body for `POST /v1/instances/{id}/quotes` (payout). */
export interface BlindPayPayoutQuoteRequest {
    /** Bank account ID. */
    bank_account_id: string;
    /** Whether to specify amount in sender or receiver currency. */
    currency_type: 'sender' | 'receiver';
    /** Whether the sender covers fees. */
    cover_fees: boolean;
    /** Amount in cents (integer). */
    request_amount: number;
    /** Blockchain network. */
    network: string;
    /** Stablecoin token. */
    token: string;
}

/** Request body for `POST /v1/instances/{id}/payin-quotes`. */
export interface BlindPayPayinQuoteRequest {
    /** Blockchain wallet ID. */
    blockchain_wallet_id: string;
    /** Whether to specify amount in sender or receiver currency. */
    currency_type: 'sender' | 'receiver';
    /** Whether the sender covers fees. */
    cover_fees: boolean;
    /** Amount in cents (integer). */
    request_amount: number;
    /** Payment method (e.g. `"spei"`). */
    payment_method: string;
    /** Stablecoin token. */
    token: string;
}

/** Request body for `POST /v1/instances/{id}/payouts/stellar/authorize`. */
export interface BlindPayPayoutAuthorizeRequest {
    /** Quote ID. */
    quote_id: string;
    /** Sender's Stellar wallet address. */
    sender_wallet_address: string;
}

/** Request body for `POST /v1/instances/{id}/payouts/stellar`. */
export interface BlindPayPayoutSubmitRequest {
    /** Quote ID. */
    quote_id: string;
    /** Signed Stellar transaction (XDR). */
    signed_transaction: string;
    /** Sender's Stellar wallet address. */
    sender_wallet_address: string;
}

/** Request body for `POST /v1/instances/{id}/payins/evm`. */
export interface BlindPayPayinCreateRequest {
    /** Payin quote ID. */
    payin_quote_id: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/** Response from `POST /v1/e/instances/{id}/tos`. */
export interface BlindPayTosResponse {
    /** The ToS acceptance URL to redirect the user to. */
    url: string;
}

/** BlindPay receiver KYC status. */
export type BlindPayReceiverStatus = 'verifying' | 'approved' | 'rejected';

/** Response from `POST /v1/instances/{id}/receivers`. */
export interface BlindPayReceiverResponse {
    /** Receiver ID (e.g. `re_000000000000`). */
    id: string;
    /** Receiver type. */
    type: 'individual' | 'business';
    /** KYC status. */
    kyc_status: BlindPayReceiverStatus;
    /** First name (individual). */
    first_name?: string;
    /** Last name (individual). */
    last_name?: string;
    /** Email address. */
    email: string;
    /** Country code. */
    country: string;
    /** KYC warnings, if rejected. */
    kyc_warnings?: string[];
    /** Fraud warnings, if any. */
    fraud_warnings?: string[];
    /** ISO 8601 creation timestamp. */
    created_at: string;
    /** ISO 8601 last-update timestamp. */
    updated_at: string;
}

/** Response from `POST /v1/instances/{id}/receivers/{id}/bank-accounts`. */
export interface BlindPayBankAccountResponse {
    /** Bank account ID (e.g. `ba_000000000000`). */
    id: string;
    /** Bank account type. */
    type: string;
    /** Display name. */
    name: string;
    /** Beneficiary name. */
    beneficiary_name?: string;
    /** SPEI CLABE. */
    spei_clabe?: string;
    /** ISO 8601 creation timestamp. */
    created_at: string;
}

/** Response from `POST /v1/instances/{id}/receivers/{id}/blockchain-wallets`. */
export interface BlindPayBlockchainWalletResponse {
    /** Blockchain wallet ID (e.g. `bw_000000000000`). */
    id: string;
    /** Display name. */
    name: string;
    /** Blockchain network. */
    network: string;
    /** Wallet address. */
    address: string;
    /** ISO 8601 creation timestamp. */
    created_at: string;
}

/** Response from `POST /v1/instances/{id}/quotes` (payout quote). */
export interface BlindPayQuoteResponse {
    /** Quote ID (e.g. `qu_000000000000`). */
    id: string;
    /** Amount the sender pays (in cents). */
    sender_amount: number;
    /** Amount the receiver gets (in cents). */
    receiver_amount: number;
    /** Commercial exchange rate. */
    commercial_quotation: number;
    /** BlindPay exchange rate (includes spread). */
    blindpay_quotation: number;
    /** Flat fee (in cents). */
    flat_fee: number;
    /** Partner fee amount (in cents). */
    partner_fee_amount: number;
    /** Billing fee amount (in cents). */
    billing_fee_amount: number;
    /** Expiration timestamp (Unix ms). */
    expires_at: number;
    /** Contract details for EVM chains. */
    contract?: {
        address: string;
        abi: unknown[];
        blindpayContractAddress: string;
        amount: string;
        network: string;
    };
}

/** Response from `POST /v1/instances/{id}/payin-quotes`. */
export interface BlindPayPayinQuoteResponse {
    /** Payin quote ID (e.g. `pq_000000000000`). */
    id: string;
    /** Amount the sender pays (in cents). */
    sender_amount: number;
    /** Amount the receiver gets (in cents). */
    receiver_amount: number;
    /** Commercial exchange rate. */
    commercial_quotation: number;
    /** BlindPay exchange rate (includes spread). */
    blindpay_quotation: number;
    /** Flat fee (in cents). */
    flat_fee: number;
    /** Partner fee amount (in cents). */
    partner_fee_amount: number;
    /** Billing fee amount (in cents). */
    billing_fee_amount: number;
    /** Expiration timestamp (Unix ms). */
    expires_at: number;
}

/** Response from `POST /v1/instances/{id}/payouts/stellar/authorize`. */
export interface BlindPayPayoutAuthorizeResponse {
    /** The Stellar transaction XDR for the user to sign. */
    transaction_hash: string;
}

/** BlindPay payout status. */
export type BlindPayPayoutStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'refunded';

/** Response from `POST /v1/instances/{id}/payouts/stellar` and `GET /v1/instances/{id}/payouts/{id}`. */
export interface BlindPayPayoutResponse {
    /** Payout ID. */
    id: string;
    /** Quote ID. */
    quote_id: string;
    /** Payout status. */
    status: BlindPayPayoutStatus;
    /** Sender wallet address. */
    sender_wallet_address: string;
    /** Amount sent (in cents). */
    sender_amount: number;
    /** Sender currency. */
    sender_currency: string;
    /** Amount received (in cents). */
    receiver_amount: number;
    /** Receiver currency. */
    receiver_currency: string;
    /** Exchange rate. */
    exchange_rate?: string;
    /** Blockchain transaction hash. */
    blockchain_tx_hash?: string;
    /** ISO 8601 creation timestamp. */
    created_at: string;
    /** ISO 8601 last-update timestamp. */
    updated_at: string;
}

/** BlindPay payin status. */
export type BlindPayPayinStatus =
    | 'pending'
    | 'waiting_for_payment'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'refunded';

/** Tracking step within a payin lifecycle. */
export interface BlindPayTrackingStep {
    step: string;
    transaction_hash?: string | null;
    completed_at?: string | null;
    external_id?: string | null;
    provider_name?: string;
    pse_instruction?: unknown;
    transfers_instruction?: unknown;
}

/** Response from `POST /v1/instances/{id}/payins/evm` and `GET /v1/instances/{id}/payins/{id}`. */
export interface BlindPayPayinResponse {
    /** Payin ID. */
    id: string;
    /** Payin quote ID. */
    payin_quote_id: string;
    /** Payin status. */
    status: BlindPayPayinStatus;
    /** Amount the sender pays (in cents). */
    sender_amount: number;
    /** Amount the receiver gets (in cents). */
    receiver_amount: number;
    /** Fiat currency code (e.g. "MXN"). */
    currency: string;
    /** Stablecoin token (e.g. "USDB"). */
    token: string;
    /** CLABE for SPEI payment (Mexico). */
    clabe?: string;
    /** Memo code for US payments. */
    memo_code?: string;
    /** PIX code for Brazil payments. */
    pix_code?: string;
    /** CBU for Argentina payments. */
    cbu?: string;
    /** BlindPay bank details for US payments. */
    blindpay_bank_details?: {
        bank_name: string;
        routing_number: string;
        account_number: string;
    };
    /** Tracking: fiat transaction step. */
    tracking_transaction?: BlindPayTrackingStep;
    /** Tracking: payment step. */
    tracking_payment?: BlindPayTrackingStep;
    /** Tracking: blockchain completion step (contains tx hash). */
    tracking_complete?: BlindPayTrackingStep;
    /** Tracking: partner fee step. */
    tracking_partner_fee?: BlindPayTrackingStep;
    /** Receiver ID. */
    receiver_id?: string;
    /** Payment method. */
    payment_method?: string;
    /** ISO 8601 creation timestamp. */
    created_at: string;
    /** ISO 8601 last-update timestamp. */
    updated_at: string;
}

// ---------------------------------------------------------------------------
// Webhook Types
// ---------------------------------------------------------------------------

/** Webhook event types sent by BlindPay. */
export type BlindPayWebhookEventType =
    | 'bankAccount.new'
    | 'receiver.new'
    | 'receiver.update'
    | 'payout.new'
    | 'payout.update'
    | 'payout.complete'
    | 'payout.partnerFee'
    | 'payin.new'
    | 'payin.update'
    | 'payin.complete'
    | 'payin.partnerFee'
    | 'tos.accept'
    | 'limitIncrease.new'
    | 'limitIncrease.update';

/** Incoming webhook payload sent by BlindPay. */
export interface BlindPayWebhookPayload {
    /** Event type. */
    event_type: BlindPayWebhookEventType;
    /** Event data. */
    data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Error Type
// ---------------------------------------------------------------------------

/** Standard error response shape returned by the BlindPay API. */
export interface BlindPayErrorResponse {
    error?: {
        /** Human-readable error message. */
        message: string;
        /** Machine-readable error code. */
        code?: string;
    };
}
