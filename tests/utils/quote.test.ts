import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateExpiresIn } from '$lib/utils/quote';

describe('calculateExpiresIn', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "Expired" for a past date', () => {
        expect(calculateExpiresIn('2000-01-01T00:00:00Z')).toBe('Expired');
    });

    it('returns minutes and seconds for a future date', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

        const result = calculateExpiresIn('2025-01-01T00:05:30Z');
        expect(result).toBe('5m 30s');
    });

    it('returns only seconds when under a minute', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

        const result = calculateExpiresIn('2025-01-01T00:00:45Z');
        expect(result).toBe('45s');
    });
});
