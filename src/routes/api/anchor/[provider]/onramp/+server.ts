/**
 * On-Ramp API endpoint
 * POST: Create an on-ramp transaction (Local Currency -> Digital Asset)
 * GET: Get on-ramp transaction status
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireProgrammatic, bearerToken, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

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
            identity,
        } = body;

        if (!customerId || !quoteId || !stellarAddress || !fromCurrency || !toCurrency || !amount) {
            throw error(400, {
                message:
                    'customerId, quoteId, stellarAddress, fromCurrency, toCurrency, and amount are required',
            });
        }

        const programmatic = requireProgrammatic(provider);
        const transaction = await programmatic.createOnRamp(
            {
                customerId,
                quoteId,
                stellarAddress,
                fromCurrency,
                toCurrency,
                amount,
                memo,
                bankAccountId,
                identity,
            },
            bearerToken(request),
        );

        return json(transaction, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url, request }) => {
    const { provider } = params;
    const transactionId = url.searchParams.get('transactionId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }

    try {
        const programmatic = requireProgrammatic(provider);
        const transaction = await programmatic.getOnRampTransaction(
            transactionId,
            bearerToken(request),
        );

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
