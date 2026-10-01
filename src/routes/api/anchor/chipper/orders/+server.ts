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
import { isMethodForMarket } from '$lib/config/chipper-markets';

/** Read a required string field, or throw a 400 naming it. */
function required(body: Record<string, unknown>, field: string): string {
    const value = body[field];
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw error(400, { message: `${field} is required` });
    }
    return String(value);
}

export const POST: RequestHandler = async ({ request }) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || (body.direction !== 'onramp' && body.direction !== 'offramp')) {
        throw error(400, { message: "direction must be 'onramp' or 'offramp'" });
    }
    const fiatCurrency = required(body, 'fiatCurrency');
    const externalReference = required(body, 'externalReference');
    try {
        if (body.direction === 'onramp') {
            const collectionCode = required(body, 'collectionCode');
            if (!isMethodForMarket(collectionCode, fiatCurrency)) {
                throw error(400, { message: `Unsupported method for ${fiatCurrency}` });
            }
            return json(
                await getChipper().createOnRampOrder({
                    collectionCode,
                    // Omitted for a bank-transfer source.
                    ...(body.phone ? { phone: String(body.phone) } : {}),
                    fiatCurrency,
                    fiatAmount: required(body, 'fiatAmount'),
                    stellarAddress: required(body, 'stellarAddress'),
                    externalReference,
                }),
            );
        }
        const payoutCode = required(body, 'payoutCode');
        if (!isMethodForMarket(payoutCode, fiatCurrency)) {
            throw error(400, { message: `Unsupported method for ${fiatCurrency}` });
        }
        return json(
            await getChipper().createOffRampOrder({
                payoutCode,
                accountNumber: required(body, 'accountNumber'),
                fiatCurrency,
                usdcAmount: required(body, 'usdcAmount'),
                externalReference,
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
