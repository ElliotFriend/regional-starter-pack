import { describe, it, expect } from 'vitest';
import { getRegion, getAnchorsForRegion, getRegionsForAnchor } from '$lib/config/regions';
import { getPaymentRail } from '$lib/config/rails';
import { getAnchor } from '$lib/config/anchors';

describe('Philippines region', () => {
    it('is defined with PHP / PH and coins as its anchor', () => {
        const region = getRegion('philippines');
        expect(region).toBeDefined();
        expect(region!.currency).toBe('PHP');
        expect(region!.code).toBe('PH');
        expect(region!.currencySymbol).toBe('₱');
        expect(region!.flag).toBe('🇵🇭');
        expect(region!.anchors).toEqual(['coins']);
    });

    it('exposes local payment rails', () => {
        const railIds = getRegion('philippines')!.paymentRails.map((r) => r.id);
        expect(railIds).toEqual(expect.arrayContaining(['instapay', 'pesonet', 'gcash']));
    });
});

describe('Philippines payment rails', () => {
    it('registers InstaPay/PESONet as bank transfers and GCash/Maya as mobile money', () => {
        expect(getPaymentRail('instapay')?.type).toBe('bank_transfer');
        expect(getPaymentRail('pesonet')?.type).toBe('bank_transfer');
        expect(getPaymentRail('gcash')?.type).toBe('mobile_money');
        expect(getPaymentRail('maya')?.type).toBe('mobile_money');
    });
});

describe('Coins.ph anchor profile', () => {
    it('is a curated anchor operating in the Philippines, on-ramp only for now', () => {
        const coins = getAnchor('coins');
        expect(coins).toBeDefined();
        expect(coins!.regions.philippines).toBeDefined();
        expect(coins!.regions.philippines.onRamp).toBe(true);
        expect(coins!.regions.philippines.offRamp).toBe(false);
        expect(coins!.regions.philippines.tokens).toContain('USDC');
    });

    it('cross-looks up between region and anchor', () => {
        expect(getAnchorsForRegion('philippines').map((a) => a.id)).toEqual(['coins']);
        expect(getRegionsForAnchor('coins').map((r) => r.id)).toEqual(['philippines']);
    });
});
