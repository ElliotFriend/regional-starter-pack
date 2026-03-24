/**
 * Transfero BaaSiC API Types
 *
 * Provider-specific request/response types for the Transfero API.
 * These are internal to the client and mapped to shared types in `../types.ts`.
 *
 * API documentation: https://docs.transfero.com
 */

/** Configuration for the Transfero client. */
export interface TransferoConfig {
    /** OAuth2 client ID. */
    clientId: string;
    /** OAuth2 client secret. */
    clientSecret: string;
    /** OAuth2 scope. */
    scope: string;
    /** Base URL for the Transfero API (e.g. `https://sandbox-api-baasic.transfero.com`). */
    baseUrl: string;
}

// =============================================================================
// Auth
// =============================================================================

/** Response from POST /auth/token. */
export interface TransferoTokenResponse {
    access_token: string;
    expires_in: number;
    token_type?: string;
}

// =============================================================================
// Quote
// =============================================================================

/** Request body for POST /api/quote/v2/requestquote. */
export interface TransferoQuoteRequest {
    baseCurrency: string;
    quoteCurrency: string;
    baseCurrencySize: number;
    quoteCurrencySize: number;
    side: 'buy' | 'sell';
}

/** Single item in the quote response array. */
export interface TransferoQuoteItem {
    quoteId?: string;
    price?: number;
    expireAt?: string;
}

/** Response from POST /api/quote/v2/requestquote (array). */
export type TransferoQuoteResponse = TransferoQuoteItem[];

// =============================================================================
// Ramp V2 — On-ramp (single-step)
// =============================================================================

/** Request body for POST /api/ramp/v2/swaporder (on-ramp). */
export interface TransferoV2CreateRampRequest {
    taxId: string;
    taxIdCountry: string;
    externalId: string;
    name: string;
    email: string;
    quoteId: string;
    cryptoWithdrawalInformation: {
        blockchain: 'Stellar';
        key: string;
    };
}

// =============================================================================
// Ramp V2 — Off-ramp (preview → accept)
// =============================================================================

/** Request body for POST /api/ramp/v2/swaporder/preview. */
export interface TransferoV2PreviewRequest {
    taxId: string;
    taxIdCountry: string;
    depositBlockchain: 'Stellar';
    externalId: string;
    name: string;
    email: string;
    quoteRequest: {
        side: 'Sell';
        baseCurrency: string;
        quoteCurrency: string;
        baseAmount: number;
        quoteAmount: number;
    };
    fiatWithdrawalInformation: {
        key?: string;
        qrCode?: string;
    };
}

/** Response from POST /api/ramp/v2/swaporder/preview. */
export interface TransferoV2PreviewResponse {
    previewId: string;
    status: string;
    quoteInformation?: TransferoQuoteInformation;
    depositInformation?: TransferoDepositInformation;
}

/** Request body for POST /api/ramp/v2/swaporder/accept. */
export interface TransferoV2AcceptRequest {
    previewId: string;
}

// =============================================================================
// Shared response types
// =============================================================================

/** Deposit information returned by the Transfero API. */
export interface TransferoDepositInformation {
    depositAddress: string;
    memo: string;
    blockchain?: string;
}

/** Quote information embedded in ramp responses. */
export interface TransferoQuoteInformation {
    baseCurrencySize: number;
    quoteCurrencySize: number;
    expireAt?: string;
}

/** Response from POST /api/ramp/v2/swaporder and POST /api/ramp/v2/swaporder/accept. */
export interface TransferoV2OrderResponse {
    id: string;
    referenceId?: string;
    externalId?: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    quote?: TransferoQuoteInformation;
    depositInformation?: TransferoDepositInformation;
}

/** Response from GET /api/ramp/v2/id/{id}. */
export interface TransferoV2RampByIdResponse {
    id: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    referenceId?: string;
    externalId?: string;
    quote?: TransferoQuoteInformation;
    depositInformation?: TransferoDepositInformation;
}

/** Error response from the Transfero API. */
export interface TransferoErrorResponse {
    error?: {
        code?: string;
        message?: string;
    };
    message?: string;
}

// =============================================================================
// Status
// =============================================================================

/** Transaction statuses returned by the Transfero API. */
export type TransferoSwapStatus =
    | 'SwapOrderCreated'
    | 'DepositReceived'
    | 'TradeCompleted'
    | 'WithdrawalCompleted'
    | 'SwapOrderCompleted'
    | 'Pending'
    | 'Processing'
    | 'Completed'
    | 'Canceled'
    | 'Cancelled'
    | 'Failed';
