/**
 * Customer API endpoint
 * POST: Create a new customer
 * GET: Get customer by email
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireProgrammatic, bearerToken, isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { email, country = 'MX', publicKey, name, taxId, taxIdCountry } = body;

        const programmatic = requireProgrammatic(provider);
        const customer = await programmatic.createCustomer(
            {
                email,
                country,
                publicKey,
                name,
                taxId,
                taxIdCountry,
            },
            bearerToken(request),
        );

        return json(customer, { status: 201 });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ params, url, request }) => {
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
        const programmatic = requireProgrammatic(provider);
        const customer = await programmatic.getCustomer({ email, country }, bearerToken(request));

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
