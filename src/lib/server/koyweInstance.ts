/**
 * Koywe client singleton (server-side only).
 *
 * Reads integration credentials from `$env/static/private` and the public USDC
 * issuer from `$env/static/public`, then constructs a single {@link KoyweClient}
 * shared across route handlers.
 *
 * The client carries no baked-in user identity: each end-user's email is passed
 * per request (the client caches a JWT per email), so a single shared instance
 * serves every user.
 */

import { KoyweClient } from '#lib/anchors/koywe/index.ts';
import { KOYWE_CLIENT_ID, KOYWE_SECRET, KOYWE_BASE_URL } from '$app/env/private';
import { PUBLIC_USDC_ISSUER } from '$app/env/public';
import { dev } from '$app/env';

let instance: KoyweClient | undefined;

/** Return the lazily-instantiated Koywe client. */
export function getKoywe(): KoyweClient {
    if (!instance) {
        instance = new KoyweClient({
            clientId: KOYWE_CLIENT_ID,
            secret: KOYWE_SECRET,
            baseUrl: KOYWE_BASE_URL,
            usdcIssuer: PUBLIC_USDC_ISSUER,
            // Request/response logging in local dev only — bodies carry PII.
            debug: dev,
        });
    }
    return instance;
}
