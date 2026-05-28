/**
 * Etherfuse KYC endpoints.
 *
 * POST: get a presigned hosted-onboarding URL.
 *   body: { customerId, publicKey, bankAccountId? }
 *
 * GET: read the current KYC status.
 *   query: ?customerId=...&publicKey=...
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.customerId || !body.publicKey) {
            throw error(400, { message: 'customerId and publicKey are required' });
        }
        const url = await getEtherfuse().getKycUrl({
            customerId: body.customerId,
            publicKey: body.publicKey,
            bankAccountId: body.bankAccountId,
        });
        return json({ url });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    const publicKey = url.searchParams.get('publicKey');
    if (!customerId || !publicKey) {
        throw error(400, { message: 'customerId and publicKey query params are required' });
    }
    try {
        const status = await getEtherfuse().getKycStatus({ customerId, publicKey });
        return json({ status });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
