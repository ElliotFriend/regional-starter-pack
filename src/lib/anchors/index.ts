/**
 * Anchor library exports
 *
 * The anchor client implementations are framework-agnostic and can be copied
 * into any TypeScript project. For the SvelteKit-specific factory that
 * instantiates clients with env vars, see `$lib/server/anchorFactory.ts`.
 */

export * from './types';
export { EtherfuseClient } from './etherfuse';
export { AlfredPayClient } from './alfredpay';
export { BlindPayClient } from './blindpay';

// SEP modules - can be composed to build anchor integrations
export * as sep from './sep';

// Test anchor client for testanchor.stellar.org
export { TestAnchorClient, createTestAnchorClient, type TestAnchorConfig } from './testanchor';
