import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
    const { direction } = params;

    if (direction !== 'onramp' && direction !== 'offramp') {
        error(404, { message: `Invalid direction for anchor: ${direction}` });
    }

    // Guard against directions the anchor doesn't support in the active region
    // (e.g. Coins.ph is on-ramp only), so on-ramp-only anchors don't expose a
    // broken off-ramp flow.
    const { anchor, activeRegionId } = await parent();
    const capability = activeRegionId ? anchor.regions[activeRegionId] : undefined;
    const supported = direction === 'onramp' ? capability?.onRamp : capability?.offRamp;
    if (!supported) {
        error(404, { message: `${anchor.name} does not support ${direction} in this region` });
    }

    return {
        direction,
    };
};
