/**
 * Client-side wrapper for the testanchor API routes at `/api/anchor/testanchor/*`.
 *
 * Mirrors {@link TestAnchorRampClient} (server-side) so Svelte components can
 * call SEP operations without importing server code. Pass `fetch` from
 * SvelteKit's load/component context for SSR support.
 */

import type {
    Sep6Transaction,
    Sep6DepositRequest,
    Sep6DepositResponse,
    Sep6WithdrawRequest,
    Sep6WithdrawResponse,
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep12CustomerRequest,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep24Transaction,
    Sep24DepositRequest,
    Sep24WithdrawRequest,
    Sep24InteractiveResponse,
    Sep38PriceRequest,
    Sep38PriceResponse,
} from '$lib/anchors/sep/types';
import { authHeader, createApiRequester, type Fetch } from './http';

export class TestAnchorApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'TestAnchorApiError';
    }
}

const { apiRequest, postJson } = createApiRequester(
    (statusCode, message) => new TestAnchorApiError(statusCode, message),
);

// ---------------------------------------------------------------------------
// SEP-10 auth
// ---------------------------------------------------------------------------

export async function getChallenge(fetch: Fetch, account: string): Promise<Sep10ChallengeResponse> {
    return postJson<Sep10ChallengeResponse>(fetch, '/api/anchor/testanchor/auth?action=challenge', {
        account,
    });
}

export async function submitChallenge(
    fetch: Fetch,
    signedTransactionXdr: string,
): Promise<Sep10TokenResponse> {
    return postJson<Sep10TokenResponse>(fetch, '/api/anchor/testanchor/auth?action=token', {
        signedTransactionXdr,
    });
}

// ---------------------------------------------------------------------------
// SEP-12 KYC
// ---------------------------------------------------------------------------

export async function getCustomer(
    fetch: Fetch,
    token: string,
    params: Sep12CustomerRequest = {},
): Promise<Sep12CustomerResponse> {
    const search = new URLSearchParams();
    if (params.id) search.set('id', params.id);
    if (params.memo) search.set('memo', params.memo);
    if (params.memo_type) search.set('memo_type', params.memo_type);
    if (params.transaction_id) search.set('transaction_id', params.transaction_id);
    if (params.type) search.set('type', params.type);
    const qs = search.toString();
    return apiRequest<Sep12CustomerResponse>(
        fetch,
        `/api/anchor/testanchor/customer${qs ? `?${qs}` : ''}`,
        { headers: authHeader(token) },
    );
}

export async function putCustomer(
    fetch: Fetch,
    token: string,
    request: Sep12PutCustomerRequest,
): Promise<Sep12PutCustomerResponse> {
    return apiRequest<Sep12PutCustomerResponse>(fetch, '/api/anchor/testanchor/customer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify(request),
    });
}

// ---------------------------------------------------------------------------
// SEP-38 price
// ---------------------------------------------------------------------------

export async function getPrice(
    fetch: Fetch,
    request: Sep38PriceRequest,
): Promise<Sep38PriceResponse> {
    return postJson<Sep38PriceResponse>(fetch, '/api/anchor/testanchor/price', request);
}

// ---------------------------------------------------------------------------
// SEP-6 programmatic
// ---------------------------------------------------------------------------

export async function sep6Deposit(
    fetch: Fetch,
    token: string,
    request: Sep6DepositRequest,
): Promise<Sep6DepositResponse> {
    return postJson<Sep6DepositResponse>(
        fetch,
        '/api/anchor/testanchor/sep6?action=deposit',
        request,
        token,
    );
}

export async function sep6Withdraw(
    fetch: Fetch,
    token: string,
    request: Sep6WithdrawRequest,
    sourceAccount?: string,
): Promise<Sep6WithdrawResponse & { signableXdr: string }> {
    return postJson<Sep6WithdrawResponse & { signableXdr: string }>(
        fetch,
        '/api/anchor/testanchor/sep6?action=withdraw',
        { ...request, sourceAccount },
        token,
    );
}

export async function getSep6Transaction(
    fetch: Fetch,
    token: string,
    id: string,
): Promise<Sep6Transaction | null> {
    try {
        return await apiRequest<Sep6Transaction>(
            fetch,
            `/api/anchor/testanchor/sep6?transactionId=${encodeURIComponent(id)}`,
            { headers: authHeader(token) },
        );
    } catch (err) {
        if (err instanceof TestAnchorApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// SEP-24 interactive
// ---------------------------------------------------------------------------

export async function sep24Deposit(
    fetch: Fetch,
    token: string,
    request: Sep24DepositRequest,
): Promise<Sep24InteractiveResponse> {
    return postJson<Sep24InteractiveResponse>(
        fetch,
        '/api/anchor/testanchor/sep24?action=deposit',
        request,
        token,
    );
}

export async function sep24Withdraw(
    fetch: Fetch,
    token: string,
    request: Sep24WithdrawRequest,
): Promise<Sep24InteractiveResponse> {
    return postJson<Sep24InteractiveResponse>(
        fetch,
        '/api/anchor/testanchor/sep24?action=withdraw',
        request,
        token,
    );
}

export async function getSep24Transaction(
    fetch: Fetch,
    token: string,
    id: string,
): Promise<Sep24Transaction | null> {
    try {
        return await apiRequest<Sep24Transaction>(
            fetch,
            `/api/anchor/testanchor/sep24?transactionId=${encodeURIComponent(id)}`,
            { headers: authHeader(token) },
        );
    } catch (err) {
        if (err instanceof TestAnchorApiError && err.statusCode === 404) return null;
        throw err;
    }
}
