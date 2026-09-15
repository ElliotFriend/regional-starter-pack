/**
 * TR Mock Anchor SEP-12 endpoint. Requires `Authorization: Bearer <sep10-token>`.
 *
 * GET → Sep12CustomerResponse
 * PUT → Sep12PutCustomerResponse
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock, requireBearer, fail } from '$lib/server/trmockInstance';
import type { Sep12PutCustomerRequest } from '$lib/anchors/sep/types';

export const GET: RequestHandler = async ({ request, url }) => {
    try {
        const token = requireBearer(request);
        const id = url.searchParams.get('id') ?? undefined;
        return json(await getTrMock().getCustomer(token, id ? { id } : {}));
    } catch (err) {
        fail(err);
    }
};

export const PUT: RequestHandler = async ({ request }) => {
    try {
        const token = requireBearer(request);
        const body = (await request.json()) as Sep12PutCustomerRequest;
        return json(await getTrMock().putCustomer(token, body));
    } catch (err) {
        fail(err);
    }
};
