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
}

// =============================================================================
// Quality Criteria
// =============================================================================

export interface QualityCriterion {
    id: string;
    label: string;
    met: boolean;
    note?: string;
}

export const QUALITY_CRITERIA = [
    {
        id: 'local-asset',
        label: 'Locally denominated asset (stablecoin or stablebond) on Stellar',
    },
    { id: 'local-rails', label: 'Support for local payment rails connected to Stellar' },
    { id: 'competitive-rates', label: 'Competitive rates (wholesale <25 bps conversion)' },
    { id: 'open-access', label: 'Well-documented open access for application developers' },
    { id: 'deep-liquidity', label: 'Deep liquidity for low slippage (local <-> global assets)' },
] as const;

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
        links: {
            website: 'https://koywe.com',
            documentation: 'https://docs-crypto.koywe.com/en',
        },
        knownIssues: [
            {
                text: 'Koywe does not return a Stellar issuer for USDC (it is network-dependent), so the integration injects PUBLIC_USDC_ISSUER for the active network.',
            },
            {
                text: 'The hosted KYC widget URL endpoint is unconfirmed in the sandbox — the client surfaces a clear "not implemented" state until it is wired up. Complete KYC for the test user via the Koywe dashboard.',
            },
            {
                text: 'In the sandbox only the Khipu rail reaches DELIVERED (via its test pay page); WIREAR and QRI orders stay in WAITING because there is no fiat-received simulation API.',
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
        logo: '/anchor-logos/manteca.png',
        links: {
            website: 'https://manteca.dev',
            documentation: 'https://developers.manteca.dev',
            'api reference': 'https://developers.manteca.dev/llms.txt',
        },
        knownIssues: [
            {
                text: "This integration was built entirely from Manteca's published API reference (developers.manteca.dev) and has NOT been verified against a live sandbox — sandbox API keys are not self-serve and require contacting Manteca sales. Request/response shapes, the onboarding action sequence, and the ramp lifecycle are modeled from docs and may diverge from runtime behavior.",
                link: 'https://developers.manteca.dev/docs/authentication',
            },
            {
                text: 'Competitive-rate qualification (<25 bps) is unverified: Manteca publishes no spread figures. Crypto ramp economics come from the price endpoint (nominal buy/sell vs effective buy/sell), NOT the /broker/v1 fee endpoint (that belongs to a separate Argentine securities product). The USDC_BRL effective spread must be read from a live sandbox before treating the rate criterion as met.',
            },
            {
                text: 'Stellar deposit addressing is assumed to be per-user (Manteca returns a unique `STELLAR` address in the user record, with no memo/tag field documented). This needs live confirmation — if Manteca ever uses a pooled Stellar address, a memo would be required and missing it would lose funds on off-ramp.',
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
    criteria: QualityCriterion[];
}

function makeCriteria(
    overrides: Partial<Record<string, { met: boolean; note?: string }>>,
): QualityCriterion[] {
    return QUALITY_CRITERIA.map((c) => ({
        id: c.id,
        label: c.label,
        met: overrides[c.id]?.met ?? false,
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
        criteria: makeCriteria({
            'local-asset': { met: false, note: 'USDC only — no locally denominated asset' },
            'local-rails': { met: true },
            'competitive-rates': { met: false, note: 'USD-intermediated conversion adds cost' },
            'open-access': { met: true },
            'deep-liquidity': {
                met: false,
                note: 'USDC has global liquidity but no local-currency depth',
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
        criteria: makeCriteria({
            'local-asset': { met: false, note: 'USDB is a USD-pegged test token' },
            'local-rails': { met: true },
            'competitive-rates': { met: false },
            'open-access': { met: true },
            'deep-liquidity': { met: false, note: 'USDB has minimal on-chain liquidity' },
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
        criteria: makeCriteria({
            'local-asset': { met: false, note: 'USDC only — no locally denominated asset' },
            'local-rails': { met: true },
            'competitive-rates': { met: false, note: 'USD-intermediated conversion adds cost' },
            'open-access': { met: true },
            'deep-liquidity': {
                met: false,
                note: 'USDC has global liquidity but no local-currency depth',
            },
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
        criteria: makeCriteria({
            'local-asset': {
                met: false,
                note: 'BRZ is locally denominated but does not meet all criteria',
            },
            'local-rails': { met: true },
            'competitive-rates': { met: false },
            'open-access': {
                met: false,
                note: 'Sandbox requires contacting support for credentials',
            },
            'deep-liquidity': { met: false, note: 'Limited on-chain BRZ liquidity' },
        }),
    },
};

export function getHonorableMentionsForRegion(regionId: string): HonorableMention[] {
    return Object.values(HONORABLE_MENTIONS).filter((hm) => hm.regions.includes(regionId));
}

export function getAllHonorableMentions(): HonorableMention[] {
    return Object.values(HONORABLE_MENTIONS);
}
