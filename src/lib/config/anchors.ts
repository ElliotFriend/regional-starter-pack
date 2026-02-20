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

export interface AnchorProfile {
    id: string;
    name: string;
    description: string;
    website: string;
    documentation: string;
    logo?: string;
    capabilities: AnchorCapabilities;
    regions: Record<string, AnchorCapability>; // keyed by region ID
}

export const ANCHORS: Record<string, AnchorProfile> = {
    etherfuse: {
        id: 'etherfuse',
        name: 'Etherfuse',
        description:
            'Etherfuse bridges traditional finance and decentralized finance, making financial systems more inclusive, transparent, and efficient for everyone.',
        website: 'https://www.etherfuse.com',
        documentation: 'https://docs.etherfuse.com',
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
    },
    alfredpay: {
        id: 'alfredpay',
        name: 'Alfred Pay',
        description:
            'Alfred Pay provides fiat on/off ramp services across Latin America, enabling seamless conversion between local currencies and digital assets on the Stellar network.',
        website: 'https://alfredpay.io',
        documentation: 'https://alfredpay.readme.io',
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
    },
    blindpay: {
        id: 'blindpay',
        name: 'BlindPay',
        description:
            'BlindPay is a global payment infrastructure that enables worldwide money transfers using both traditional fiat currencies and stablecoins.',
        website: 'https://blindpay.com',
        documentation: 'https://docs.blindpay.com',
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
    },
};

export function getAnchor(id: string): AnchorProfile | undefined {
    return ANCHORS[id];
}

export function getAllAnchors(): AnchorProfile[] {
    return Object.values(ANCHORS);
}
