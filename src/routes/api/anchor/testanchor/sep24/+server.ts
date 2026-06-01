/**
 * Test anchor SEP-24 endpoint.
 *
 * POST ?action=deposit  — body Sep24DepositRequest  → Sep24InteractiveResponse
 * POST ?action=withdraw — body Sep24WithdrawRequest → Sep24InteractiveResponse
 * GET  ?transactionId=  → Sep24Transaction
 *
 * All routes require a `Authorization: Bearer <sep10-token>` header.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTestAnchor, requireBearer } from '$lib/server/testanchorInstance';
import { TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';
import type { Sep24DepositRequest, Sep24WithdrawRequest } from '$lib/anchors/sep/types';

export const POST: RequestHandler = async ({ request, url }) => {
    const action = url.searchParams.get('action');
    try {
        const token = requireBearer(request);
        const body = await request.json();
        const anchor = getTestAnchor();

        if (action === 'deposit') {
            return json(await anchor.sep24Deposit(token, body as Sep24DepositRequest));
        }
        if (action === 'withdraw') {
            return json(await anchor.sep24Withdraw(token, body as Sep24WithdrawRequest));
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
        const tx = await getTestAnchor().getSep24Transaction(token, transactionId);
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
