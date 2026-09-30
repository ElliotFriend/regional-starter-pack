/**
 * Chipper orders endpoint.
 * POST { direction: 'onramp', ...CreateOnRampOrderArgs }
 *    | { direction: 'offramp', ...CreateOffRampOrderArgs } → the order.
 * GET  ?id= → the order, for polling.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json()) ?? {};
    if (body.direction !== 'onramp' && body.direction !== 'offramp') {
        throw error(400, { message: "direction must be 'onramp' or 'offramp'" });
    }
    try {
        if (body.direction === 'onramp') {
            return json(
                await getChipper().createOnRampOrder({
                    collectionCode: String(body.collectionCode),
                    // Omitted for a bank-transfer source.
                    ...(body.phone ? { phone: String(body.phone) } : {}),
                    fiatCurrency: String(body.fiatCurrency),
                    fiatAmount: String(body.fiatAmount),
                    stellarAddress: String(body.stellarAddress),
                    externalReference: String(body.externalReference),
                }),
            );
        }
        return json(
            await getChipper().createOffRampOrder({
                payoutCode: String(body.payoutCode),
                accountNumber: String(body.accountNumber),
                fiatCurrency: String(body.fiatCurrency),
                usdcAmount: String(body.usdcAmount),
                externalReference: String(body.externalReference),
            }),
        );
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) throw error(400, { message: 'id is required' });
    try {
        const order = await getChipper().getOrder(id);
        if (!order) throw error(404, { message: 'Order not found' });
        return json(order);
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
