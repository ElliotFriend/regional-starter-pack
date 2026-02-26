import { describe, it, expect } from 'vitest';
import { isKycComplete, needsMoreInfo, isProcessing, isRejected } from './sep12';
import type { Sep12Status } from './types';

describe('isKycComplete', () => {
    it('returns true for ACCEPTED', () => {
        expect(isKycComplete('ACCEPTED')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isKycComplete('PROCESSING')).toBe(false);
        expect(isKycComplete('NEEDS_INFO')).toBe(false);
        expect(isKycComplete('REJECTED')).toBe(false);
    });
});

describe('needsMoreInfo', () => {
    it('returns true for NEEDS_INFO', () => {
        expect(needsMoreInfo('NEEDS_INFO')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(needsMoreInfo('ACCEPTED')).toBe(false);
        expect(needsMoreInfo('PROCESSING')).toBe(false);
        expect(needsMoreInfo('REJECTED')).toBe(false);
    });
});

describe('isProcessing', () => {
    it('returns true for PROCESSING', () => {
        expect(isProcessing('PROCESSING')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isProcessing('ACCEPTED')).toBe(false);
        expect(isProcessing('NEEDS_INFO')).toBe(false);
        expect(isProcessing('REJECTED')).toBe(false);
    });
});

describe('isRejected', () => {
    it('returns true for REJECTED', () => {
        expect(isRejected('REJECTED')).toBe(true);
    });

    it('returns false for other statuses', () => {
        const others: Sep12Status[] = ['ACCEPTED', 'PROCESSING', 'NEEDS_INFO'];
        others.forEach((status) => {
            expect(isRejected(status)).toBe(false);
        });
    });
});
