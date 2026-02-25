/**
 * SEP (Stellar Ecosystem Proposal) implementations for anchor interoperability.
 *
 * These modules can be used independently or combined to build anchor integrations.
 * Import the namespaced modules (e.g. `sep24.deposit()`) rather than individual functions.
 */

// SEP-1: Stellar Info File (stellar.toml discovery)
export * as sep1 from './sep1';

// SEP-10: Web Authentication
export * as sep10 from './sep10';

// SEP-12: KYC API
export * as sep12 from './sep12';

// SEP-6: Programmatic Deposit/Withdrawal
export * as sep6 from './sep6';

// SEP-24: Interactive Deposit/Withdrawal
export * as sep24 from './sep24';

// SEP-31: Cross-Border Payments
export * as sep31 from './sep31';

// SEP-38: Anchor RFQ (Quotes)
export * as sep38 from './sep38';

// Shared types
export * from './types';
