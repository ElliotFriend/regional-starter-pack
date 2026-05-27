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

import type { Anchor, WalletAuthOps, ProgrammaticOps, InteractiveOps } from '$lib/anchors/types';
import { AnchorError } from '$lib/anchors/types';
import { EtherfuseClient } from '$lib/anchors/etherfuse';
import { TestAnchorAdapter } from '$lib/anchors/testanchor';
import { ETHERFUSE_API_KEY, ETHERFUSE_BASE_URL } from '$env/static/private';

export type AnchorProvider = 'etherfuse' | 'testanchor';

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
            case 'testanchor':
                anchor = new TestAnchorAdapter();
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
    return ['etherfuse', 'testanchor'].includes(provider);
}

/**
 * Extract a bearer token from a request's `Authorization` header, if present.
 * Used to thread a wallet-auth (SEP-10) session token through to facet methods.
 */
export function bearerToken(request: Request): string | undefined {
    const header = request.headers.get('authorization');
    if (!header) return undefined;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : undefined;
}

/**
 * Get an anchor's wallet-auth (SEP-10) facet, or throw if it doesn't use
 * wallet-based authentication.
 *
 * @throws {AnchorError} 400 if the provider has no `auth` facet.
 */
export function requireAuth(provider: AnchorProvider): WalletAuthOps {
    const anchor = getAnchor(provider);
    if (!anchor.auth) {
        throw new AnchorError(
            `${provider} does not use wallet-based authentication`,
            'NO_AUTH_FACET',
            400,
        );
    }
    return anchor.auth;
}

/**
 * Get an anchor's programmatic (SEP-6-style) facet, or throw if it doesn't
 * support programmatic ramp operations.
 *
 * @throws {AnchorError} 400 if the provider has no `programmatic` facet.
 */
export function requireProgrammatic(provider: AnchorProvider): ProgrammaticOps {
    const anchor = getAnchor(provider);
    if (!anchor.programmatic) {
        throw new AnchorError(
            `${provider} does not support programmatic ramp operations`,
            'NO_PROGRAMMATIC_FACET',
            400,
        );
    }
    return anchor.programmatic;
}

/**
 * Get an anchor's interactive (SEP-24-style) facet, or throw if it doesn't
 * support interactive ramp operations.
 *
 * @throws {AnchorError} 400 if the provider has no `interactive` facet.
 */
export function requireInteractive(provider: AnchorProvider): InteractiveOps {
    const anchor = getAnchor(provider);
    if (!anchor.interactive) {
        throw new AnchorError(
            `${provider} does not support interactive ramp operations`,
            'NO_INTERACTIVE_FACET',
            400,
        );
    }
    return anchor.interactive;
}
