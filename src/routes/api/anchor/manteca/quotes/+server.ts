/**
 * Manteca quotes endpoint.
 * GET: compose a normalized quote (price + fee). query: ?ramp=&asset=&against=
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const GET: RequestHandler = async ({ url }) => {
    const ramp = url.searchParams.get('ramp');
    const asset = url.searchParams.get('asset');
    const against = url.searchParams.get('against');
    if ((ramp !== 'onramp' && ramp !== 'offramp') || !asset || !against) {
        throw error(400, { message: 'ramp (onramp|offramp), asset and against are required' });
    }
    try {
        const quote = await getManteca().getQuote({ ramp, asset, against });
        return json(quote);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
