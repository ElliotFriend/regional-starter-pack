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

    it('Brazil has etherfuse and manteca as its anchors', () => {
        const region = getRegion('brazil');
        expect(region).toBeDefined();
        expect(region!.anchors).toEqual(['etherfuse', 'manteca']);
    });

    it('Mexico has etherfuse as its only anchor', () => {
        const region = getRegion('mexico');
        expect(region).toBeDefined();
        expect(region!.anchors).toEqual(['etherfuse']);
    });

    it('returns Argentina region with ARS and Koywe anchor', () => {
        const region = getRegion('argentina');
        expect(region).toBeDefined();
        expect(region!.id).toBe('argentina');
        expect(region!.name).toBe('Argentina');
        expect(region!.currency).toBe('ARS');
        expect(region!.code).toBe('AR');
        expect(region!.flag).toBe('🇦🇷');
        expect(region!.anchors).toEqual(['koywe']);
        const railIds = region!.paymentRails.map((r) => r.id);
        expect(railIds).toContain('wirear');
        expect(railIds).toContain('qri');
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
    it('returns only Etherfuse for Mexico', () => {
        const anchors = getAnchorsForRegion('mexico');
        expect(anchors).toHaveLength(1);
        expect(anchors[0].id).toBe('etherfuse');
    });

    it('returns Etherfuse and Manteca for Brazil', () => {
        const anchors = getAnchorsForRegion('brazil');
        expect(anchors).toHaveLength(2);
        expect(anchors.map((a) => a.id)).toEqual(['etherfuse', 'manteca']);
    });

    it('returns only Koywe for Argentina', () => {
        const anchors = getAnchorsForRegion('argentina');
        expect(anchors).toHaveLength(1);
        expect(anchors[0].id).toBe('koywe');
    });

    it('returns empty array for nonexistent region', () => {
        expect(getAnchorsForRegion('nonexistent')).toEqual([]);
    });
});

describe('getRegionsForAnchor', () => {
    it('returns Mexico and Brazil for etherfuse', () => {
        const regions = getRegionsForAnchor('etherfuse');
        expect(regions).toHaveLength(2);
        const ids = regions.map((r) => r.id);
        expect(ids).toContain('mexico');
        expect(ids).toContain('brazil');
    });

    it('returns Argentina for koywe', () => {
        const regions = getRegionsForAnchor('koywe');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('argentina');
    });

    it('returns Brazil for manteca', () => {
        const regions = getRegionsForAnchor('manteca');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('brazil');
    });

    it('returns empty array for removed anchors', () => {
        expect(getRegionsForAnchor('alfredpay')).toEqual([]);
        expect(getRegionsForAnchor('blindpay')).toEqual([]);
        expect(getRegionsForAnchor('abroad')).toEqual([]);
        expect(getRegionsForAnchor('transfero')).toEqual([]);
    });

    it('returns empty array for nonexistent anchor', () => {
        expect(getRegionsForAnchor('nonexistent')).toEqual([]);
    });
});
