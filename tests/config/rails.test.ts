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

    it('returns WIREAR (CVU) rail', () => {
        const rail = getPaymentRail('wirear');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('wirear');
        expect(rail!.type).toBe('bank_transfer');
        expect(rail!.description).toBeDefined();
    });

    it('returns QRI rail', () => {
        const rail = getPaymentRail('qri');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('qri');
    });

    it('returns CVU rail (Argentina — Manteca CVU/CBU/alias)', () => {
        const rail = getPaymentRail('cvu');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('cvu');
        expect(rail!.type).toBe('bank_transfer');
        expect(rail!.description).toBeDefined();
    });

    it('returns BRE-B rail (Colombia)', () => {
        const rail = getPaymentRail('breb');
        expect(rail).toBeDefined();
        expect(rail!.id).toBe('breb');
        expect(rail!.type).toBe('bank_transfer');
        expect(rail!.description).toBeDefined();
    });

    it('returns undefined for nonexistent rail', () => {
        expect(getPaymentRail('nonexistent')).toBeUndefined();
    });
});

describe('pse rail', () => {
    it('defines the Colombian PSE rail', () => {
        expect(getPaymentRail('pse')).toBeDefined();
        expect(getPaymentRail('pse')!.id).toBe('pse');
        expect(getPaymentRail('pse')!.type).toBe('bank_transfer');
        expect(getPaymentRail('pse')!.name).toBe('PSE');
    });
});
