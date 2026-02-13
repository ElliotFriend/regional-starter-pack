/**
 * Blockchain Wallets API endpoint (BlindPay-specific)
 * POST: Register a blockchain wallet for a receiver
 * GET: List blockchain wallets for a receiver
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider, AnchorError } from '$lib/anchors';
import { BlindPayClient } from '$lib/anchors/blindpay/client';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const anchor = getAnchor(provider);

        if (!(anchor instanceof BlindPayClient)) {
            throw error(400, { message: 'Provider does not support blockchain wallet registration' });
        }

        const body = await request.json();
        const { receiverId, address, name } = body;

        if (!receiverId || !address) {
            throw error(400, { message: 'receiverId and address are required' });
        }

        const wallet = await anchor.registerBlockchainWallet(receiverId, address, name);
        return json(wallet);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const receiverId = url.searchParams.get('receiverId');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!receiverId) {
        throw error(400, { message: 'receiverId query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);

        if (!(anchor instanceof BlindPayClient)) {
            throw error(400, { message: 'Provider does not support blockchain wallets' });
        }

        const wallets = await anchor.getBlockchainWallets(receiverId);
        return json(wallets);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
