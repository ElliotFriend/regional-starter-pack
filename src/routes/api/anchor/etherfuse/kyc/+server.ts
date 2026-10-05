/**
 * Etherfuse KYC endpoints.
 *
 * POST: get a presigned hosted-onboarding URL.
 *   body: { customerId, publicKey, bankAccountId? }
 *
 * GET: read the current KYC status.
 *   query: ?customerId=...&publicKey=...
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.customerId || !body.publicKey) {
            throw error(400, 'customerId and publicKey are required');
        }
        const url = await getEtherfuse().getKycUrl({
            customerId: body.customerId,
            publicKey: body.publicKey,
            bankAccountId: body.bankAccountId,
        });
        return Response.json({ url });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    const publicKey = url.searchParams.get('publicKey');
    if (!customerId || !publicKey) {
        throw error(400, 'customerId and publicKey query params are required');
    }
    try {
        const status = await getEtherfuse().getKycStatus({ customerId, publicKey });
        return Response.json({ status });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
