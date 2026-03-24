import { describe, it, expect } from 'vitest';
import {
    getRegion,
    getAllRegions,
    getAnchorsForRegion,
    getRegionsForAnchor,
} from '$lib/config/regions';

describe('getRegion', () => {
    it('returns Mexico region', () => {
        const region = getRegion('mexico');
        expect(region).toBeDefined();
        expect(region!.id).toBe('mexico');
        expect(region!.name).toBe('Mexico');
        expect(region!.currency).toBe('MXN');
        expect(region!.code).toBe('MX');
    });

    it('returns Brazil region', () => {
        const region = getRegion('brazil');
        expect(region).toBeDefined();
        expect(region!.id).toBe('brazil');
        expect(region!.name).toBe('Brazil');
        expect(region!.currency).toBe('BRL');
        expect(region!.currencySymbol).toBe('R$');
        expect(region!.code).toBe('BR');
        expect(region!.flag).toBe('🇧🇷');
    });

    it('Brazil has PIX payment rail', () => {
        const region = getRegion('brazil');
        expect(region).toBeDefined();
        const railIds = region!.paymentRails.map((r) => r.id);
        expect(railIds).toContain('pix');
    });

    it('Brazil has alfredpay and abroad anchors', () => {
        const region = getRegion('brazil');
        expect(region).toBeDefined();
        expect(region!.anchors).toContain('alfredpay');
        expect(region!.anchors).toContain('abroad');
    });

    it('returns undefined for nonexistent region', () => {
        expect(getRegion('nonexistent')).toBeUndefined();
    });
});

describe('getAllRegions', () => {
    it('returns all regions including brazil', () => {
        const regions = getAllRegions();
        expect(regions.length).toBeGreaterThanOrEqual(2);
        const ids = regions.map((r) => r.id);
        expect(ids).toContain('mexico');
        expect(ids).toContain('brazil');
    });
});

describe('getAnchorsForRegion', () => {
    it('returns all 3 anchors for Mexico', () => {
        const anchors = getAnchorsForRegion('mexico');
        expect(anchors).toHaveLength(3);
        const ids = anchors.map((a) => a.id);
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('blindpay');
    });

    it('returns alfredpay and abroad for Brazil', () => {
        const anchors = getAnchorsForRegion('brazil');
        expect(anchors).toHaveLength(2);
        const ids = anchors.map((a) => a.id);
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('abroad');
    });

    it('returns empty array for nonexistent region', () => {
        expect(getAnchorsForRegion('nonexistent')).toEqual([]);
    });
});

describe('getRegionsForAnchor', () => {
    it('returns Mexico for etherfuse', () => {
        const regions = getRegionsForAnchor('etherfuse');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('mexico');
    });

    it('returns Mexico and Brazil for alfredpay', () => {
        const regions = getRegionsForAnchor('alfredpay');
        expect(regions).toHaveLength(2);
        const ids = regions.map((r) => r.id);
        expect(ids).toContain('mexico');
        expect(ids).toContain('brazil');
    });

    it('returns Brazil for abroad', () => {
        const regions = getRegionsForAnchor('abroad');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('brazil');
    });

    it('returns Mexico for blindpay', () => {
        const regions = getRegionsForAnchor('blindpay');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('mexico');
    });

    it('returns empty array for nonexistent anchor', () => {
        expect(getRegionsForAnchor('nonexistent')).toEqual([]);
    });
});
