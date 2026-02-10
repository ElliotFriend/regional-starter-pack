import { getAllAnchors, getAllRegions } from '$lib/config/regions';
import type { LayoutLoad } from './$types';

/**
 * In SvelteKit, a `+layout.ts` file exists to provide some kind of data to a
 * `+layout.svelte` page. This data then "trickles down" and is available to the
 * layout's corresponding `+page.svelte` file, and any layout/page files
 * underneath this one in the directory structure.
 *
 * In this situation, we're using it to load and propagate information about all
 * the available regions and anchors.
 *
 * {@link https://svelte.dev/docs/kit/routing#layout-layout.js | SvelteKit Docs}
 *
 * @returns currently available regions and anchors
 */
export const load: LayoutLoad = () => {
    return {
        regions: getAllRegions(),
        anchors: getAllAnchors(),
    };
};
