/**
 * Koywe off-ramp endpoint.
 * POST: either create an off-ramp order (USDC → fiat) from a quote, or attach a
 * Stellar tx hash to an existing order.
 *   create:        { quoteId, bankAccountId, documentNumber? }
 *   submit txHash: { action: 'submitTxHash', orderId, txHash }
 *
 * NOTE: both the off-ramp order field name and the txHash submit path are
 * TODO-flagged in the client pending live confirmation.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();

        if (body.action === 'submitTxHash') {
            if (!body.orderId || !body.txHash) {
                throw error(400, { message: 'orderId and txHash are required' });
            }
            await getKoywe().submitTxHash(body.orderId, body.txHash);
            return json({ ok: true });
        }

        if (!body.quoteId || !body.bankAccountId) {
            throw error(400, { message: 'quoteId and bankAccountId are required' });
        }
        const order = await getKoywe().createOffRampOrder({
            quoteId: body.quoteId,
            bankAccountId: body.bankAccountId,
            documentNumber: body.documentNumber,
        });
        return json(order, { status: 201 });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
