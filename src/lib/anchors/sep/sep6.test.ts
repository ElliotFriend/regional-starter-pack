import { describe, it, expect } from 'vitest';
import {
    isComplete,
    isPendingUser,
    isPendingAnchor,
    isFailed,
    isRefunded,
    isInProgress,
    getStatusDescription,
} from './sep6';
import type { TransactionStatus } from './types';

describe('isComplete', () => {
    it('returns true for completed', () => {
        expect(isComplete('completed')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isComplete('pending_anchor')).toBe(false);
        expect(isComplete('error')).toBe(false);
    });
});

describe('isPendingUser', () => {
    const pendingUserStatuses: TransactionStatus[] = [
        'pending_user_transfer_start',
        'pending_user',
        'pending_customer_info_update',
        'pending_transaction_info_update',
    ];

    it.each(pendingUserStatuses)('returns true for %s', (status) => {
        expect(isPendingUser(status)).toBe(true);
    });

    it('returns false for non-user-pending statuses', () => {
        expect(isPendingUser('pending_anchor')).toBe(false);
        expect(isPendingUser('completed')).toBe(false);
    });
});

describe('isPendingAnchor', () => {
    const pendingAnchorStatuses: TransactionStatus[] = [
        'pending_anchor',
        'pending_stellar',
        'pending_external',
        'pending_trust',
        'pending_user_transfer_complete',
    ];

    it.each(pendingAnchorStatuses)('returns true for %s', (status) => {
        expect(isPendingAnchor(status)).toBe(true);
    });

    it('returns false for non-anchor-pending statuses', () => {
        expect(isPendingAnchor('pending_user')).toBe(false);
        expect(isPendingAnchor('completed')).toBe(false);
    });
});

describe('isFailed', () => {
    const failedStatuses: TransactionStatus[] = ['error', 'expired', 'no_market'];

    it.each(failedStatuses)('returns true for %s', (status) => {
        expect(isFailed(status)).toBe(true);
    });

    it('returns false for non-failed statuses', () => {
        expect(isFailed('completed')).toBe(false);
        expect(isFailed('pending_anchor')).toBe(false);
    });
});

describe('isRefunded', () => {
    it('returns true for refunded', () => {
        expect(isRefunded('refunded')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isRefunded('completed')).toBe(false);
    });
});

describe('isInProgress', () => {
    it('returns true for in-progress statuses', () => {
        expect(isInProgress('pending_anchor')).toBe(true);
        expect(isInProgress('pending_user')).toBe(true);
        expect(isInProgress('incomplete')).toBe(true);
    });

    it('returns false for terminal statuses', () => {
        expect(isInProgress('completed')).toBe(false);
        expect(isInProgress('error')).toBe(false);
        expect(isInProgress('refunded')).toBe(false);
    });
});

describe('getStatusDescription', () => {
    const allStatuses: TransactionStatus[] = [
        'incomplete',
        'pending_user_transfer_start',
        'pending_user_transfer_complete',
        'pending_external',
        'pending_anchor',
        'pending_stellar',
        'pending_trust',
        'pending_user',
        'pending_customer_info_update',
        'pending_transaction_info_update',
        'pending_sender',
        'pending_receiver',
        'completed',
        'refunded',
        'expired',
        'error',
        'no_market',
    ];

    it.each(allStatuses)('returns a description for %s', (status) => {
        const desc = getStatusDescription(status);
        expect(desc).toBeTruthy();
        expect(typeof desc).toBe('string');
    });

    it('returns the status itself as fallback for unknown status', () => {
        const desc = getStatusDescription('unknown_status' as TransactionStatus);
        expect(desc).toBe('unknown_status');
    });
});
