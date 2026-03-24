import { describe, it, expect } from 'vitest';
import { PROVIDER, SUPPORTED_COUNTRIES } from '$lib/constants';

describe('PROVIDER', () => {
    it('includes ABROAD', () => {
        expect(PROVIDER.ABROAD).toBe('abroad');
    });
});

describe('SUPPORTED_COUNTRIES', () => {
    it('includes Brazil with BRL and PIX', () => {
        const brazil = SUPPORTED_COUNTRIES.find((c) => c.code === 'BR');
        expect(brazil).toBeDefined();
        expect(brazil!.name).toBe('Brazil');
        expect(brazil!.currency).toBe('BRL');
        expect(brazil!.paymentMethod).toBe('PIX');
    });
});
