/**
 * Manteca synthetic polling endpoint.
 * GET: fetch a synthetic by any id. query: ?id=
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const GET: RequestHandler = async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) {
        throw error(400, { message: 'id is required' });
    }
    try {
        const synthetic = await getManteca().getSynthetic(id);
        if (!synthetic) {
            throw error(404, { message: 'Synthetic not found' });
        }
        return json(synthetic);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
