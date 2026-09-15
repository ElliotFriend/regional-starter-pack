/**
 * TR Mock Anchor sandbox helpers. Requires `Authorization: Bearer <sep10-token>`.
 *
 * POST ?action=simulate-bank-transfer — body { transactionId, amount } → { ok: true }
 *
 * Stands in for the incoming TRY bank transfer. Sandbox-only; a production
 * anchor observes a real transfer instead.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock, requireBearer } from '$lib/server/trmockInstance';
import { TrMockError } from '$lib/anchors/trmock';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const token = requireBearer(request);
        const { transactionId, amount } = (await request.json()) as {
            transactionId?: string;
            amount?: string;
        };

        if (action === 'simulate-bank-transfer') {
            if (!transactionId || !amount) {
                throw error(400, { message: 'transactionId and amount are required' });
            }
            await getTrMock().simulateBankTransfer(token, transactionId, amount);
            return json({ ok: true });
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
