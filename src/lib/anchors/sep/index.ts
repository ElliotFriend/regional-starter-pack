/**
 * SEP (Stellar Ecosystem Proposal) implementations for anchor interoperability.
 *
 * These modules can be used independently or combined to build anchor integrations.
 */

// SEP-1: Stellar Info File (stellar.toml discovery)
export * as sep1 from './sep1';
export {
    fetchStellarToml,
    getSep10Endpoint,
    getSep6Endpoint,
    getSep12Endpoint,
    getSep24Endpoint,
    getSep31Endpoint,
    getSep38Endpoint,
    getSigningKey,
    getCurrencies,
    getCurrencyByCode,
    supportsSep,
} from './sep1';

// SEP-10: Web Authentication
export * as sep10 from './sep10';
export {
    getChallenge,
    validateChallenge,
    signChallenge,
    submitChallenge,
    authenticate,
    decodeToken,
    isTokenExpired,
    createAuthHeaders,
    type Sep10Config,
    type Sep10SignerFn,
} from './sep10';

// SEP-12: KYC API
export * as sep12 from './sep12';
export {
    getCustomer,
    putCustomer,
    deleteCustomer,
    getCustomerStatus,
    isKycComplete,
    needsMoreInfo,
    isProcessing,
    isRejected,
    SEP9_NATURAL_PERSON_FIELDS,
    SEP9_ORGANIZATION_FIELDS,
    type Sep9NaturalPersonField,
    type Sep9OrganizationField,
    type Sep9Field,
} from './sep12';

// SEP-6: Programmatic Deposit/Withdrawal
export * as sep6 from './sep6';
export {
    getInfo as getSep6Info,
    deposit as sep6Deposit,
    withdraw as sep6Withdraw,
    getTransaction as getSep6Transaction,
    getTransactionByStellarId as getSep6TransactionByStellarId,
    getTransactions as getSep6Transactions,
} from './sep6';

// SEP-24: Interactive Deposit/Withdrawal
export * as sep24 from './sep24';
export {
    getInfo as getSep24Info,
    deposit as sep24Deposit,
    withdraw as sep24Withdraw,
    getTransaction as getSep24Transaction,
    getTransactionByStellarId as getSep24TransactionByStellarId,
    getTransactions as getSep24Transactions,
    openPopup,
    createIframe,
    pollTransaction as pollSep24Transaction,
} from './sep24';

// SEP-31: Cross-Border Payments
export * as sep31 from './sep31';
export {
    getInfo as getSep31Info,
    getReceiveAssets,
    postTransaction,
    getTransaction as getSep31Transaction,
    patchTransaction,
    putTransactionCallback,
    pollTransaction as pollSep31Transaction,
} from './sep31';

// SEP-38: Anchor RFQ (Quotes)
export * as sep38 from './sep38';
export {
    getInfo as getSep38Info,
    getAssets as getSep38Assets,
    getPrice,
    getPrices,
    postQuote,
    getQuote,
    stellarAssetId,
    fiatAssetId,
    parseAssetId,
} from './sep38';

// Shared types
export * from './types';
