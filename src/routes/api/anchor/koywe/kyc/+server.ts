/**
 * Koywe KYC endpoints.
 *
 * GET ?email=…: check whether the account can operate (canOperate, accountStatus,
 *   and any missing requirements) via GET /rest/accounts/{email}/check.
 * POST: register a delegated-KYC account (this is the "submit KYC" step).
 *   body: CreateAccountArgs ({ email, document, address, personalInfo }).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError, type CreateAccountArgs } from '$lib/anchors/koywe';

export const GET: RequestHandler = async ({ url }) => {
    const email = url.searchParams.get('email');
    if (!email) {
        throw error(400, { message: 'email query parameter is required' });
    }
    try {
        const check = await getKoywe().checkAccount(email);
        return json(check);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = (await request.json()) as CreateAccountArgs;
        if (!body.email || !body.document || !body.address || !body.personalInfo) {
            throw error(400, {
                message: 'email, document, address, and personalInfo are required',
            });
        }
        await getKoywe().createAccount(body);
        return json({ ok: true }, { status: 201 });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
