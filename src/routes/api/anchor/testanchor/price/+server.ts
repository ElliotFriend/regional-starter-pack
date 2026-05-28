/**
 * Test anchor SEP-38 price endpoint.
 * POST body Sep38PriceRequest → Sep38PriceResponse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTestAnchor } from '$lib/server/testanchorInstance';
import { TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';
import type { Sep38PriceRequest } from '$lib/anchors/sep/types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = (await request.json()) as Sep38PriceRequest;
        return json(await getTestAnchor().getPrice(body));
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
