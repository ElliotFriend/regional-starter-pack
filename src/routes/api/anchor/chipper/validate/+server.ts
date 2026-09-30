/**
 * Chipper destination validation endpoint.
 * POST { code, accountNumber } → { valid, accountName?, reason? }.
 *
 * KNOWN VULNERABILITY: this route is unauthenticated, so anyone who can reach
 * it can resolve the account holder's name for any mobile money number or bank
 * account in the app's active markets, using this app's Chipper key. That is a
 * PII lookup (an enumeration and privacy risk), not just a format check. It is
 * acceptable only because the app is a sandbox demo: the server refuses live
 * keys (assertSandboxKey) and sandbox names are synthetic. Before using a live
 * key, put this behind user authentication and rate limiting, or resolve names
 * only inside an authenticated off-ramp flow.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChipper } from '$lib/server/chipperInstance';
import { ChipperError } from '$lib/anchors/chipper';
import { isMethodForMarket } from '$lib/config/chipper-markets';

export const POST: RequestHandler = async ({ request }) => {
    const { code, accountNumber } = ((await request.json().catch(() => null)) ?? {}) as Record<
        string,
        unknown
    >;
    if (typeof code !== 'string' || typeof accountNumber !== 'string' || !accountNumber) {
        throw error(400, { message: 'code and accountNumber are required' });
    }
    if (!isMethodForMarket(code)) {
        throw error(400, { message: `Unsupported method: ${code}` });
    }
    try {
        return json(await getChipper().validateDestination({ code, accountNumber }));
    } catch (err) {
        if (err instanceof ChipperError) throw error(err.statusCode, { message: err.message });
        throw err;
    }
};
