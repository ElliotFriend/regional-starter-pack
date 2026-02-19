/**
 * Sandbox API endpoint
 * POST: Trigger sandbox-only operations (KYC completion, etc.)
 * Only works in sandbox/development environments
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors';
import { AlfredPayClient } from '$lib/anchors/alfredpay/client';
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
            case 'completeKyc': {
                if (!(anchor instanceof AlfredPayClient)) {
                    throw error(400, { message: 'completeKyc not supported for this provider' });
                }
                const { submissionId } = body;
                if (!submissionId) {
                    throw error(400, {
                        message: 'submissionId is required for completeKyc action',
                    });
                }
                console.log('[Sandbox API] Completing KYC for submission:', submissionId);
                await anchor.completeKycSandbox(submissionId);
                return json({ success: true, message: 'KYC marked as completed' });
            }

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
