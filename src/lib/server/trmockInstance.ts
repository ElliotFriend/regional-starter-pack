/**
 * TR Mock Anchor client singleton (server-side only).
 *
 * `requireBearer` is duplicated from `testanchorInstance.ts` on purpose —
 * per-provider isolation is a project decision and the helper is four lines.
 */

import { error } from '@sveltejs/kit';
import { TrMockRampClient, TrMockError } from '$lib/anchors/trmock';
import { SepApiError } from '$lib/anchors/sep/types';
import { PUBLIC_TRMOCK_HOME_DOMAIN, PUBLIC_USDC_ISSUER } from '$env/static/public';
import { dev } from '$app/environment';

let instance: TrMockRampClient | undefined;

/** Lazily-instantiated TrMockRampClient. */
export function getTrMock(): TrMockRampClient {
    if (!instance) {
        // Request logging in local dev only.
        instance = new TrMockRampClient({
            domain: PUBLIC_TRMOCK_HOME_DOMAIN,
            usdcIssuer: PUBLIC_USDC_ISSUER,
            debug: dev,
        });
    }
    return instance;
}

/** Extract a bearer token from a request's `Authorization` header. */
export function bearerToken(request: Request): string | undefined {
    const header = request.headers.get('authorization');
    if (!header) return undefined;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : undefined;
}

/** Require a bearer token or throw a 401. */
export function requireBearer(request: Request): string {
    const token = bearerToken(request);
    if (!token) {
        const err = new Error('SEP-10 session token required');
        (err as Error & { statusCode?: number }).statusCode = 401;
        throw err;
    }
    return token;
}

/**
 * Shared error-mapping for the trmock proxy routes. Re-throws known error
 * shapes as SvelteKit HTTP errors and otherwise rethrows unchanged.
 *
 * Order matters: `TrMockError` and `SepApiError` first (both carry their own
 * status), then a plain `Error` with a bolted-on `statusCode` (that's
 * `requireBearer`'s 401). Anything else — including an `HttpError` from an
 * inline `throw error(...)` in the calling route, which is not an
 * `instanceof Error` — falls through to `throw err` untouched, so SvelteKit's
 * own error handling still sees it.
 */
export function fail(err: unknown): never {
    if (err instanceof TrMockError) throw error(err.statusCode, { message: err.message });
    if (err instanceof SepApiError) throw error(err.status, { message: err.message });
    if (err instanceof Error && 'statusCode' in err) {
        throw error((err as Error & { statusCode?: number }).statusCode ?? 500, {
            message: err.message,
        });
    }
    throw err;
}
