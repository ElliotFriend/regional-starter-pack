import { describe, it, expect } from 'vitest';
import { isValidCuit, cuitCheckDigit, generateCuit } from '$lib/utils/cuit';

describe('cuitCheckDigit', () => {
    it('computes the AFIP modulo-11 check digit', () => {
        // 20-12345678 → check digit 6 (the known sandbox CUIT 20123456786).
        expect(cuitCheckDigit('2012345678')).toBe(6);
    });
});

describe('isValidCuit', () => {
    it('accepts a known-valid CUIT (with and without separators)', () => {
        expect(isValidCuit('20123456786')).toBe(true);
        expect(isValidCuit('20-12345678-6')).toBe(true);
    });

    it('rejects a wrong check digit', () => {
        expect(isValidCuit('20123456780')).toBe(false);
    });

    it('rejects wrong length / non-numeric', () => {
        expect(isValidCuit('2012345678')).toBe(false);
        expect(isValidCuit('abcdefghijk')).toBe(false);
        expect(isValidCuit('')).toBe(false);
    });
});

describe('generateCuit', () => {
    it('always produces a valid 11-digit CUIT with an individual prefix', () => {
        const prefixes = new Set(['20', '23', '24', '27']);
        for (let i = 0; i < 500; i++) {
            const c = generateCuit();
            expect(c).toMatch(/^\d{11}$/);
            expect(isValidCuit(c), c).toBe(true);
            expect(prefixes.has(c.slice(0, 2)), c).toBe(true);
        }
    });

    it('honors a requested prefix', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateCuit(27).slice(0, 2)).toBe('27');
        }
    });
});
