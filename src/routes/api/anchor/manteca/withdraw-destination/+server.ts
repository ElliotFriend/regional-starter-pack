/**
 * Manteca withdraw-destination validation endpoint.
 * GET: resolve and validate a PIX key / CBU / CVU. query: ?destination=&country=
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError, type MantecaExchange } from '$lib/anchors/manteca';

export const GET: RequestHandler = async ({ url }) => {
    const destination = url.searchParams.get('destination');
    const country = url.searchParams.get('country') as MantecaExchange | null;
    if (!destination || !country) {
        throw error(400, { message: 'destination and country are required' });
    }
    try {
        const result = await getManteca().getWithdrawDestinationInfo(destination, country);
        return json(result);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
