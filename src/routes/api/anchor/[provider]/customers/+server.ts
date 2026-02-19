/**
 * Customer API endpoint
 * POST: Create a new customer
 * GET: Get customer by email
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { email, country = 'MX', publicKey } = body;

        if (!email) {
            throw error(400, { message: 'email is required' });
        }

        const anchor = getAnchor(provider);
        const customer = await anchor.createCustomer({ email, country, publicKey });

        return json(customer, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;
    const email = url.searchParams.get('email');
    const country = url.searchParams.get('country') || 'MX';

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    if (!email) {
        throw error(400, { message: 'email query parameter is required' });
    }

    try {
        const anchor = getAnchor(provider);
        const customer = await anchor.getCustomerByEmail(email, country);

        if (!customer) {
            throw error(404, { message: 'Customer not found' });
        }

        return json(customer);
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
