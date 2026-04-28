/**
 * Sandbox API endpoint
 * POST: Trigger sandbox-only operations (fiat simulation, etc.)
 * Only works in sandbox/development environments
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';
import { EtherfuseClient } from '$lib/anchors/etherfuse/client';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { action } = body;

        if (!action) {
            throw error(400, { message: 'action is required' });
        }

        const anchor = getAnchor(provider);

        switch (action) {
            case 'simulateFiatReceived': {
                if (!(anchor instanceof EtherfuseClient)) {
                    throw error(400, {
                        message: 'simulateFiatReceived not supported for this provider',
                    });
                }
                const { orderId } = body;
                if (!orderId) {
                    throw error(400, {
                        message: 'orderId is required for simulateFiatReceived action',
                    });
                }
                console.log('[Sandbox API] Simulating fiat received for order:', orderId);
                const statusCode = await anchor.simulateFiatReceived(orderId);
                return json({ success: statusCode === 200, statusCode });
            }

            default:
                throw error(400, { message: `Unknown action: ${action}` });
        }
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
