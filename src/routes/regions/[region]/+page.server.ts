import type { PageServerLoad } from './$types';
import { getAnchorsForRegion, getRegion } from '$lib/config/regions';
import { getHonorableMentionsForRegion } from '$lib/config/anchors';
import { getAnchor as getAnchorInstance, isValidProvider } from '$lib/server/anchorFactory';
import { error } from '@sveltejs/kit';
import type { TokenInfo } from '$lib/anchors/types';

/**
 * Server-side page load for the per-region page.
 *
 * Aggregates token info from anchor client instances so the page can
 * display full token metadata (symbol, name, description) without
 * importing from config/tokens.
 */
export const load: PageServerLoad = ({ params }) => {
    const regionId = params.region;
    const region = getRegion(regionId);
    if (!region) error(404, { message: `Region not found: ${regionId}` });

    const profiles = getAnchorsForRegion(regionId);
    const tokenMap = new Map<string, TokenInfo>();
    for (const p of profiles) {
        if (!isValidProvider(p.id)) continue;
        const regionTokens = new Set(p.regions[regionId]?.tokens ?? []);
        for (const t of getAnchorInstance(p.id).supportedTokens) {
            if (regionTokens.has(t.symbol)) tokenMap.set(t.symbol, t);
        }
    }

    const honorableMentions = getHonorableMentionsForRegion(regionId);

    return {
        region,
        anchors: profiles,
        tokens: Array.from(tokenMap.values()),
        honorableMentions,
    };
};
