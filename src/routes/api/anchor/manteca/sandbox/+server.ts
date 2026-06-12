/**
 * Manteca sandbox helpers.
 * POST: simulate an inbound fiat deposit (advances an on-ramp past its DEPOSIT
 *   stage without real money). body: { action: 'simulateDeposit', userId, coin, amount, externalId? }
 *
 * Sandbox-only — the underlying endpoint has no effect in production.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (body.action !== 'simulateDeposit') {
            throw error(400, { message: "action must be 'simulateDeposit'" });
        }
        if (!body.userId || !body.coin || body.amount == null) {
            throw error(400, { message: 'userId, coin and amount are required' });
        }
        const deposit = await getManteca().simulateTestDeposit({
            userId: body.userId,
            coin: body.coin,
            amount: body.amount,
            externalId: body.externalId,
        });
        return json(deposit, { status: 201 });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
