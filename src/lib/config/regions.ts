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
        flag: '',
        description:
            'Mexico has a growing crypto ecosystem with SPEI providing fast, reliable bank transfers. Multiple anchors support MXN to USDC conversion.',
        paymentRails: [PAYMENT_RAILS.spei],
        anchors: ['etherfuse', 'alfredpay', 'blindpay'],
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
