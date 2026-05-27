/**
 * Wallet-auth (SEP-10) token store.
 *
 * Caches SEP-10 JWTs keyed by provider + wallet public key, persisted to
 * localStorage so the user isn't prompted to re-sign a Freighter challenge on
 * every navigation or component remount. Tokens are validated against their
 * `exp` claim on read and dropped once expired (or about to expire), so a fresh
 * handshake happens only when one is actually needed.
 *
 * Note: localStorage is readable by any script on the page, so a stored JWT is
 * exposed to XSS. That's an acceptable trade-off for this testnet demo; a
 * production app may prefer an HttpOnly cookie minted by the server instead.
 */

import { browser } from '$app/environment';

const STORAGE_PREFIX = 'rsp:auth:';
// Treat tokens expiring within this window as already stale, so we re-auth
// before an in-flight request would be rejected for an expired token.
const EXPIRY_SKEW_SECONDS = 30;

function storageKey(provider: string, publicKey: string) {
    return `${STORAGE_PREFIX}${provider}:${publicKey}`;
}

/** Decode a JWT's `exp` (seconds since epoch), or `null` if absent/unparseable. */
function tokenExp(token: string): number | null {
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
        const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.exp === 'number' ? json.exp : null;
    } catch {
        return null;
    }
}

/** True if the token is present and not within the expiry skew of expiring. */
function isFresh(token: string): boolean {
    const exp = tokenExp(token);
    if (exp === null) return false; // no exp claim -> don't trust the cache
    return exp - EXPIRY_SKEW_SECONDS > Date.now() / 1000;
}

function createAuthStore() {
    // In-memory mirror of localStorage, to avoid re-reading/parsing on every call.
    const cache = new Map<string, string>();

    function forget(key: string) {
        cache.delete(key);
        if (browser) localStorage.removeItem(key);
    }

    return {
        /**
         * Return a still-valid cached token for this provider + wallet, or
         * `undefined` if none is stored or the stored one has expired (in which
         * case it is cleared). Reading never triggers a wallet prompt.
         */
        get(provider: string, publicKey: string): string | undefined {
            const key = storageKey(provider, publicKey);
            const token =
                cache.get(key) ?? (browser ? (localStorage.getItem(key) ?? undefined) : undefined);
            if (!token) return undefined;
            if (!isFresh(token)) {
                forget(key);
                return undefined;
            }
            cache.set(key, token);
            return token;
        },

        /** Cache and persist a freshly minted token. */
        set(provider: string, publicKey: string, token: string) {
            const key = storageKey(provider, publicKey);
            cache.set(key, token);
            if (browser) localStorage.setItem(key, token);
        },

        /**
         * Clear all in-memory tokens (e.g. on wallet disconnect). Leaves
         * localStorage intact so an unexpired token survives a reconnect.
         */
        clear() {
            cache.clear();
        },
    };
}

export const authStore = createAuthStore();
