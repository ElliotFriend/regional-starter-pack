/**
 * Etherfuse Sandbox endpoint.
 * POST: trigger sandbox-only operations.
 *   action: 'simulateFiatReceived' — body also includes `orderId`.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { action } = body;
        if (!action) {
            throw error(400, 'action is required');
        }

        switch (action) {
            case 'simulateFiatReceived': {
                const { orderId } = body;
                if (!orderId) {
                    throw error(400, 'orderId is required for simulateFiatReceived action');
                }
                const statusCode = await getEtherfuse().simulateFiatReceived(orderId);
                return Response.json({ success: statusCode === 200, statusCode });
            }
            default:
                throw error(400, `Unknown action: ${action}`);
        }
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
