/**
 * Etherfuse Bank Accounts endpoint.
 * GET: list saved bank accounts for a customer (`customerId` query param).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) {
        throw error(400, { message: 'customerId query parameter is required' });
    }
    try {
        const accounts = await getEtherfuse().listBankAccounts(customerId);
        return json(accounts);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
