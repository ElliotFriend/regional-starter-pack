/**
 * TR Mock Anchor SEP-10 endpoint.
 *
 * POST ?action=challenge — body { account }              → Sep10ChallengeResponse
 * POST ?action=token     — body { signedTransactionXdr } → Sep10TokenResponse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock } from '$lib/server/trmockInstance';
import { TrMockError } from '$lib/anchors/trmock';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const anchor = getTrMock();
        const body = await request.json();

        if (action === 'challenge') {
            const { account } = body as { account?: string };
            if (!account) throw error(400, { message: 'account is required' });
            return json(await anchor.getChallenge(account));
        }
        if (action === 'token') {
            const { signedTransactionXdr } = body as { signedTransactionXdr?: string };
            if (!signedTransactionXdr) {
                throw error(400, { message: 'signedTransactionXdr is required' });
            }
            return json(await anchor.submitChallenge(signedTransactionXdr));
        }
        throw error(400, { message: `Unknown action: ${action}` });
    } catch (err) {
        if (err instanceof TrMockError) throw error(err.statusCode, { message: err.message });
        if (err instanceof Error && 'statusCode' in err) {
            throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
                message: err.message,
            });
        }
        throw err;
    }
};
