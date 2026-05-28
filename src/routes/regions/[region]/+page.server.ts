import type { PageServerLoad } from './$types';
import { getAnchorsForRegion, getRegion } from '$lib/config/regions';
import { getHonorableMentionsForRegion } from '$lib/config/anchors';
import { error } from '@sveltejs/kit';

/**
 * Server-side page load for the per-region page.
 *
 * Pure-config: returns the region definition, the curated anchor profiles that
 * serve it, and the honorable-mention providers. No runtime anchor client
 * lookup — the page itself reads token symbols straight from the profile's
 * region capability.
 */
export const load: PageServerLoad = ({ params }) => {
    const regionId = params.region;
    const region = getRegion(regionId);
    if (!region) error(404, { message: `Region not found: ${regionId}` });

    return {
        region,
        anchors: getAnchorsForRegion(regionId),
        honorableMentions: getHonorableMentionsForRegion(regionId),
    };
};
