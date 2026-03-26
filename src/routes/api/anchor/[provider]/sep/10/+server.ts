/**
 * SEP-10 Challenge Proxy
 *
 * Generic route for any SEP-compliant anchor. Fetches a SEP-10 challenge
 * and optionally co-signs it with the app's signing key if a `client_domain`
 * operation is present.
 *
 * The client then signs the challenge with Freighter and submits it directly
 * to the anchor to obtain a JWT. The JWT stays client-side.
 *
 * Only works for anchors that have `sepDomain` set on their Anchor client.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TransactionBuilder, Keypair, Networks } from '@stellar/stellar-sdk';
import { sep1, sep10 } from '$lib/anchors/sep';
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
import { SEP1_SIGNING_KEY_SECRET } from '$env/static/private';

// const NETWORK_PASSPHRASES: Record<string, string> = {
//     testnet: 'Test SDF Network ; September 2015',
//     public: 'Public Global Stellar Network ; September 2015',
// };

export const GET: RequestHandler = async ({ params, url }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    const anchor = getAnchor(provider);

    if (!anchor.sepDomain) {
        throw error(400, {
            message: `Provider '${provider}' is not a SEP-compliant anchor`,
        });
    }

    const account = url.searchParams.get('account');
    const clientDomain =
        url.searchParams.get('client_domain') || 'regional-starter-pack.vercel.app';

    if (!account) {
        throw error(400, { message: 'account query parameter is required' });
    }

    try {
        // 1. Discover the anchor's SEP-10 auth endpoint
        const toml = await sep1.fetchStellarToml(anchor.sepDomain);
        const authEndpoint = sep1.getSep10Endpoint(toml);
        const serverSigningKey = sep1.getSigningKey(toml);

        if (!authEndpoint) {
            throw error(500, {
                message: `${anchor.displayName} does not advertise a SEP-10 auth endpoint`,
            });
        }

        const networkPassphrase = sep1.getNetworkPassphrase(toml) ?? Networks.TESTNET;

        // 2. Fetch the challenge from the anchor
        const challenge = await sep10.getChallenge(
            {
                authEndpoint,
                serverSigningKey: serverSigningKey || '',
                networkPassphrase,
                // homeDomain: anchor.sepDomain,
            },
            account,
            { clientDomain },
        );

        // 3. If client_domain operation is present, co-sign with our signing key
        let challengeXdr = challenge.transaction;

        if (clientDomain && SEP1_SIGNING_KEY_SECRET) {
            const tx = TransactionBuilder.fromXDR(
                challengeXdr,
                challenge.network_passphrase || networkPassphrase,
            );

            const hasClientDomainOp = tx.operations.some(
                (op) => op.type === 'manageData' && op.name === 'client_domain',
            );

            if (hasClientDomainOp) {
                const signingKeypair = Keypair.fromSecret(SEP1_SIGNING_KEY_SECRET);
                tx.sign(signingKeypair);
                challengeXdr = tx.toXDR();
            }
        }

        // 4. Return the (possibly co-signed) challenge to the client
        return json({
            transaction: challengeXdr,
            network_passphrase: challenge.network_passphrase || networkPassphrase,
            authEndpoint,
        });
    } catch (err) {
        if (err instanceof Error && 'status' in err) {
            throw err;
        }
        const message = err instanceof Error ? err.message : 'Failed to fetch SEP-10 challenge';
        throw error(500, { message });
    }
};
