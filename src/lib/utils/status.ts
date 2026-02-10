/**
 * Status display utilities
 */

import { TX_STATUS } from '$lib/constants';

/**
 * Get Tailwind CSS classes for transaction status badges
 */
export function getStatusColor(status: string): string {
    switch (status) {
        case TX_STATUS.PENDING:
            return 'bg-yellow-100 text-yellow-800';
        case TX_STATUS.PROCESSING:
            return 'bg-blue-100 text-blue-800';
        case TX_STATUS.COMPLETED:
            return 'bg-green-100 text-green-800';
        case TX_STATUS.FAILED:
        case TX_STATUS.EXPIRED:
        case TX_STATUS.CANCELLED:
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}
