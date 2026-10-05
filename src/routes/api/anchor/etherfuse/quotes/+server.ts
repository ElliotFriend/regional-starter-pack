/**
 * Etherfuse Quote endpoint.
 * POST: request a price quote between fiat and a token.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.fromAsset || !body.toAsset || !body.sourceAmount) {
            throw error(400, 'fromAsset, toAsset, and sourceAmount are required');
        }
        const quote = await getEtherfuse().getQuote({
            fromAsset: body.fromAsset,
            toAsset: body.toAsset,
            sourceAmount: body.sourceAmount,
            customerId: body.customerId,
            stellarAddress: body.stellarAddress,
        });
        return Response.json(quote, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
