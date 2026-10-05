/**
 * Manteca sandbox deposit simulation (static deposit addresses only, e.g. AR CVU).
 * POST body: { userAnyId, legalEntity, asset, amount }
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '#lib/server/mantecaInstance.ts';
import { MantecaError } from '#lib/anchors/manteca/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.json();
    const { userAnyId, legalEntity, asset, amount } = body ?? {};
    if (!userAnyId || !legalEntity || !asset || !amount) {
        throw error(400, 'userAnyId, legalEntity, asset, and amount are required');
    }
    try {
        await getManteca().createSandboxDeposit({
            userAnyId: String(userAnyId),
            legalEntity: String(legalEntity),
            asset: String(asset),
            amount: String(amount),
        });
        return Response.json({ ok: true });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
