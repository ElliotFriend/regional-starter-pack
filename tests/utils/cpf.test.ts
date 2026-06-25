import { describe, it, expect } from 'vitest';
import { isValidCpf, cpfCheckDigits, generateCpf } from '$lib/utils/cpf';

describe('cpfCheckDigits', () => {
    it('computes both modulo-11 check digits', () => {
        // 123456789 → check digits "09" (the known test CPF 12345678909).
        expect(cpfCheckDigits('123456789')).toBe('09');
        // 403608938 → "21" (Manteca's Brazil docs example 403.608.938-21).
        expect(cpfCheckDigits('403608938')).toBe('21');
    });
});

describe('isValidCpf', () => {
    it('accepts known-valid CPFs (with and without separators)', () => {
        expect(isValidCpf('12345678909')).toBe(true);
        expect(isValidCpf('40360893821')).toBe(true);
        expect(isValidCpf('403.608.938-21')).toBe(true);
    });

    it('rejects a wrong check digit', () => {
        expect(isValidCpf('12345678900')).toBe(false);
    });

    it('rejects all-same-digit CPFs even though their checksum passes', () => {
        expect(isValidCpf('00000000000')).toBe(false);
        expect(isValidCpf('11111111111')).toBe(false);
    });

    it('rejects wrong length / non-numeric', () => {
        expect(isValidCpf('1234567890')).toBe(false);
        expect(isValidCpf('abcdefghijk')).toBe(false);
        expect(isValidCpf('')).toBe(false);
    });
});

describe('generateCpf', () => {
    it('always produces a valid 11-digit CPF', () => {
        for (let i = 0; i < 500; i++) {
            const c = generateCpf();
            expect(c).toMatch(/^\d{11}$/);
            expect(isValidCpf(c), c).toBe(true);
        }
    });
});
