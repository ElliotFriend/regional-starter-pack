import { describe, it, expect } from 'vitest';
import { getPaymentRail } from '$lib/config/rails';

describe('getPaymentRail', () => {
    it('returns SPEI rail', () => {
        const rail = getPaymentRail('spei');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('spei');
        expect(rail!.name).toBe('SPEI');
        expect(rail!.type).toBe('bank_transfer');
    });

    it('returns PIX rail', () => {
        const rail = getPaymentRail('pix');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('pix');
        expect(rail!.name).toBe('PIX');
        expect(rail!.type).toBe('bank_transfer');
        expect(rail!.description).toBeDefined();
    });

    it('returns undefined for nonexistent rail', () => {
        expect(getPaymentRail('nonexistent')).toBeUndefined();
    });
});
