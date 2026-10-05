/**
 * Chipper capabilities endpoint.
 * GET ?country=GH|KE → mobile money collections, and mobile money + bank payouts.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '#lib/server/chipperInstance.ts';
import { ChipperError } from '#lib/anchors/chipper/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const country = url.searchParams.get('country');
    if (!country) throw error(400, 'country is required');
    try {
        return Response.json(await getChipper().getCapabilities(country));
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, err.message);
        throw err;
    }
};
