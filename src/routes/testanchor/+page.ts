import type { PageLoad } from './$types';

import { createTestAnchorPlaygroundClient } from '$lib/anchors/testanchor';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ fetch }) => {
    const client = createTestAnchorPlaygroundClient(undefined, fetch);

    try {
        const toml = await client.initialize();

        const tomlInfo = {
            sep10: toml.WEB_AUTH_ENDPOINT,
            sep6: toml.TRANSFER_SERVER,
            sep12: toml.KYC_SERVER,
            sep24: toml.TRANSFER_SERVER_SEP0024,
            sep31: toml.DIRECT_PAYMENT_SERVER,
            sep38: toml.ANCHOR_QUOTE_SERVER,
            signingKey: toml.SIGNING_KEY,
            currencies: toml.CURRENCIES?.filter((c) => c.code).map((c) => ({
                code: c.code!,
                issuer: c.issuer,
            })),
        };

        return {
            /** the initialized testanchor client */
            client,
            /** the toml information for the testanchor */
            tomlInfo,
            /** a promise resolving to the sep24 /info data */
            sep24Info: client.sep24.getInfo(),
            /** a promise resolving to the sep6 /info data */
            sep6Info: client.sep6.getInfo(),
            /** a promise resolving to the sep38 /info data */
            sep38Info: client.sep38.getInfo(),
        };
    } catch (e: unknown) {
        error(500, { message: e instanceof Error ? e.message : 'Failed to initialize' });
    }
};
