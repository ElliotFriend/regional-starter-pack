/**
 * Chipper rate endpoint.
 * GET ?origin=GHS&destination=USDC → { rate } (destination units per origin unit).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';

export const GET: RequestHandler = async ({ url }) => {
    const origin = url.searchParams.get('origin');
    const destination = url.searchParams.get('destination');
    if (!origin || !destination) {
        throw error(400, { message: 'origin and destination are required' });
    }
    try {
        return json({ rate: await getChipper().getRate(origin, destination) });
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
