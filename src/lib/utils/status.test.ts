import { describe, it, expect } from 'vitest';
import { getStatusColor } from './status';

describe('getStatusColor', () => {
    it('returns yellow for pending', () => {
        expect(getStatusColor('pending')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('returns blue for processing', () => {
        expect(getStatusColor('processing')).toBe('bg-blue-100 text-blue-800');
    });

    it('returns green for completed', () => {
        expect(getStatusColor('completed')).toBe('bg-green-100 text-green-800');
    });

    it('returns red for failed', () => {
        expect(getStatusColor('failed')).toBe('bg-red-100 text-red-800');
    });

    it('returns red for expired', () => {
        expect(getStatusColor('expired')).toBe('bg-red-100 text-red-800');
    });

    it('returns red for cancelled', () => {
        expect(getStatusColor('cancelled')).toBe('bg-red-100 text-red-800');
    });

    it('returns gray fallback for unknown status', () => {
        expect(getStatusColor('something_else')).toBe('bg-gray-100 text-gray-800');
    });
});
