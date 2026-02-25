import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
    const { direction } = params;

    if (direction !== 'onramp' && direction !== 'offramp') {
        error(404, { message: `Invalid direction for anchor: ${direction}` });
    }

    return {
        direction,
    };
};
