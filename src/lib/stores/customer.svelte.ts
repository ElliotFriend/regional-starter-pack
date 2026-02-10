/**
 * Customer Store
 *
 * Minimal store for customer state that needs to be shared across components.
 * Uses Svelte 5 runes for reactivity.
 */

import type { Customer, KycStatus } from '$lib/anchors/types';
import { KYC_STATUS } from '$lib/constants';

function createCustomerStore() {
    let customer = $state<Customer | null>(null);

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

        /** Set the current customer */
        set(c: Customer | null) {
            customer = c;
        },

        /** Update the customer's KYC status */
        updateKycStatus(status: KycStatus) {
            if (customer) {
                customer = { ...customer, kycStatus: status };
            }
        },

        /** Clear the customer (logout) */
        clear() {
            customer = null;
        },
    };
}

export const customerStore = createCustomerStore();
