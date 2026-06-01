/**
 * Etherfuse Quote endpoint.
 * POST: request a price quote between fiat and a token.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.fromAsset || !body.toAsset || !body.sourceAmount) {
            throw error(400, {
                message: 'fromAsset, toAsset, and sourceAmount are required',
            });
        }
        const quote = await getEtherfuse().getQuote({
            fromAsset: body.fromAsset,
            toAsset: body.toAsset,
            sourceAmount: body.sourceAmount,
            customerId: body.customerId,
            stellarAddress: body.stellarAddress,
        });
        return json(quote, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
