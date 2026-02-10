import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getAnchorsForRegion, getRegion } from '$lib/config/regions';

/**
 * In SvelteKit, a `+page.ts` file exists to provide some kind of data to a
 * `+page.svelte` page. This data is available to the page, but __does not__
 * "trickle down" the directory structure at all.
 *
 * In this situation, we're using it to load and propagate information about all
 * the available anchors in the region the user has navigated to.
 *
 * {@link https://svelte.dev/docs/kit/routing#page-page.js | SvelteKit Docs}
 *
 * @returns currently available anchors in the selected region
 */
export const load: PageLoad = ({ params }) => {
    const regionId = params.region;
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
