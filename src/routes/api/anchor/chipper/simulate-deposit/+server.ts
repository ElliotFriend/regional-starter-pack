/**
 * Chipper sandbox bank-deposit simulation for a bank-sourced on-ramp order.
 * POST { orderId, amount, externalReference } → { ok: true }.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '#lib/server/chipperInstance.ts';
import { ChipperError } from '#lib/anchors/chipper/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    const { orderId, amount, externalReference } = (await request.json()) ?? {};
    if (!orderId || !amount || !externalReference) {
        throw error(400, 'orderId, amount, and externalReference are required');
    }
    try {
        await getChipper().simulateBankDeposit({
            orderId: String(orderId),
            amount: String(amount),
            externalReference: String(externalReference),
        });
        return Response.json({ ok: true });
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, err.message);
        throw err;
    }
};
