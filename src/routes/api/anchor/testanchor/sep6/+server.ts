/**
 * Test anchor SEP-6 endpoint.
 *
 * POST ?action=deposit  — body Sep6DepositRequest  → Sep6DepositResponse
 * POST ?action=withdraw — body Sep6WithdrawRequest → Sep6WithdrawResponse & { signableXdr }
 * GET  ?transactionId=  → Sep6Transaction
 *
 * All routes require a `Authorization: Bearer <sep10-token>` header.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTestAnchor, requireBearer } from '$lib/server/testanchorInstance';
import { TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';
import type { Sep6DepositRequest, Sep6WithdrawRequest } from '$lib/anchors/sep/types';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const token = requireBearer(request);
        const body = await request.json();
        const anchor = getTestAnchor();

        if (action === 'deposit') {
            const req = body as Sep6DepositRequest;
            return json(await anchor.sep6Deposit(token, req));
        }
        if (action === 'withdraw') {
            const { sourceAccount, ...req } = body as Sep6WithdrawRequest & {
                sourceAccount?: string;
            };
            const account = sourceAccount ?? anchor.decodeToken(token).sub;
            return json(await anchor.sep6Withdraw(token, req, account));
        }
        throw error(400, { message: `Unknown action: ${action}` });
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        if (err instanceof Error && 'statusCode' in err) {
            throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
                message: err.message,
            });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ request, url }) => {
    const transactionId = url.searchParams.get('transactionId');
    if (!transactionId) {
        throw error(400, { message: 'transactionId query parameter is required' });
    }
    try {
        const token = requireBearer(request);
        const tx = await getTestAnchor().getSep6Transaction(token, transactionId);
        if (!tx) throw error(404, { message: 'Transaction not found' });
        return json(tx);
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        if (err instanceof Error && 'statusCode' in err) {
            throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
                message: err.message,
            });
        }
        throw err;
    }
};
