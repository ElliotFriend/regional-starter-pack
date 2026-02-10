import { getAllAnchors, getAllRegions } from '$lib/config/regions';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = () => {
    return {
        regions: getAllRegions(),
        anchors: getAllAnchors(),
    };
};
