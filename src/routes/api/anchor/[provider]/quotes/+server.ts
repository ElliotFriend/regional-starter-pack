/**
 * Quotes API endpoint
 * POST: Get a quote for currency exchange
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { fromCurrency, toCurrency, fromAmount, toAmount, customerId, stellarAddress } = body;

        if (!fromCurrency || !toCurrency) {
            throw error(400, { message: 'fromCurrency and toCurrency are required' });
        }

        if (!fromAmount && !toAmount) {
            throw error(400, { message: 'Either fromAmount or toAmount is required' });
        }

        const anchor = getAnchor(provider);
        const quote = await anchor.getQuote({
            fromCurrency,
            toCurrency,
            fromAmount,
            toAmount,
            customerId,
            stellarAddress,
        });

        return json(quote);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
