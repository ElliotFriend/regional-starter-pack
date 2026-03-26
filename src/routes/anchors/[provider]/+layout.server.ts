import type { LayoutServerLoad } from './$types';
import { getAnchor as getAnchorProfile } from '$lib/config/anchors';
import { getRegionsForAnchor, getRegion } from '$lib/config/regions';
import { getAnchor as getAnchorInstance, isValidProvider } from '$lib/server/anchorFactory';
import { error } from '@sveltejs/kit';

/**
 * Server-side layout load for the per-provider pages.
 *
 * Reads UI metadata from config (AnchorProfile) and runtime metadata
 * (capabilities, tokens, rails) from the anchor client instance.
 *
 * Providers that are registered in the factory but not in config (e.g. testanchor)
 * get a minimal inline profile so the route still works.
 */
export const load: LayoutServerLoad = ({ params }) => {
    const anchorId = params.provider;
    if (!isValidProvider(anchorId)) {
        error(404, { message: `Anchor not found: ${anchorId}` });
    }

    const instance = getAnchorInstance(anchorId);
    const profile = getAnchorProfile(anchorId);

    // For providers not in config (e.g. testanchor), create a minimal profile
    const anchor = profile ?? {
        id: anchorId,
        name: instance.displayName,
        description: '',
        links: {},
        regions: {},
    };

    const firstRegionId = Object.keys(anchor.regions)[0];
    const region = firstRegionId ? getRegion(firstRegionId) : undefined;
    const fiatCurrency = region?.currency ?? instance.supportedCurrencies[0] ?? 'USD';
    const firstRegionCap = firstRegionId ? anchor.regions[firstRegionId] : undefined;
    const primaryToken = firstRegionCap?.tokens[0] ?? instance.supportedTokens[0]?.symbol ?? 'USDC';

    return {
        anchor,
        displayName: instance.displayName,
        capabilities: instance.capabilities,
        supportedTokens: [...instance.supportedTokens],
        supportedRails: [...instance.supportedRails],
        regions: getRegionsForAnchor(anchorId),
        fiatCurrency,
        primaryToken,
        sepDomain: instance.sepDomain,
    };
};
