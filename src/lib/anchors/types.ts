/**
 * Shared types for anchor integrations.
 *
 * This module defines the common {@link Anchor} interface and all supporting
 * types used across anchor providers. It is framework-agnostic and can be
 * copied to any TypeScript project.
 */

/** KYC verification status for a customer. */
export type KycStatus = 'pending' | 'approved' | 'rejected' | 'not_started' | 'update_required';

/** Lifecycle status for on-ramp and off-ramp transactions. */
export type TransactionStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'
    | 'refunded';

/** A customer record as returned by an anchor provider. */
export interface Customer {
    /** Unique customer identifier assigned by the anchor. */
    id: string;
    /** Customer email address, if available. */
    email?: string;
    /** Current KYC verification status. */
    kycStatus: KycStatus;
    /** ISO 3166-1 alpha-2 country code the customer registered with (e.g. `"MX"`, `"BR"`).
     *  Used to drive region-specific UI (currency, payment rail, asset) for returning customers. */
    country?: string;
    /** Bank account ID — generated at registration time for providers that require it (e.g. Etherfuse). */
    bankAccountId?: string;
    /** Blockchain wallet ID — generated at registration time for providers that require it (e.g. BlindPay). */
    blockchainWalletId?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** A currency conversion quote from an anchor provider. */
export interface Quote {
    /** Unique quote identifier. */
    id: string;
    /** Source currency code (e.g. `"MXN"`, `"USDC"`). */
    fromCurrency: string;
    /** Destination currency code (e.g. `"USDC"`, `"MXN"`). */
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
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

// =============================================================================
// Payment Instructions — discriminated union by rail type
// =============================================================================

/** Base fields shared by all payment instruction types. */
interface PaymentInstructionsBase {
    /** Amount to transfer. */
    amount: string;
    /** Currency code for the transfer. */
    currency: string;
    /** Payment reference to include in the transfer. */
    reference?: string;
}

/** SPEI payment instructions (Mexico). */
export interface SpeiPaymentInstructions extends PaymentInstructionsBase {
    /** Discriminant for the SPEI rail. */
    type: 'spei';
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the receiving bank. */
    bankName?: string;
    /** Name of the account beneficiary. */
    beneficiary?: string;
}

/** PIX payment instructions (Brazil). */
export interface PixPaymentInstructions extends PaymentInstructionsBase {
    /** Discriminant for the PIX rail. */
    type: 'pix';
    /** PIX BR-Code / EMV copy-paste string for QR or pasted entry into a banking app. */
    pixCode: string;
    /** PIX key (the underlying identity — CPF, CNPJ, email, phone, or EVP UUID) for manual transfers. */
    pixKey?: string;
    /** PIX key type (e.g. `"evp"`, `"cpf"`, `"cnpj"`, `"email"`, `"phone"`). */
    pixKeyType?: string;
    /** Name of the account beneficiary. */
    beneficiary?: string;
}

// Ready to add when needed:
// interface AchPaymentInstructions extends PaymentInstructionsBase { type: 'ach'; routingNumber: string; accountNumber: string; }
// interface SwiftPaymentInstructions extends PaymentInstructionsBase { type: 'swift'; swiftCode: string; iban: string; }

/** Discriminated union of payment instructions for all supported rails. */
export type PaymentInstructions = SpeiPaymentInstructions | PixPaymentInstructions;

// =============================================================================
// Fiat Account types — discriminated union by rail type
// =============================================================================

/** Input for registering a new SPEI fiat account. */
export interface SpeiFiatAccountInput {
    /** Discriminant for the SPEI rail. */
    type: 'spei';
    /** 18-digit CLABE interbank code. */
    clabe: string;
    /** Name of the bank. */
    bankName?: string;
    /** Name of the account beneficiary. */
    beneficiary: string;
}

/** Input for registering a new PIX fiat account. */
export interface PixFiatAccountInput {
    /** Discriminant for the PIX rail. */
    type: 'pix';
    /** PIX key (CPF, CNPJ, email, phone, or random key). */
    pixKey: string;
    /** PIX key type (e.g. `"cpf"`, `"cnpj"`, `"email"`, `"phone"`, `"random"`). */
    pixKeyType?: string;
    /** Tax ID (CPF or CNPJ). */
    taxId: string;
    /** Full name of the account holder. */
    accountHolderName: string;
}

/** Discriminated union of fiat account registration inputs for all supported rails. */
export type FiatAccountInput = SpeiFiatAccountInput | PixFiatAccountInput;

/** Input for {@link Anchor.registerFiatAccount}. */
export interface RegisterFiatAccountInput {
    /** Customer to register the account under. */
    customerId: string;
    /** Bank account details. */
    account: FiatAccountInput;
    /** Stellar public key — required by providers that use presigned-URL auth (e.g. Etherfuse). */
    publicKey?: string;
}

/** Summary of a registered fiat account (returned from the anchor). */
export interface FiatAccountSummary {
    /** Unique fiat account identifier. */
    id: string;
    /** Payment rail type (e.g. `"spei"`). */
    type: string;
    /** Human-readable label for the account. */
    label: string;
    /** Name of the bank. */
    bankName?: string;
    /** Account number or CLABE. */
    accountIdentifier?: string;
    /** Name of the account beneficiary. */
    beneficiary?: string;
}

/** A newly registered fiat account returned by {@link Anchor.registerFiatAccount}. */
export interface RegisteredFiatAccount {
    /** Unique fiat account identifier. */
    id: string;
    /** Customer that owns this account. */
    customerId: string;
    /** Payment rail type (e.g. `"SPEI"`). */
    type: string;
    /** Registration status (e.g. `"active"`). */
    status: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

/** A saved fiat account returned by {@link Anchor.getFiatAccounts}. */
export interface SavedFiatAccount {
    /** Unique fiat account identifier. */
    id: string;
    /** Payment rail type (e.g. `"SPEI"`). */
    type: string;
    /** Account number or CLABE. */
    accountNumber: string;
    /** Name of the bank. */
    bankName: string;
    /** Full name of the account holder. */
    accountHolderName: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
}

// =============================================================================
// Transaction types
// =============================================================================

/** An on-ramp (fiat → crypto) transaction. */
export interface OnRampTransaction {
    /** Unique transaction identifier. */
    id: string;
    /** Customer that owns this transaction. */
    customerId: string;
    /** Quote used for this transaction. */
    quoteId: string;
    /** Current transaction status. */
    status: TransactionStatus;
    /** Fiat amount being sent. */
    fromAmount: string;
    /** Fiat currency code (e.g. `"MXN"`). */
    fromCurrency: string;
    /** Crypto amount to be received. */
    toAmount: string;
    /** Crypto currency code (e.g. `"USDC"`). */
    toCurrency: string;
    /** Stellar address that will receive the crypto. */
    stellarAddress: string;
    /** Payment instructions the user must follow to fund the transaction. */
    paymentInstructions?: PaymentInstructions;
    /** Fee in basis points (e.g. `20` = 0.20%). */
    feeBps?: number;
    /** Fee amount in fiat currency. */
    feeAmount?: string;
    /** Stellar transaction hash once the crypto has been sent. */
    stellarTxHash?: string;
    /** URL for anchor-hosted interactive flow (e.g. SEP-24). */
    interactiveUrl?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

/** An off-ramp (crypto → fiat) transaction. */
export interface OffRampTransaction {
    /** Unique transaction identifier. */
    id: string;
    /** Customer that owns this transaction. */
    customerId: string;
    /** Quote used for this transaction. */
    quoteId: string;
    /** Current transaction status. */
    status: TransactionStatus;
    /** Crypto amount being sent. */
    fromAmount: string;
    /** Crypto currency code (e.g. `"USDC"`). */
    fromCurrency: string;
    /** Fiat amount to be received. */
    toAmount: string;
    /** Fiat currency code (e.g. `"MXN"`). */
    toCurrency: string;
    /** Stellar address the user sends crypto from. */
    stellarAddress: string;
    /** Fiat account receiving the payout. */
    fiatAccount?: FiatAccountSummary;
    /** Fee in basis points (e.g. `20` = 0.20%). */
    feeBps?: number;
    /** Fee amount in fiat currency. */
    feeAmount?: string;
    /** Memo to include in the Stellar transaction. */
    memo?: string;
    /** Stellar transaction hash once the crypto has been sent. */
    stellarTxHash?: string;
    /** Pre-built transaction envelope (e.g. base64 XDR) for the user to sign. */
    signableTransaction?: string;
    /** URL to an anchor-hosted status page for this transaction. */
    statusPage?: string;
    /** URL for anchor-hosted interactive flow (e.g. SEP-24). */
    interactiveUrl?: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
    /** ISO 8601 last-update timestamp. */
    updatedAt: string;
}

// =============================================================================
// Identity (for providers that require inline identity on ramp requests)
// =============================================================================

/** Identity fields for providers that require user identity on each ramp request (e.g. Transfero). */
export interface RampIdentity {
    /** Full name of the user. */
    name: string;
    /** Email address. */
    email: string;
    /** Tax identification number (e.g. CPF/CNPJ for Brazil). */
    taxId: string;
    /** ISO 3166-1 alpha-3 country code for the tax ID (e.g. `"BRA"`). Defaults to `"BRA"` if omitted. */
    taxIdCountry?: string;
}

// =============================================================================
// Input types
// =============================================================================

/** Input for {@link Anchor.createCustomer}. */
export interface CreateCustomerInput {
    /** Customer email address. Required by most providers. */
    email?: string;
    /** ISO 3166-1 alpha-2 country code (e.g. `"MX"`). */
    country?: string;
    /** Stellar public key — required by providers that use wallet-based identity (e.g. Etherfuse). */
    publicKey?: string;
    /** Full name — required by providers that use tax-ID-based identity (e.g. Transfero). */
    name?: string;
    /** Tax identification number (e.g. CPF/CNPJ for Brazil) — required by some providers. */
    taxId?: string;
    /** ISO 3166-1 alpha-3 country code for the tax ID (e.g. `"BRA"`). */
    taxIdCountry?: string;
}

/** Input for {@link Anchor.getCustomer}. */
export interface GetCustomerInput {
    /** Customer ID for direct lookup. */
    customerId?: string;
    /** Email for email-based lookup (providers with `emailLookup` capability). */
    email?: string;
    /** ISO 3166-1 alpha-2 country code — narrows email lookup scope. */
    country?: string;
}

/** Input for {@link Anchor.getQuote}. */
export interface GetQuoteInput {
    /** Source currency code (e.g. `"MXN"`, `"USDC"`). */
    fromCurrency: string;
    /** Destination currency code (e.g. `"USDC"`, `"MXN"`). */
    toCurrency: string;
    /** Amount in the source currency. Provide either this or `toAmount`. */
    fromAmount?: string;
    /** Amount in the destination currency. Provide either this or `fromAmount`. */
    toAmount?: string;
    /** Customer ID — required by some providers for quote generation. */
    customerId?: string;
    /** Wallet address — used by some providers to resolve asset identifiers. */
    stellarAddress?: string;
    /** Resource ID — bank account or blockchain wallet ID needed by some providers for quotes. */
    resourceId?: string;
}

/** Input for {@link Anchor.createOnRamp}. */
export interface CreateOnRampInput {
    /** Customer placing the on-ramp order. */
    customerId: string;
    /** Quote ID for pricing. */
    quoteId: string;
    /** Stellar address that will receive the crypto. */
    stellarAddress: string;
    /** Source fiat currency code (e.g. `"MXN"`). */
    fromCurrency: string;
    /** Destination crypto currency code (e.g. `"USDC"`). */
    toCurrency: string;
    /** Amount in the source fiat currency. */
    amount: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
    /** Bank account ID — required by some providers (e.g. Etherfuse). */
    bankAccountId?: string;
    /** Identity fields for providers that require inline identity (e.g. Transfero). */
    identity?: RampIdentity;
}

/** Input for {@link Anchor.createOffRamp}. */
export interface CreateOffRampInput {
    /** Customer placing the off-ramp order. */
    customerId: string;
    /** Quote ID for pricing. */
    quoteId: string;
    /** Stellar address sending the crypto. */
    stellarAddress: string;
    /** Source crypto currency code (e.g. `"USDC"`). */
    fromCurrency: string;
    /** Destination fiat currency code (e.g. `"MXN"`). */
    toCurrency: string;
    /** Amount in the source crypto currency. */
    amount: string;
    /** Registered fiat account ID to receive the payout. */
    fiatAccountId: string;
    /** Optional memo for the Stellar transaction. */
    memo?: string;
    /** Identity fields for providers that require inline identity (e.g. Transfero). */
    identity?: RampIdentity;
}

// =============================================================================
// Token metadata
// =============================================================================

/** Describes a digital asset token supported by an anchor. */
export interface TokenInfo {
    /** Token ticker symbol (e.g. `"USDC"`, `"CETES"`). */
    symbol: string;
    /** Human-readable token name (e.g. `"USD Coin"`). */
    name: string;
    /** Stellar asset issuer public key. Absent for native XLM. */
    issuer?: string;
    /** Short description of the token. */
    description: string;
}

// =============================================================================
// KYC field/document requirements — anchors declare what they need
// =============================================================================

/** A single form field required for KYC verification. */
export interface KycFieldRequirement {
    /** Machine-readable field key (e.g. `"firstName"`, `"dateOfBirth"`). */
    key: string;
    /** Human-readable label for the form field. */
    label: string;
    /** HTML input type. */
    type: 'text' | 'date' | 'email' | 'tel' | 'select';
    /** Whether this field must be provided. */
    required: boolean;
    /** Placeholder text for the input. */
    placeholder?: string;
    /** Options for `select` type fields. */
    options?: { value: string; label: string }[];
}

/** A document required for KYC verification. */
export interface KycDocumentRequirement {
    /** Machine-readable document key (e.g. `"idFront"`, `"selfie"`). */
    key: string;
    /** Human-readable label for the document. */
    label: string;
    /** Description or instructions for the document. */
    description?: string;
    /** Accepted MIME types (e.g. `"image/jpeg,image/png"`). */
    accept?: string;
    /** How the document is provided: direct file upload or a URL reference. */
    mode: 'file_upload' | 'url_reference';
}

/** The full set of fields and documents required for KYC by an anchor. */
export interface KycRequirements {
    /** Form fields the user must fill out. */
    fields: KycFieldRequirement[];
    /** Documents the user must provide. */
    documents: KycDocumentRequirement[];
}

/** User-submitted KYC data (fields + documents) for {@link Anchor.submitKyc}. */
export interface KycSubmissionData {
    /** Key-value pairs of completed form fields. */
    fields: Record<string, string>;
    /** Key-value pairs of document uploads (File objects or URL strings). */
    documents: Record<string, File | string>;
    /** Provider-specific metadata (e.g. `tosId` for BlindPay). */
    metadata?: Record<string, string>;
}

/** Result returned by {@link Anchor.submitKyc} after a KYC submission. */
export interface KycSubmissionResult {
    /** Customer ID (may be newly created, e.g. by BlindPay). */
    customerId: string;
    /** KYC status after submission (typically `"pending"`). */
    kycStatus: KycStatus;
    /** Submission identifier for tracking, if available. */
    submissionId?: string;
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
    /** KYC presentation style. */
    kycFlow?: 'form' | 'iframe' | 'redirect';
    /** Whether the anchor requires bank account selection before quoting (off-ramp). */
    requiresBankBeforeQuote?: boolean;
    /** Whether the anchor requires blockchain wallet registration before on-ramp. */
    requiresBlockchainWalletRegistration?: boolean;
    /** Whether the anchor sends a signable XDR via a deferred polling step. */
    deferredOffRampSigning?: boolean;
    /** Whether the anchor uses a separate payout submission endpoint instead of direct Stellar submission. */
    requiresAnchorPayoutSubmission?: boolean;
    /** Whether the anchor has sandbox simulation support. */
    sandbox?: boolean;
}

// =============================================================================
// Anchor interface
// =============================================================================

/**
 * Unified interface for fiat on/off ramp anchor providers.
 *
 * Each anchor implementation wraps a provider-specific REST API and maps
 * responses to the shared types defined in this module. The interface covers
 * the full lifecycle: customer creation, KYC, quoting, on-ramp, off-ramp,
 * and fiat account management.
 */
export interface Anchor {
    /** Machine-readable provider identifier (e.g. `"etherfuse"`, `"alfredpay"`). */
    readonly name: string;
    /** Human-readable provider name for display (e.g. `"Etherfuse"`, `"Alfred Pay"`). */
    readonly displayName: string;
    /** Runtime capability flags describing this provider's features and requirements. */
    readonly capabilities: AnchorCapabilities;
    /** Digital asset tokens supported by this provider. */
    readonly supportedTokens: readonly TokenInfo[];
    /** ISO 4217 fiat currency codes supported by this provider (e.g. `["MXN"]`). */
    readonly supportedCurrencies: readonly string[];
    /** Payment rail identifiers supported by this provider (e.g. `["spei"]`). */
    readonly supportedRails: readonly string[];

    /**
     * Create a new customer with the anchor provider.
     * @param input - Customer details (email, country, public key).
     * @returns The created customer.
     * @throws {AnchorError} On validation failure or API error.
     */
    createCustomer(input: CreateCustomerInput): Promise<Customer>;

    /**
     * Look up an existing customer by ID or email.
     * @param input - Lookup criteria (customer ID, email, or both).
     * @returns The customer, or `null` if not found.
     * @throws {AnchorError} On validation failure or API error.
     */
    getCustomer(input: GetCustomerInput): Promise<Customer | null>;

    /**
     * Request a currency conversion quote.
     * @param input - Currency pair, amount, and optional context (customer, wallet).
     * @returns A quote with rate, fees, and expiration.
     * @throws {AnchorError} On API error.
     */
    getQuote(input: GetQuoteInput): Promise<Quote>;

    /**
     * Create an on-ramp (fiat → crypto) transaction.
     * @param input - Customer, quote, amount, and destination Stellar address.
     * @returns The created transaction, typically with payment instructions.
     * @throws {AnchorError} On API error.
     */
    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;

    /**
     * Fetch the current state of an on-ramp transaction.
     * @param transactionId - The transaction's unique identifier.
     * @returns The transaction, or `null` if not found.
     * @throws {AnchorError} On API error.
     */
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;

    /**
     * Register a fiat bank account for a customer.
     * @param input - Customer ID and bank account details.
     * @returns The newly registered account.
     * @throws {AnchorError} On API error.
     */
    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;

    /**
     * List all registered fiat accounts for a customer.
     * @param customerId - The customer's unique identifier.
     * @returns Array of saved fiat accounts (empty if none found).
     * @throws {AnchorError} On API error.
     */
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;

    /**
     * Create an off-ramp (crypto → fiat) transaction.
     * @param input - Customer, quote, amount, fiat account, and source Stellar address.
     * @returns The created transaction.
     * @throws {AnchorError} On API error.
     */
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;

    /**
     * Fetch the current state of an off-ramp transaction.
     * @param transactionId - The transaction's unique identifier.
     * @returns The transaction, or `null` if not found.
     * @throws {AnchorError} On API error.
     */
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;

    /**
     * Get a URL for an interactive KYC/onboarding flow (iframe, redirect, or ToS page).
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key (required by some providers).
     * @param bankAccountId - Bank account to associate (required by some providers).
     * @returns The KYC URL string.
     * @throws {AnchorError} On API error.
     */
    getKycUrl?(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string>;

    /**
     * Get the current KYC verification status for a customer.
     * @param customerId - The customer's unique identifier.
     * @param publicKey - Stellar public key (required by some providers).
     * @returns The customer's KYC status.
     * @throws {AnchorError} On API error.
     */
    getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus>;

    /**
     * Get the KYC field and document requirements for a country.
     * @param country - ISO 3166-1 alpha-2 country code. Defaults vary by provider.
     * @returns The required fields and documents.
     * @throws {AnchorError} On API error.
     */
    getKycRequirements?(country?: string): Promise<KycRequirements>;

    /**
     * Submit KYC data and documents for a customer.
     * @param customerId - The customer's unique identifier.
     * @param data - Form fields, documents, and optional metadata.
     * @returns The submission result with updated KYC status.
     * @throws {AnchorError} On validation failure or API error.
     */
    submitKyc?(customerId: string, data: KycSubmissionData): Promise<KycSubmissionResult>;
}

/**
 * Error thrown by anchor client operations.
 *
 * Wraps provider API errors with a machine-readable `code` and HTTP `statusCode`
 * for consistent error handling across providers.
 */
export class AnchorError extends Error {
    /** Machine-readable error code (e.g. `"MISSING_EMAIL"`, `"UNKNOWN_ERROR"`). */
    code: string;
    /** HTTP status code from the upstream API (defaults to `500`). */
    statusCode: number;

    /**
     * @param message - Human-readable error description.
     * @param code - Machine-readable error code.
     * @param statusCode - HTTP status code. Defaults to `500`.
     */
    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'AnchorError';
        this.code = code;
        this.statusCode = statusCode;
    }
}
