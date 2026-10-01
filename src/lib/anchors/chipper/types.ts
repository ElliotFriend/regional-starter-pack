/**
 * Chipper Platform API types. Wire shapes follow `chipper.openapi.json`
 * (vendored from docs.platform.chipper.ai) and were confirmed live in sandbox.
 */

/** Constructor config for {@link ChipperClient}. */
export interface ChipperConfig {
    /** Secret API key (`sk_test_…` / `sk_live_…`). Server-side only. */
    apiKey: string;
    /** e.g. `https://sandbox-api.platform.chipper.ai`. */
    baseUrl: string;
    /** Log requests, responses, and errors (never the key). Default off. */
    debug?: boolean;
}

/** A field-level validation problem from a `validation_error`. */
export interface ChipperErrorDetail {
    field: string;
    message: string;
}

/** Any non-2xx Chipper response. Branch on `code` (the stable `error` value). */
export class ChipperError extends Error {
    code: string;
    statusCode: number;
    requestId?: string;
    details?: unknown;

    constructor(
        message: string,
        code: string,
        statusCode: number = 500,
        requestId?: string,
        details?: unknown,
    ) {
        super(message);
        this.name = 'ChipperError';
        this.code = code;
        this.statusCode = statusCode;
        this.requestId = requestId;
        this.details = details;
    }
}

/** Raw error envelope. */
export interface ChipperErrorResponse {
    error: string;
    message: string;
    details?: unknown;
    requestId?: string;
}

/** `GET /v1/organization`. */
export interface ChipperOrganization {
    id: string;
    name: string;
    country: string;
    timezone: string;
    defaultCurrency: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChipperMethodLimits {
    min: number;
    max: number;
    currency: string;
}

/** One payment method from the capabilities catalog. */
export interface ChipperMethod {
    code: string;
    name: string;
    type: string;
    status: string;
    limits: ChipperMethodLimits | null;
    estimatedSettlement?: string;
    fields?: Array<{ key: string; label: string; type: string; placeholder?: string }>;
}

/** The methods this app ramps with for one country, by direction. */
export interface ChipperCountryCapabilities {
    /** Mobile money methods Chipper can charge (the on-ramp source). */
    collections: ChipperMethod[];
    /** Mobile money and bank methods Chipper can pay out to (the off-ramp destination). */
    payouts: ChipperMethod[];
}

/** One country/currency group in the raw capabilities catalog. */
export interface ChipperCapabilityGroup {
    country: { code: string; name: string };
    currency: { code: string; name: string };
    methods: ChipperMethod[];
}

/** Raw `GET /v1/capabilities/{country}`. */
export interface ChipperCapabilitiesResponse {
    capabilities: { payouts?: ChipperCapabilityGroup[]; collections?: ChipperCapabilityGroup[] };
}

/** `POST /v1/validate` result. */
export interface ChipperValidation {
    valid: boolean;
    accountName?: string;
    reason?: string;
}

export type ChipperOrderStatus =
    | 'created'
    | 'awaiting_funds'
    | 'awaiting_confirmations'
    | 'funds_received'
    | 'overpaid'
    | 'underpaid'
    | 'processing_payout'
    | 'completed'
    | 'failed'
    | 'expired';

export interface ChipperMoney {
    amount: string;
    currency: string;
}

export interface ChipperOrderLeg {
    code: string;
    /** Bank name on a bank-transfer leg. */
    bank?: string | null;
    accountNumber?: string | null;
    address?: string | null;
    tag?: string;
    chain?: string | null;
    amount: string;
    currency: string;
    kyc?: { accountName?: string; [key: string]: unknown };
}

/** Where the payer sends the inflow. Crypto instructions carry `address` + memo `tag`. */
export interface ChipperInstructions {
    type: 'crypto' | 'virtual_account' | 'mobile_money';
    message: string;
    amount: string;
    currency: string;
    /** Virtual account instructions: the receiving bank and account. */
    bank?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    address?: string | null;
    tag?: string | null;
    chain?: string | null;
}

/** Raw order as returned inside `{ order }`. */
export interface ChipperOrderResponse {
    id: string;
    status: ChipperOrderStatus;
    from: ChipperOrderLeg;
    to: ChipperOrderLeg;
    fee: ChipperMoney | null;
    rate: string | null;
    instructions: ChipperInstructions | null;
    expectedAmount: string | null;
    receivedAmount: string | null;
    collectionId: string | null;
    payoutId: string | null;
    externalReference: string;
    statusMessage: string | null;
    expiresAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** An order normalized for the host app. */
export interface ChipperOrder extends ChipperOrderResponse {
    /** `completed`, `failed`, or `expired`: stop polling. */
    isTerminal: boolean;
    /** `failed` or `expired`. */
    failed: boolean;
}

export interface CreateOnRampOrderArgs {
    /**
     * Source method: mobile money (`gh_mtn`, `ke_mpesa`) or the payer's bank
     * (`ke_kcb`), for which Chipper issues a per-order virtual account.
     */
    collectionCode: string;
    /** Mobile money payer phone in E.164; omit for a bank-transfer source. */
    phone?: string;
    fiatCurrency: string;
    /** Decimal string in the fiat currency. */
    fiatAmount: string;
    stellarAddress: string;
    /** Idempotency key: reuse it on retry. */
    externalReference: string;
    /**
     * End-user details, sent as `from.kyc`. Required in production (after the
     * platform completes KYB); not needed in sandbox. Chipper has not yet
     * documented the field list, so this is passed through as-is.
     */
    kyc?: Record<string, unknown>;
}

export interface CreateOffRampOrderArgs {
    /** Payout method: mobile money (`ke_mpesa`) or bank (`gh_gcb`, `ke_kcb`). */
    payoutCode: string;
    /** Recipient phone in E.164 (mobile money) or bank account number. */
    accountNumber: string;
    fiatCurrency: string;
    /** Decimal string in USDC. */
    usdcAmount: string;
    externalReference: string;
    /**
     * End-user details, sent as `from.kyc`. Required in production (after the
     * platform completes KYB); not needed in sandbox. Chipper has not yet
     * documented the field list, so this is passed through as-is.
     */
    kyc?: Record<string, unknown>;
}

export type ChipperSandboxOutcome =
    'delayed_completion' | 'failed' | 'customer_timeout' | 'transient_error_then_reconciled';

/** A virtual account (bank account number that credits the organization). */
export interface ChipperVirtualAccount {
    id: string;
    status: string;
    currency: string;
    bank: string;
    accountNumber: string;
    accountName: string;
    externalReference?: string | null;
}

export interface SimulateBankDepositArgs {
    /** The bank-sourced order whose virtual account receives the transfer. */
    orderId: string;
    /** Amount in the order's fiat currency; use `order.expectedAmount`. */
    amount: string;
    /** Idempotency key for the simulation. */
    externalReference: string;
}
