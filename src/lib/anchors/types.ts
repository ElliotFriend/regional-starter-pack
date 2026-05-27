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

/** A single labelled instruction field (e.g. a SEP-6 deposit instruction). */
export interface PaymentInstructionField {
    /** Machine-readable field key (e.g. `"bank_number"`). */
    key: string;
    /** Human-readable label. */
    label: string;
    /** The value the user should use. */
    value: string;
    /** Optional extra description. */
    description?: string;
}

/**
 * Generic, rail-agnostic payment instructions — an ordered list of labelled
 * fields. Used by anchors whose deposit instructions don't map to a specific
 * named rail (e.g. SEP-6 `instructions`).
 */
export interface GenericPaymentInstructions extends PaymentInstructionsBase {
    /** Discriminant for generic instructions. */
    type: 'generic';
    /** Optional human-readable summary of how to pay (e.g. SEP-6 `how`). */
    how?: string;
    /** Ordered instruction fields to display. */
    fields: PaymentInstructionField[];
}

// Ready to add when needed:
// interface AchPaymentInstructions extends PaymentInstructionsBase { type: 'ach'; routingNumber: string; accountNumber: string; }
// interface SwiftPaymentInstructions extends PaymentInstructionsBase { type: 'swift'; swiftCode: string; iban: string; }

/** Discriminated union of payment instructions for all supported rails. */
export type PaymentInstructions =
    | SpeiPaymentInstructions
    | PixPaymentInstructions
    | GenericPaymentInstructions;

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
    /** Human-readable status message from the anchor, if provided (e.g. SEP-6 `message`). */
    message?: string;
    /**
     * Customer info the anchor needs before it can proceed (e.g. SEP-6
     * `pending_customer_info_update`). When present, the app should collect these
     * fields and submit them via {@link ProgrammaticOps.submitKyc} (passing the
     * transaction id), then resume polling. Absent in the normal happy path.
     */
    requiredInfo?: KycRequirements;
    /**
     * Whether the transaction is parked awaiting a customer-info update (SEP-6
     * `pending_customer_info_update`). When `true` but {@link requiredInfo} is
     * absent, the required info has already been submitted and the anchor has not
     * yet advanced the transaction — the app may offer the user a retry.
     */
    awaitingCustomerInfo?: boolean;
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
    /** Human-readable status message from the anchor, if provided (e.g. SEP-6 `message`). */
    message?: string;
    /**
     * Customer info the anchor needs before it can proceed (e.g. SEP-6
     * `pending_customer_info_update`). When present, the app should collect these
     * fields and submit them via {@link ProgrammaticOps.submitKyc} (passing the
     * transaction id), then resume polling. Absent in the normal happy path.
     */
    requiredInfo?: KycRequirements;
    /**
     * Whether the transaction is parked awaiting a customer-info update (SEP-6
     * `pending_customer_info_update`). When `true` but {@link requiredInfo} is
     * absent, the required info has already been submitted and the anchor has not
     * yet advanced the transaction — the app may offer the user a retry.
     */
    awaitingCustomerInfo?: boolean;
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
    /** Whether this document must be provided. Treated as required when omitted. */
    required?: boolean;
}

/** The full set of fields and documents required for KYC by an anchor. */
export interface KycRequirements {
    /** Form fields the user must fill out. */
    fields: KycFieldRequirement[];
    /** Documents the user must provide. */
    documents: KycDocumentRequirement[];
    /** Optional human-readable message from the anchor about what it needs. */
    message?: string;
}

/**
 * Context for {@link ProgrammaticOps.getKycRequirements}. Some anchors return a
 * static field set; others discover the fields a specific (authenticated)
 * customer or in-flight transaction still needs via SEP-12.
 */
export interface KycRequirementsQuery {
    /** ISO 3166-1 alpha-2 country code, for anchors with country-specific requirements. */
    country?: string;
    /** SEP-10 session token, for anchors that discover requirements per authenticated customer. */
    auth?: string;
    /** Customer/account identifier, when requirements depend on the specific customer. */
    customerId?: string;
    /** Transaction id, when an in-flight transaction needs additional info (SEP-6 `pending_customer_info_update`). */
    transactionId?: string;
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
    /**
     * Whether the anchor exposes a sandbox "fiat received" simulation for the
     * programmatic on-ramp (the `simulateFiatReceived` action on the
     * `/api/anchor/[provider]/sandbox` route). Distinct from {@link sandbox}:
     * an anchor can be sandbox-backed (e.g. for KYC test data) without offering
     * this particular deposit-confirmation simulation.
     */
    sandboxFiatSimulation?: boolean;
    /**
     * How new fiat/bank accounts are registered.
     * - `'inline'` (default) — partner code submits account details via {@link ProgrammaticOps.registerFiatAccount}.
     * - `'hosted'` — registration happens in the anchor's hosted onboarding UI; partner code only requests a presigned URL via {@link ProgrammaticOps.getKycUrl} and the user fills in account details there.
     */
    fiatAccountRegistration?: 'inline' | 'hosted';
    /**
     * Which ramp flow archetypes this anchor supports, mirroring the facets it
     * implements: `'programmatic'` (the {@link ProgrammaticOps} / SEP-6 archetype)
     * and/or `'interactive'` (the {@link InteractiveOps} / SEP-24 archetype).
     * Used by the UI to decide which flow to present (and which to default to
     * when both are available).
     */
    flowStyles?: readonly ('programmatic' | 'interactive')[];
}

// =============================================================================
// Wallet auth & interactive (hosted-flow) types
// =============================================================================

/** A wallet-signature authentication challenge (SEP-10). */
export interface AuthChallenge {
    /** Base64 XDR of the challenge transaction the wallet must sign. */
    transactionXdr: string;
    /** Network passphrase the challenge must be signed against. */
    networkPassphrase: string;
}

/** An authenticated session token (e.g. a SEP-10 JWT). */
export interface AuthSession {
    /** Bearer token used to authorize subsequent facet calls (programmatic or interactive). */
    token: string;
}

/** Input for starting an interactive on/off-ramp session. */
export interface StartInteractiveInput {
    /** Crypto asset code (e.g. `"USDC"`, `"SRT"`). */
    assetCode: string;
    /** Stellar asset issuer; absent for native XLM. */
    assetIssuer?: string;
    /** Stellar account that will receive (on-ramp) or send (off-ramp) the asset. */
    account: string;
    /** Optional amount to pre-fill in the hosted UI. */
    amount?: string;
    /** Session token from {@link WalletAuthOps.submitChallenge}, when the provider requires it. */
    auth?: string;
}

/** A started interactive session: a hosted URL plus a transaction id to poll. */
export interface InteractiveSession {
    /** URL of the anchor-hosted interactive flow (open in popup/iframe/redirect). */
    interactiveUrl: string;
    /** Transaction id to poll via the facet's `get*Transaction` methods. */
    transactionId: string;
}

// =============================================================================
// Capability facets
// =============================================================================

/**
 * Wallet-based authentication operations (SEP-10).
 *
 * Present when the anchor authenticates the end user via their Stellar wallet
 * signature rather than server-side credentials. The handshake is split so the
 * signing step can happen client-side (e.g. Freighter): request a challenge,
 * sign it in the wallet, then exchange the signed challenge for a session token
 * that is threaded into subsequent facet calls via their `auth` parameter.
 *
 * Omitted by anchors that authenticate server-side (e.g. Etherfuse's API key,
 * or an HMAC merchant secret).
 */
export interface WalletAuthOps {
    /** Request a challenge transaction for the given account to sign. */
    getChallenge(account: string): Promise<AuthChallenge>;
    /** Exchange a wallet-signed challenge for a session token (SEP-10 JWT). */
    submitChallenge(signedTransactionXdr: string): Promise<AuthSession>;
}

/**
 * Programmatic (API-orchestrated) ramp operations — the SEP-6 archetype.
 *
 * The partner app collects customer, KYC, and fiat-account details itself and
 * drives the flow via these methods, rendering payment instructions in its own
 * UI. Implemented by providers like Etherfuse.
 */
export interface ProgrammaticOps {
    /**
     * Create a new customer with the anchor provider.
     * @param auth - Session token for wallet-authenticated anchors (see {@link Anchor.auth}); ignored by API-key anchors.
     * @throws {AnchorError} On validation failure or API error.
     */
    createCustomer(input: CreateCustomerInput, auth?: string): Promise<Customer>;

    /**
     * Look up an existing customer by ID or email.
     * @returns The customer, or `null` if not found.
     */
    getCustomer(input: GetCustomerInput, auth?: string): Promise<Customer | null>;

    /** Request a currency conversion quote with rate, fees, and expiration. */
    getQuote(input: GetQuoteInput, auth?: string): Promise<Quote>;

    /** Create an on-ramp (fiat → crypto) transaction, typically with payment instructions. */
    createOnRamp(input: CreateOnRampInput, auth?: string): Promise<OnRampTransaction>;

    /** Fetch the current state of an on-ramp transaction, or `null` if not found. */
    getOnRampTransaction(transactionId: string, auth?: string): Promise<OnRampTransaction | null>;

    /**
     * Register a fiat bank account for a customer. Optional — anchors with
     * `capabilities.fiatAccountRegistration === 'hosted'` register accounts via
     * their hosted onboarding UI instead and may omit this method.
     */
    registerFiatAccount?(
        input: RegisterFiatAccountInput,
        auth?: string,
    ): Promise<RegisteredFiatAccount>;

    /** List all registered fiat accounts for a customer (empty if none). */
    getFiatAccounts(customerId: string, auth?: string): Promise<SavedFiatAccount[]>;

    /** Create an off-ramp (crypto → fiat) transaction. */
    createOffRamp(input: CreateOffRampInput, auth?: string): Promise<OffRampTransaction>;

    /** Fetch the current state of an off-ramp transaction, or `null` if not found. */
    getOffRampTransaction(transactionId: string, auth?: string): Promise<OffRampTransaction | null>;

    /** Get a URL for an interactive KYC/onboarding flow (iframe, redirect, or ToS page). */
    getKycUrl?(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string>;

    /** Get the current KYC verification status for a customer. */
    getKycStatus(customerId: string, publicKey?: string, auth?: string): Promise<KycStatus>;

    /**
     * Get the KYC field and document requirements. Anchors may return a static
     * set, or — given a session token in {@link KycRequirementsQuery.auth} —
     * discover the fields the specific customer (or in-flight transaction) still
     * needs via SEP-12.
     */
    getKycRequirements?(query?: KycRequirementsQuery): Promise<KycRequirements>;

    /** Submit KYC data and documents for a customer. */
    submitKyc?(
        customerId: string,
        data: KycSubmissionData,
        auth?: string,
    ): Promise<KycSubmissionResult>;
}

/**
 * Interactive (hosted-UI) ramp operations — the SEP-24 archetype.
 *
 * The anchor hosts the full customer-facing flow (KYC, amount entry, payment
 * method). The partner app authenticates, starts a session, hands the user the
 * hosted URL, and polls for status. Implemented by SEP-24 anchors (test anchor)
 * and hosted-widget providers (e.g. Coins.ph).
 */
export interface InteractiveOps {
    /** Optional pre-flight price quote (e.g. SEP-38). */
    getQuote?(input: GetQuoteInput, auth?: string): Promise<Quote>;

    /** Start an interactive on-ramp (fiat → crypto) session. */
    startOnRamp(input: StartInteractiveInput): Promise<InteractiveSession>;

    /** Fetch the current state of an on-ramp transaction, or `null` if not found. */
    getOnRampTransaction(transactionId: string, auth?: string): Promise<OnRampTransaction | null>;

    /** Start an interactive off-ramp (crypto → fiat) session. */
    startOffRamp(input: StartInteractiveInput): Promise<InteractiveSession>;

    /** Fetch the current state of an off-ramp transaction, or `null` if not found. */
    getOffRampTransaction(transactionId: string, auth?: string): Promise<OffRampTransaction | null>;
}

// =============================================================================
// Anchor interface
// =============================================================================

/**
 * Unified interface for fiat on/off ramp anchor providers.
 *
 * An anchor exposes shared identity/metadata plus one or both capability facets:
 *   - {@link ProgrammaticOps} (`programmatic`) — SEP-6-style, app-orchestrated.
 *   - {@link InteractiveOps} (`interactive`) — SEP-24-style, anchor-hosted.
 *
 * At least one of `programmatic`/`interactive` must be present. Consumers narrow
 * on facet presence, e.g. `if (anchor.interactive) { ... }`. A single provider
 * may implement both (the test anchor exposes SEP-6 and SEP-24). The optional
 * `auth` facet is orthogonal: present for wallet-authenticated anchors and used
 * by either flow.
 */
export interface Anchor {
    /** Machine-readable provider identifier (e.g. `"etherfuse"`, `"testanchor"`). */
    readonly name: string;
    /** Human-readable provider name for display (e.g. `"Etherfuse"`). */
    readonly displayName: string;
    /** Runtime capability flags describing this provider's features and requirements. */
    readonly capabilities: AnchorCapabilities;
    /** Digital asset tokens supported by this provider. */
    readonly supportedTokens: readonly TokenInfo[];
    /** ISO 4217 fiat currency codes supported by this provider (e.g. `["MXN"]`). */
    readonly supportedCurrencies: readonly string[];
    /** Payment rail identifiers supported by this provider (e.g. `["spei"]`). */
    readonly supportedRails: readonly string[];

    /** Wallet-based (SEP-10) authentication, if the anchor authenticates the end user via their wallet. */
    readonly auth?: WalletAuthOps;
    /** Programmatic (SEP-6-style) operations, if supported. */
    readonly programmatic?: ProgrammaticOps;
    /** Interactive (SEP-24-style) operations, if supported. */
    readonly interactive?: InteractiveOps;
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
