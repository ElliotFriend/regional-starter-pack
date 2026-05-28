/**
 * Etherfuse Customer endpoints.
 * POST: create a customer
 * GET: fetch a customer by `customerId` query param
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { EtherfuseError } from '$lib/anchors/etherfuse';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const customer = await getEtherfuse().createCustomer({
            publicKey: body.publicKey,
            email: body.email,
            country: body.country,
        });
        return json(customer, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) {
        throw error(400, { message: 'customerId query parameter is required' });
    }
    try {
        const customer = await getEtherfuse().getCustomer(customerId);
        if (!customer) {
            throw error(404, { message: 'Customer not found' });
        }
        return json(customer);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
