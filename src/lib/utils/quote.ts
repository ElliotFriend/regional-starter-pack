/**
 * Quote utilities
 *
 * Helpers for building quote-related identifiers across ramp flows.
 */

import type { AnchorCapabilities } from '$lib/anchors/types';

/**
 * Build a customerId for quote requests.
 *
 * BlindPay expects a composite `"customerId:resourceId"` format. For other
 * providers the plain customer ID is returned.
 *
 * @param customerId  - The base customer ID
 * @param capabilities - Anchor capability flags
 * @param resourceId  - The resource ID to append (blockchainWalletId for on-ramp, bankAccountId for off-ramp)
 */
export function getQuoteCustomerId(
    customerId: string,
    capabilities: AnchorCapabilities | undefined,
    resourceId?: string,
): string {
    if (capabilities?.compositeQuoteCustomerId && resourceId) {
        return `${customerId}:${resourceId}`;
    }
    return customerId;
}

/**
 * Calculate the minutes and seconds until a specified time is reached.
 *
 * @param expiresAt - stringified date when the quote will expire
 */
export function calculateExpiresIn(expiresAt: string): string {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}
