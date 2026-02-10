/**
 * AlfredPay-specific API types
 */

export interface AlfredPayConfig {
    apiKey: string;
    apiSecret: string;
    baseUrl: string;
}

// API Request Types
export interface AlfredPayCreateCustomerRequest {
    email: string;
    type: 'INDIVIDUAL' | 'BUSINESS';
    country: string;
    phoneNumber?: string;
    businessId?: string;
}

export interface AlfredPayQuoteRequest {
    fromCurrency: string;
    toCurrency: string;
    fromAmount?: string;
    toAmount?: string;
    chain: 'XLM';
    paymentMethodType: 'SPEI';
    customerId?: string;
    businessId?: string;
    metadata?: Record<string, unknown>;
}

export interface AlfredPayOnRampRequest {
    customerId: string;
    quoteId: string;
    wallet_address: string;
    chain: 'XLM';
}

export interface AlfredPayOffRampRequest {
    customerId: string;
    quoteId: string;
    wallet_address: string;
    chain: 'XLM';
    bankAccount: {
        bankName: string;
        accountNumber: string;
        clabe: string;
        beneficiary: string;
    };
}

// API Response Types
export interface AlfredPayCreateCustomerResponse {
    customerId: string;
    createdAt: string;
}

export interface AlfredPayCustomerResponse {
    id: string;
    email: string;
    kyc_status: 'pending' | 'approved' | 'rejected' | 'not_started';
    created_at: string;
    updated_at: string;
}

export interface AlfredPayQuoteFee {
    type: 'commissionFee' | 'processingFee' | 'taxFee' | 'networkFee';
    amount: string;
    currency: string;
}

export interface AlfredPayQuoteResponse {
    quoteId: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    toAmount: string;
    chain: string;
    paymentMethodType: string;
    expiration: string;
    fees: AlfredPayQuoteFee[];
    rate: string;
}

export interface AlfredPayPaymentInstructions {
    type: 'spei';
    bank_name: string;
    account_number: string;
    clabe: string;
    beneficiary: string;
    reference: string;
    amount: string;
    currency: string;
}

export interface AlfredPayFiatPaymentInstructions {
    paymentType: string;
    clabe: string;
    reference: string;
    expirationDate: string;
    paymentDescription: string;
    bankName: string;
    accountHolderName: string;
}

export interface AlfredPayOnRampTransaction {
    transactionId: string;
    customerId: string;
    quoteId: string;
    status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    fromAmount: string;
    fromCurrency: string;
    toAmount: string;
    toCurrency: string;
    depositAddress: string;
    chain: string;
    paymentMethodType: string;
    txHash: string | null;
    memo: string;
    createdAt: string;
    updatedAt: string;
}

export interface AlfredPayOnRampResponse {
    transaction: AlfredPayOnRampTransaction;
    fiatPaymentInstructions: AlfredPayFiatPaymentInstructions;
}

// GET response has flat structure (transaction fields at top level)
export interface AlfredPayOnRampFlatResponse extends AlfredPayOnRampTransaction {
    fiatPaymentInstructions: AlfredPayFiatPaymentInstructions;
}

export interface AlfredPayBankAccount {
    id: string;
    bank_name: string;
    account_number: string;
    clabe: string;
    beneficiary: string;
}

export interface AlfredPayOffRampResponse {
    transactionId: string;
    customerId: string;
    createdAt: string;
    updatedAt: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    toAmount: string;
    chain: string;
    status: 'CREATED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
    fiatAccountId: string;
    depositAddress: string;
    expiration: string;
    memo: string;
    externalId?: string;
    metadata?: unknown;
    txHash?: string;
    quote?: AlfredPayQuoteResponse;
}

export interface AlfredPayKycIframeResponse {
    url: string;
}

// KYC Requirements Types
export interface AlfredPayKycRequirement {
    name: string;
    required: boolean;
    type: string;
    description?: string;
}

export interface AlfredPayKycRequirementsResponse {
    country: string;
    requirements: {
        personal: AlfredPayKycRequirement[];
        documents: AlfredPayKycRequirement[];
    };
}

// KYC Submission Types
export interface AlfredPayKycSubmissionRequest {
    kycSubmission: {
        firstName: string;
        lastName: string;
        dateOfBirth: string;
        country: string;
        city: string;
        state: string;
        address: string;
        zipCode: string;
        nationalities: string[];
        email: string;
        dni: string;
    };
}

export interface AlfredPayKycSubmissionResponse {
    submissionId: string;
    status: string;
    createdAt: string;
}

// KYC Status values from AlfredPay webhook status updates
export type AlfredPayKycStatus =
    | 'CREATED' // KYC submission has been created
    | 'IN_REVIEW' // KYC submission is being reviewed by partner
    | 'UPDATE_REQUIRED' // KYC requires additional info from partner
    | 'COMPLETED' // KYC verified on partner side
    | 'FAILED'; // KYC failed on partner side

export interface AlfredPayKycSubmissionStatusResponse {
    submissionId?: string;
    status: AlfredPayKycStatus;
    createdAt?: string;
    updatedAt?: string;
}

// KYC File Upload Types
export type AlfredPayKycFileType =
    | 'National ID Front'
    | 'National ID Back'
    | 'Driver Licence Front'
    | 'Driver Licence Back'
    | 'Selfie';

export interface AlfredPayKycFileResponse {
    fileId: string;
    fileType: AlfredPayKycFileType;
    status: string;
}

export interface AlfredPayErrorResponse {
    error: {
        code: string;
        message: string;
    };
}

// Fiat Account Types
export type AlfredPayFiatAccountType =
    | 'SPEI'
    | 'PIX'
    | 'COELSA'
    | 'ACH'
    | 'ACH_DOM'
    | 'BANK_CN'
    | 'BANK_USA'
    | 'ACH_CHL'
    | 'ACH_BOL'
    | 'B89';

export interface AlfredPayFiatAccountFields {
    accountNumber: string;
    accountType: string;
    accountName: string;
    accountBankCode: string;
    accountAlias: string;
    networkIdentifier: string;
    metadata?: {
        accountHolderName: string;
    };
}

export interface AlfredPayCreateFiatAccountRequest {
    customerId: string;
    type: AlfredPayFiatAccountType;
    fiatAccountFields: AlfredPayFiatAccountFields;
    isExternal?: boolean;
}

export interface AlfredPayFiatAccountResponse {
    fiatAccountId: string;
    customerId: string;
    type: string;
    status: string;
    createdAt: string;
}

export interface AlfredPayFiatAccountListItem {
    fiatAccountId: string;
    type: string;
    accountNumber: string;
    accountType: string;
    accountName: string;
    accountAlias: string;
    bankName: string;
    createdAt: string;
    isExternal: boolean;
    metadata?: {
        accountHolderName?: string;
    };
}

// Webhook Types (incoming)
export interface AlfredPayWebhookPayload {
    event: string;
    data: {
        id: string;
        status: string;
        [key: string]: unknown;
    };
    timestamp: string;
    signature: string;
}

// Sandbox webhook request (outgoing - for testing)
export type AlfredPayWebhookEventType = 'KYC' | 'ONRAMP' | 'OFFRAMP' | 'KYB';

export interface AlfredPaySandboxWebhookRequest {
    referenceId: string;
    eventType: AlfredPayWebhookEventType;
    status: string;
    metadata: Record<string, unknown> | null;
}
