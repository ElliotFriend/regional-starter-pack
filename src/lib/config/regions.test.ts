import { describe, it, expect } from 'vitest';
import { getRegion, getAllRegions, getAnchorsForRegion, getRegionsForAnchor } from './regions';

describe('getRegion', () => {
    it('returns Mexico region', () => {
        const region = getRegion('mexico');
        expect(region).toBeDefined();
        expect(region!.id).toBe('mexico');
        expect(region!.name).toBe('Mexico');
        expect(region!.currency).toBe('MXN');
        expect(region!.code).toBe('MX');
    });

    it('returns undefined for nonexistent region', () => {
        expect(getRegion('nonexistent')).toBeUndefined();
    });
});

describe('getAllRegions', () => {
    it('returns all regions', () => {
        const regions = getAllRegions();
        expect(regions.length).toBeGreaterThan(0);
        expect(regions[0].id).toBe('mexico');
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

    it('returns Mexico for alfredpay', () => {
        const regions = getRegionsForAnchor('alfredpay');
        expect(regions).toHaveLength(1);
        expect(regions[0].id).toBe('mexico');
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
