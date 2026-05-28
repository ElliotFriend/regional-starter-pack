/**
 * Etherfuse Assets endpoint.
 * GET: list rampable assets for a given currency/wallet (`currency` and `wallet`
 * query params; `blockchain` optional, defaults to `stellar`).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const GET: RequestHandler = async ({ url }) => {
    const currency = url.searchParams.get('currency');
    const wallet = url.searchParams.get('wallet');
    const blockchain = url.searchParams.get('blockchain') || undefined;
    if (!currency || !wallet) {
        throw error(400, { message: 'currency and wallet query params are required' });
    }
    try {
        const result = await getEtherfuse().getAssets({ currency, wallet, blockchain });
        return json(result);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
