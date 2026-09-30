/**
 * Chipper sandbox bank-deposit simulation for a bank-sourced on-ramp order.
 * POST { orderId, amount, externalReference } → { ok: true }.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';

export const POST: RequestHandler = async ({ request }) => {
    const { orderId, amount, externalReference } = (await request.json()) ?? {};
    if (!orderId || !amount || !externalReference) {
        throw error(400, { message: 'orderId, amount, and externalReference are required' });
    }
    try {
        await getChipper().simulateBankDeposit({
            orderId: String(orderId),
            amount: String(amount),
            externalReference: String(externalReference),
        });
        return json({ ok: true });
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
