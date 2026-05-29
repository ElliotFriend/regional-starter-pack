/**
 * Koywe client singleton (server-side only).
 *
 * Reads integration credentials from `$env/static/private` and the public USDC
 * issuer from `$env/static/public`, then constructs a single {@link KoyweClient}
 * shared across route handlers.
 *
 * The Argentina sandbox uses a fixed per-region test user
 * (`stellar-ar@koywe-test.com`); the auth token is scoped to that email.
 */

import { KoyweClient } from '$lib/anchors/koywe';
import { KOYWE_CLIENT_ID, KOYWE_SECRET, KOYWE_BASE_URL } from '$env/static/private';
import { PUBLIC_USDC_ISSUER } from '$env/static/public';

/** Argentina sandbox test user (clientId is scoped to this region). */
const KOYWE_AR_EMAIL = 'stellar-ar@koywe-test.com';

let instance: KoyweClient | undefined;

/** Return the lazily-instantiated Koywe client. */
export function getKoywe(): KoyweClient {
    if (!instance) {
        instance = new KoyweClient({
            clientId: KOYWE_CLIENT_ID,
            secret: KOYWE_SECRET,
            baseUrl: KOYWE_BASE_URL,
            email: KOYWE_AR_EMAIL,
            usdcIssuer: PUBLIC_USDC_ISSUER,
        });
    }
    return instance;
}
