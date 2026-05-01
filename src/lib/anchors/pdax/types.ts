/**
 * PDAX-specific request/response shapes.
 *
 * These mirror the OpenAPI spec at `openapi.yaml`. Only fields actually
 * read or written by the client are typed precisely; provider-extra fields
 * are tolerated via `Record` indexing where necessary.
 */

import type {
    BankInfo,
    CryptoToken,
    Country,
    FeeType,
    FiatInMethod,
    FiatOutMethod,
    Purpose,
    RelationshipOfSenderToBeneficiary,
    Sex,
    SourceOfFunds,
} from './reference';

// =============================================================================
// Response envelopes
// =============================================================================

export interface SuccessEnvelope<T> {
    status: 'success';
    data: T;
}

export interface ErrorEnvelope {
    status?: 'error';
    code: string;
    message: string;
}

// =============================================================================
// Trade
// =============================================================================

/** Side of a quote/order. PDAX docs say "Counterparty action -- buy or sell". */
export type TradeSide = 'buy' | 'sell';

export interface TradeQuoteRequest {
    side: TradeSide;
    /** Crypto asset (e.g. `'USDCXLM'`). */
    quote_currency: CryptoToken['symbol'];
    /** Always `'PHP'` for the institutional flow. */
    base_currency: 'PHP';
    /** Currency the caller wants to receive in. Mirrors `quote_currency` for our use. */
    currency: CryptoToken['symbol'];
    /** Quantity to buy or sell (in the relevant unit, as a string). */
    quantity: string;
}

export interface TradeQuoteData {
    quote_id: string;
    expires_at: string;
    base_currency: 'PHP';
    quote_currency: string;
    side: TradeSide;
    base_quantity: number;
    price: number;
    total_amount: number;
}

export interface TradeOrderRequest {
    quote_id: string;
    side: TradeSide;
    /** UUID v4. */
    idempotency_id: string;
}

export interface TradeOrderData {
    order_id: number;
    /** Lowercase `'successful'` / `'failed'` per the response example. */
    status: string;
    quote_currency: string;
    base_currency: string;
    side: TradeSide;
    base_quantity: number;
    price: number;
    total_amount: number;
}

export interface OrderStatusData {
    order_id: number | string;
    /** Uppercase `'SUCCESSFUL'` / `'FAILED'` per the spec. */
    status: string;
    quote_currency: string;
    base_currency: string;
    side: TradeSide;
    base_quantity: number;
    price: number;
    total_amount: number;
}

// =============================================================================
// Fiat deposit (cash-in / on-ramp first leg)
// =============================================================================

export interface FiatDepositRequest {
    amount: string;
    method: FiatInMethod;
    identifier: string;
    /** Required identity fields. */
    sender_first_name: string;
    sender_middle_name: string;
    sender_last_name: string;
    sender_country_origin: Country;
    source_of_funds: SourceOfFunds;
    beneficiary_first_name: string;
    beneficiary_middle_name: string;
    beneficiary_last_name: string;
    purpose: Purpose;
    relationship_of_sender_to_beneficiary: RelationshipOfSenderToBeneficiary;
    currency: 'PHP';
    /** Optional identity fields — caller forwards whatever it has. */
    [field: string]: string | undefined;
}

/** /fiat/deposit returns a raw object (no SuccessEnvelope wrap). */
export interface FiatDepositResponse {
    request_id: string;
    identifier: string;
    reference_number: string;
    amount: number;
    method: string;
    payment_checkout_url: string;
    fee: number;
    status: string;
}

// =============================================================================
// Fiat withdraw (cash-out / off-ramp last leg)
// =============================================================================

export interface FiatWithdrawRequest {
    identifier: string;
    sender_first_name: string;
    sender_middle_name: string;
    sender_last_name: string;
    sender_country_origin: Country;
    source_of_funds: SourceOfFunds;
    fee_type: FeeType;
    beneficiary_first_name: string;
    beneficiary_middle_name: string;
    beneficiary_last_name: string;
    beneficiary_bank_code: BankInfo['code'];
    beneficiary_account_name: string;
    beneficiary_account_number: string;
    purpose: Purpose;
    relationship_of_sender_to_beneficiary: RelationshipOfSenderToBeneficiary;
    currency: 'PHP';
    amount: string;
    method: FiatOutMethod;
    [field: string]: string | undefined;
}

export interface FiatWithdrawData {
    request_id: string;
    identifier: string;
    reference_number: string;
    amount: number;
    method: string;
    fee?: number;
    status: string;
    retry_methods?: Array<{
        request_id: string;
        channel: string;
        status: string;
        fail_reason?: string;
        time?: string;
    }>;
}

// =============================================================================
// Crypto deposit / withdraw
// =============================================================================

export interface CryptoDepositData {
    currency: string;
    address: string;
    /** Memo, if applicable (USDCXLM uses memo). */
    tag?: string;
}

export interface CryptoWithdrawRequest {
    identifier: string;
    currency: CryptoToken['symbol'];
    address: string;
    amount: string;
    tag?: string;
    beneficiary_first_name: string;
    beneficiary_last_name: string;
    beneficiary_exchange: string;
    /** PDAX docs document this as a string (e.g. `'true'`/`'false'`). */
    send_to_self: string;
    beneficiary_wallet: string;
}

/** /crypto/withdraw returns a raw object (no SuccessEnvelope wrap). */
export interface CryptoWithdrawResponse {
    identifier: string;
    transaction_id: number;
    transaction_hash?: string;
    amount: string;
    address: string;
    tag?: string;
    total: string;
    fee: string;
    currency: string;
    /** `'IN PROGRESS'` per the spec. */
    status: string;
    created_at: string;
}

// =============================================================================
// Transaction polling
// =============================================================================

export interface FiatTransaction {
    request_id: string;
    transaction_id: string;
    amount: number;
    fee?: number;
    method?: string;
    /** `'Cash In'` or `'Cash Out'`. */
    mode?: string;
    reference_number?: string;
    fulfilled_at?: string | null;
    declined_at?: string | null;
    rejection_reason?: string | null;
    currency?: string;
    created_at?: string;
    updated_at?: string;
    /** `'IN-PROGRESS'`, `'COMPLETED'`, `'FAILED'`. */
    status: string;
    identifier: string;
    fee_type?: string;
    retried_methods?: unknown[];
}

export interface CryptoTransaction {
    transaction_id: string;
    /** `'crypto_in'`, `'crypto_out'`. */
    type: string;
    debit_ccy?: string | null;
    credit_ccy?: string | null;
    debit_amount?: string;
    debit_net_amount?: string;
    credit_amount?: string;
    credit_net_amount?: string;
    fee_amount?: string;
    /** `'pending'`, `'completed'`, `'failed'`. */
    status: string;
    created_at?: string;
    txn_hash?: string;
    sender_email?: string | null;
    sender_wallet_address?: string | null;
    sender_wallet_address_tag?: string | null;
    receiver_email?: string | null;
    receiver_wallet_address?: string | null;
    receiver_wallet_address_tag?: string | null;
}

// =============================================================================
// Local-only stored state
// =============================================================================

/**
 * Internal state we keep alongside an on-ramp transaction so we can advance
 * the state machine across polling calls. PDAX assigns no single transaction
 * ID for the whole on-ramp; we generate our own and key local state by it.
 */
export interface PdaxOnRampState {
    /** Local id we generated and use as PDAX `identifier`. */
    id: string;
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    /** PHP amount the customer is sending. */
    amount: string;
    /** Crypto amount expected from the trade leg. */
    expectedCryptoAmount: string;
    method: FiatInMethod;
    /** Identity fields snapshot used for the deposit call. */
    identity: Record<string, string>;
    /** Deposit checkout URL returned by /fiat/deposit. */
    paymentCheckoutUrl?: string;
    /** Order id from /trade once executed. */
    orderId?: string;
    /** Crypto withdrawal txn id from /crypto/withdraw once executed. */
    cryptoWithdrawId?: string;
    /** Stellar transaction hash, populated once the crypto leg completes. */
    cryptoTxHash?: string;
    /** Stage in the multi-step state machine. */
    stage:
        | 'fiat_pending'
        | 'fiat_fulfilled'
        | 'trade_executed'
        | 'crypto_dispatched'
        | 'completed'
        | 'failed';
    createdAt: string;
    updatedAt: string;
}

export interface PdaxOffRampState {
    id: string;
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    /** Crypto amount the customer is sending. */
    amount: string;
    /** PHP amount expected from the trade leg. */
    expectedFiatAmount: string;
    method: FiatOutMethod;
    bankCode: BankInfo['code'];
    accountName: string;
    accountNumber: string;
    identity: Record<string, string>;
    /** Deposit address (USDCXLM) from /crypto/deposit. */
    depositAddress?: string;
    depositMemo?: string;
    /** Order id from /trade once executed. */
    orderId?: string;
    /** Withdraw request id from /fiat/withdraw once executed. */
    fiatWithdrawId?: string;
    stage:
        | 'crypto_pending'
        | 'crypto_received'
        | 'trade_executed'
        | 'fiat_dispatched'
        | 'completed'
        | 'failed';
    createdAt: string;
    updatedAt: string;
}
