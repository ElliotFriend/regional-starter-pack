/**
 * Client-side API wrappers for Manteca.
 *
 * Typed `fetch` helpers around the `/api/anchor/manteca/*` CORS-proxy routes.
 * The browser never sees the `md-api-key`; these wrappers talk to our own
 * SvelteKit routes, which call {@link getManteca} server-side.
 */

import { createApiRequester, type Fetch } from './http';
import type {
    MantecaUser,
    MantecaQuote,
    MantecaSynthetic,
    MantecaWithdrawDestination,
    MantecaExchange,
    CreateUserArgs,
    SubmitOnboardingArgs,
    GetQuoteArgs,
    CreateRampOnArgs,
    CreateRampOffArgs,
} from '$lib/anchors/manteca';

/** Error thrown by the client-side Manteca API wrappers. */
export class MantecaApiError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'MantecaApiError';
    }
}

const { apiRequest, postJson } = createApiRequester(
    (statusCode, message) => new MantecaApiError(statusCode, message),
);

const BASE = '/api/anchor/manteca';

// --- Users & onboarding ---

export async function createUser(fetch: Fetch, args: CreateUserArgs): Promise<MantecaUser> {
    return postJson<MantecaUser>(fetch, `${BASE}/users`, args);
}

export async function getUser(fetch: Fetch, userAnyId: string): Promise<MantecaUser | null> {
    try {
        return await apiRequest<MantecaUser>(
            fetch,
            `${BASE}/users?userAnyId=${encodeURIComponent(userAnyId)}`,
        );
    } catch (err) {
        if (err instanceof MantecaApiError && err.statusCode === 404) return null;
        throw err;
    }
}

export async function submitOnboarding(
    fetch: Fetch,
    args: SubmitOnboardingArgs,
): Promise<MantecaUser> {
    return postJson<MantecaUser>(fetch, `${BASE}/kyc`, args);
}

export async function getMissingPersonalData(fetch: Fetch, userAnyId: string): Promise<string[]> {
    return apiRequest<string[]>(fetch, `${BASE}/kyc?userAnyId=${encodeURIComponent(userAnyId)}`);
}

// --- Pricing ---

export async function getQuote(fetch: Fetch, args: GetQuoteArgs): Promise<MantecaQuote> {
    const params = new URLSearchParams({
        ramp: args.ramp,
        asset: args.asset,
        against: args.against,
    });
    return apiRequest<MantecaQuote>(fetch, `${BASE}/quotes?${params}`);
}

// --- Ramps ---

export async function createRampOn(
    fetch: Fetch,
    args: CreateRampOnArgs,
): Promise<MantecaSynthetic> {
    return postJson<MantecaSynthetic>(fetch, `${BASE}/ramp`, { action: 'onramp', ...args });
}

export async function createRampOff(
    fetch: Fetch,
    args: CreateRampOffArgs,
): Promise<MantecaSynthetic> {
    return postJson<MantecaSynthetic>(fetch, `${BASE}/ramp`, { action: 'offramp', ...args });
}

export async function getSynthetic(
    fetch: Fetch,
    syntheticAnyId: string,
): Promise<MantecaSynthetic | null> {
    try {
        return await apiRequest<MantecaSynthetic>(
            fetch,
            `${BASE}/synthetic?id=${encodeURIComponent(syntheticAnyId)}`,
        );
    } catch (err) {
        if (err instanceof MantecaApiError && err.statusCode === 404) return null;
        throw err;
    }
}

// --- Destinations ---

export async function getWithdrawDestinationInfo(
    fetch: Fetch,
    destination: string,
    country: MantecaExchange,
): Promise<MantecaWithdrawDestination> {
    const params = new URLSearchParams({ destination, country });
    return apiRequest<MantecaWithdrawDestination>(fetch, `${BASE}/withdraw-destination?${params}`);
}
