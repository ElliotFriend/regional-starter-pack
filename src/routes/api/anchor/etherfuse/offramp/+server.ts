/**
 * Etherfuse Off-Ramp endpoints.
 * POST: create an off-ramp order. Returns immediately; poll for the burn XDR via GET.
 * GET: fetch an off-ramp order by `orderId` query param.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.customerId || !body.quoteId || !body.publicKey || !body.bankAccountId) {
            throw error(400, {
                message: 'customerId, quoteId, publicKey, and bankAccountId are required',
            });
        }
        const order = await getEtherfuse().createOffRampOrder({
            customerId: body.customerId,
            quoteId: body.quoteId,
            publicKey: body.publicKey,
            bankAccountId: body.bankAccountId,
            memo: body.memo,
        });
        return json(order, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
        throw error(400, { message: 'orderId query parameter is required' });
    }
    try {
        const order = await getEtherfuse().getOffRampOrder(orderId);
        if (!order) {
            throw error(404, { message: 'Order not found' });
        }
        return json(order);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
