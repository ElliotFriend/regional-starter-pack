/**
 * Chipper capabilities endpoint.
 * GET ?country=GH|KE → mobile money collections, and mobile money + bank payouts.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';

export const GET: RequestHandler = async ({ url }) => {
    const country = url.searchParams.get('country');
    if (!country) throw error(400, { message: 'country is required' });
    try {
        return json(await getChipper().getCapabilities(country));
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
