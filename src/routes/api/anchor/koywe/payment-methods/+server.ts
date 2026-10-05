/**
 * Koywe payment-methods (rails) endpoint.
 * GET: list selectable payment providers for a fiat currency.
 *   query: ?symbol=ARS
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '#lib/server/koyweInstance.ts';
import { KoyweError } from '#lib/anchors/koywe/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const symbol = url.searchParams.get('symbol');
    if (!symbol) {
        throw error(400, 'symbol query parameter is required');
    }
    try {
        const methods = await getKoywe().getPaymentProviders(symbol);
        return Response.json(methods);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
