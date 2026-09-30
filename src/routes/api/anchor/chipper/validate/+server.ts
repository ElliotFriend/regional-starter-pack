/**
 * Chipper destination validation endpoint.
 * POST { code, accountNumber } → { valid, accountName?, reason? }.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';

export const POST: RequestHandler = async ({ request }) => {
    const { code, accountNumber } = (await request.json()) ?? {};
    if (!code || !accountNumber) {
        throw error(400, { message: 'code and accountNumber are required' });
    }
    try {
        return json(
            await getChipper().validateDestination({
                code: String(code),
                accountNumber: String(accountNumber),
            }),
        );
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
