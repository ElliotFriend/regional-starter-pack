/**
 * Payout Submit API endpoint (BlindPay-specific)
 * POST: Submit a signed Stellar payout transaction
 *
 * BlindPay's Stellar payout is a 2-step process:
 * 1. Authorize (via createOffRamp) → get XDR to sign
 * 2. Submit signed XDR back to BlindPay (this endpoint)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors';
import { BlindPayClient } from '$lib/anchors/blindpay/client';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const anchor = getAnchor(provider);

        if (!(anchor instanceof BlindPayClient)) {
            throw error(400, { message: 'Provider does not support signed payout submission' });
        }

        const body = await request.json();
        const { quoteId, signedTransaction, senderWalletAddress } = body;

        if (!quoteId || !signedTransaction || !senderWalletAddress) {
            throw error(400, {
                message: 'quoteId, signedTransaction, and senderWalletAddress are required',
            });
        }

        const result = await anchor.submitSignedPayout(
            quoteId,
            signedTransaction,
            senderWalletAddress,
        );
        return json(result);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
