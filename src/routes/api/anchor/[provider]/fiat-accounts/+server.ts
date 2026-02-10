/**
 * Fiat Accounts API endpoint
 * GET: List saved fiat accounts for a customer
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider, AnchorError } from '$lib/anchors';

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
