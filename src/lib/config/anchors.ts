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
                text: 'Support for PIX ramping in Brazil is currently Sandbox only, and not documented all that well. The Etherfuse API is baseline working for this, but is a bit of a work-in-progress still.',
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
    coins: {
        id: 'coins',
        name: 'Coins.ph',
        description:
            'Coins.ph is the leading crypto on/off-ramp in the Philippines. It hosts the entire buy/sell flow in a widget (login, KYC/MFA, payment), reached via a signed URL — wired here as an interactive (SEP-24-style) anchor for PHP → USDC on Stellar.',
        logo: '/anchor-logos/coins.png',
        links: {
            website: 'https://coins.ph',
            documentation: 'https://docs.coins.ph/rest-api',
            'ramp SDK': 'https://www.npmjs.com/package/@coinsph/ramp-sdk',
        },
        knownIssues: [
            {
                text: 'Stellar is not listed among the networks in the Coins.ph ramp docs we have (which show EVM chains and Solana); USDC-on-Stellar support is assumed pending confirmation against their sandbox.',
            },
            {
                text: 'Coins.ph currently offers USDC/USDT (USD-pegged) rather than a PHP-denominated Stellar asset, so it does not yet meet the "locally denominated asset" quality criterion. Listed as curated provisionally; revisit if a PHP-denominated asset becomes available.',
            },
            {
                text: 'Launch-only for now: the hosted widget creates the order after the user logs in, so no order id is returned at launch. Server-side status polling (via the order-detail/callback API) is a follow-up; completion is confirmed out-of-band (Coins.ph email).',
            },
            {
                text: 'Off-ramp (USDC → PHP) is not yet implemented — the consumer withdrawal model needs confirmation against the sandbox.',
            },
        ],
        regions: {
            philippines: {
                onRamp: true,
                offRamp: false,
                paymentRails: ['instapay', 'pesonet', 'gcash', 'maya'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
        devOnboarding: [
            {
                text: 'Request merchant credentials (API key, secret key, merchant ID) and sandbox access from Coins.ph.',
                link: 'https://docs.coins.ph/rest-api',
            },
            {
                text: 'Set COINS_API_KEY, COINS_SECRET_KEY, COINS_MERCHANT_ID, and COINS_WIDGET_BASE_URL in your environment.',
            },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Connect Wallet',
                    description: 'Connect Freighter; the wallet address is the USDC destination.',
                },
                {
                    title: 'Start Hosted Session',
                    description:
                        'The server builds a signed Coins.ph widget URL for the buy (on-ramp) flow.',
                },
                {
                    title: 'Complete in Hosted Widget',
                    description:
                        'The user logs in, completes KYC/MFA, pays via a local rail, and confirms — all inside the Coins.ph widget.',
                },
                {
                    title: 'Receive USDC',
                    description:
                        "Coins.ph settles and delivers USDC to the user's Stellar wallet. Completion is confirmed out-of-band for now.",
                },
            ],
            offRamp: [
                {
                    title: 'Not yet available',
                    description:
                        'Off-ramp (USDC → PHP) is planned; the consumer withdrawal model needs confirmation against the Coins.ph sandbox.',
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
