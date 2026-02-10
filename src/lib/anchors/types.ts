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
    | 'cancelled';

export interface Customer {
    id: string;
    email: string;
    kycStatus: KycStatus;
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
    memo?: string;
    stellarTxHash?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCustomerInput {
    email: string;
    country?: string;
}

export interface GetQuoteInput {
    fromCurrency: string;
    toCurrency: string;
    fromAmount?: string;
    toAmount?: string;
}

export interface CreateOnRampInput {
    customerId: string;
    quoteId: string;
    stellarAddress: string;
    fromCurrency: string;
    toCurrency: string;
    amount: string;
    memo?: string;
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

    getKycIframeUrl(customerId: string): Promise<string>;
    getKycStatus(customerId: string): Promise<KycStatus>;
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
