/**
 * Koywe on-ramp endpoint.
 * POST: create an on-ramp order (fiat → USDC) from an executable quote.
 *   body: { quoteId, stellarAddress, email?, documentNumber?, callbackUrl?, externalId? }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.quoteId || !body.stellarAddress) {
            throw error(400, { message: 'quoteId and stellarAddress are required' });
        }
        const order = await getKoywe().createOnRampOrder({
            quoteId: body.quoteId,
            stellarAddress: body.stellarAddress,
            email: body.email,
            documentNumber: body.documentNumber,
            callbackUrl: body.callbackUrl,
            externalId: body.externalId,
        });
        return json(order, { status: 201 });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
