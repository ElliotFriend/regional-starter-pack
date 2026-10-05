/**
 * Manteca withdraw-destination validation endpoint.
 * GET: resolve and validate a PIX key / CBU / CVU. query: ?destination=&country=
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '#lib/server/mantecaInstance.ts';
import { MantecaError, type MantecaExchange } from '#lib/anchors/manteca/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const destination = url.searchParams.get('destination');
    const country = url.searchParams.get('country') as MantecaExchange | null;
    if (!destination || !country) {
        throw error(400, 'destination and country are required');
    }
    try {
        const result = await getManteca().getWithdrawDestinationInfo(destination, country);
        return Response.json(result);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
