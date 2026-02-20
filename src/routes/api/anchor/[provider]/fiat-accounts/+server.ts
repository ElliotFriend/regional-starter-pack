/**
 * Fiat Accounts API endpoint
 * GET: List saved fiat accounts for a customer
 * POST: Register a new fiat account (bank account) for a customer
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
        const { customerId, bankName, clabe, beneficiary } = body;

        if (!customerId || !clabe || !beneficiary) {
            throw error(400, { message: 'customerId, clabe, and beneficiary are required' });
        }

        const anchor = getAnchor(provider);
        const result = await anchor.registerFiatAccount({
            customerId,
            account: {
                type: 'spei',
                clabe,
                bankName: bankName || undefined,
                beneficiary,
            },
        });

        return json(result, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const customerId = url.searchParams.get('customerId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!customerId) {
        throw error(400, { message: 'customerId query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);
        const accounts = await anchor.getFiatAccounts(customerId);
        return json(accounts);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
