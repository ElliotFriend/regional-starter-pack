import { describe, it, expect } from 'vitest';
import { getAnchor, getAllAnchors } from '$lib/config/anchors';

describe('getAnchor', () => {
    it('returns Etherfuse profile', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('etherfuse');
        expect(anchor!.name).toBe('Etherfuse');
    });

    it('returns AlfredPay profile', () => {
        const anchor = getAnchor('alfredpay');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('alfredpay');
    });

    it('returns BlindPay profile', () => {
        const anchor = getAnchor('blindpay');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('blindpay');
    });

    it('returns Abroad Finance profile', () => {
        const anchor = getAnchor('abroad');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('abroad');
        expect(anchor!.name).toBe('Abroad Finance');
    });

    it('Abroad profile has brazil region with offRamp only', () => {
        const anchor = getAnchor('abroad');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil).toBeDefined();
        expect(anchor!.regions.brazil.offRamp).toBe(true);
        expect(anchor!.regions.brazil.onRamp).toBe(false);
    });

    it('Abroad brazil region has pix rail and USDC token', () => {
        const anchor = getAnchor('abroad');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil.paymentRails).toContain('pix');
        expect(anchor!.regions.brazil.tokens).toContain('USDC');
    });

    it('AlfredPay has brazil region with on and off ramp', () => {
        const anchor = getAnchor('alfredpay');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil).toBeDefined();
        expect(anchor!.regions.brazil.onRamp).toBe(true);
        expect(anchor!.regions.brazil.offRamp).toBe(true);
    });

    it('AlfredPay brazil region has pix rail and USDC token', () => {
        const anchor = getAnchor('alfredpay');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil.paymentRails).toContain('pix');
        expect(anchor!.regions.brazil.tokens).toContain('USDC');
    });

    it('returns undefined for nonexistent anchor', () => {
        expect(getAnchor('nonexistent')).toBeUndefined();
    });
});

describe('getAllAnchors', () => {
    it('returns all 4 anchors', () => {
        const anchors = getAllAnchors();
        expect(anchors).toHaveLength(4);
        const ids = anchors.map((a) => a.id);
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('blindpay');
        expect(ids).toContain('abroad');
    });
});
