/**
 * Test Anchor Integration
 *
 * Two coexisting SEP-compliant clients for testanchor.stellar.org, each
 * optimised for a different use case:
 *
 * - `TestAnchorPlaygroundClient` (`./playground.ts`) — stateful,
 *   namespaced SEP playground. Powers the `/testanchor` demo page,
 *   which walks through each SEP protocol interactively for one user.
 *   Authenticate once, then call `client.sep6.deposit(...)` etc.
 * - `TestAnchorRampClient` (`./ramp.ts`) — stateless, flat-API ramp
 *   client. Powers the curated `/anchors/testanchor/...` ramp flows
 *   (SEP-10 + SEP-6 + SEP-24 + SEP-38). Matches the per-provider client
 *   shape used by Etherfuse and (eventually) Koywe, PDAX, etc.
 *
 * See each file's docstring for the full rationale on why they don't
 * collapse into one client.
 */

export {
    TestAnchorPlaygroundClient,
    createTestAnchorPlaygroundClient,
    type TestAnchorPlaygroundConfig,
} from './playground';
export {
    TestAnchorRampClient,
    createTestAnchorRampClient,
    TestAnchorSepUnsupportedError,
    type TestAnchorRampClientConfig,
    type TestAnchorTokenInfo,
} from './ramp';
