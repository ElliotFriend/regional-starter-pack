/**
 * Wallet authentication (SEP-10) endpoint
 *
 * Splits the SEP-10 handshake so the signing step happens client-side:
 *   POST ?action=challenge  { account }              -> { transactionXdr, networkPassphrase }
 *   POST ?action=token      { signedTransactionXdr } -> { token }
 *
 * The browser signs the challenge XDR with the wallet (e.g. Freighter) between
 * the two calls; no signing secret is ever exposed server-side.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const POST: RequestHandler = async ({ params, url, request }) => {
    const { provider } = params;
    const action = url.searchParams.get('action');

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const auth = requireAuth(provider);
        const body = await request.json();

        if (action === 'challenge') {
            if (!body.account) {
                throw error(400, { message: 'account is required' });
            }
            const challenge = await auth.getChallenge(body.account);
            return json(challenge);
        }

        if (action === 'token') {
            if (!body.signedTransactionXdr) {
                throw error(400, { message: 'signedTransactionXdr is required' });
            }
            const session = await auth.submitChallenge(body.signedTransactionXdr);
            return json(session);
        }

        throw error(400, { message: 'action query parameter must be "challenge" or "token"' });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
