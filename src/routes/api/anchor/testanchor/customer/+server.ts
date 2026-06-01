/**
 * Test anchor SEP-12 customer endpoint.
 *
 * GET (Bearer required) ?transaction_id=&id=&memo=&memo_type= → Sep12CustomerResponse
 * PUT (Bearer required) body Sep12PutCustomerRequest          → Sep12PutCustomerResponse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTestAnchor, requireBearer } from '$lib/server/testanchorInstance';
import { TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';
import type { Sep12CustomerRequest, Sep12PutCustomerRequest } from '$lib/anchors/sep/types';

export const GET: RequestHandler = async ({ request, url }) => {
    try {
        const token = requireBearer(request);
        const params: Sep12CustomerRequest = {};
        const id = url.searchParams.get('id');
        const memo = url.searchParams.get('memo');
        const memoType = url.searchParams.get('memo_type');
        const transactionId = url.searchParams.get('transaction_id');
        const type = url.searchParams.get('type');
        if (id) params.id = id;
        if (memo) params.memo = memo;
        if (memoType) params.memo_type = memoType as 'text' | 'id' | 'hash';
        if (transactionId) params.transaction_id = transactionId;
        if (type) params.type = type;
        return json(await getTestAnchor().getCustomer(token, params));
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        if (err instanceof Error && 'statusCode' in err) {
            throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
                message: err.message,
            });
        }
        throw err;
    }
};

export const PUT: RequestHandler = async ({ request }) => {
    try {
        const token = requireBearer(request);
        const body = (await request.json()) as Sep12PutCustomerRequest;
        return json(await getTestAnchor().putCustomer(token, body));
    } catch (err) {
        if (err instanceof TestAnchorSepUnsupportedError) {
            throw error(err.statusCode, { message: err.message });
        }
        if (err instanceof Error && 'statusCode' in err) {
            throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
                message: err.message,
            });
        }
        throw err;
    }
};
