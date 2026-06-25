/**
 * Anchor Profile Configuration
 *
 * Defines anchor provider profiles and their regional capabilities.
 * The `AnchorProfile` type is the config-side representation — distinct from
 * the runtime `Anchor` interface in `$lib/anchors/types.ts`.
 *
 * Runtime capability flags (`AnchorCapabilities`) and provider-intrinsic metadata
 * (display name, supported tokens, currencies, rails) live on the `Anchor`
 * interface and client classes in `$lib/anchors/`.
 */

export interface AnchorCapability {
    onRamp: boolean;
    offRamp: boolean;
    paymentRails: string[]; // IDs of supported payment rails
    tokens: string[]; // Symbols of supported tokens
    kycRequired: boolean;
    minAmount?: string;
    maxAmount?: string;
    comingSoon?: boolean;
}

export interface DevOnboardingStep {
    text: string;
    link?: string;
}

export interface IntegrationStep {
    title: string;
    description: string;
}

export interface IntegrationFlow {
    onRamp: IntegrationStep[];
    offRamp: IntegrationStep[];
}

export interface KnownIssue {
    text: string;
    link?: string;
}

export interface AnchorProfile {
    id: string;
    name: string;
    description: string;
    links: Record<string, string>;
    logo?: string;
    knownIssues?: KnownIssue[];
    regions: Record<string, AnchorCapability>; // keyed by region ID
    devOnboarding?: DevOnboardingStep[];
    integrationFlow?: IntegrationFlow;
    /** Two-lens criteria scores. Omitted for anchors not yet scored. */
    scorecard?: ScoredCriterion[];
    /**
     * Reference/test anchor (no-value testnet) — exempt from the commercial
     * gate when computing {@link curationStatus}.
     */
    referenceAnchor?: boolean;
}

// =============================================================================
// Quality Criteria
// =============================================================================

/** Four-state score for a single criterion (✅ 🟡 ❌ ❔). */
export type CriterionStatus = 'met' | 'partial' | 'failed' | 'unverified';

/** Which lens a criterion belongs to. */
export type Lens = 'commercial' | 'developer';

/** A lens-tagged criterion definition. */
export interface CriterionDef {
    id: string;
    /** Full label — used in the detailed scorecard on an anchor's own page. */
    label: string;
    /** Brief label — used in the compact scorecard on listing / region pages. */
    shortLabel: string;
    lens: Lens;
}

/** A criterion scored for a specific anchor. */
export interface ScoredCriterion extends CriterionDef {
    status: CriterionStatus;
    note?: string;
}

/**
 * Commercial lens — the curation / end-user-value bar. Fee + liquidity are
 * vetted elsewhere and are typically `unverified` in our data.
 */
export const COMMERCIAL_CRITERIA: readonly CriterionDef[] = [
    {
        id: 'local-asset',
        label: 'Locally denominated asset (stablecoin or stablebond) on Stellar',
        shortLabel: 'Locally denominated asset',
        lens: 'commercial',
    },
    {
        id: 'local-rails',
        label: 'Support for local payment rails connected to Stellar',
        shortLabel: 'Local payment rails',
        lens: 'commercial',
    },
    {
        id: 'competitive-rates',
        label: 'Competitive rates (wholesale <25 bps conversion)',
        shortLabel: 'Competitive rates',
        lens: 'commercial',
    },
    {
        id: 'deep-liquidity',
        label: 'Deep liquidity for low slippage (local ↔ global assets)',
        shortLabel: 'Deep liquidity',
        lens: 'commercial',
    },
] as const;

/**
 * Developer lens — buildability. Distilled from the developer-friction rubric;
 * supplements (does not replace) the commercial bar.
 */
export const DEVELOPER_CRITERIA: readonly CriterionDef[] = [
    {
        id: 'open-access',
        label: 'Open self-service access (credentials + sandbox, no human in the loop)',
        shortLabel: 'Open self-service access',
        lens: 'developer',
    },
    {
        id: 'accurate-docs',
        label: 'Accurate, well-documented API (docs match the wire)',
        shortLabel: 'Accurate docs',
        lens: 'developer',
    },
    {
        id: 'high-fidelity-sandbox',
        label: 'High-fidelity sandbox (a completed test ramp lands real on-chain testnet tokens)',
        shortLabel: 'High-fidelity sandbox',
        lens: 'developer',
    },
    {
        id: 'agent-buildable',
        label: 'Agent-buildable (machine-readable docs/spec, diagnosable failures)',
        shortLabel: 'Agent-buildable',
        lens: 'developer',
    },
    {
        id: 'fee-discoverability',
        label: 'Fee/rate discoverability (costs findable via pricing docs or a quote/fee API)',
        shortLabel: 'Fee discoverability',
        lens: 'developer',
    },
] as const;

/** The full criteria set, commercial lens first. */
export const QUALITY_CRITERIA: readonly CriterionDef[] = [
    ...COMMERCIAL_CRITERIA,
    ...DEVELOPER_CRITERIA,
];

/**
 * Compute the advisory curation flag for a scorecard.
 *
 * - Commercial lens passes unless **two or more** criteria are `failed` (a
 *   single failure — typically the missing local asset — is tolerated).
 * - Developer lens passes unless **any** criterion is `failed`.
 * - `partial` / `unverified` never count against either lens.
 * - Reference anchors (`exempt`) are always curated.
 *
 * Advisory only — it does not move anchors between {@link ANCHORS} and
 * {@link HONORABLE_MENTIONS}; placement stays a manual editorial decision.
 */
export function curationStatus(
    scorecard: ScoredCriterion[],
    opts: { exempt?: boolean } = {},
): { status: 'curated' | 'flagged'; flags: ScoredCriterion[] } {
    if (opts.exempt) return { status: 'curated', flags: [] };
    const failed = scorecard.filter((c) => c.status === 'failed');
    const commercialFails = failed.filter((c) => c.lens === 'commercial').length;
    const developerFails = failed.filter((c) => c.lens === 'developer').length;
    const status = commercialFails >= 2 || developerFails >= 1 ? 'flagged' : 'curated';
    return { status, flags: failed };
}

// =============================================================================
// Curated Anchors
// =============================================================================

export const ANCHORS: Record<string, AnchorProfile> = {
    etherfuse: {
        id: 'etherfuse',
        name: 'Etherfuse',
        description:
            'Etherfuse bridges traditional finance and decentralized finance, making financial systems more inclusive, transparent, and efficient for everyone.',
        logo: '/anchor-logos/etherfuse.png',
        scorecard: makeCriteria({
            'local-asset': { status: 'met', note: 'CETES / TESOURO stablebonds on Stellar' },
            'local-rails': { status: 'met', note: 'SPEI (MX); PIX (BR)' },
            'competitive-rates': {
                status: 'met',
                note: 'Stablebond yield offsets conversion cost',
            },
            'deep-liquidity': { status: 'met' },
            'open-access': { status: 'met', note: 'Self-serve signup; sandbox live 24/7' },
            'accurate-docs': { status: 'met', note: 'Guides + reference match the wire (MX)' },
            'high-fidelity-sandbox': {
                status: 'met',
                note: 'Sandbox delivers on-chain tokens; off-ramp burns tokens',
            },
            'agent-buildable': { status: 'met', note: 'MCP docs server + OpenAPI spec' },
            'fee-discoverability': {
                status: 'met',
                note: 'Quote API returns fee + rate per transaction; public pricing docs',
            },
        }),
        links: {
            website: 'https://www.etherfuse.com',
            documentation: 'https://docs.etherfuse.com',
            'sandbox app': 'https://devnet.etherfuse.com',
        },
        knownIssues: [
            {
                text: "Brazil support (BRL ↔ TESOURO over PIX) is underway and undocumented: Etherfuse's published FX API and OpenAPI spec currently cover only Mexico (MXN ↔ CETES over SPEI) plus USD-denominated stablecoins (USDC, EURC). The Brazil/PIX request and response shapes in this client are speculative and unverified against a live environment.",
            },
            {
                text: 'If you try to create your customers through API calls, submitting the various "agreements" via POST requests to Etherfuse currently fails with a 406 error. This blocks customer KYC via these API methods. The Onboarding URL approach still works.',
            },
        ],
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['CETES'],
                kycRequired: true,
            },
            brazil: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['pix'],
                tokens: ['TESOURO'],
                kycRequired: true,
            },
        },
        devOnboarding: [
            {
                text: 'Developers must sign up and create an organization to get API Keys',
                link: 'https://devnet.etherfuse.com/ramp',
            },
            { text: 'KYB/KYC is required for developers prior to launching on Mainnet' },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Create Customer',
                    description: 'Register the user and receive a KYC onboarding URL.',
                },
                {
                    title: 'Complete KYC via Iframe',
                    description: 'Embed the onboarding URL in an iframe for identity verification.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the local currency to token conversion.',
                },
                {
                    title: 'Create On-Ramp Order',
                    description: 'Submit the order and receive local payment instructions.',
                },
                {
                    title: 'Transfer Fiat via Bank',
                    description:
                        'The user sends local currency via their payment rail using the provided details.',
                },
                {
                    title: 'Receive Tokens',
                    description:
                        "The anchor delivers locally denominated tokens to the user's Stellar wallet.",
                },
            ],
            offRamp: [
                {
                    title: 'Create Customer + KYC',
                    description: 'Register and complete identity verification via iframe.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the token to local currency conversion.',
                },
                {
                    title: 'Create Off-Ramp Order',
                    description: 'Submit the off-ramp order to the anchor.',
                },
                {
                    title: 'Poll for Signable Transaction',
                    description: 'Wait for the burn transaction XDR to appear via polling.',
                },
                {
                    title: 'Sign with Freighter',
                    description: 'Sign the burn transaction in Freighter and submit to Stellar.',
                },
                {
                    title: 'Receive Fiat',
                    description:
                        "The anchor sends local currency to the user's bank via their payment rail.",
                },
            ],
        },
    },
    koywe: {
        id: 'koywe',
        name: 'Koywe',
        description:
            'Koywe is a Latin American crypto-finance infrastructure provider offering fiat on/off ramps between local currencies and stablecoins. In Argentina it ramps Argentine pesos (ARS) to USDC on Stellar via local CVU and QR bank-transfer rails.',
        logo: '/anchor-logos/koywe.png',
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'USDC only',
            },
            'local-rails': { status: 'met', note: 'WIREAR (CVU) + QRI' },
            'competitive-rates': {
                status: 'partial',
            },
            'deep-liquidity': { status: 'unverified' },
            'open-access': {
                status: 'partial',
                note: 'Credentials by email request (lightweight human step)',
            },
            'accurate-docs': { status: 'met', note: 'Authoritative OpenAPI spec' },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'Sandbox cannot settle the Stellar USDC leg; end-to-end delivery only verifiable on an EVM testnet (Sepolia or Amoy) with a Koywe mock token, not canonical USDC',
            },
            'agent-buildable': {
                status: 'partial',
                note: 'OpenAPI good; opaque/silent sandbox failures',
            },
            'fee-discoverability': {
                status: 'met',
                note: 'Quote API returns fee per transaction',
            },
        }),
        links: {
            website: 'https://koywe.com',
            documentation: 'https://docs-crypto.koywe.com/en',
        },
        knownIssues: [
            {
                text: 'Regional expansion (BD pipeline): Colombia is live (PSE rails) and is a near-term expansion candidate; Brazil (PIX) is announced as "coming soon" but not yet live. The same Stellar USDC leg applies once those fiat rails are confirmed.',
            },
            {
                text: 'Koywe does not return a Stellar issuer for USDC (it is network-dependent), so the integration injects PUBLIC_USDC_ISSUER for the active network.',
            },
            {
                text: 'The hosted KYC widget URL endpoint is unconfirmed in the sandbox — the client surfaces a clear "not implemented" state until it is wired up. Complete KYC for the test user via the Koywe dashboard.',
            },
            {
                text: 'The sandbox cannot settle the Stellar USDC leg: an on-ramp order to a Stellar address confirms the fiat payment and advances to EXECUTING, but Koywe never broadcasts the on-chain delivery, so it loops between EXECUTING and PENDING until it expires by retries. Koywe confirmed USDC-on-Stellar is unsupported in the sandbox and pointed us at an EVM testnet instead — Sepolia (plain "USDC" symbol) or Amoy/Polygon ("USDC Polygon"). Driven over Sepolia, the same Khipu flow does complete end-to-end to DELIVERED with a real on-chain tx — but it credits a Koywe-issued mock token (name "Koywe USDC", 18 decimals) rather than canonical Circle USDC. So the sandbox proves the full ramp pipeline, just not on the target chain or asset. WIREAR and QRI orders stay in WAITING (only Khipu has a test pay page).',
            },
            {
                text: 'The off-ramp order field name and the submit-tx-hash REST path follow the documented OpenAPI spec but have not been verified end-to-end against the live sandbox.',
            },
            {
                text: "Off-ramp is blocked at bank-account registration: POST /rest/bank-accounts returns a 400 ownership-validation error even for Koywe's own documented DNI↔CVU test pairs. Appears to be a non-functional sandbox validation backend on Koywe's side; awaiting the Koywe team.",
            },
            {
                text: 'KYC document numbers are single-use: re-using a whitelisted test DNI on a new account returns "account already exists with that document number", so the small pool of sandbox test identities is quickly exhausted. Account verification status is read live via GET /rest/accounts/{email}/check.',
            },
        ],
        regions: {
            argentina: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['wirear', 'qri'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
        devOnboarding: [
            {
                text: 'Request sandbox integration credentials (clientId + secret) from Koywe.',
                link: 'https://docs-crypto.koywe.com/en',
            },
            {
                text: 'Authenticate with POST /rest/auth to obtain a 24h JWT scoped to the end-user email.',
            },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Authenticate',
                    description:
                        'Exchange the integration clientId/secret for a JWT scoped to the user email.',
                },
                {
                    title: 'Select Payment Method',
                    description:
                        'Fetch ARS payment providers (WIREAR / QRI / Khipu) and let the user pick a rail.',
                },
                {
                    title: 'Get Quote',
                    description:
                        'Request an executable ARS → USDC quote for the chosen payment method.',
                },
                {
                    title: 'Create On-Ramp Order',
                    description:
                        'Submit the order with the user’s Stellar address; receive CVU instructions or a hosted redirect.',
                },
                {
                    title: 'Pay via Local Rail',
                    description:
                        'The user transfers ARS via CVU, or completes the hosted QR/Khipu redirect.',
                },
                {
                    title: 'Receive USDC',
                    description:
                        'Koywe delivers USDC to the user’s Stellar wallet once funds settle.',
                },
            ],
            offRamp: [
                {
                    title: 'Authenticate',
                    description: 'Exchange the integration credentials for a user-scoped JWT.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request an executable USDC → ARS quote.',
                },
                {
                    title: 'Create Off-Ramp Order',
                    description:
                        'Submit the order against a registered bank account; receive a Koywe deposit address.',
                },
                {
                    title: 'Send USDC',
                    description:
                        'Sign and submit the USDC payment to the Koywe deposit address with Freighter.',
                },
                {
                    title: 'Submit Tx Hash',
                    description:
                        'Attach the Stellar transaction hash so Koywe can reconcile the transfer.',
                },
                {
                    title: 'Receive ARS',
                    description: 'Koywe pays out ARS to the user’s bank account.',
                },
            ],
        },
    },
    testanchor: {
        id: 'testanchor',
        name: 'Test Anchor',
        description:
            'The Stellar Development Foundation reference anchor (testanchor.stellar.org). It implements the full SEP stack on testnet and is wired here as a dual-facet anchor: SEP-24 interactive (the default flow) and SEP-6 programmatic, both authenticated with SEP-10 wallet signatures.',
        logo: '/anchor-logos/testanchor.png',
        referenceAnchor: true,
        scorecard: makeCriteria({
            // Reference SEP test anchor (no-value testnet) — exempt from the
            // commercial gate; the gold standard on the developer lens.
            'open-access': { status: 'met', note: 'No signup; open testnet' },
            'accurate-docs': { status: 'met', note: 'SEP standard + stellar.toml' },
            'high-fidelity-sandbox': {
                status: 'met',
                note: 'Issues real testnet SRT + USDC',
            },
            'agent-buildable': { status: 'met', note: 'Standard SEPs' },
            'fee-discoverability': {
                status: 'met',
                note: 'SEP-38 firm quotes + SEP-6 fee fields',
            },
        }),
        links: {
            website: 'https://testanchor.stellar.org',
            documentation:
                'https://developers.stellar.org/docs/learn/fundamentals/stellar-ecosystem-proposals',
            'stellar.toml': 'https://testanchor.stellar.org/.well-known/stellar.toml',
        },
        knownIssues: [
            {
                text: 'The test anchor issues no-value testnet assets (SRT and testnet USDC) and exists only for integration testing — it is not a curated production provider and does not offer locally denominated assets.',
            },
        ],
        regions: {
            testnet: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['bank'],
                tokens: ['SRT', 'USDC'],
                kycRequired: true,
            },
        },
        devOnboarding: [
            {
                text: 'No signup required — the test anchor is open on Stellar testnet.',
                link: 'https://testanchor.stellar.org/.well-known/stellar.toml',
            },
            {
                text: 'Fund a testnet wallet and add a trustline to the asset you want to ramp.',
            },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Authenticate (SEP-10)',
                    description:
                        'Sign a challenge transaction with the wallet to obtain a session token.',
                },
                {
                    title: 'Start Interactive Deposit (SEP-24)',
                    description: 'Request a hosted deposit session and receive an interactive URL.',
                },
                {
                    title: 'Complete in Hosted UI',
                    description:
                        'The user finishes KYC, amount entry, and payment in the anchor-hosted popup.',
                },
                {
                    title: 'Poll Until Complete',
                    description:
                        "Poll the transaction status until the anchor delivers the asset to the user's wallet.",
                },
            ],
            offRamp: [
                {
                    title: 'Authenticate (SEP-10)',
                    description:
                        'Sign a challenge transaction with the wallet to obtain a session token.',
                },
                {
                    title: 'Start Interactive Withdrawal (SEP-24)',
                    description:
                        'Request a hosted withdrawal session and receive an interactive URL.',
                },
                {
                    title: 'Complete in Hosted UI',
                    description:
                        'The user provides payout details and sends the asset from the hosted flow.',
                },
                {
                    title: 'Poll Until Complete',
                    description: 'Poll the transaction status until the payout is confirmed.',
                },
            ],
        },
    },
    manteca: {
        id: 'manteca',
        name: 'Manteca',
        description:
            'Manteca is a Buenos Aires-based B2B financial-infrastructure provider whose crypto API lets fintechs embed on/off ramps across 12 LatAm markets. In Brazil it ramps Brazilian reais (BRL) to USDC on Stellar via PIX, orchestrating fiat deposit, conversion, and crypto settlement in a single "synthetic" operation.',
        logo: '/anchor-logos/manteca.svg',
        links: {
            website: 'https://manteca.dev',
            documentation: 'https://developers.manteca.dev',
            'api reference': 'https://developers.manteca.dev/llms.txt',
        },
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'USDC/USDT/XLM — no locally denominated asset',
            },
            'local-rails': {
                status: 'met',
                note: 'PIX (BR) + CVU/CBU/alias (AR) + BRE-B (CO)',
            },
            'competitive-rates': {
                status: 'failed',
                note: 'Sandbox spread ~0 (not representative); production ~50–60 bps per survey, above the <25 bps target',
            },
            'deep-liquidity': { status: 'met', note: '~$10M/day per survey; Bybit partnership' },
            'open-access': {
                status: 'failed',
                note: 'Sandbox keys are sales-gated — obtained one via sales, still no self-serve',
            },
            'accurate-docs': {
                status: 'partial',
                note: 'Verified live: several wire shapes diverge from the published reference — nested effectivePrice (not flat), {user,person} onboarding envelope, PIX deposit object (no scalar address), sex F/M/X enum',
            },
            'high-fidelity-sandbox': {
                status: 'partial',
                note: "Partial — the full ramp pipeline is proven (EVM/Base Sepolia round trip completes both directions with real on-chain settlement + deposit detection); only Manteca's sandbox STELLAR leg is broken, with a vendor-side fix pending (reported June 2026). Onboarding works, the PIX deposit auto-detects (~15s) and auto-converts BRL→USDC, but the Stellar WITHDRAW leg FAILS (stages[3].errors: [\"Withdraw FAILED\"]) with no on-chain broadcast — even to a funded, USDC-trustlined testnet account. Issuer mismatch is RULED OUT: Manteca's pooled sandbox Stellar account trustlines the same Circle testnet USDC (GBBD47IF…) and holds ~30k, so the asset/trust is right. Neither crypto leg works in sandbox: the on-ramp outbound withdraw fails with no broadcast, and the off-ramp ignores a real on-chain USDC deposit (10 USDC sent to the user's muxed address, tx confirmed — synthetic never advanced past DEPOSIT). Fiat legs auto-mock. Failure is Stellar-specific: a full EVM (Base Sepolia) round trip COMPLETED — on-ramp delivered real testnet USDC on-chain AND off-ramp detected a real on-chain deposit and settled — so the whole pipeline works; only Manteca's sandbox Stellar leg is broken.",
            },
            'agent-buildable': {
                status: 'met',
                note: 'Markdown docs + llms.txt; built a full client from them and onboarded a sandbox user end-to-end',
            },
            'fee-discoverability': {
                status: 'met',
                note: 'Confirmed live: per-quote fee on the ramp synthetic (withdrawCostInAsset/withdrawCostInAgainst + effectivePrice)',
            },
        }),
        knownIssues: [
            {
                text: "Sandbox-verified (June 2026): onboarding, ramp-on creation, automatic PIX-deposit detection (~15s) and BRL→USDC conversion all work — no deposit-simulation call is needed (the sandbox auto-settles the fiat leg). BUT the ramp does NOT complete: the Stellar WITHDRAW leg fails (stages[3].errors: [\"Withdraw FAILED\"]) with no on-chain broadcast, even to a funded, USDC-trustlined testnet account. Issuer mismatch is RULED OUT — Manteca's pooled sandbox Stellar account (base GCVQ3XR5…) trustlines the same Circle testnet USDC (GBBD47IF…) and holds ~30k USDC. The sandbox does not bridge to real testnet on EITHER crypto leg: on-ramp outbound withdraw fails with no broadcast, and the off-ramp ignores a real, correctly-addressed on-chain USDC deposit (sent 10 USDC to the user's muxed deposit address, tx confirmed on testnet — synthetic stayed at DEPOSIT, never detected). Fiat legs are auto-mocked. The failure is STELLAR-SPECIFIC: a full EVM (Base Sepolia) round trip on the same user COMPLETED — on-ramp delivered real testnet USDC on-chain (tx 0x057b16d4…, token 0x8431ebc6…) AND a subsequent off-ramp detected a real on-chain USDC deposit and settled (both reached COMPLETED). So the entire ramp pipeline — including inbound deposit detection — is real and works; ONLY Manteca's sandbox Stellar leg is broken. Ask Manteca to enable/fix the sandbox Stellar leg.",
                link: 'https://developers.manteca.dev/recipes/ramp-on-synthetic',
            },
            {
                text: 'The broker test-deposit endpoint (/broker/v1/api/banking/deposit) is NOT used — it belongs to a separate Broker-as-a-Service product, credits ARS/USD only (no BRL), and returns 401 INVALID_API_KEY for the crypto sandbox key. The on-ramp does not need it (the deposit auto-settles).',
            },
            {
                text: 'The sandbox ramp-on POST (/crypto/v2/synthetics/ramp-on) is intermittently flaky — observed 3 consecutive "fetch failed" connection errors before a retry succeeded. Client callers should retry transient network failures.',
            },
            {
                text: 'Multi-region: Brazil (PIX/BRL) is sandbox-verified, but Argentina (CVU/CBU/alias, ARS) and Colombia (BRE-B, COP) are built (flow pages parameterized by ?region=) yet NOT fully sandbox-verified. The CVU/BRE-B on-ramp deposit-instruction and off-ramp destination wire shapes are unconfirmed (the deposit renderer falls back to generic fields). See docs/manteca-multiregion-plan.md Phase 4.',
            },
            {
                text: 'Argentina probed (June 2026): price/quote/onboarding work (resolving sandbox CUIT 20123456786). BUT AR requires an IDENTITY_VALIDATION onboarding step (required:true for AR, false for BR) that does NOT auto-complete in sandbox — it needs identity-document upload via POST /crypto/v2/onboarding-actions/upload-identity-image (returns a presigned S3 URL; FRONT+BACK), with no confirmed sandbox auto-approve. So AR users never reach ACTIVE and ramp-on/off 409 USER_STATUS. The demo KYC form has no document-upload step, so AR (and likely CO) stall at the "account not operational" notice. AR off-ramp destination must be a CBU (22-digit, not starting 000), CVU (22-digit, starts 000, 9th digit 0), or alias (6–20 chars, letters/./-).',
            },
            {
                text: "Sandbox onboarding validates legalId against a FIXED set of seeded test identities (appears Manteca-wide, across markets): Brazil CPF, Argentina CUIT, Colombia CC, etc. Arbitrary checksum-valid IDs return DATA_PROVIDER_NF or map to non-onboardable personas (e.g. IS_UNDER_AGE, IS_DEAD), and each seeded ID is single-use (dedup by legalId → 409 on reuse). A valid CUIT generator (src/lib/utils/cuit.ts) covers FORMAT validity for production/inline validation, but does NOT yield onboardable sandbox identities. Repeatable sandbox onboarding needs Manteca's seeded test-ID list per market.",
            },
            {
                text: 'Several wire shapes were corrected against the live sandbox after building from docs: the price endpoint nests effectivePrice/price/spread (not flat effectiveBuy/Sell); /onboarding-actions/initial returns a {user, person} envelope; the ramp-on PIX deposit is a {code, url} QR object under details.depositAddresses.PIX (no scalar address); and personalData.sex must be F/M/X. The off-ramp wire (ramp-off synthetic, payout) is still unverified — no sandbox identity reached an off-ramp.',
            },
            {
                text: 'Competitive-rate qualification (<25 bps) remains unverified: the sandbox shows ~0 spread (not representative). Per-quote cost IS discoverable on the ramp synthetic (withdrawCostInAsset/withdrawCostInAgainst + effectivePrice); production BRL spread (~50–60 bps per survey) must be confirmed on a live account.',
            },
            {
                text: 'Stellar deposit addressing is per-user and confirmed muxed (the user record returns a SEP-23 `M…` STELLAR address, no separate memo) — verified in sandbox.',
            },
            {
                text: 'Liquidity depth is unverified — no public volume figures. The July 2025 Bybit partnership suggests meaningful scale in Argentina/Brazil but provides no per-asset liquidity numbers.',
            },
        ],
        regions: {
            brazil: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['pix'],
                tokens: ['USDC'],
                kycRequired: true,
            },
            argentina: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['cvu'],
                tokens: ['USDC'],
                kycRequired: true,
            },
            colombia: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['breb'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
        devOnboarding: [
            {
                text: 'Contact Manteca to obtain sandbox API keys (not self-serve) and an integration manager.',
                link: 'https://developers.manteca.dev/docs/authentication',
            },
            {
                text: 'Authenticate every request with the static `md-api-key` header — no OAuth, no token refresh.',
            },
            {
                text: 'Onboard end-users programmatically via POST /crypto/v2/onboarding-actions/initial. Brazil auto-populates only some fields (name, birthDate, work) from national databases — you must still supply surname, phoneNumber, nationality, address.street, sex, and maritalStatus. Use the missing-personal-data endpoint to check what is pending, then poll the user until ACTIVE.',
            },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Onboard User',
                    description:
                        'Create the end-user and submit their CPF; Manteca runs KYC and auto-populates personal data for Brazil.',
                },
                {
                    title: 'Get Quote',
                    description: 'Read the USDC_BRL price and fee to estimate the conversion.',
                },
                {
                    title: 'Create Ramp-On Synthetic',
                    description:
                        'Create a ramp-on synthetic with the Stellar destination; receive PIX deposit instructions.',
                },
                {
                    title: 'Pay via PIX',
                    description:
                        'The user pays the PIX deposit (or, in sandbox, simulate the deposit) to trigger the synthetic.',
                },
                {
                    title: 'Receive USDC',
                    description:
                        'Manteca converts BRL to USDC and settles it to the user’s Stellar address; poll until COMPLETED.',
                },
            ],
            offRamp: [
                {
                    title: 'Onboard User',
                    description: 'Create and KYC the end-user (CPF) if not already active.',
                },
                {
                    title: 'Validate PIX Key',
                    description:
                        'Resolve the payout PIX key to confirm the recipient name and masked legal ID.',
                },
                {
                    title: 'Create Ramp-Off Synthetic',
                    description:
                        'Create a ramp-off synthetic with the PIX key as destination; receive the Stellar deposit address.',
                },
                {
                    title: 'Send USDC',
                    description:
                        'Sign and submit the USDC payment to the Manteca Stellar address with Freighter.',
                },
                {
                    title: 'Receive BRL',
                    description:
                        'Manteca sells USDC and pays out BRL via PIX; poll the synthetic until COMPLETED.',
                },
            ],
        },
    },
};

export function getAnchor(id: string): AnchorProfile | undefined {
    return ANCHORS[id];
}

export function getAllAnchors(): AnchorProfile[] {
    return Object.values(ANCHORS);
}

// =============================================================================
// Honorable Mentions
// =============================================================================

export interface HonorableMention {
    id: string;
    name: string;
    description: string;
    website: string;
    tokens: string[];
    rails: string[];
    regions: string[];
    scorecard: ScoredCriterion[];
    /**
     * `true` for a branch/candidate anchor we are still actively evaluating —
     * its scorecard is hand-authored from preliminary investigation notes, not
     * a verified live integration. Consumers should label these "under
     * evaluation".
     */
    vetting?: boolean;
}

/**
 * Build a full two-lens scorecard. Unspecified criteria default to
 * `unverified` (honest absence of data, rather than an implied failure).
 */
function makeCriteria(
    overrides: Partial<Record<string, { status: CriterionStatus; note?: string }>> = {},
): ScoredCriterion[] {
    return QUALITY_CRITERIA.map((c) => ({
        ...c,
        status: overrides[c.id]?.status ?? 'unverified',
        note: overrides[c.id]?.note,
    }));
}

export const HONORABLE_MENTIONS: Record<string, HonorableMention> = {
    alfredpay: {
        id: 'alfredpay',
        name: 'Alfred Pay',
        description:
            'Fiat on/off ramp services across Latin America, enabling conversion between local currencies and USDC on the Stellar network.',
        website: 'https://alfredpay.io',
        tokens: ['USDC'],
        rails: ['spei', 'pix'],
        regions: ['mexico', 'brazil'],
        scorecard: makeCriteria({
            'local-asset': { status: 'failed', note: 'USDC only' },
            'local-rails': { status: 'met' },
            'competitive-rates': {
                status: 'partial',
            },
            'deep-liquidity': {
                status: 'partial',
            },
            'open-access': { status: 'met', note: 'Sandbox exists; use example API keys' },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'Sandbox does not submit testnet transactions',
            },
        }),
    },
    blindpay: {
        id: 'blindpay',
        name: 'BlindPay',
        description:
            'Global payment infrastructure enabling worldwide money transfers using traditional fiat currencies and stablecoins.',
        website: 'https://blindpay.com',
        tokens: ['USDB'],
        rails: ['spei'],
        regions: ['mexico'],
        scorecard: makeCriteria({
            'local-asset': { status: 'failed', note: 'USDC only' },
            'local-rails': { status: 'met' },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': { status: 'unverified' },
            'open-access': { status: 'met', note: 'Self-serve signup + rich sandbox' },
            'high-fidelity-sandbox': {
                status: 'partial',
                note: 'Off-ramp sends tokens; on-ramp blocked by a wrong USDB issuer',
            },
        }),
    },
    abroad: {
        id: 'abroad',
        name: 'Abroad Finance',
        description:
            'Cross-border off-ramp infrastructure enabling conversion from digital assets to BRL via PIX.',
        website: 'https://abroad.finance',
        tokens: ['USDC'],
        rails: ['pix'],
        regions: ['brazil'],
        scorecard: makeCriteria({
            'local-asset': { status: 'failed', note: 'USDC only' },
            'local-rails': { status: 'partial', note: 'Off-ramp only' },
            'competitive-rates': {
                status: 'failed',
            },
            'deep-liquidity': {
                status: 'failed',
            },
            'open-access': {
                status: 'failed',
                note: 'No sandbox at all — test with small live amounts',
            },
            'high-fidelity-sandbox': { status: 'failed', note: 'No testnet environment' },
        }),
    },
    transfero: {
        id: 'transfero',
        name: 'Transfero',
        description:
            'Banking-as-a-Service infrastructure for fiat on/off ramps in Brazil. Issuer of the BRZ stablecoin on Stellar.',
        website: 'https://transfero.com',
        tokens: ['USDC', 'BRZ'],
        rails: ['pix'],
        regions: ['brazil'],
        scorecard: makeCriteria({
            // BRZ is a genuine BRL-pegged Stellar asset (Transfero is the issuer);
            'local-asset': {
                status: 'partial',
                note: 'BRZ is Transfero-issued, but availability/activity is unclear',
            },
            'local-rails': { status: 'met' },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': { status: 'unverified' },
            'open-access': {
                status: 'failed',
                note: 'Sandbox requires contacting support for credentials',
            },
            'high-fidelity-sandbox': { status: 'unverified' },
        }),
    },
    // --- In-vetting branch candidates (BD actively engaging; assessments are
    // preliminary, hand-authored from investigation notes). ---
    pdax: {
        id: 'pdax',
        name: 'PDAX',
        description:
            'Philippine licensed exchange explored as a PHP ramp. Best PH option commercially, but the most integration-hostile of the candidates.',
        website: 'https://pdax.ph',
        tokens: ['USDC'],
        rails: ['instapay', 'pesonet'],
        regions: ['philippines'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'USDCXLM (= USDC) — no locally denominated asset',
            },
            'local-rails': {
                status: 'unverified',
                note: 'PHP bank rails; never confirmed end-to-end',
            },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': { status: 'unverified' },
            'open-access': {
                status: 'failed',
                note: 'Password-gated docs + Telegram-gated credentials — no self-serve',
            },
            'accurate-docs': {
                status: 'failed',
                note: 'No first-party spec; reverse-engineered and drifts from the wire',
            },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'No crypto tx ever completed; sandbox appears to use an internal ledger, not real testnet',
            },
            'agent-buildable': {
                status: 'failed',
                note: 'Gated, no machine-readable spec, opaque NOT_FOUND errors',
            },
        }),
    },
    coinsph: {
        id: 'coinsph',
        name: 'Coins.ph',
        description:
            'Philippine wallet/exchange explored as a launch-only on-ramp. Stellar + USDC support itself is unconfirmed.',
        website: 'https://coins.ph',
        tokens: ['USDC'],
        rails: ['instapay', 'pesonet'],
        regions: ['philippines'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': { status: 'failed', note: 'USDC — no locally denominated asset' },
            'local-rails': { status: 'unverified', note: 'PHP rails; unconfirmed' },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': { status: 'unverified' },
            'open-access': { status: 'failed', note: 'Blocked on credentials — not self-serve' },
            'accurate-docs': {
                status: 'failed',
                note: 'Docs list only EVM/Solana; do not reflect any Stellar capability',
            },
            'high-fidelity-sandbox': {
                status: 'unverified',
                note: 'Blocked; Stellar support unconfirmed',
            },
            'agent-buildable': {
                status: 'partial',
                note: 'Docs + HMAC signing exist, but core capability is unconfirmable',
            },
        }),
    },
    // --- BD priority-pipeline candidates (actively engaged; assessments are
    // preliminary, hand-authored from research). ---
    bitso: {
        id: 'bitso',
        name: 'Bitso',
        description:
            'Major LATAM exchange. Bitso Business supports USDC on Stellar (production) with SPEI/PIX/PSE fiat rails; local stablecoins (MXNB, BRL1) are on EVM chains, not Stellar. It is a treasury/exchange API, not a SEP anchor: fiat settles in your own Bitso account and you convert + withdraw USDC to the customer, so the integrator is the principal/fund-holder (B2B2C) rather than plugging into an anchor that custodies and transmits directly to the end-user wallet — which carries the attendant money-transmission, KYC, and (in Brazil) Bacen-reporting obligations.',
        website: 'https://bitso.com/business',
        tokens: ['USDC'],
        rails: ['spei', 'pix', 'pse'],
        regions: ['mexico', 'brazil', 'argentina', 'colombia'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'USDC on Stellar; MXNB/BRL1 local tokens are on Arbitrum/Polygon, not Stellar',
            },
            'local-rails': { status: 'met', note: 'SPEI/PIX/PSE; ARS rails partial' },
            'competitive-rates': { status: 'unverified', note: 'Spreads not published' },
            'deep-liquidity': { status: 'met', note: 'One of LATAM’s largest exchanges' },
            'open-access': {
                status: 'partial',
                note: 'Self-serve API keys + staging confirmed live (conversions + USDC-on-Stellar withdrawal work); fiat pay-in (CLABE/SPEI/PIX) is permission-gated per market (403 until activated)',
            },
            'accurate-docs': { status: 'met', note: 'Comprehensive public docs portal' },
            'high-fidelity-sandbox': {
                status: 'met',
                note: 'Confirmed live: a staging USDC withdrawal (xlm_sac) delivers real Stellar testnet USDC on-chain',
            },
            'agent-buildable': {
                status: 'met',
                note: 'OpenAPI + llms.txt (explicit AI-agent index)',
            },
            'fee-discoverability': {
                status: 'met',
                note: 'Conversion quote returns fee_amount/fee_percentage; withdrawal_methods lists per-method fees (confirmed live)',
            },
        }),
    },
    yellowcard: {
        id: 'yellowcard',
        name: 'Yellow Card',
        description:
            'Pan-African ramp. USDC on Stellar is live in its B2B API (custodial REST + hosted MCP, not a SEP anchor). Kenya served via M-Pesa; Ghana not yet served.',
        website: 'https://yellowcard.io',
        tokens: ['USDC', 'USDT'],
        rails: ['mpesa', 'mobile-money'],
        regions: ['kenya', 'ghana'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'USD stablecoins only; no KES/GHS token on Stellar',
            },
            'local-rails': {
                status: 'partial',
                note: 'Kenya (M-Pesa) live; Ghana/GHS not yet served',
            },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': {
                status: 'partial',
                note: 'Licensed pan-African ramp; depth not disclosed',
            },
            'open-access': {
                status: 'failed',
                note: 'Discovery call + KYB + signed legal agreement required before API keys',
            },
            'accurate-docs': { status: 'met', note: 'Public docs + OpenAPI + llms.txt' },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'Sandbox is mocked; Stellar excluded from sim addresses, no real testnet result',
            },
            'agent-buildable': {
                status: 'met',
                note: 'Hosted MCP server + llms.txt + OpenAPI + error codes',
            },
        }),
    },
    fonbnk: {
        id: 'fonbnk',
        name: 'Fonbnk',
        description:
            'African airtime/mobile-money ⇄ crypto ramp. USDC on Stellar is live (on/off-ramp) with self-serve API access and mobile-money rails in Kenya and Ghana. Proprietary REST/widget, not a SEP anchor.',
        website: 'https://fonbnk.com',
        tokens: ['USDC'],
        rails: ['mpesa', 'mobile-money', 'airtime'],
        regions: ['kenya', 'ghana'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'Stellar asset is USDC; cKES/cGHS local stablecoins are on Celo, not Stellar',
            },
            'local-rails': { status: 'met', note: 'Mobile money + airtime, Kenya and Ghana' },
            'competitive-rates': {
                status: 'unverified',
                note: 'Mobile-money ramps typically 1–4%; API rate unconfirmed',
            },
            'deep-liquidity': { status: 'unverified' },
            'open-access': {
                status: 'met',
                note: 'Self-serve sandbox registration; clientId/secret from dashboard',
            },
            'accurate-docs': {
                status: 'met',
                note: 'Public versioned GitBook docs + HMAC signing guide',
            },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'Pay Widget sandbox rejects STELLAR/USDC ("blockchain asset not available"); USDC works on other chains (e.g. Ethereum), so no Stellar on-ramp today',
            },
            'agent-buildable': {
                status: 'partial',
                note: 'llms.txt + REST docs, but no OpenAPI/MCP and not SEP-standard',
            },
            'fee-discoverability': {
                status: 'met',
                note: 'v2 price/quote API returns fees',
            },
        }),
    },
    bilira: {
        id: 'bilira',
        name: 'BiLira',
        description:
            'Issuer of TRYB, a TRY-pegged stablecoin (the rare genuine local asset). TRYB is live on EVM/Solana but NOT on Stellar yet — Stellar support is "in the works" per BD, unconfirmed publicly.',
        website: 'https://bilira.co',
        tokens: ['TRYB'],
        rails: ['bank-transfer'],
        regions: ['turkiye'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'TRYB is TRY-pegged but not on Stellar (EVM/Solana); Stellar issuance in the works, unconfirmed',
            },
            'local-rails': {
                status: 'met',
                note: 'TRY↔TRYB via Turkish bank accounts; BiLira Direct ramp',
            },
            'competitive-rates': { status: 'unverified' },
            'deep-liquidity': {
                status: 'partial',
                note: 'TRYB liquidity thin/fragmented; none on Stellar',
            },
            'open-access': {
                status: 'failed',
                note: 'Partner/contact-only; no public self-serve ramp API',
            },
            'accurate-docs': {
                status: 'failed',
                note: 'No public developer docs/API reference found',
            },
            'high-fidelity-sandbox': { status: 'failed', note: 'No sandbox found' },
            'agent-buildable': {
                status: 'failed',
                note: 'No OpenAPI/SEP; token issuer + exchange, not an anchor',
            },
        }),
    },
    onafriq: {
        id: 'onafriq',
        name: 'Onafriq',
        description:
            'Pan-African mobile-money aggregator (ex-MFS Africa) with deep KES/GHS rails. No Stellar support today — USDC pilots (Circle/Conduit) are backend settlement on unnamed chains. Access is enterprise/contract-only.',
        website: 'https://onafriq.com',
        tokens: ['USDC'],
        rails: ['mpesa', 'mobile-money'],
        regions: ['kenya', 'ghana'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'No KES/GHS token on Stellar; USDC pilots not Stellar-confirmed',
            },
            'local-rails': {
                status: 'met',
                note: 'Mobile money + bank across KE/GH; very deep reach',
            },
            'competitive-rates': { status: 'unverified', note: 'Per-contract pricing' },
            'deep-liquidity': { status: 'met', note: 'Largest African payments network' },
            'open-access': {
                status: 'failed',
                note: 'Enterprise/contract-led onboarding; no self-serve',
            },
            'accurate-docs': {
                status: 'partial',
                note: 'Developer portal exists but credential-gated',
            },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'No Stellar integration; no on-chain testnet path',
            },
            'agent-buildable': { status: 'unverified', note: 'No public OpenAPI/SEP found' },
        }),
    },
    flutterwave: {
        id: 'flutterwave',
        name: 'Flutterwave',
        description:
            'Major African PSP with excellent self-serve fiat developer DX and strong M-Pesa/Ghana MoMo rails — but no Stellar leg (used Stellar in 2021, pivoted to Polygon in 2025). A fiat-rail partner, not a Stellar ramp.',
        website: 'https://flutterwave.com',
        tokens: ['USDC'],
        rails: ['mpesa', 'mobile-money'],
        regions: ['kenya', 'ghana'],
        vetting: true,
        scorecard: makeCriteria({
            'local-asset': {
                status: 'failed',
                note: 'No KES/GHS token on Stellar; stablecoin roadmap is Polygon',
            },
            'local-rails': { status: 'met', note: 'M-Pesa (KE) + Ghana mobile money, first-class' },
            'competitive-rates': {
                status: 'failed',
                note: '%-level PSP fees (2–3%), far above the <25 bps bar',
            },
            'deep-liquidity': {
                status: 'partial',
                note: 'Large fiat float; not Stellar on-chain liquidity',
            },
            'open-access': {
                status: 'met',
                note: 'Self-serve signup + instant test/live API keys',
            },
            'accurate-docs': { status: 'met', note: 'Public, well-maintained docs (v3/v4)' },
            'high-fidelity-sandbox': {
                status: 'failed',
                note: 'Rich fiat sandbox but no Stellar leg — no on-chain testnet result possible',
            },
            'agent-buildable': { status: 'met', note: 'OpenAPI + llms.txt; diagnosable errors' },
        }),
    },
};

export function getHonorableMentionsForRegion(regionId: string): HonorableMention[] {
    return Object.values(HONORABLE_MENTIONS).filter((hm) => hm.regions.includes(regionId));
}

export function getAllHonorableMentions(): HonorableMention[] {
    return Object.values(HONORABLE_MENTIONS);
}
