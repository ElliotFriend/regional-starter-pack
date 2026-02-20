/**
 * Shared types for anchor integrations
 * This module can be copied to any project that needs anchor functionality
 */

export type KycStatus = 'pending' | 'approved' | 'rejected' | 'not_started' | 'update_required';

export type TransactionStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'
    | 'refunded';

export interface Customer {
    id: string;
    email: string;
    kycStatus: KycStatus;
    /** Bank account ID — generated at registration time for providers that require it (e.g. Etherfuse). */
    bankAccountId?: string;
    /** Blockchain wallet ID — generated at registration time for providers that require it (e.g. BlindPay). */
    blockchainWalletId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Quote {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    toAmount: string;
    exchangeRate: string;
    fee: string;
    expiresAt: string;
    createdAt: string;
}

// =============================================================================
// Payment Instructions — discriminated union by rail type
// =============================================================================

/** Base fields shared by all payment instruction types. */
interface PaymentInstructionsBase {
    amount: string;
    currency: string;
    reference?: string;
}

/** SPEI payment instructions (Mexico). */
export interface SpeiPaymentInstructions extends PaymentInstructionsBase {
    type: 'spei';
    clabe: string;
    bankName?: string;
    beneficiary?: string;
}

// Ready to add when needed:
// interface AchPaymentInstructions extends PaymentInstructionsBase { type: 'ach'; routingNumber: string; accountNumber: string; }
// interface PixPaymentInstructions extends PaymentInstructionsBase { type: 'pix'; pixCode: string; }
// interface SwiftPaymentInstructions extends PaymentInstructionsBase { type: 'swift'; swiftCode: string; iban: string; }

export type PaymentInstructions = SpeiPaymentInstructions;
// Will become: SpeiPaymentInstructions | AchPaymentInstructions | PixPaymentInstructions | ...

// =============================================================================
// Fiat Account types — discriminated union by rail type
// =============================================================================

/** Input for registering a new SPEI fiat account. */
export interface SpeiFiatAccountInput {
    type: 'spei';
    clabe: string;
    bankName?: string;
    beneficiary: string;
}

/** Input for registering a new fiat account. */
export type FiatAccountInput = SpeiFiatAccountInput;

/** Input for the registerFiatAccount method. */
export interface RegisterFiatAccountInput {
    customerId: string;
    account: FiatAccountInput;
}

/** Summary of a registered fiat account (returned from the anchor). */
export interface FiatAccountSummary {
    id: string;
    type: string;
    label: string;
    bankName?: string;
    accountIdentifier?: string;
    beneficiary?: string;
}

export interface RegisteredFiatAccount {
    id: string;
    customerId: string;
    type: string;
    status: string;
    createdAt: string;
}

export interface SavedFiatAccount {
    id: string;
    type: string;
    accountNumber: string;
    bankName: string;
    accountHolderName: string;
    createdAt: string;
}

// =============================================================================
// Transaction types
// =============================================================================

export interface OnRampTransaction {
    id: string;
    customerId: string;
    quoteId: string;
    status: TransactionStatus;
    fromAmount: string;
    fromCurrency: string;
    toAmount: string;
    toCurrency: string;
    stellarAddress: string;
    paymentInstructions?: PaymentInstructions;
    feeBps?: number;
    feeAmount?: string;
    stellarTxHash?: string;
    /** URL for anchor-hosted interactive flow (e.g. SEP-24). */
    interactiveUrl?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OffRampTransaction {
    id: string;
    customerId: string;
    quoteId: string;
    status: TransactionStatus;
    fromAmount: string;
    fromCurrency: string;
    toAmount: string;
    toCurrency: string;
    stellarAddress: string;
    fiatAccount?: FiatAccountSummary;
    feeBps?: number;
    feeAmount?: string;
    memo?: string;
    stellarTxHash?: string;
    /** Pre-built transaction envelope (e.g. base64 XDR) for the user to sign. */
    signableTransaction?: string;
    /** URL to an anchor-hosted status page for this transaction. */
    statusPage?: string;
    /** URL for anchor-hosted interactive flow (e.g. SEP-24). */
    interactiveUrl?: string;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// Input types
// =============================================================================

export interface CreateCustomerInput {
    email: string;
    country?: string;
    publicKey?: string;
}

export interface GetQuoteInput {
    fromCurrency: string;
    toCurrency: string;
    fromAmount?: string;
    toAmount?: string;
    /** Customer ID — required by some providers for quote generation. */
    customerId?: string;
    /** Wallet address — used by some providers to resolve asset identifiers. */
    stellarAddress?: string;
}

export interface CreateOnRampInput {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    memo?: string;
    /** Bank account ID — required by some providers (e.g. Etherfuse). */
    bankAccountId?: string;
}

export interface CreateOffRampInput {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    fiatAccountId: string;
    memo?: string;
}

// =============================================================================
// Anchor Capabilities
// =============================================================================

/** Capability flags for runtime detection of anchor features. */
export interface AnchorCapabilities {
    /** Whether the anchor supports looking up customers by email. */
    emailLookup?: boolean;
    /** Whether the anchor provides a URL-based KYC/onboarding flow (iframe, redirect, or ToS page). */
    kycUrl?: boolean;
    /** Whether the anchor supports SEP-24 interactive deposit/withdrawal. */
    sep24?: boolean;
    /** Whether the anchor supports SEP-6 programmatic deposit/withdrawal. */
    sep6?: boolean;
    /** Whether the anchor requires a separate ToS acceptance step before customer creation. */
    requiresTos?: boolean;
    /** Whether off-ramp transactions require wallet-side signing (XDR). */
    requiresOffRampSigning?: boolean;
}

// =============================================================================
// Anchor interface
// =============================================================================

/**
 * Anchor interface — implement this for each anchor provider.
 */
export interface Anchor {
    readonly name: string;
    readonly capabilities: AnchorCapabilities;

    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getCustomerByEmail?(email: string, country?: string): Promise<Customer | null>;

    getQuote(input: GetQuoteInput): Promise<Quote>;

    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;

    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;

    getKycUrl?(
        customerId: string,
        publicKey?: string,
        bankAccountId?: string,
    ): Promise<string>;
    getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus>;
}

export class AnchorError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
    ) {
        super(message);
        this.name = 'AnchorError';
    }
}
