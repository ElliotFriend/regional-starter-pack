/**
 * Region and Anchor Configuration
 *
 * This file defines the supported regions, anchors, and their capabilities.
 * Add new regions or anchors here to extend the application.
 */

export interface PaymentRail {
    id: string;
    name: string;
    description: string;
    type: 'bank_transfer' | 'card' | 'mobile_money' | 'other';
}

export interface Token {
    symbol: string;
    name: string;
    issuer?: string; // Stellar asset issuer, undefined for native XLM
    description: string;
}

export interface AnchorCapability {
    onRamp: boolean;
    offRamp: boolean;
    paymentRails: string[]; // IDs of supported payment rails
    tokens: string[]; // Symbols of supported tokens
    kycRequired: boolean;
    minAmount?: string;
    maxAmount?: string;
}

export interface Anchor {
    id: string;
    name: string;
    description: string;
    website: string;
    documentation: string;
    logo?: string;
    regions: Record<string, AnchorCapability>; // keyed by region ID
}

export interface Region {
    id: string;
    name: string;
    code: string; // ISO country code
    currency: string;
    currencySymbol: string;
    flag: string; // Emoji flag
    description: string;
    paymentRails: PaymentRail[];
    anchors: string[]; // IDs of anchors operating in this region
}

// =============================================================================
// Payment Rails
// =============================================================================

export const PAYMENT_RAILS: Record<string, PaymentRail> = {
    spei: {
        id: 'spei',
        name: 'SPEI',
        description:
            "Sistema de Pagos Electrónicos Interbancarios - Mexico's real-time payment system",
        type: 'bank_transfer',
    },
};

// =============================================================================
// Tokens
// =============================================================================

export const TOKENS: Record<string, Token> = {
    USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', // Circle USDC issuer on Stellar
        description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
    },
    XLM: {
        symbol: 'XLM',
        name: 'Stellar Lumens',
        description: 'The native token of the Stellar network',
    },
    CETES: {
        symbol: 'CETES',
        name: 'Etherfuse CETES',
        issuer: 'GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC',
        description: 'Etherfuse CETES, officially known as Mexican Federal Treasury Certificates, are Mexico\'s oldest short-term debt securities issued by the Ministry of Finance.'
    },
};

// =============================================================================
// Anchors
// =============================================================================

export const ANCHORS: Record<string, Anchor> = {
    alfredpay: {
        id: 'alfredpay',
        name: 'Alfred Pay',
        description:
            'Alfred Pay provides fiat on/off ramp services across Latin America, enabling seamless conversion between local currencies and digital assets on the Stellar network.',
        website: 'https://alfredpay.io',
        documentation: 'https://alfredpay.readme.io',
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
    etherfuse: {
        id: 'etherfuse',
        name: 'Etherfuse',
        description:
            'Etherfuse bridges traditional finance and decentralized finance, making financial systems more inclusive, transparent, and efficient for everyone.',
        website: 'https://www.etherfuse.com',
        documentation: 'https://docs.etherfuse.com',
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['CETES'],
                kycRequired: true,
            },
        },
    }
};

// =============================================================================
// Regions
// =============================================================================

export const REGIONS: Record<string, Region> = {
    mexico: {
        id: 'mexico',
        name: 'Mexico',
        code: 'MX',
        currency: 'MXN',
        currencySymbol: '$',
        flag: '',
        description:
            'Mexico has a growing crypto ecosystem with SPEI providing fast, reliable bank transfers. Multiple anchors support MXN to USDC conversion.',
        paymentRails: [PAYMENT_RAILS.spei],
        anchors: ['alfredpay', 'etherfuse'],
    },
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getRegion(id: string): Region | undefined {
    return REGIONS[id];
}

export function getAnchor(id: string): Anchor | undefined {
    return ANCHORS[id];
}

export function getRegionsForAnchor(anchorId: string): Region[] {
    const anchor = getAnchor(anchorId);
    if (!anchor) return [];

    return Object.keys(anchor.regions)
        .map((regionId) => REGIONS[regionId])
        .filter((r): r is Region => r !== undefined);
}

export function getAnchorsForRegion(regionId: string): Anchor[] {
    const region = getRegion(regionId);
    if (!region) return [];

    return region.anchors
        .map((anchorId) => ANCHORS[anchorId])
        .filter((a): a is Anchor => a !== undefined);
}

export function getPaymentRail(id: string): PaymentRail | undefined {
    return PAYMENT_RAILS[id];
}

export function getToken(symbol: string): Token | undefined {
    return TOKENS[symbol];
}

// Get all regions as an array (for listing)
export function getAllRegions(): Region[] {
    return Object.values(REGIONS);
}

// Get all anchors as an array (for listing)
export function getAllAnchors(): Anchor[] {
    return Object.values(ANCHORS);
}
