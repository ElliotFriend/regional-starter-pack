/**
 * Koywe payment-methods (rails) endpoint.
 * GET: list selectable payment providers for a fiat currency.
 *   query: ?symbol=ARS
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const GET: RequestHandler = async ({ url }) => {
    const symbol = url.searchParams.get('symbol');
    if (!symbol) {
        throw error(400, { message: 'symbol query parameter is required' });
    }
    try {
        const methods = await getKoywe().getPaymentProviders(symbol);
        return json(methods);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
