/**
 * TR Mock Anchor SEP-12 endpoint. Requires `Authorization: Bearer <sep10-token>`.
 *
 * GET → Sep12CustomerResponse
 * PUT → Sep12PutCustomerResponse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrMock, requireBearer } from '$lib/server/trmockInstance';
import { TrMockError } from '$lib/anchors/trmock';
import type { Sep12PutCustomerRequest } from '$lib/anchors/sep/types';

function fail(err: unknown): never {
    if (err instanceof TrMockError) throw error(err.statusCode, { message: err.message });
    if (err instanceof Error && 'statusCode' in err) {
        throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
            message: err.message,
        });
    }
    throw err;
}

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
