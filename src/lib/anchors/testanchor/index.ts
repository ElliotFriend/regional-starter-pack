/**
 * Test Anchor Integration
 *
 * Standalone SEP-compliant clients for testanchor.stellar.org.
 *
 * - `TestAnchorClient` — the SEP playground used by the `/testanchor` demo
 * - `TestAnchorRampClient` — the bespoke ramp client used by the curated
 *   `/anchors/testanchor` flows
 */

export { TestAnchorClient, createTestAnchorClient, type TestAnchorConfig } from './client';
export {
    TestAnchorRampClient,
    createTestAnchorRampClient,
    TestAnchorSepUnsupportedError,
    type TestAnchorRampClientConfig,
    type TestAnchorTokenInfo,
} from './ramp';
