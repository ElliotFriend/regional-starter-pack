/**
 * Etherfuse Customer endpoints.
 * POST: create a customer
 * GET: fetch a customer by `customerId` query param
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEtherfuse } from '#lib/server/etherfuseInstance.ts';
import { EtherfuseError } from '#lib/anchors/etherfuse/index.ts';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const customer = await getEtherfuse().createCustomer({
            publicKey: body.publicKey,
            email: body.email,
            country: body.country,
        });
        return Response.json(customer, { status: 201 });
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};

export const GET: RequestHandler = async ({ url }) => {
    const customerId = url.searchParams.get('customerId');
    if (!customerId) {
        throw error(400, 'customerId query parameter is required');
    }
    try {
        const customer = await getEtherfuse().getCustomer(customerId);
        if (!customer) {
            throw error(404, 'Customer not found');
        }
        return Response.json(customer);
    } catch (err) {
        if (err instanceof EtherfuseError) {
            throw error(err.statusCode, err.message);
        }
        throw err;
    }
};
