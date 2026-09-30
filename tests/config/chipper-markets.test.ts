import { describe, it, expect } from 'vitest';
import {
    CHIPPER_MARKETS,
    getChipperMarket,
    normalizePhone,
    maxSendableUsdc,
    shortfall,
    shouldOfferStartOver,
    groupMethods,
} from '$lib/config/chipper-markets';

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

    it('ships a sandbox bank account number that validates (no 00000x trigger suffix)', () => {
        for (const m of Object.values(CHIPPER_MARKETS)) {
            expect(m.testBankAccount).toMatch(/^\d{10}$/);
            expect(m.testBankAccount).not.toMatch(/00000[0-2]$/);
        }
    });

    it('offers bank-transfer on-ramps in Kenya only (Ghana bank pay-ins need an org representative)', () => {
        expect(CHIPPER_MARKETS.kenya.bankOnRamp).toBe(true);
        expect(CHIPPER_MARKETS.ghana.bankOnRamp).toBe(false);
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

describe('maxSendableUsdc', () => {
    it('leaves room for the 0.5% fee Chipper adds to the USDC sent', () => {
        // 10 / 1.005 = 9.950248…, floored to 6 decimals so amount + fee ≤ balance
        expect(maxSendableUsdc('10')).toBe('9.950248');
        expect(maxSendableUsdc('0')).toBe('0.000000');
        expect(maxSendableUsdc('')).toBe('0.000000');
    });
});

describe('shortfall', () => {
    it('reports how much USDC is missing to fund the order, or null when covered', () => {
        expect(shortfall('10.050000', '10.0000000')).toBe('0.050000');
        expect(shortfall('4.020000', '13.9700000')).toBeNull();
        expect(shortfall('4.020000', '4.0200000')).toBeNull();
    });
});

describe('shouldOfferStartOver', () => {
    const live = { failed: false };
    it('offers a restart when the order failed, the poll timed out, or a sandbox trigger fired', () => {
        expect(shouldOfferStartOver({ failed: true }, false, null)).toBe(true);
        expect(shouldOfferStartOver(live, true, null)).toBe(true);
        expect(shouldOfferStartOver(live, false, 'delayed_completion')).toBe(true);
    });
    it('does not interrupt a healthy in-flight order', () => {
        expect(shouldOfferStartOver(live, false, null)).toBe(false);
        expect(shouldOfferStartOver(null, false, null)).toBe(false);
    });
});

describe('groupMethods', () => {
    const m = (code: string, name: string, type: string) => ({
        code,
        name,
        type,
        status: 'operational',
        limits: null,
    });

    it('puts mobile money first in catalog order, then banks sorted by name', () => {
        const groups = groupMethods([
            m('gh_mtn', 'MTN Mobile Money', 'mobile_money'),
            m('gh_gcb', 'GCB Bank', 'bank_transfer'),
            m('gh_vodafone', 'Telecel Cash', 'mobile_money'),
            m('gh_absa', 'Absa Bank Ghana', 'bank_transfer'),
            m('gh_access', 'access bank', 'bank_transfer'),
        ]);
        expect(groups.map((g) => g.label)).toEqual(['Mobile money', 'Banks']);
        expect(groups[0].methods.map((x) => x.code)).toEqual(['gh_mtn', 'gh_vodafone']);
        expect(groups[1].methods.map((x) => x.code)).toEqual(['gh_absa', 'gh_access', 'gh_gcb']);
    });

    it('omits an empty group', () => {
        const groups = groupMethods([m('ke_mpesa', 'M-Pesa Kenya', 'mobile_money')]);
        expect(groups.map((g) => g.label)).toEqual(['Mobile money']);
    });
});
