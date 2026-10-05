/**
 * Etherfuse Bank Accounts endpoint.
 * GET: list saved bank accounts for a customer (`customerId` query param).
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) {
        throw error(400, 'customerId query parameter is required');
    }
    try {
        const accounts = await getEtherfuse().listBankAccounts(customerId);
        return Response.json(accounts);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
