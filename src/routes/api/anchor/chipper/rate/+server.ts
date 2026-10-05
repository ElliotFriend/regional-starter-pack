/**
 * Chipper rate endpoint.
 * GET ?origin=GHS&destination=USDC → { rate } (destination units per origin unit).
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '#lib/server/chipperInstance.ts';
import { ChipperError } from '#lib/anchors/chipper/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const origin = url.searchParams.get('origin');
    const destination = url.searchParams.get('destination');
    if (!origin || !destination) {
        throw error(400, 'origin and destination are required');
    }
    try {
        return Response.json({ rate: await getChipper().getRate(origin, destination) });
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, err.message);
        throw err;
    }
};
