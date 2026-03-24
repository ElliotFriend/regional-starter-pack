/**
 * Abroad Finance API Types
 *
 * Provider-specific request/response types for the Abroad Finance API.
 * These are internal to the client and mapped to shared types in `../types.ts`.
 */

/** Configuration for the Abroad Finance client. */
export interface AbroadConfig {
    /** API key for authentication (sent as X-API-Key header). */
    apiKey: string;
    /** Base URL for the Abroad Finance API. */
    baseUrl: string;
}

// =============================================================================
// API Request Types
// =============================================================================

/** Request body for POST /quote. */
export interface AbroadQuoteRequest {
    amount: number;
    crypto_currency: string;
    network: string;
    payment_method: string;
    target_currency: string;
}

/** Request body for POST /transaction. */
export interface AbroadTransactionRequest {
    quote_id: string;
    user_id: string;
    account_number: string;
    bank_code?: string;
    tax_id: string;
    redirectUrl?: string;
}

/** Request body for POST /customers. */
export interface AbroadCreateCustomerRequest {
    email: string;
    country: string;
}

/** Request body for POST /customers/{customerId}/fiat-accounts. */
export interface AbroadRegisterFiatAccountRequest {
    type: string;
    pix_key: string;
    pix_key_type?: string;
    tax_id: string;
    account_holder_name: string;
}

// =============================================================================
// API Response Types
// =============================================================================

/** Response from POST /quote. */
export interface AbroadQuoteResponse {
    id: string;
    crypto_amount: string;
    fiat_amount: string;
    exchange_rate: string;
    fee: string;
    expires_at: string;
    created_at: string;
    crypto_currency: string;
    target_currency: string;
}

/** Response from POST /transaction and GET /transaction/{id}. */
export interface AbroadTransactionResponse {
    id: string;
    status: AbroadTransactionStatus;
    transaction_reference: string;
    deposit_address: string;
    crypto_amount: string;
    fiat_amount: string;
    crypto_currency: string;
    target_currency: string;
    kycLink?: string;
    created_at: string;
    updated_at: string;
}

/** Response from POST /customers. */
export interface AbroadCustomerResponse {
    id: string;
    email: string;
    kyc_status?: string;
    created_at: string;
    updated_at?: string;
}

/** Response from POST /customers/{customerId}/fiat-accounts. */
export interface AbroadFiatAccountResponse {
    id: string;
    type: string;
    status: string;
    created_at: string;
}

/** Response from GET /customers/{customerId}/fiat-accounts. */
export interface AbroadSavedFiatAccountResponse {
    id: string;
    type: string;
    account_number: string;
    bank_name: string;
    account_holder_name: string;
    created_at: string;
}

/** Response from GET /customers/{customerId}/kyc-url. */
export interface AbroadKycUrlResponse {
    kyc_url: string;
}

// =============================================================================
// Abroad Transaction Statuses
// =============================================================================

/** Transaction statuses returned by the Abroad Finance API. */
export type AbroadTransactionStatus =
    | 'AWAITING_PAYMENT'
    | 'PROCESSING_PAYMENT'
    | 'PAYMENT_COMPLETED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_EXPIRED'
    | 'WRONG_AMOUNT';
