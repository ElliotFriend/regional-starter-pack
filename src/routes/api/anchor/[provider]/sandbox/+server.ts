/**
 * Sandbox API endpoint
 * POST: Trigger sandbox-only operations (KYC completion, etc.)
 * Only works in sandbox/development environments
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider, AnchorError } from '$lib/anchors';
import { AlfredPayClient } from '$lib/anchors/alfredpay/client';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { action, submissionId } = body;

        if (!action) {
            throw error(400, { message: 'action is required' });
        }

        const anchor = getAnchor(provider);

        // Type guard to check if anchor supports sandbox methods
        if (!(anchor instanceof AlfredPayClient)) {
            throw error(400, { message: 'Sandbox operations not supported for this provider' });
        }

        switch (action) {
            case 'completeKyc': {
                if (!submissionId) {
                    throw error(400, {
                        message: 'submissionId is required for completeKyc action',
                    });
                }
                console.log('[Sandbox API] Completing KYC for submission:', submissionId);
                await anchor.completeKycSandbox(submissionId);
                return json({ success: true, message: 'KYC marked as completed' });
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
