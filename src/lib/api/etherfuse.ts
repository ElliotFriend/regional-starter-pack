/**
 * Client-side wrapper for the Etherfuse API routes at `/api/anchor/etherfuse/*`.
 *
 * Mirrors the {@link EtherfuseClient} surface (server-side) so Svelte components
 * can call native Etherfuse operations without importing server code. Pass
 * `fetch` from SvelteKit's load/component context for SSR support.
 */

import type {
    EtherfuseCustomer,
    EtherfuseQuote,
    EtherfuseOnRampOrder,
    EtherfuseOffRampOrder,
    EtherfuseSavedBankAccount,
    EtherfuseKycStatus,
    EtherfuseAssetsResponse,
    CreateCustomerArgs,
    GetQuoteArgs,
    CreateOnRampOrderArgs,
    CreateOffRampOrderArgs,
    GetKycUrlArgs,
    GetKycStatusArgs,
    GetAssetsArgs,
} from '$lib/anchors/etherfuse';

type Fetch = typeof fetch;

/** Error thrown by client-side Etherfuse API calls. */
export class EtherfuseApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'EtherfuseApiError';
    }
}

async function apiRequest<T>(fetch: Fetch, url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new EtherfuseApiError(
            response.status,
            data.message || data.error || `Request failed: ${response.status}`,
        );
    }
    return response.json();
}

async function postJson<T>(fetch: Fetch, url: string, body: unknown): Promise<T> {
    return apiRequest<T>(fetch, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export async function createCustomer(
    fetch: Fetch,
    args: CreateCustomerArgs,
): Promise<EtherfuseCustomer> {
    return postJson<EtherfuseCustomer>(fetch, '/api/anchor/etherfuse/customers', args);
}

export async function getCustomer(
    fetch: Fetch,
    customerId: string,
): Promise<EtherfuseCustomer | null> {
    try {
        return await apiRequest<EtherfuseCustomer>(
            fetch,
            `/api/anchor/etherfuse/customers?customerId=${encodeURIComponent(customerId)}`,
        );
    } catch (err) {
        if (err instanceof EtherfuseApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function getQuote(fetch: Fetch, args: GetQuoteArgs): Promise<EtherfuseQuote> {
    return postJson<EtherfuseQuote>(fetch, '/api/anchor/etherfuse/quotes', args);
}

// ---------------------------------------------------------------------------
// On-ramp
// ---------------------------------------------------------------------------

export async function createOnRampOrder(
    fetch: Fetch,
    args: CreateOnRampOrderArgs,
): Promise<EtherfuseOnRampOrder> {
    return postJson<EtherfuseOnRampOrder>(fetch, '/api/anchor/etherfuse/onramp', args);
}

export async function getOnRampOrder(
    fetch: Fetch,
    orderId: string,
): Promise<EtherfuseOnRampOrder | null> {
    try {
        return await apiRequest<EtherfuseOnRampOrder>(
            fetch,
            `/api/anchor/etherfuse/onramp?orderId=${encodeURIComponent(orderId)}`,
        );
    } catch (err) {
        if (err instanceof EtherfuseApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Off-ramp
// ---------------------------------------------------------------------------

export async function createOffRampOrder(
    fetch: Fetch,
    args: CreateOffRampOrderArgs,
): Promise<EtherfuseOffRampOrder> {
    return postJson<EtherfuseOffRampOrder>(fetch, '/api/anchor/etherfuse/offramp', args);
}

export async function getOffRampOrder(
    fetch: Fetch,
    orderId: string,
): Promise<EtherfuseOffRampOrder | null> {
    try {
        return await apiRequest<EtherfuseOffRampOrder>(
            fetch,
            `/api/anchor/etherfuse/offramp?orderId=${encodeURIComponent(orderId)}`,
        );
    } catch (err) {
        if (err instanceof EtherfuseApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

export async function listBankAccounts(
    fetch: Fetch,
    customerId: string,
): Promise<EtherfuseSavedBankAccount[]> {
    try {
        return await apiRequest<EtherfuseSavedBankAccount[]>(
            fetch,
            `/api/anchor/etherfuse/bank-accounts?customerId=${encodeURIComponent(customerId)}`,
        );
    } catch (err) {
        if (err instanceof EtherfuseApiError && err.statusCode === 404) return [];
        throw err;
    }
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export async function getKycUrl(fetch: Fetch, args: GetKycUrlArgs): Promise<string> {
    const data = await postJson<{ url: string }>(fetch, '/api/anchor/etherfuse/kyc', args);
    return data.url;
}

export async function getKycStatus(
    fetch: Fetch,
    args: GetKycStatusArgs,
): Promise<EtherfuseKycStatus> {
    const params = new URLSearchParams({
        customerId: args.customerId,
        publicKey: args.publicKey,
    });
    const data = await apiRequest<{ status: EtherfuseKycStatus }>(
        fetch,
        `/api/anchor/etherfuse/kyc?${params.toString()}`,
    );
    return data.status;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function getAssets(
    fetch: Fetch,
    args: GetAssetsArgs,
): Promise<EtherfuseAssetsResponse> {
    const params = new URLSearchParams({ currency: args.currency, wallet: args.wallet });
    if (args.blockchain) params.set('blockchain', args.blockchain);
    return apiRequest<EtherfuseAssetsResponse>(
        fetch,
        `/api/anchor/etherfuse/assets?${params.toString()}`,
    );
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export async function simulateFiatReceived(fetch: Fetch, orderId: string): Promise<number> {
    const result = await postJson<{ success: boolean; statusCode: number }>(
        fetch,
        '/api/anchor/etherfuse/sandbox',
        { action: 'simulateFiatReceived', orderId },
    );
    return result.statusCode;
}
