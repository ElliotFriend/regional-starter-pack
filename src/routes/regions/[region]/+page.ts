import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getAnchorsForRegion, getRegion } from '$lib/config/regions';

export const load: PageLoad = async ({ params }) => {
    const regionId = params.region;
    if (!regionId) {
        error(400, { message: 'Missing region' });
    }

    const region = getRegion(regionId);
    if (!region) {
        error(404, { message: `Region not found: ${regionId}` });
    }

    const anchors = getAnchorsForRegion(regionId);

    // Collect all unique tokens available in this region
    const tokens = new Set<string>();
    anchors.forEach((anchor) => {
        const capability = anchor.regions[regionId];
        if (capability) {
            capability.tokens.forEach((t) => tokens.add(t));
        }
    });

    return {
        region,
        anchors,
        tokens,
    };
};
