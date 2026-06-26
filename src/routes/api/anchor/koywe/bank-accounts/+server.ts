/**
 * Koywe bank-account endpoints (off-ramp payout registration).
 *
 * GET ?email=&countryCode=&currencySymbol=: list a user's registered accounts.
 * POST: register a bank account.
 *   body: CreateBankAccountArgs ({ email, accountNumber, currencySymbol, countryCode, documentNumber?, accountType? }).
 *
 * The returned account's `id` is what an off-ramp order passes as its
 * `destinationAddress` (via `bankAccountId`).
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError, type CreateBankAccountArgs } from '$lib/anchors/koywe';

export const GET: RequestHandler = async ({ url }) => {
    const email = url.searchParams.get('email');
    const countryCode = url.searchParams.get('countryCode');
    const currencySymbol = url.searchParams.get('currencySymbol');
    if (!email || !countryCode || !currencySymbol) {
        throw error(400, {
            message: 'email, countryCode, and currencySymbol query parameters are required',
        });
    }
    try {
        const accounts = await getKoywe().getBankAccounts({ email, countryCode, currencySymbol });
        return json(accounts);
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = (await request.json()) as CreateBankAccountArgs;
        if (!body.email || !body.accountNumber || !body.countryCode || !body.currencySymbol) {
            throw error(400, {
                message: 'email, accountNumber, countryCode, and currencySymbol are required',
            });
        }
        const account = await getKoywe().createBankAccount(body);
        return json(account, { status: 201 });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
