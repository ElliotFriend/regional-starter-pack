/**
 * Chipper client singleton (server-side only).
 *
 * Reads the sandbox/production base URL and the secret Bearer key from
 * `$env/static/private` and constructs one {@link ChipperClient} shared across
 * route handlers. Chipper is partner-level, so one instance serves every user.
 */

import { ChipperClient, assertSandboxKey } from '$lib/anchors/chipper';
import { CHIPPER_API_URL, CHIPPER_SECRET_KEY } from '$env/static/private';
import { dev } from '$app/environment';

let instance: ChipperClient | undefined;

/** Return the lazily-instantiated Chipper client. */
export function getChipper(): ChipperClient {
    if (!instance) {
        // The proxy routes are unauthenticated, so this demo runs on sandbox
        // keys only; a live key would let any visitor move real money.
        assertSandboxKey(CHIPPER_SECRET_KEY);
        instance = new ChipperClient({
            apiKey: CHIPPER_SECRET_KEY,
            baseUrl: CHIPPER_API_URL,
            // Request/response logging in local dev only; bodies carry phone numbers.
            debug: dev,
        });
    }
    return instance;
}
