/**
 * Client-side wrapper for the TR Mock Anchor API routes at
 * `/api/anchor/trmock/*`.
 *
 * Mirrors {@link TrMockRampClient} (server-side) so Svelte components can call
 * SEP operations without importing server code. Pass `fetch` from SvelteKit's
 * load/component context for SSR support.
 */

import type {
    Sep6Transaction,
    Sep6DepositResponse,
    Sep6WithdrawResponse,
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep38QuoteResponse,
} from '$lib/anchors/sep/types';
import { authHeader, createApiRequester, type Fetch } from './http';

export class TrMockApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'TrMockApiError';
    }
}

const { apiRequest, postJson } = createApiRequester(
    (statusCode, message) => new TrMockApiError(statusCode, message),
);

// ---------------------------------------------------------------------------
// SEP-10 auth
// ---------------------------------------------------------------------------

export async function getChallenge(fetch: Fetch, account: string): Promise<Sep10ChallengeResponse> {
    return postJson<Sep10ChallengeResponse>(fetch, '/api/anchor/trmock/auth?action=challenge', {
        account,
    });
}

export async function submitChallenge(
    fetch: Fetch,
    signedTransactionXdr: string,
): Promise<Sep10TokenResponse> {
    return postJson<Sep10TokenResponse>(fetch, '/api/anchor/trmock/auth?action=token', {
        signedTransactionXdr,
    });
}

// ---------------------------------------------------------------------------
// SEP-12 KYC
// ---------------------------------------------------------------------------

export async function getCustomer(fetch: Fetch, token: string): Promise<Sep12CustomerResponse> {
    return apiRequest<Sep12CustomerResponse>(fetch, '/api/anchor/trmock/customer', {
        headers: authHeader(token),
    });
}

export async function putCustomer(
    fetch: Fetch,
    token: string,
    request: Sep12PutCustomerRequest,
): Promise<Sep12PutCustomerResponse> {
    return apiRequest<Sep12PutCustomerResponse>(fetch, '/api/anchor/trmock/customer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify(request),
    });
}

// ---------------------------------------------------------------------------
// SEP-38 quotes
// ---------------------------------------------------------------------------

export async function createQuote(
    fetch: Fetch,
    token: string,
    direction: 'onramp' | 'offramp',
    amount: string,
): Promise<Sep38QuoteResponse> {
    return postJson<Sep38QuoteResponse>(
        fetch,
        '/api/anchor/trmock/quote',
        { direction, amount },
        token,
    );
}

// ---------------------------------------------------------------------------
// SEP-6 quoted ramps
// ---------------------------------------------------------------------------

export async function depositExchange(
    fetch: Fetch,
    token: string,
    request: { amount: string; account: string; quoteId?: string },
): Promise<Sep6DepositResponse> {
    return postJson<Sep6DepositResponse>(
        fetch,
        '/api/anchor/trmock/sep6?action=deposit',
        request,
        token,
    );
}

export async function withdrawExchange(
    fetch: Fetch,
    token: string,
    request: { amount: string; account: string; quoteId?: string; dest?: string },
): Promise<Sep6WithdrawResponse & { signableXdr: string }> {
    return postJson<Sep6WithdrawResponse & { signableXdr: string }>(
        fetch,
        '/api/anchor/trmock/sep6?action=withdraw',
        request,
        token,
    );
}

export async function getTransaction(
    fetch: Fetch,
    token: string,
    id: string,
): Promise<Sep6Transaction | null> {
    try {
        return await apiRequest<Sep6Transaction>(
            fetch,
            `/api/anchor/trmock/sep6?transactionId=${encodeURIComponent(id)}`,
            { headers: authHeader(token) },
        );
    } catch (err) {
        if (err instanceof TrMockApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Sandbox helpers
// ---------------------------------------------------------------------------

export async function simulateBankTransfer(
    fetch: Fetch,
    token: string,
    transactionId: string,
    amount: string,
): Promise<void> {
    await postJson<{ ok: boolean }>(
        fetch,
        '/api/anchor/trmock/sandbox?action=simulate-bank-transfer',
        { transactionId, amount },
        token,
    );
}
