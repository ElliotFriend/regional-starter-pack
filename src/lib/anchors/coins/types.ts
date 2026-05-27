/**
 * Coins.ph ramp integration types.
 *
 * Covers the hosted widget (link integration) used today, plus the REST
 * order/status shapes kept for the deferred polling/webhook path (see README).
 */

export interface CoinsRampConfig {
    /** Public merchant API key (safe to embed in the widget URL). */
    apiKey: string;
    /** Merchant secret key for HMAC signing. Server-side only — never sent to the browser. */
    secretKey: string;
    /** Merchant identifier. */
    merchantId: string;
    /** Base URL of the hosted widget, e.g. `https://coins.ph` (prod) or the sandbox host. */
    widgetBaseUrl: string;
    /** Base URL of the Coins.ph merchant REST API (used by the deferred status path). */
    apiBaseUrl?: string;
    /** ISO country code for the ramp. Defaults to `PH`. */
    country?: string;
    /** Stellar issuer of the USDC asset delivered by the ramp. */
    usdcIssuer: string;
    /** Network identifier passed to Coins.ph. Defaults to `STELLAR`. */
    network?: string;
    /** Clock injection for deterministic signing/tests. Defaults to `Date.now`. */
    now?: () => number;
    /** Nonce generator injection for tests. Defaults to `crypto.randomUUID`. */
    nonceFn?: () => string;
}

/**
 * Coarse Coins.ph order status (`status` field on the ramp callback). The
 * order-detail API also exposes a finer-grained `orderStatus` set; see the
 * README for the full list. Terminal states: SUCCEEDED, FAILED, CANCELLED,
 * REFUNDED, EXPIRED.
 */
export type CoinsOrderStatus =
    | 'CREATE'
    | 'PROCESSING'
    | 'MANUAL_REVIEW'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REFUNDED'
    | 'EXPIRED';

/** Response shape of `ramp/v1/orderDetail` (used by the deferred status path). */
export interface CoinsOrderDetail {
    orderId: string;
    status: CoinsOrderStatus | string;
    sourceCurrency?: string;
    targetCurrency?: string;
    sourceAmount?: string;
    targetAmount?: string;
    fee?: string;
}
