/**
 * Manteca define-personal-data endpoint.
 * POST: submit/update personalData for an EXISTING user (fills the fields
 *   reported by missing-personal-data). body: { userAnyId, personalData }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.userAnyId || !body.personalData) {
            throw error(400, { message: 'userAnyId and personalData are required' });
        }
        await getManteca().definePersonalData(body.userAnyId, body.personalData);
        return json({ ok: true });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
