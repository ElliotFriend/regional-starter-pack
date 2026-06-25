/**
 * Manteca users endpoint.
 * POST: create an end-user. body: { email, exchange?, externalId?, sessionId? }
 * GET:  fetch a user by any id (?userAnyId=), or search for an existing user
 *       by ?email= / ?legalId= / ?externalId= (returns the match, or null).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getManteca } from '$lib/server/mantecaInstance';
import { MantecaError } from '$lib/anchors/manteca';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        if (!body.email) {
            throw error(400, { message: 'email is required' });
        }
        const user = await getManteca().createUser({
            email: body.email,
            exchange: body.exchange,
            externalId: body.externalId,
            sessionId: body.sessionId,
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
    const email = url.searchParams.get('email');
    const legalId = url.searchParams.get('legalId');
    const externalId = url.searchParams.get('externalId');
    try {
        // Fetch-by-id (?userAnyId=) 404s when absent; search (?email/legalId/
        // externalId) returns the match or null so callers can branch.
        if (userAnyId) {
            const user = await getManteca().getUser(userAnyId);
            if (!user) {
                throw error(404, { message: 'User not found' });
            }
            return json(user);
        }
        if (email || legalId || externalId) {
            const user = await getManteca().findUser({
                email: email ?? undefined,
                legalId: legalId ?? undefined,
                externalId: externalId ?? undefined,
            });
            return json(user);
        }
        throw error(400, {
            message: 'userAnyId or a search filter (email/legalId/externalId) is required',
        });
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
