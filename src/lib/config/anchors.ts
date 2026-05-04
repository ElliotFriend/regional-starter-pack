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

import type { SandboxHours } from '$lib/utils/sandboxHours';

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

export interface DevNote {
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
    sandboxHours?: SandboxHours;
    /** Extra bullets appended to the "For Developers" box on the anchor page. */
    devNotes?: DevNote[];
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
    pdax: {
        id: 'pdax',
        name: 'PDAX',
        description:
            'PDAX (Philippine Digital Asset Exchange) is the Philippines’ first BSP-licensed virtual asset service provider, bridging PHP and digital assets for retail and institutional users.',
        logo: '/anchor-logos/pdax.png',
        links: {
            website: 'https://pdax.ph',
            documentation: 'https://doc.general.api.pdax.ph',
        },
        knownIssues: [
            {
                text: "USDC is the only digital asset PDAX supports for our flow — no PHP-denominated stablecoin or stablebond exists on Stellar yet. PDAX is included as the best available Philippines option despite not meeting the 'locally denominated asset' quality criterion that other curated anchors satisfy.",
            },
            {
                text: 'PDAX API documentation at doc.general.api.pdax.ph is currently password-gated. PDAX is evaluating whether they can open public access.',
            },
            {
                text: 'PDAX staging is only available 6:00am-10:00pm Philippine Standard Time (UTC+8), Monday through Friday, excluding Philippine holidays. Requests outside that window will fail; the badge next to the anchor name reflects the current open/closed status (the holiday calendar is not enforced).',
            },
        ],
        devNotes: [
            {
                text: 'Authentication uses email + password rather than an API key. Login returns a JWT pair (access_token + id_token) that must both be sent on every authenticated request, plus a refresh_token for renewal. MFA via OTP is optional.',
            },
            {
                text: 'PDAX is an institutional shared-account API: there are no endpoints to provision per-end-user accounts. End-user identity is passed per transaction through sender/beneficiary KYC fields on /fiat/deposit and /fiat/withdraw, correlated by a custom `identifier`.',
            },
            {
                text: 'PDAX delegates end-user KYC and account management to the integrator. This reference implementation collects identity via a form for the demo flow — production deployments need real KYC verification, customer record management, and applicable licensing (e.g., BSP VASP registration where applicable).',
            },
        ],
        regions: {
            philippines: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['instapay', 'pesonet'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
        sandboxHours: {
            timezone: 'Asia/Manila',
            days: [1, 2, 3, 4, 5],
            startHour: 6,
            endHour: 22,
            note: 'Mon-Fri, 6:00am-10:00pm Philippine Standard Time. Excludes Philippine holidays.',
        },
        devOnboarding: [
            {
                text: 'Apply for an institutional account with PDAX (BSP-licensed VASP onboarding required).',
                link: 'https://pdax.ph',
            },
            {
                text: 'Once approved, request API credentials from the PDAX team (email + password, used against the staging server first: stage.services.sandbox.pdax.ph).',
            },
            {
                text: 'Optionally register a webhook endpoint via POST /pdax-institution/v1/config/webhook to receive push notifications for fiat deposit/withdrawal status changes (crypto status changes still require polling).',
            },
        ],
        integrationFlow: {
            onRamp: [
                {
                    title: 'Authenticate',
                    description:
                        'POST /pdax-institution/v1/login with email + password. Receive an access_token + id_token JWT pair (and a refresh_token for renewal); both JWTs are sent on every subsequent request.',
                },
                {
                    title: 'Get a Firm Quote',
                    description:
                        'POST /pdax-institution/v1/trade/quote with side=buy, base_currency=PHP, quote_currency=USDCXLM, and the PHP amount. Receive a quote_id and expires_at.',
                },
                {
                    title: 'Initiate Fiat Deposit',
                    description:
                        "POST /pdax-institution/v1/fiat/deposit with the user's identity fields (sender + beneficiary), the chosen method (e.g. instapay_upay_cashin), and a unique identifier. Receive a payment_checkout_url.",
                },
                {
                    title: 'User Pays via Checkout URL',
                    description:
                        'The user is sent to the checkout URL to complete the PHP payment via their selected method (InstaPay/QRPh, GrabPay, or a DragonPay-supported bank/wallet).',
                },
                {
                    title: 'Detect Fiat Settlement',
                    description:
                        'Poll GET /pdax-institution/v1/fiat/transactions (filtered by identifier) for a fulfilled_at timestamp, or receive a webhook event if registered.',
                },
                {
                    title: 'Execute the Trade',
                    description:
                        'POST /pdax-institution/v1/trade with the quote_id and side=buy to convert PHP → USDCXLM at the locked rate. Order completes synchronously.',
                },
                {
                    title: "Withdraw USDC to User's Stellar Wallet",
                    description:
                        "POST /pdax-institution/v1/crypto/withdraw with currency=USDCXLM and the user's Stellar public key as the destination.",
                },
            ],
            offRamp: [
                {
                    title: 'Authenticate',
                    description: 'POST /pdax-institution/v1/login (same as the on-ramp flow).',
                },
                {
                    title: 'Get a Firm Quote',
                    description:
                        'POST /pdax-institution/v1/trade/quote with side=sell, base_currency=PHP, quote_currency=USDCXLM, and the USDC amount. Receive a quote_id and expires_at.',
                },
                {
                    title: "Get PDAX's USDC Deposit Address",
                    description:
                        'GET /pdax-institution/v1/crypto/deposit?currency=USDCXLM. Receive a Stellar address and (if applicable) a memo/tag the user must include on the payment.',
                },
                {
                    title: 'Sign and Submit USDC Payment with Freighter',
                    description:
                        'The user signs a Stellar payment to the deposit address (with the memo) and submits it to the network.',
                },
                {
                    title: 'Detect Crypto Settlement',
                    description:
                        'Poll GET /pdax-institution/v1/crypto/transactions (filtered by identifier) for a status of completed.',
                },
                {
                    title: 'Execute the Trade',
                    description:
                        'POST /pdax-institution/v1/trade with the quote_id and side=sell to convert USDCXLM → PHP.',
                },
                {
                    title: "Disburse PHP to User's Bank",
                    description:
                        "POST /pdax-institution/v1/fiat/withdraw with the user's beneficiary bank details, beneficiary_bank_code, fee_type, and method (PAY-TO-ACCOUNT-REAL-TIME for InstaPay or PAY-TO-ACCOUNT-NON-REAL-TIME for PESONet).",
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
