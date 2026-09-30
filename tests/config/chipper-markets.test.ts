import { describe, it, expect } from 'vitest';
import { CHIPPER_MARKETS, getChipperMarket, normalizePhone } from '$lib/config/chipper-markets';

describe('CHIPPER_MARKETS', () => {
    it('covers Ghana and Kenya with country, currency, and dial code', () => {
        expect(Object.keys(CHIPPER_MARKETS).sort()).toEqual(['ghana', 'kenya']);
        expect(CHIPPER_MARKETS.ghana).toMatchObject({
            country: 'GH',
            currency: 'GHS',
            dialCode: '+233',
        });
        expect(CHIPPER_MARKETS.kenya).toMatchObject({
            country: 'KE',
            currency: 'KES',
            dialCode: '+254',
        });
    });

    it('ships sandbox test phones that complete in sandbox', () => {
        expect(CHIPPER_MARKETS.ghana.testPhone).toBe('+233548909027');
        expect(CHIPPER_MARKETS.kenya.testPhone).toBe('+254712345678');
    });

    it('defaults unknown regions to Ghana', () => {
        expect(getChipperMarket(null).id).toBe('ghana');
        expect(getChipperMarket('kenya').id).toBe('kenya');
        expect(getChipperMarket('nope').id).toBe('ghana');
    });
});

describe('normalizePhone', () => {
    it.each([
        ['+233548909027', '+233', '+233548909027'],
        ['233548909027', '+233', '+233548909027'],
        ['0548 909 027', '+233', '+233548909027'],
        ['548-909-027', '+233', '+233548909027'],
        ['0712 345 678', '+254', '+254712345678'],
        ['abc', '+233', null],
        ['', '+254', null],
    ])('%s (%s) → %s', (input, dial, expected) => {
        expect(normalizePhone(input, dial)).toBe(expected);
    });
});
