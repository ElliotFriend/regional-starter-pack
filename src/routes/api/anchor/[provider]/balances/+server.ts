/**
 * Balances API endpoint
 * GET: Return PDAX wallet balances (PHP fiat + USDCXLM crypto).
 *
 * PDAX-only — Etherfuse does not expose a balance API today, so other
 * providers 400. If a second provider gains a balance method later, switch
 * to a capability/feature-detect check.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';
import { PdaxClient } from '$lib/anchors/pdax/client';

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    const anchor = getAnchor(provider);
    if (!(anchor instanceof PdaxClient)) {
        throw error(400, { message: `Provider ${provider} does not expose balances` });
    }

    const currency = url.searchParams.get('currency') ?? undefined;

    try {
        const balances = await anchor.getBalances(currency);
        return json(balances);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
