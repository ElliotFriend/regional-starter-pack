/**
 * Test anchor client singleton (server-side only).
 */

import { TestAnchorRampClient } from '$lib/anchors/testanchor';
import { dev } from '$app/environment';

let instance: TestAnchorRampClient | undefined;

/** Lazily-instantiated TestAnchorRampClient. */
export function getTestAnchor(): TestAnchorRampClient {
    if (!instance) {
        // Request logging in local dev only.
        instance = new TestAnchorRampClient({ debug: dev });
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
