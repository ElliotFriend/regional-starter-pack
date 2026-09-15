/**
 * TR Mock Anchor SEP-6 endpoint. Requires `Authorization: Bearer <sep10-token>`.
 *
 * POST ?action=deposit  — body { amount, account, quoteId? }        → Sep6DepositResponse
 * POST ?action=withdraw — body { amount, account, quoteId?, dest? } → Sep6WithdrawResponse & { signableXdr }
 * GET  ?transactionId=                                              → Sep6Transaction
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock, requireBearer, fail } from '$lib/server/trmockInstance';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const token = requireBearer(request);
        const anchor = getTrMock();
        const body = (await request.json()) as {
            amount?: string;
            account?: string;
            quoteId?: string;
            dest?: string;
        };
        if (!body.amount) throw error(400, { message: 'amount is required' });
        const account = body.account ?? anchor.decodeToken(token).sub;

        if (action === 'deposit') {
            return json(
                await anchor.depositExchange(token, {
                    amount: body.amount,
                    account,
                    quoteId: body.quoteId,
                }),
            );
        }
        if (action === 'withdraw') {
            return json(
                await anchor.withdrawExchange(token, {
                    amount: body.amount,
                    account,
                    quoteId: body.quoteId,
                    dest: body.dest,
                }),
            );
        }
        throw error(400, { message: `Unknown action: ${action}` });
    } catch (err) {
        fail(err);
    }
};

export const GET: RequestHandler = async ({ request, url }) => {
    const transactionId = url.searchParams.get('transactionId');
    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }
    try {
        const token = requireBearer(request);
        const tx = await getTrMock().getTransaction(token, transactionId);
        if (!tx) throw error(404, { message: 'Transaction not found' });
        return json(tx);
    } catch (err) {
        fail(err);
    }
};
