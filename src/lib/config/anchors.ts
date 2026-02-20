/**
 * Anchor Profile Configuration
 *
 * Defines anchor provider profiles and their regional capabilities.
 * The `AnchorProfile` type is the config-side representation — distinct from
 * the runtime `Anchor` interface in `$lib/anchors/types.ts`.
 */

import type { AnchorCapabilities } from '$lib/anchors/types';

export interface AnchorCapability {
    onRamp: boolean;
    offRamp: boolean;
    paymentRails: string[]; // IDs of supported payment rails
    tokens: string[]; // Symbols of supported tokens
    kycRequired: boolean;
    minAmount?: string;
    maxAmount?: string;
}

export interface IntegrationStep {
    title: string;
    description: string;
}

export interface IntegrationFlow {
    onRamp: IntegrationStep[];
    offRamp: IntegrationStep[];
}

export interface AnchorProfile {
    id: string;
    name: string;
    description: string;
    links: Record<string, string>;
    logo?: string;
    capabilities: AnchorCapabilities;
    regions: Record<string, AnchorCapability>; // keyed by region ID
    integrationFlow?: IntegrationFlow;
}

export const ANCHORS: Record<string, AnchorProfile> = {
    etherfuse: {
        id: 'etherfuse',
        name: 'Etherfuse',
        description:
            'Etherfuse bridges traditional finance and decentralized finance, making financial systems more inclusive, transparent, and efficient for everyone.',
        links: {
            website: 'https://www.etherfuse.com',
            documentation: 'https://docs.etherfuse.com',
            'sandbox app': 'https://devnet.etherfuse.com',
        },
        capabilities: {
            kycUrl: true,
            requiresOffRampSigning: true,
            kycFlow: 'iframe',
            deferredOffRampSigning: true,
            sandbox: true,
            displayName: 'Etherfuse',
        },
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['CETES'],
                kycRequired: true,
            },
        },
        integrationFlow: {
            onRamp: [
                {
                    title: 'Create Customer',
                    description: 'Register the user and receive a KYC onboarding URL.',
                },
                {
                    title: 'Complete KYC via Iframe',
                    description:
                        'Embed the onboarding URL in an iframe for identity verification.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the MXN to CETES conversion.',
                },
                {
                    title: 'Create On-Ramp Order',
                    description: 'Submit the order and receive SPEI payment instructions.',
                },
                {
                    title: 'Transfer Fiat via Bank',
                    description:
                        'The user sends MXN via SPEI using the provided payment details.',
                },
                {
                    title: 'Receive Tokens',
                    description:
                        'The anchor delivers CETES tokens to the user\'s Stellar wallet.',
                },
            ],
            offRamp: [
                {
                    title: 'Create Customer + KYC',
                    description: 'Register and complete identity verification via iframe.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the CETES to MXN conversion.',
                },
                {
                    title: 'Create Off-Ramp Order',
                    description: 'Submit the off-ramp order to the anchor.',
                },
                {
                    title: 'Poll for Signable Transaction',
                    description:
                        'Wait for the burn transaction XDR to appear via polling.',
                },
                {
                    title: 'Sign with Freighter',
                    description:
                        'Sign the burn transaction in Freighter and submit to Stellar.',
                },
                {
                    title: 'Receive Fiat',
                    description: 'The anchor sends MXN to the user\'s bank via SPEI.',
                },
            ],
        },
    },
    alfredpay: {
        id: 'alfredpay',
        name: 'Alfred Pay',
        description:
            'Alfred Pay provides fiat on/off ramp services across Latin America, enabling seamless conversion between local currencies and digital assets on the Stellar network.',
        links: {
            website: 'https://alfredpay.io',
            documentation: 'https://alfredpay.readme.io',
        },
        capabilities: {
            emailLookup: true,
            kycUrl: true,
            kycFlow: 'form',
            sandbox: true,
            displayName: 'Alfred Pay',
        },
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['USDC'],
                kycRequired: true,
            },
        },
        integrationFlow: {
            onRamp: [
                {
                    title: 'Create Customer',
                    description:
                        'Register a new customer or look up an existing one by email.',
                },
                {
                    title: 'Submit KYC Form',
                    description: 'Collect and submit identity data via a form.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the MXN to USDC conversion.',
                },
                {
                    title: 'Create On-Ramp Order',
                    description: 'Submit the order and receive SPEI payment instructions.',
                },
                {
                    title: 'Transfer Fiat via Bank',
                    description:
                        'The user sends MXN via SPEI using the provided payment details.',
                },
                {
                    title: 'Receive USDC',
                    description:
                        'The anchor delivers USDC to the user\'s Stellar wallet.',
                },
            ],
            offRamp: [
                {
                    title: 'Create Customer + KYC',
                    description: 'Register and submit identity data via form.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the USDC to MXN conversion.',
                },
                {
                    title: 'Create Off-Ramp Order',
                    description: 'Submit the off-ramp order to the anchor.',
                },
                {
                    title: 'Build Payment Transaction',
                    description:
                        'Build a USDC payment transaction to the anchor\'s Stellar address.',
                },
                {
                    title: 'Sign and Submit',
                    description:
                        'Sign with Freighter and submit the transaction to the Stellar network.',
                },
                {
                    title: 'Receive Fiat',
                    description: 'The anchor sends MXN to the user\'s bank via SPEI.',
                },
            ],
        },
    },
    blindpay: {
        id: 'blindpay',
        name: 'BlindPay',
        description:
            'BlindPay is a global payment infrastructure that enables worldwide money transfers using both traditional fiat currencies and stablecoins.',
        links: {
            website: 'https://blindpay.com',
            documentation: 'https://docs.blindpay.com',
            dashboard: 'https://app.blindpay.com',
        },
        capabilities: {
            kycUrl: true,
            requiresTos: true,
            requiresOffRampSigning: true,
            kycFlow: 'redirect',
            requiresBankBeforeQuote: true,
            requiresBlockchainWalletRegistration: true,
            requiresAnchorPayoutSubmission: true,
            compositeQuoteCustomerId: true,
            sandbox: true,
            displayName: 'BlindPay',
        },
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['USDB'],
                kycRequired: true,
            },
        },
        integrationFlow: {
            onRamp: [
                {
                    title: 'Accept Terms of Service',
                    description: 'The user must accept the anchor\'s Terms of Service.',
                },
                {
                    title: 'Create Receiver + KYC',
                    description:
                        'Register a receiver and complete KYC via redirect.',
                },
                {
                    title: 'Register Blockchain Wallet',
                    description:
                        'Register the user\'s Stellar wallet address with the anchor.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the MXN to USDB conversion.',
                },
                {
                    title: 'Create Payin Order',
                    description: 'Submit the order and receive SPEI payment instructions.',
                },
                {
                    title: 'Transfer Fiat via Bank',
                    description:
                        'The user sends MXN via SPEI using the provided payment details.',
                },
                {
                    title: 'Receive USDB',
                    description:
                        'The anchor delivers USDB to the user\'s Stellar wallet.',
                },
            ],
            offRamp: [
                {
                    title: 'Accept Terms of Service',
                    description: 'The user must accept the anchor\'s Terms of Service.',
                },
                {
                    title: 'Create Receiver + KYC',
                    description:
                        'Register a receiver and complete KYC via redirect.',
                },
                {
                    title: 'Register Bank Account',
                    description:
                        'Register the user\'s bank account details with the anchor.',
                },
                {
                    title: 'Get Quote',
                    description: 'Request a quote for the USDB to MXN conversion.',
                },
                {
                    title: 'Create Payout Quote',
                    description: 'Create a payout quote with the anchor.',
                },
                {
                    title: 'Submit Payout',
                    description:
                        'Submit the payout to the anchor, which collects tokens and sends fiat via SPEI.',
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
