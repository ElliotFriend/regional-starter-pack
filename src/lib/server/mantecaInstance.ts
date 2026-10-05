/**
 * Manteca client singleton (server-side only).
 *
 * Reads the API key + base URL from `$env/static/private` and the public USDC
 * issuer from `$env/static/public`, then constructs a single {@link MantecaClient}
 * shared across route handlers.
 *
 * The client carries no baked-in user identity: each end-user is addressed by
 * `userAnyId` per request, so a single shared instance serves every user. The
 * static `md-api-key` never leaves the server.
 */

import { MantecaClient } from '#lib/anchors/manteca/index.ts';
import { MANTECA_API_KEY, MANTECA_BASE_URL } from '$app/env/private';
import { PUBLIC_USDC_ISSUER } from '$app/env/public';
import { dev } from '$app/env';

let instance: MantecaClient | undefined;

/** Return the lazily-instantiated Manteca client. */
export function getManteca(): MantecaClient {
    if (!instance) {
        instance = new MantecaClient({
            apiKey: MANTECA_API_KEY,
            baseUrl: MANTECA_BASE_URL,
            usdcIssuer: PUBLIC_USDC_ISSUER,
            defaultExchange: 'BRAZIL',
            // Request/response logging in local dev only — bodies carry PII.
            debug: dev,
        });
    }
    return instance;
}
