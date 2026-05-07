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
 * The active region is selected via the `?region=` query param when present
 * (e.g. linked from a region page). When absent, falls back to the first
 * region declared on the anchor profile — typically Mexico for Etherfuse.
 * Downstream components should treat the returned `fiatCurrency`,
 * `primaryToken`, and `activeRegion` as initial defaults that the user can
 * still override via the country dropdown on the registration step.
 */
export const load: LayoutServerLoad = ({ params, url }) => {
    const anchorId = params.provider;
    if (!isValidProvider(anchorId)) {
        error(404, { message: `Anchor not found: ${anchorId}` });
    }
    const profile = getAnchorProfile(anchorId);
    if (!profile) {
        error(404, { message: `Anchor not found: ${anchorId}` });
    }

    const instance = getAnchorInstance(anchorId);

    const requestedRegionId = url.searchParams.get('region');
    const supportedRegionIds = Object.keys(profile.regions);
    const activeRegionId =
        requestedRegionId && supportedRegionIds.includes(requestedRegionId)
            ? requestedRegionId
            : supportedRegionIds[0];

    const activeRegion = activeRegionId ? getRegion(activeRegionId) : undefined;
    const activeCapability = activeRegionId ? profile.regions[activeRegionId] : undefined;
    // No silent country/rail defaults — a missing capability for this anchor is
    // a config error worth surfacing downstream rather than masking with MX/SPEI.
    const fiatCurrency = activeRegion?.currency;
    const primaryToken = activeCapability?.tokens[0] ?? instance.supportedTokens[0]?.symbol;
    const paymentRail = activeCapability?.paymentRails[0];

    return {
        anchor: profile,
        displayName: instance.displayName,
        capabilities: instance.capabilities,
        supportedTokens: [...instance.supportedTokens],
        supportedRails: [...instance.supportedRails],
        regions: getRegionsForAnchor(anchorId),
        activeRegion,
        activeRegionId,
        fiatCurrency,
        primaryToken,
        paymentRail,
    };
};
