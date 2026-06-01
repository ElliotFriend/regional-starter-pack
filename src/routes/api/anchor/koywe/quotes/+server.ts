/**
 * Koywe quote endpoint.
 * POST: request an executable price quote between fiat (ARS) and USDC on Stellar.
 *   body: { ramp, fiatCurrency, amount, paymentMethodId? }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.ramp || !body.fiatCurrency || !body.amount) {
            throw error(400, { message: 'ramp, fiatCurrency, and amount are required' });
        }
        const quote = await getKoywe().getQuote({
            ramp: body.ramp,
            fiatCurrency: body.fiatCurrency,
            amount: body.amount,
            paymentMethodId: body.paymentMethodId,
        });
        return json(quote, { status: 201 });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
