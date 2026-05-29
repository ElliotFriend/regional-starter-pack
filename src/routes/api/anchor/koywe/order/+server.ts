/**
 * Koywe order endpoint.
 * GET: fetch an order (on- or off-ramp) by `orderId` query param for polling.
 *   Optional `email` query param scopes the auth token to that user.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const GET: RequestHandler = async ({ url }) => {
    const orderId = url.searchParams.get('orderId');
    if (!orderId) {
        throw error(400, { message: 'orderId query parameter is required' });
    }
    const email = url.searchParams.get('email') ?? undefined;
    try {
        const order = await getKoywe().getOrder(orderId, email);
        if (!order) {
            throw error(404, { message: 'Order not found' });
        }
        return json(order);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
