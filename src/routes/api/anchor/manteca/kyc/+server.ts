/**
 * Manteca KYC / onboarding endpoint.
 * POST: submit (or incrementally update) onboarding identity data.
 *   body: { email, legalId, exchange?, legalIdType?, legalIdNationality?, type?, personalData?, banking? }
 * GET:  list onboarding personal-data fields still missing. query: ?userAnyId=
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.email || !body.legalId) {
            throw error(400, { message: 'email and legalId are required' });
        }
        const user = await getManteca().submitOnboarding({
            email: body.email,
            legalId: body.legalId,
            exchange: body.exchange,
            legalIdType: body.legalIdType,
            legalIdNationality: body.legalIdNationality,
            type: body.type,
            externalId: body.externalId,
            sessionId: body.sessionId,
            personalData: body.personalData,
            banking: body.banking,
        });
        return json(user, { status: 201 });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const userAnyId = url.searchParams.get('userAnyId');
    if (!userAnyId) {
        throw error(400, { message: 'userAnyId is required' });
    }
    try {
        const missing = await getManteca().getMissingPersonalData(userAnyId);
        return json(missing);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
