/**
 * Etherfuse On-Ramp endpoints.
 * POST: create an on-ramp order (returns deposit instructions).
 * GET: fetch an on-ramp order by `orderId` query param.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.customerId || !body.quoteId || !body.publicKey) {
            throw error(400, 'customerId, quoteId, and publicKey are required');
        }
        const order = await getEtherfuse().createOnRampOrder({
            customerId: body.customerId,
            quoteId: body.quoteId,
            publicKey: body.publicKey,
            bankAccountId: body.bankAccountId,
            memo: body.memo,
        });
        return Response.json(order, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
        throw error(400, 'orderId query parameter is required');
    }
    try {
        const order = await getEtherfuse().getOnRampOrder(orderId);
        if (!order) {
            throw error(404, 'Order not found');
        }
        return Response.json(order);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
