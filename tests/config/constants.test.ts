import { describe, it, expect } from 'vitest';
import { PROVIDER, SUPPORTED_COUNTRIES } from '$lib/constants';

describe('PROVIDER', () => {
    it('includes ETHERFUSE', () => {
        expect(PROVIDER.ETHERFUSE).toBe('etherfuse');
    });

    it('includes TESTANCHOR', () => {
        expect(PROVIDER.TESTANCHOR).toBe('testanchor');
    });

    it('has the expected providers', () => {
        expect(Object.keys(PROVIDER)).toHaveLength(2);
    });
});

describe('SUPPORTED_COUNTRIES', () => {
    it('includes Mexico with MXN and SPEI', () => {
        const mexico = SUPPORTED_COUNTRIES.find((c) => c.code === 'MX');
        expect(mexico).toBeDefined();
        expect(mexico!.name).toBe('Mexico');
        expect(mexico!.currency).toBe('MXN');
        expect(mexico!.paymentMethod).toBe('SPEI');
    });

    it('includes Brazil with BRL and PIX', () => {
        const brazil = SUPPORTED_COUNTRIES.find((c) => c.code === 'BR');
        expect(brazil).toBeDefined();
        expect(brazil!.name).toBe('Brazil');
        expect(brazil!.currency).toBe('BRL');
        expect(brazil!.paymentMethod).toBe('PIX');
    });
});
