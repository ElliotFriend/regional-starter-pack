/**
 * TR Mock Anchor integration — a Turkish TRY↔USDC sandbox anchor on Stellar
 * testnet. Standalone by design: this directory owns its own types and error
 * class and shares nothing with the other anchor clients except
 * `@stellar/stellar-sdk` and `../sep`.
 */

export { TrMockRampClient, TrMockError, createTrMockRampClient } from './ramp';
export type { TrMockRampClientConfig } from './ramp';
