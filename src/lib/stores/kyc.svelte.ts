/**
 * KYC Store
 *
 * Persists per-transaction identity fields (the PDAX-style flat field map)
 * keyed by `(provider, publicKey)` so they survive page refreshes without a
 * database. Kept separate from the customer store on purpose: customer
 * identity is an opaque API record on most anchors, but for PDAX we own the
 * KYC blob locally and replay it on every /fiat/deposit + /fiat/withdraw call.
 */

import { browser } from '$app/environment';
import type { IdentityFields } from '$lib/anchors/types';

const STORAGE_PREFIX = 'rsp:kyc:';

function createKycStore() {
    let data = $state<IdentityFields | null>(null);
    let activeProvider: string | null = null;
    let activePublicKey: string | null = null;

    function storageKey(provider: string, publicKey: string) {
        return `${STORAGE_PREFIX}${provider}:${publicKey}`;
    }

    function persist() {
        if (!browser || !activeProvider || !activePublicKey) return;
        const key = storageKey(activeProvider, activePublicKey);
        if (data) {
            localStorage.setItem(key, JSON.stringify(data));
        } else {
            localStorage.removeItem(key);
        }
    }

    return {
        /** Current stored identity fields, or null if none. */
        get current() {
            return data;
        },

        /** Hydrate from localStorage for a given (provider, wallet). */
        load(publicKey: string, provider: string) {
            if (!browser) return;
            activeProvider = provider;
            activePublicKey = publicKey;
            const stored = localStorage.getItem(storageKey(provider, publicKey));
            if (stored) {
                try {
                    data = JSON.parse(stored);
                } catch {
                    localStorage.removeItem(storageKey(provider, publicKey));
                    data = null;
                }
            } else {
                data = null;
            }
        },

        /** Replace the stored identity fields wholesale. */
        set(fields: IdentityFields | null) {
            data = fields;
            persist();
        },

        /** Merge new fields into the existing record. */
        merge(fields: IdentityFields) {
            data = { ...(data ?? {}), ...fields };
            persist();
        },

        /** Forget the active session. Does not remove persisted data. */
        clear() {
            data = null;
            activeProvider = null;
            activePublicKey = null;
        },
    };
}

export const kycStore = createKycStore();
