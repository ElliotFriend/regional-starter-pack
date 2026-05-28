/**
 * Test anchor SEP-10 auth endpoint.
 *
 * POST ?action=challenge — body { account } → Sep10ChallengeResponse
 * POST ?action=token     — body { signedTransactionXdr } → Sep10TokenResponse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTestAnchor } from '$lib/server/testanchorInstance';
import { TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const body = await request.json();
        const anchor = getTestAnchor();

        if (action === 'challenge') {
            if (!body.account) throw error(400, { message: 'account is required' });
            return json(await anchor.getChallenge(body.account));
        }

        if (action === 'token') {
            if (!body.signedTransactionXdr) {
                throw error(400, { message: 'signedTransactionXdr is required' });
            }
            return json(await anchor.submitChallenge(body.signedTransactionXdr));
        }

        throw error(400, { message: `Unknown action: ${action}` });
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
