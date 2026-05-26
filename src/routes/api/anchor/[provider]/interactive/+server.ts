/**
 * Interactive (SEP-24-style) ramp endpoint
 *
 *   POST { direction, assetCode, assetIssuer?, account, amount? }
 *        -> { interactiveUrl, transactionId }   (starts a hosted session)
 *   GET  ?direction=onramp|offramp&transactionId=...
 *        -> the transaction status
 *
 * The SEP-10 session token (when the provider requires one) is passed via the
 * `Authorization: Bearer <token>` header and threaded into the facet calls.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireInteractive, bearerToken, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const interactive = requireInteractive(provider);
        const body = await request.json();
        const { direction, assetCode, assetIssuer, account, amount } = body;

        if (direction !== 'onramp' && direction !== 'offramp') {
            throw error(400, { message: 'direction must be "onramp" or "offramp"' });
        }
        if (!assetCode || !account) {
            throw error(400, { message: 'assetCode and account are required' });
        }

        const input = { assetCode, assetIssuer, account, amount, auth: bearerToken(request) };
        const session =
            direction === 'onramp'
                ? await interactive.startOnRamp(input)
                : await interactive.startOffRamp(input);

        return json(session, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url, request }) => {
    const { provider } = params;
    const direction = url.searchParams.get('direction');
    const transactionId = url.searchParams.get('transactionId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }
    if (direction !== 'onramp' && direction !== 'offramp') {
        throw error(400, { message: 'direction must be "onramp" or "offramp"' });
    }
    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }

    try {
        const interactive = requireInteractive(provider);
        const auth = bearerToken(request);
        const transaction =
            direction === 'onramp'
                ? await interactive.getOnRampTransaction(transactionId, auth)
                : await interactive.getOffRampTransaction(transactionId, auth);

        if (!transaction) {
            throw error(404, { message: 'Transaction not found' });
        }

        return json(transaction);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
