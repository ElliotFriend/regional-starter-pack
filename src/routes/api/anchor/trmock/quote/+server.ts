/**
 * TR Mock Anchor SEP-38 firm-quote endpoint. Requires
 * `Authorization: Bearer <sep10-token>`.
 *
 * POST body { direction: 'onramp' | 'offramp', amount } → Sep38QuoteResponse
 *
 * The route composes the asset pair so the browser never has to know the
 * anchor's asset-identifier quirks.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock, requireBearer, fail } from '$lib/server/trmockInstance';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const token = requireBearer(request);
        const { direction, amount } = (await request.json()) as {
            direction?: 'onramp' | 'offramp';
            amount?: string;
        };
        if (!amount) throw error(400, { message: 'amount is required' });
        if (direction !== 'onramp' && direction !== 'offramp') {
            throw error(400, { message: "direction must be 'onramp' or 'offramp'" });
        }

        const anchor = getTrMock();
        const quote = await anchor.createQuote(token, {
            sell_asset: direction === 'onramp' ? anchor.fiatAssetId() : anchor.sep38AssetId(),
            buy_asset: direction === 'onramp' ? anchor.sep38AssetId() : anchor.fiatAssetId(),
            sell_amount: amount,
            context: 'sep6',
        });
        return json(quote);
    } catch (err) {
        fail(err);
    }
};
