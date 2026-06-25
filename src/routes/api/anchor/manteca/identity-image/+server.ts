/**
 * Manteca identity-image upload (KYC `IDENTITY_VALIDATION`).
 * POST multipart/form-data: { userAnyId, side: FRONT|BACK, fileName, file }.
 * The server mints a presigned URL and PUTs the bytes to it (keeps the
 * md-api-key server-side; avoids any browser→S3 CORS dependency).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const form = await request.formData();
        const userAnyId = form.get('userAnyId');
        const side = form.get('side');
        const file = form.get('file');
        const fileName = form.get('fileName');
        if (typeof userAnyId !== 'string' || (side !== 'FRONT' && side !== 'BACK')) {
            throw error(400, { message: 'userAnyId and side (FRONT|BACK) are required' });
        }
        if (!(file instanceof Blob)) {
            throw error(400, { message: 'file is required' });
        }
        await getManteca().uploadIdentityImage({
            userAnyId,
            side,
            fileName: typeof fileName === 'string' && fileName ? fileName : 'identity.jpg',
            file,
        });
        return json({ ok: true });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
