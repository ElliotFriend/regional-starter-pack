/**
 * Manteca synthetic polling endpoint.
 * GET: fetch a synthetic by any id. query: ?id=
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '#lib/server/mantecaInstance.ts';
import { MantecaError } from '#lib/anchors/manteca/index.ts';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        throw error(400, 'id is required');
    }
    try {
        const synthetic = await getManteca().getSynthetic(id);
        if (!synthetic) {
            throw error(404, 'Synthetic not found');
        }
        return Response.json(synthetic);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
