/**
 * SeevCash integration — a Ghana GHS↔USDC SEP anchor over mobile money.
 * Standalone by design: this directory owns its own types and error class and
 * shares nothing with the other anchor clients except `@stellar/stellar-sdk`
 * and `../sep`.
 */

export { SeevcashRampClient, SeevcashError, createSeevcashRampClient } from './ramp';
export type { SeevcashRampClientConfig } from './ramp';
