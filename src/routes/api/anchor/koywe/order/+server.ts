/**
 * Koywe order endpoint.
 * GET: fetch an order (on- or off-ramp) for polling, by either `orderId` or
 *   `externalId` query param (the client-supplied idempotency key). Optional
 *   `email` query param scopes the auth token to that user.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '#lib/server/koyweInstance.ts';
import { KoyweError } from '#lib/anchors/koywe/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const orderId = url.searchParams.get('orderId');
    const externalId = url.searchParams.get('externalId');
    if (!orderId && !externalId) {
        throw error(400, 'orderId or externalId query parameter is required');
    }
    const email = url.searchParams.get('email') ?? undefined;
    try {
        const order = orderId
            ? await getKoywe().getOrder(orderId, email)
            : await getKoywe().getOrderByExternalId(externalId!, email);
        if (!order) {
            throw error(404, 'Order not found');
        }
        return Response.json(order);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
