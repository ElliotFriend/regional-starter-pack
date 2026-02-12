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
import { KYC_STATUS } from '$lib/constants';

const STORAGE_PREFIX = 'stellar:customer:';

function createCustomerStore() {
    let customer = $state<Customer | null>(null);
    let activePublicKey: string | null = null;

    function storageKey(publicKey: string) {
        return `${STORAGE_PREFIX}${publicKey}`;
    }

    /** Write the current customer to localStorage. */
    function persist() {
        if (!browser || !activePublicKey || !customer) return;
        localStorage.setItem(storageKey(activePublicKey), JSON.stringify(customer));
    }

    return {
        /** The current customer, or null if not logged in */
        get current() {
            return customer;
        },

        /** Whether a customer is loaded */
        get isLoggedIn() {
            return customer !== null;
        },

        /** Whether the customer's KYC is approved */
        get isKycApproved() {
            return customer?.kycStatus === KYC_STATUS.APPROVED;
        },

        /**
         * Hydrate customer state from localStorage for a given wallet.
         * Call this when a wallet connects to restore any previously-stored
         * customer (and their Etherfuse UUID).
         */
        load(publicKey: string) {
            if (!browser) return;
            activePublicKey = publicKey;

            const stored = localStorage.getItem(storageKey(publicKey));
            if (stored) {
                try {
                    customer = JSON.parse(stored);
                } catch {
                    localStorage.removeItem(storageKey(publicKey));
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
        },
    };
}

export const customerStore = createCustomerStore();
