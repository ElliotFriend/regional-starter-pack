import type { LayoutLoad } from './$types';
import { getAnchor, getRegionsForAnchor } from '$lib/config/regions';
import { error } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ params }) => {
    const providerId = params.provider;
    if (!providerId) {
        error(400, { message: 'Missing anchor' });
    }

    const anchor = getAnchor(providerId);
    if (!anchor) {
        error(404, { message: `Anchor not found: ${providerId}` });
    }

    const tokens = new Set<string>();
    Object.values(anchor.regions).forEach((cap) => {
        cap.tokens.forEach((t) => tokens.add(t));
    });

    return {
        anchor,
        regions: getRegionsForAnchor(providerId),
        tokens,
    };
};
