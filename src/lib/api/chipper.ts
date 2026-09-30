/**
 * Client-side wrapper for the Chipper API routes at `/api/anchor/chipper/*`.
 *
 * Chipper authenticates server-side with a secret Bearer key (never exposed to
 * the browser), so these wrappers carry no credentials. Pass `fetch` from
 * SvelteKit's load/component context for SSR support.
 */

import type {
    ChipperCountryCapabilities,
    ChipperOrder,
    ChipperValidation,
    CreateOnRampOrderArgs,
    CreateOffRampOrderArgs,
} from '$lib/anchors/chipper';
import { createApiRequester, type Fetch } from './http';

/** Error thrown by client-side Chipper API calls. */
export class ChipperApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'ChipperApiError';
    }
}

const { apiRequest, postJson } = createApiRequester(
    (statusCode, message) => new ChipperApiError(statusCode, message),
);

const BASE = '/api/anchor/chipper';

export function getCapabilities(
    fetch: Fetch,
    country: string,
): Promise<ChipperCountryCapabilities> {
    return apiRequest(fetch, `${BASE}/capabilities?country=${encodeURIComponent(country)}`);
}

export function getRate(
    fetch: Fetch,
    origin: string,
    destination: string,
): Promise<{ rate: string }> {
    const params = new URLSearchParams({ origin, destination });
    return apiRequest(fetch, `${BASE}/rate?${params}`);
}

export function validateDestination(
    fetch: Fetch,
    args: { code: string; accountNumber: string },
): Promise<ChipperValidation> {
    return postJson(fetch, `${BASE}/validate`, args);
}

export function createOnRampOrder(
    fetch: Fetch,
    args: CreateOnRampOrderArgs,
): Promise<ChipperOrder> {
    return postJson(fetch, `${BASE}/orders`, { direction: 'onramp', ...args });
}

export function createOffRampOrder(
    fetch: Fetch,
    args: CreateOffRampOrderArgs,
): Promise<ChipperOrder> {
    return postJson(fetch, `${BASE}/orders`, { direction: 'offramp', ...args });
}

export async function getOrder(fetch: Fetch, id: string): Promise<ChipperOrder | null> {
    try {
        return await apiRequest<ChipperOrder>(fetch, `${BASE}/orders?id=${encodeURIComponent(id)}`);
    } catch (err) {
        if (err instanceof ChipperApiError && err.statusCode === 404) return null;
        throw err;
    }
}
