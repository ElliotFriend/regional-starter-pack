/**
 * Manteca users endpoint.
 * POST: create an end-user. body: { email, exchange?, externalId?, sessionId? }
 * GET:  fetch a user by any id. query: ?userAnyId=
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
    if (!userAnyId) {
        throw error(400, { message: 'userAnyId is required' });
    }
    try {
        const user = await getManteca().getUser(userAnyId);
        if (!user) {
            throw error(404, { message: 'User not found' });
        }
        return json(user);
    } catch (err) {
        if (err instanceof MantecaError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
