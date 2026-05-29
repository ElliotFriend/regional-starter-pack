/**
 * Client-side wrapper for the Koywe API routes at `/api/anchor/koywe/*`.
 *
 * Mirrors the {@link KoyweClient} surface (server-side) so Svelte components can
 * call native Koywe operations without importing server code. Pass `fetch` from
 * SvelteKit's load/component context for SSR support.
 *
 * Koywe authenticates server-side with a `clientId`/`secret` pair (never exposed
 * to the browser), so these wrappers carry no bearer token — the proxy routes
 * attach it via the server-side singleton.
 */

import type {
    KoywePaymentMethod,
    KoyweQuote,
    KoyweOnRampOrder,
    KoyweOffRampOrder,
    KoyweOrder,
    KoyweKycStatus,
    GetQuoteArgs,
    CreateOnRampOrderArgs,
    CreateOffRampOrderArgs,
} from '$lib/anchors/koywe';
import { createApiRequester, type Fetch } from './http';

/** Error thrown by client-side Koywe API calls. */
export class KoyweApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'KoyweApiError';
    }
}

const { apiRequest, postJson } = createApiRequester(
    (statusCode, message) => new KoyweApiError(statusCode, message),
);

// ---------------------------------------------------------------------------
// Payment methods (rails)
// ---------------------------------------------------------------------------

export async function getPaymentProviders(
    fetch: Fetch,
    fiatCurrency: string,
): Promise<KoywePaymentMethod[]> {
    return apiRequest<KoywePaymentMethod[]>(
        fetch,
        `/api/anchor/koywe/payment-methods?symbol=${encodeURIComponent(fiatCurrency)}`,
    );
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function getQuote(fetch: Fetch, args: GetQuoteArgs): Promise<KoyweQuote> {
    return postJson<KoyweQuote>(fetch, '/api/anchor/koywe/quotes', args);
}

// ---------------------------------------------------------------------------
// On-ramp
// ---------------------------------------------------------------------------

export async function createOnRampOrder(
    fetch: Fetch,
    args: CreateOnRampOrderArgs,
): Promise<KoyweOnRampOrder> {
    return postJson<KoyweOnRampOrder>(fetch, '/api/anchor/koywe/onramp', args);
}

// ---------------------------------------------------------------------------
// Off-ramp
// ---------------------------------------------------------------------------

export async function createOffRampOrder(
    fetch: Fetch,
    args: CreateOffRampOrderArgs,
): Promise<KoyweOffRampOrder> {
    return postJson<KoyweOffRampOrder>(fetch, '/api/anchor/koywe/offramp', args);
}

/** Attach a Stellar tx hash to an off-ramp order (TODO-flagged path server-side). */
export async function submitTxHash(fetch: Fetch, orderId: string, txHash: string): Promise<void> {
    await postJson<{ ok: boolean }>(fetch, '/api/anchor/koywe/offramp', {
        action: 'submitTxHash',
        orderId,
        txHash,
    });
}

// ---------------------------------------------------------------------------
// Order polling (shared by both ramps)
// ---------------------------------------------------------------------------

export async function getOrder(fetch: Fetch, orderId: string): Promise<KoyweOrder | null> {
    try {
        return await apiRequest<KoyweOrder>(
            fetch,
            `/api/anchor/koywe/order?orderId=${encodeURIComponent(orderId)}`,
        );
    } catch (err) {
        if (err instanceof KoyweApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export async function getKycStatus(fetch: Fetch): Promise<KoyweKycStatus> {
    const data = await apiRequest<{ status: KoyweKycStatus }>(fetch, '/api/anchor/koywe/kyc');
    return data.status;
}

/**
 * Get the Koywe hosted-KYC URL. Currently throws server-side (501) — the
 * endpoint is unconfirmed. Surfaced here so callers can catch and message it.
 */
export async function getKycUrl(fetch: Fetch): Promise<string> {
    const data = await postJson<{ url: string }>(fetch, '/api/anchor/koywe/kyc', {});
    return data.url;
}
