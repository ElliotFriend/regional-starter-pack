/**
 * Anchor factory and registry (server-side only)
 *
 * This module uses SvelteKit's `$env/static/private` to read API keys and
 * instantiate anchor clients. It must only be imported from server-side code
 * (e.g. `+server.ts` route handlers).
 *
 * The anchor client implementations themselves (in `$lib/anchors/`) are
 * framework-agnostic and can be copied into any TypeScript project.
 */

import type { Anchor } from '$lib/anchors/types';
import { EtherfuseClient } from '$lib/anchors/etherfuse';
import { PdaxClient } from '$lib/anchors/pdax';
import { createProxiedFetch } from '$lib/anchors/pdax/proxiedFetch';
import {
    ETHERFUSE_API_KEY,
    ETHERFUSE_BASE_URL,
    PDAX_USERNAME,
    PDAX_PASSWORD,
    PDAX_BASE_URL,
    PDAX_PROXY_SECRET,
} from '$env/static/private';

export type AnchorProvider = 'etherfuse' | 'pdax';

const anchorInstances = new Map<AnchorProvider, Anchor>();

/**
 * Get an anchor instance by provider name.
 * Instances are cached for reuse.
 *
 * @param provider - One of the supported anchor provider names.
 * @returns The configured {@link Anchor} instance.
 * @throws {Error} If the provider is not recognized.
 */
export function getAnchor(provider: AnchorProvider): Anchor {
    let anchor = anchorInstances.get(provider);

    if (!anchor) {
        switch (provider) {
            case 'etherfuse':
                anchor = new EtherfuseClient({
                    apiKey: ETHERFUSE_API_KEY,
                    baseUrl: ETHERFUSE_BASE_URL,
                });
                break;
            case 'pdax':
                // No `stateStore` is passed → the client falls back to
                // `InMemoryPdaxStateStore`. That's fine for the demo (single
                // Node process), but a serverless deployment must inject a
                // persistent adapter or the on/off-ramp polls will lose track
                // of in-flight transactions. See `src/lib/anchors/pdax/README.md`
                // for a Vercel KV / Upstash Redis sketch.
                anchor = new PdaxClient({
                    username: PDAX_USERNAME,
                    password: PDAX_PASSWORD,
                    baseUrl: PDAX_BASE_URL,
                    fetchFn: createProxiedFetch(PDAX_PROXY_SECRET),
                });
                break;
            default:
                throw new Error(`Unknown anchor provider: ${provider}`);
        }
        anchorInstances.set(provider, anchor);
    }

    return anchor;
}

/**
 * Check if a provider name is valid.
 *
 * @param provider - The string to validate.
 * @returns `true` if the string is a known {@link AnchorProvider}.
 */
export function isValidProvider(provider: string): provider is AnchorProvider {
    return ['etherfuse', 'pdax'].includes(provider);
}
