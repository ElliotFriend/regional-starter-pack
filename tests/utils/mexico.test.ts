import { describe, it, expect } from 'vitest';
import {
    isValidCurp,
    curpCheckDigit,
    generateCurp,
    isValidRfc,
    rfcCheckChar,
    generateRfc,
    isValidClabe,
    clabeCheckDigit,
    generateClabe,
} from '$lib/utils/mexico';

// -----------------------------------------------------------------------------
// CURP
// -----------------------------------------------------------------------------

// Oracle: first 17 chars sum to 1979 under the RENAPO dictionary/weights, so
// 1979 % 10 = 9 -> check digit (10 - 9) % 10 = 1.
const VALID_CURP = 'SABC560626MDFLRN01';

describe('curpCheckDigit', () => {
    it('computes the RENAPO mod-10 check digit', () => {
        expect(curpCheckDigit(VALID_CURP.slice(0, 17))).toBe(1);
    });
});

describe('isValidCurp', () => {
    it('accepts a known-valid CURP (any case, surrounding space)', () => {
        expect(isValidCurp(VALID_CURP)).toBe(true);
        expect(isValidCurp(VALID_CURP.toLowerCase())).toBe(true);
        expect(isValidCurp(`  ${VALID_CURP}  `)).toBe(true);
    });

    it('rejects a wrong check digit', () => {
        expect(isValidCurp('SABC560626MDFLRN00')).toBe(false);
    });

    it('rejects wrong length', () => {
        expect(isValidCurp('SABC560626MDFLRN0')).toBe(false); // 17
        expect(isValidCurp(`${VALID_CURP}0`)).toBe(false); // 19
        expect(isValidCurp('')).toBe(false);
    });

    it('rejects structural violations', () => {
        expect(isValidCurp('1ABC560626MDFLRN01')).toBe(false); // 1st not a letter
        expect(isValidCurp('SXBC560626MDFLRN01')).toBe(false); // 2nd not a vowel
        expect(isValidCurp('SABC561326MDFLRN01')).toBe(false); // month 13
        expect(isValidCurp('SABC560626XDFLRN01')).toBe(false); // sex not H/M
        expect(isValidCurp('SABC560626MZZLRN01')).toBe(false); // ZZ not a state code
        expect(isValidCurp('SABC560626MDFAER01')).toBe(false); // vowel in consonant slot
    });
});

describe('generateCurp', () => {
    it('always produces a structurally valid, checksum-valid CURP', () => {
        for (let i = 0; i < 500; i++) {
            const c = generateCurp();
            expect(c, c).toMatch(/^[A-Z]{4}\d{6}[HM][A-Z]{2}[A-Z]{3}[0-9A-Z]\d$/);
            expect(isValidCurp(c), c).toBe(true);
        }
    });

    it('honors a requested sex', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateCurp('H')[10]).toBe('H');
            expect(generateCurp('M')[10]).toBe('M');
        }
    });
});

// -----------------------------------------------------------------------------
// RFC (persona física)
// -----------------------------------------------------------------------------

// Oracle: the classic SAT example RFC, check character '8'.
const VALID_RFC = 'GODE561231GR8';

describe('rfcCheckChar', () => {
    it('computes the SAT modulo-11 check character', () => {
        expect(rfcCheckChar(VALID_RFC.slice(0, 12))).toBe('8');
    });
});

describe('isValidRfc', () => {
    it('accepts a known-valid RFC (any case, surrounding space)', () => {
        expect(isValidRfc(VALID_RFC)).toBe(true);
        expect(isValidRfc(VALID_RFC.toLowerCase())).toBe(true);
        expect(isValidRfc(`  ${VALID_RFC}  `)).toBe(true);
    });

    it('rejects a wrong check character', () => {
        expect(isValidRfc('GODE561231GR0')).toBe(false);
    });

    it('rejects wrong length / structure', () => {
        expect(isValidRfc('GODE561231GR')).toBe(false); // 12 (moral length)
        expect(isValidRfc('GODE561331GR8')).toBe(false); // month 13
        expect(isValidRfc('')).toBe(false);
    });
});

describe('generateRfc', () => {
    it('always produces a structurally valid, checksum-valid RFC', () => {
        for (let i = 0; i < 500; i++) {
            const r = generateRfc();
            expect(r, r).toMatch(/^[A-Z]{4}\d{6}[A-Z\d]{2}[A-Z\d]$/);
            expect(isValidRfc(r), r).toBe(true);
        }
    });
});

// -----------------------------------------------------------------------------
// CLABE
// -----------------------------------------------------------------------------

// Oracle: canonical valid CLABE (check digit 9).
const VALID_CLABE = '032180000118359719';

describe('clabeCheckDigit', () => {
    it('computes the [3,7,1]-weighted mod-10 check digit', () => {
        expect(clabeCheckDigit(VALID_CLABE.slice(0, 17))).toBe(9);
    });
});

describe('isValidClabe', () => {
    it('accepts a known-valid CLABE (with or without separators)', () => {
        expect(isValidClabe(VALID_CLABE)).toBe(true);
        expect(isValidClabe('032 180 00011835971 9')).toBe(true);
    });

    it('rejects the checksum-invalid placeholder CLABE', () => {
        // The Koywe MX placeholder ends in 3; its correct check digit is 4.
        expect(isValidClabe('646180374711307483')).toBe(false);
        expect(clabeCheckDigit('64618037471130748')).toBe(4);
    });

    it('rejects wrong length / non-numeric', () => {
        expect(isValidClabe('03218000011835971')).toBe(false); // 17
        expect(isValidClabe('abcdefghijklmnopqr')).toBe(false);
        expect(isValidClabe('')).toBe(false);
    });
});

describe('generateClabe', () => {
    it('always produces a valid 18-digit CLABE', () => {
        for (let i = 0; i < 500; i++) {
            const c = generateClabe();
            expect(c, c).toMatch(/^\d{18}$/);
            expect(isValidClabe(c), c).toBe(true);
        }
    });

    it('honors a requested 3-digit bank code', () => {
        for (let i = 0; i < 50; i++) {
            expect(generateClabe('646').slice(0, 3)).toBe('646');
        }
    });

    it('rejects a bad bank code', () => {
        expect(() => generateClabe('6460')).toThrow();
    });
});
