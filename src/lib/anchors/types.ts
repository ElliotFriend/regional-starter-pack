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

export interface PaymentInstructions {
    type: 'spei';
    bankName: string;
    accountNumber: string;
    clabe: string;
    beneficiary: string;
    reference: string;
    amount: string;
    currency: string;
}

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
    createdAt: string;
    updatedAt: string;
}

export interface BankAccount {
    id: string;
    bankName: string;
    accountNumber: string;
    clabe: string;
    beneficiary: string;
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
    bankAccount: BankAccount;
    feeBps?: number;
    feeAmount?: string;
    memo?: string;
    stellarTxHash?: string;
    /** Pre-built transaction envelope (e.g. base64 XDR) for the user to sign. */
    signableTransaction?: string;
    /** URL to an anchor-hosted status page for this transaction. */
    statusPage?: string;
    createdAt: string;
    updatedAt: string;
}

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

export interface FiatAccountInput {
    bankName: string;
    accountNumber: string;
    clabe: string;
    beneficiary: string;
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

export interface CreateOffRampInput {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    fiatAccountId: string;
    memo?: string;
    // Bank account info for response mapping (not sent to API)
    bankAccountInfo?: FiatAccountInput;
}

export interface RegisterFiatAccountInput {
    customerId: string;
    bankAccount: FiatAccountInput;
}

/**
 * Anchor interface - implement this for each anchor provider
 */
export interface Anchor {
    readonly name: string;

    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getCustomerByEmail(email: string, country?: string): Promise<Customer | null>;

    getQuote(input: GetQuoteInput): Promise<Quote>;

    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;

    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;

    getKycIframeUrl(
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
