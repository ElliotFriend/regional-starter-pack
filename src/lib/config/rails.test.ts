import { describe, it, expect } from 'vitest';
import { getPaymentRail } from './rails';

describe('getPaymentRail', () => {
    it('returns SPEI rail', () => {
        const rail = getPaymentRail('spei');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('spei');
        expect(rail!.name).toBe('SPEI');
        expect(rail!.type).toBe('bank_transfer');
    });

    it('returns undefined for nonexistent rail', () => {
        expect(getPaymentRail('nonexistent')).toBeUndefined();
    });
});
