/**
 * Etherfuse client singleton (server-side only).
 *
 * Reads API credentials from `$env/static/private` and constructs a single
 * {@link EtherfuseClient} instance shared across route handlers.
 */

import { EtherfuseClient } from '$lib/anchors/etherfuse';
import { ETHERFUSE_API_KEY, ETHERFUSE_BASE_URL } from '$env/static/private';

let instance: EtherfuseClient | undefined;

/** Return the lazily-instantiated Etherfuse client. */
export function getEtherfuse(): EtherfuseClient {
    if (!instance) {
        instance = new EtherfuseClient({
            apiKey: ETHERFUSE_API_KEY,
            baseUrl: ETHERFUSE_BASE_URL,
        });
    }
    return instance;
}
