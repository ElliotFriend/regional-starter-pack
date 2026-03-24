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
import { AlfredPayClient } from '$lib/anchors/alfredpay';
import { BlindPayClient } from '$lib/anchors/blindpay';
import { AbroadClient } from '$lib/anchors/abroad';
import { TransferoClient } from '$lib/anchors/transfero';
import {
    ETHERFUSE_API_KEY,
    ETHERFUSE_BASE_URL,
    ALFREDPAY_API_KEY,
    ALFREDPAY_API_SECRET,
    ALFREDPAY_BASE_URL,
    BLINDPAY_API_KEY,
    BLINDPAY_INSTANCE_ID,
    BLINDPAY_BASE_URL,
    ABROAD_API_KEY,
    ABROAD_BASE_URL,
    TRANSFERO_CLIENT_ID,
    TRANSFERO_CLIENT_SECRET,
    TRANSFERO_SCOPE,
    TRANSFERO_API_URL,
} from '$env/static/private';

export type AnchorProvider = 'etherfuse' | 'alfredpay' | 'blindpay' | 'abroad' | 'transfero';

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
            case 'alfredpay':
                anchor = new AlfredPayClient({
                    apiKey: ALFREDPAY_API_KEY,
                    apiSecret: ALFREDPAY_API_SECRET,
                    baseUrl: ALFREDPAY_BASE_URL,
                });
                break;
            case 'blindpay':
                anchor = new BlindPayClient({
                    apiKey: BLINDPAY_API_KEY,
                    instanceId: BLINDPAY_INSTANCE_ID,
                    baseUrl: BLINDPAY_BASE_URL,
                });
                break;
            case 'abroad':
                anchor = new AbroadClient({
                    apiKey: ABROAD_API_KEY,
                    baseUrl: ABROAD_BASE_URL,
                });
                break;
            case 'transfero':
                anchor = new TransferoClient({
                    clientId: TRANSFERO_CLIENT_ID,
                    clientSecret: TRANSFERO_CLIENT_SECRET,
                    scope: TRANSFERO_SCOPE,
                    baseUrl: TRANSFERO_API_URL,
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
    return ['etherfuse', 'alfredpay', 'blindpay', 'abroad', 'transfero'].includes(provider);
}
