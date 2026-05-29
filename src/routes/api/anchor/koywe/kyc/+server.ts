/**
 * Koywe KYC endpoints.
 *
 * GET: read the current KYC status for the configured user.
 * POST: get the Koywe hosted-KYC URL.
 *   NOTE: the hosted KYC endpoint is unconfirmed; the client throws 501 here
 *   (NOT_IMPLEMENTED) until it is wired up.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getKoywe } from '$lib/server/koyweInstance';
import { KoyweError } from '$lib/anchors/koywe';

export const GET: RequestHandler = async () => {
    try {
        const status = await getKoywe().getKycStatus();
        return json({ status });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const POST: RequestHandler = async () => {
    try {
        const url = await getKoywe().getKycUrl();
        return json({ url });
    } catch (err) {
        if (err instanceof KoyweError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
