/**
 * SEP-10 session helper.
 *
 * Wraps the `ensureAuth` / `cachedAuth` / Freighter-sign / authStore
 * handshake that was duplicated in every flow page using a SEP-10-authed
 * anchor (the four testanchor pages on this branch; future Koywe-and-similar
 * pages will use it too).
 *
 * The factory is parameterised on a `(provider, endpoints)` pair so any
 * anchor's `getChallenge`/`submitChallenge` wrapper can be plugged in.
 */

import { walletStore } from '$lib/stores/wallet.svelte';
import { authStore } from '$lib/stores/auth';
import { signWithFreighter } from './freighter';

/** The two operations a SEP-10 session needs from an anchor's API client. */
export interface Sep10Endpoints {
    /** Request a challenge transaction for the given account. */
    getChallenge: (
        fetch: typeof globalThis.fetch,
        account: string,
    ) => Promise<{ transaction: string }>;
    /** Exchange a wallet-signed challenge for a session token. */
    submitChallenge: (
        fetch: typeof globalThis.fetch,
        signedXdr: string,
    ) => Promise<{ token: string }>;
}

export interface Sep10Session {
    /**
     * Return a cached SEP-10 token if one is fresh for the connected wallet,
     * otherwise run the handshake (which triggers a Freighter signing popup).
     * Returns `undefined` if no wallet is connected.
     *
     * MUST only be called from user-initiated handlers — never from `$effect`
     * or a polling interval, because it may pop a Freighter window.
     */
    ensure: (fetch: typeof globalThis.fetch) => Promise<string | undefined>;
    /**
     * Return the currently-cached SEP-10 token (or `undefined`) without
     * triggering a handshake. Safe to call from background polling.
     */
    cached: () => string | undefined;
}

/** Build a SEP-10 session bound to one provider's challenge/submit endpoints. */
export function createSep10Session(provider: string, endpoints: Sep10Endpoints): Sep10Session {
    return {
        async ensure(fetch) {
            if (!walletStore.publicKey) return undefined;
            const cached = authStore.get(provider, walletStore.publicKey);
            if (cached) return cached;
            const challenge = await endpoints.getChallenge(fetch, walletStore.publicKey);
            const { signedXdr } = await signWithFreighter(
                challenge.transaction,
                walletStore.network,
            );
            const { token } = await endpoints.submitChallenge(fetch, signedXdr);
            authStore.set(provider, walletStore.publicKey, token);
            return token;
        },
        cached() {
            return walletStore.publicKey
                ? authStore.get(provider, walletStore.publicKey)
                : undefined;
        },
    };
}
