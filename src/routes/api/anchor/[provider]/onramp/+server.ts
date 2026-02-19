/**
 * On-Ramp API endpoint
 * POST: Create an on-ramp transaction (Local Currency -> Digital Asset)
 * GET: Get on-ramp transaction status
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const {
            customerId,
            quoteId,
            stellarAddress,
            fromCurrency,
            toCurrency,
            amount,
            memo,
            bankAccountId,
        } = body;

        if (!customerId || !quoteId || !stellarAddress || !fromCurrency || !toCurrency || !amount) {
            throw error(400, {
                message:
                    'customerId, quoteId, stellarAddress, fromCurrency, toCurrency, and amount are required',
            });
        }

        const anchor = getAnchor(provider);
        const transaction = await anchor.createOnRamp({
            customerId,
            quoteId,
            stellarAddress,
            fromCurrency,
            toCurrency,
            amount,
            memo,
            bankAccountId,
        });

        return json(transaction, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const transactionId = url.searchParams.get('transactionId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);
        const transaction = await anchor.getOnRampTransaction(transactionId);

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
