/**
 * Region Configuration
 *
 * Defines supported geographic regions, their currencies, and payment rails.
 * Also provides cross-lookup helpers between regions and anchors.
 */

import type { PaymentRail } from '$lib/config/rails';
import { PAYMENT_RAILS } from '$lib/config/rails';
import { ANCHORS } from '$lib/config/anchors';
import type { AnchorProfile } from '$lib/config/anchors';

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

export const REGIONS: Record<string, Region> = {
    mexico: {
        id: 'mexico',
        name: 'Mexico',
        code: 'MX',
        currency: 'MXN',
        currencySymbol: '$',
        flag: '🇲🇽',
        description:
            'Mexico has a growing crypto ecosystem with SPEI providing fast, reliable bank transfers. Etherfuse ramps to CETES stablebonds and Koywe ramps Mexican pesos to USDC on Stellar over SPEI.',
        paymentRails: [PAYMENT_RAILS.spei],
        anchors: ['etherfuse', 'koywe'],
    },
    brazil: {
        id: 'brazil',
        name: 'Brazil',
        code: 'BR',
        currency: 'BRL',
        currencySymbol: 'R$',
        flag: '🇧🇷',
        description:
            'Brazil has a vibrant fintech ecosystem with PIX enabling instant payments 24/7. Locally denominated assets on Stellar enable low-cost on- and off-ramps with competitive FX rates.',
        paymentRails: [PAYMENT_RAILS.pix],
        anchors: ['etherfuse', 'manteca'],
    },
    argentina: {
        id: 'argentina',
        name: 'Argentina',
        code: 'AR',
        currency: 'ARS',
        currencySymbol: '$',
        flag: '🇦🇷',
        description:
            'Argentina pairs high stablecoin demand with instant CVU bank transfers. Koywe and Manteca ramp Argentine pesos to USDC on Stellar with local payment rails (CVU/CBU/alias, QR) and competitive FX.',
        paymentRails: [PAYMENT_RAILS.cvu, PAYMENT_RAILS.wirear, PAYMENT_RAILS.qri],
        anchors: ['koywe', 'manteca'],
    },
    colombia: {
        id: 'colombia',
        name: 'Colombia',
        code: 'CO',
        currency: 'COP',
        currencySymbol: '$',
        flag: '🇨🇴',
        description:
            "Colombia is rolling out Bre-B, the central bank's instant payment system. Manteca ramps Colombian pesos to USDC on Stellar over BRE-B, and Koywe ramps COP to USDC over PSE — both with competitive FX.",
        paymentRails: [PAYMENT_RAILS.breb, PAYMENT_RAILS.pse],
        anchors: ['manteca', 'koywe'],
    },
    testnet: {
        id: 'testnet',
        name: 'Testnet',
        code: 'US',
        currency: 'USD',
        currencySymbol: '$',
        flag: '🧪',
        description:
            'A synthetic region for the Stellar test anchor (testanchor.stellar.org). It exercises the full SEP integration surface — both the SEP-6 programmatic and SEP-24 interactive ramp flows — on the Stellar testnet, without real funds.',
        paymentRails: [PAYMENT_RAILS.bank],
        anchors: ['testanchor'],
    },
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getRegion(id: string): Region | undefined {
    return REGIONS[id];
}

export function getAllRegions(): Region[] {
    return Object.values(REGIONS);
}

export function getAnchorsForRegion(regionId: string): AnchorProfile[] {
    const region = getRegion(regionId);
    if (!region) return [];

    return region.anchors
        .map((anchorId) => ANCHORS[anchorId])
        .filter((a): a is AnchorProfile => a !== undefined);
}

export function getRegionsForAnchor(anchorId: string): Region[] {
    const anchor = ANCHORS[anchorId];
    if (!anchor) return [];

    return Object.keys(anchor.regions)
        .map((regionId) => REGIONS[regionId])
        .filter((r): r is Region => r !== undefined);
}
