/**
 * Customer Store
 *
 * Minimal store for customer state that needs to be shared across components.
 * Uses Svelte 5 runes for reactivity.
 *
 * Persists customer data to localStorage keyed by wallet public key so that
 * Etherfuse customer UUIDs (and other customer state) survive page refreshes
 * without requiring a database.
 */

import { browser } from '$app/environment';
import type { Customer, KycStatus } from '$lib/anchors/types';

const STORAGE_PREFIX = 'stellar:customer:';

function createCustomerStore() {
    let customer = $state<Customer | null>(null);
    let activePublicKey: string | null = null;
    let activeProvider: string | null = null;

    function storageKey(provider: string, publicKey: string) {
        return `${STORAGE_PREFIX}${provider}:${publicKey}`;
    }

    /** Write the current customer to localStorage. */
    function persist() {
        if (!browser || !activeProvider || !activePublicKey || !customer) return;
        localStorage.setItem(storageKey(activeProvider, activePublicKey), JSON.stringify(customer));
    }

    return {
        /** The current customer, or null if not logged in */
        get current() {
            return customer;
        },

        /**
         * Hydrate customer state from localStorage for a given wallet and provider.
         * Call this when a wallet connects to restore any previously-stored
         * customer for this specific provider.
         */
        load(publicKey: string, provider: string) {
            if (!browser) return;
            activePublicKey = publicKey;
            activeProvider = provider;

            const stored = localStorage.getItem(storageKey(provider, publicKey));
            if (stored) {
                try {
                    customer = JSON.parse(stored);
                } catch {
                    localStorage.removeItem(storageKey(provider, publicKey));
                    customer = null;
                }
            } else {
                customer = null;
            }
        },

        /** Set the current customer (also persists to localStorage) */
        set(c: Customer | null) {
            customer = c;
            persist();
        },

        /** Update the customer's KYC status (also persists to localStorage) */
        updateKycStatus(status: KycStatus) {
            if (customer) {
                customer = { ...customer, kycStatus: status };
                persist();
            }
        },

        /** Clear the customer (logout). Does NOT remove localStorage data so the customer can be restored on reconnect. */
        clear() {
            customer = null;
            activePublicKey = null;
            activeProvider = null;
        },
    };
}

export const customerStore = createCustomerStore();
