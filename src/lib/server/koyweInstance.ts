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

import { KoyweClient } from '$lib/anchors/koywe';
import { KOYWE_CLIENT_ID, KOYWE_SECRET, KOYWE_BASE_URL } from '$env/static/private';
import { PUBLIC_USDC_ISSUER } from '$env/static/public';

let instance: KoyweClient | undefined;

/** Return the lazily-instantiated Koywe client. */
export function getKoywe(): KoyweClient {
    if (!instance) {
        instance = new KoyweClient({
            clientId: KOYWE_CLIENT_ID,
            secret: KOYWE_SECRET,
            baseUrl: KOYWE_BASE_URL,
            usdcIssuer: PUBLIC_USDC_ISSUER,
        });
    }
    return instance;
}
