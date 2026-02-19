/**
 * Anchor factory and registry
 * Add new anchor implementations here
 */

import type { Anchor } from './types';
import { AlfredPayClient } from './alfredpay';
import {
    ALFREDPAY_API_KEY,
    ALFREDPAY_API_SECRET,
    ALFREDPAY_BASE_URL,
    ETHERFUSE_API_KEY,
    ETHERFUSE_BASE_URL,
    BLINDPAY_API_KEY,
    BLINDPAY_INSTANCE_ID,
    BLINDPAY_BASE_URL,
} from '$env/static/private';
import { EtherfuseClient } from './etherfuse';
import { BlindPayClient } from './blindpay';

export type AnchorProvider = 'alfredpay' | 'etherfuse' | 'blindpay';

const anchorInstances = new Map<AnchorProvider, Anchor>();

/**
 * Get an anchor instance by provider name
 * Instances are cached for reuse
 */
export function getAnchor(provider: AnchorProvider): Anchor {
    let anchor = anchorInstances.get(provider);

    if (!anchor) {
        switch (provider) {
            case 'alfredpay':
                anchor = new AlfredPayClient({
                    apiKey: ALFREDPAY_API_KEY,
                    apiSecret: ALFREDPAY_API_SECRET,
                    baseUrl: ALFREDPAY_BASE_URL,
                });
                break;
            case 'etherfuse':
                anchor = new EtherfuseClient({
                    apiKey: ETHERFUSE_API_KEY,
                    baseUrl: ETHERFUSE_BASE_URL,
                });
                break;
            case 'blindpay':
                anchor = new BlindPayClient({
                    apiKey: BLINDPAY_API_KEY,
                    instanceId: BLINDPAY_INSTANCE_ID,
                    baseUrl: BLINDPAY_BASE_URL,
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
 * Check if a provider name is valid
 */
export function isValidProvider(provider: string): provider is AnchorProvider {
    return ['alfredpay', 'etherfuse', 'blindpay'].includes(provider);
}

export * from './types';
export { AlfredPayClient } from './alfredpay';
export { EtherfuseClient } from './etherfuse';
export { BlindPayClient } from './blindpay';

// SEP modules - can be composed to build anchor integrations
export * as sep from './sep';

// Test anchor client for testanchor.stellar.org
export { TestAnchorClient, createTestAnchorClient, type TestAnchorConfig } from './testanchor';
