/**
 * Koywe currency-tokens endpoint.
 * GET: list supported crypto tokens, each with the fiat currencies it pairs
 *   with and their per-currency transaction limits (`GET /rest/token-currencies`).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const GET: RequestHandler = async () => {
    try {
        const tokens = await getKoywe().getTokenCurrencies();
        return json(tokens);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
