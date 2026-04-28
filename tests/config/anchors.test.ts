import { describe, it, expect } from 'vitest';
import {
    getAnchor,
    getAllAnchors,
    QUALITY_CRITERIA,
    HONORABLE_MENTIONS,
    getHonorableMentionsForRegion,
    getAllHonorableMentions,
} from '$lib/config/anchors';

describe('getAnchor', () => {
    it('returns Etherfuse profile', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('etherfuse');
        expect(anchor!.name).toBe('Etherfuse');
    });

    it('Etherfuse has mexico region with on and off ramp', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.mexico).toBeDefined();
        expect(anchor!.regions.mexico.onRamp).toBe(true);
        expect(anchor!.regions.mexico.offRamp).toBe(true);
        expect(anchor!.regions.mexico.paymentRails).toContain('spei');
        expect(anchor!.regions.mexico.tokens).toContain('CETES');
    });

    it('Etherfuse has brazil region as coming soon', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil).toBeDefined();
        expect(anchor!.regions.brazil.onRamp).toBe(true);
        expect(anchor!.regions.brazil.offRamp).toBe(true);
        expect(anchor!.regions.brazil.paymentRails).toContain('pix');
        expect(anchor!.regions.brazil.tokens).toContain('TESOURO');
        expect(anchor!.regions.brazil.comingSoon).toBe(true);
    });

    it('does not return removed anchors', () => {
        expect(getAnchor('alfredpay')).toBeUndefined();
        expect(getAnchor('blindpay')).toBeUndefined();
        expect(getAnchor('abroad')).toBeUndefined();
        expect(getAnchor('transfero')).toBeUndefined();
    });

    it('returns undefined for nonexistent anchor', () => {
        expect(getAnchor('nonexistent')).toBeUndefined();
    });
});

describe('getAllAnchors', () => {
    it('returns Etherfuse and PDAX', () => {
        const anchors = getAllAnchors();
        const ids = anchors.map((a) => a.id);
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('pdax');
    });
});

describe('PDAX profile', () => {
    it('exists and has Philippines as a coming-soon region with InstaPay and USDC', () => {
        const pdax = getAnchor('pdax');
        expect(pdax).toBeDefined();
        expect(pdax!.name).toBe('PDAX');
        expect(pdax!.regions.philippines).toBeDefined();
        expect(pdax!.regions.philippines.comingSoon).toBe(true);
        expect(pdax!.regions.philippines.paymentRails).toContain('instapay');
        expect(pdax!.regions.philippines.tokens).toContain('USDC');
    });
});

describe('QUALITY_CRITERIA', () => {
    it('has 5 criteria', () => {
        expect(QUALITY_CRITERIA).toHaveLength(5);
    });

    it('has expected criteria IDs', () => {
        const ids = QUALITY_CRITERIA.map((c) => c.id);
        expect(ids).toContain('local-asset');
        expect(ids).toContain('local-rails');
        expect(ids).toContain('competitive-rates');
        expect(ids).toContain('open-access');
        expect(ids).toContain('deep-liquidity');
    });

    it('each criterion has id and label', () => {
        for (const criterion of QUALITY_CRITERIA) {
            expect(criterion.id).toBeTruthy();
            expect(criterion.label).toBeTruthy();
        }
    });
});

describe('HONORABLE_MENTIONS', () => {
    it('has 4 entries', () => {
        const mentions = Object.keys(HONORABLE_MENTIONS);
        expect(mentions).toHaveLength(4);
    });

    it('includes alfredpay', () => {
        const mention = HONORABLE_MENTIONS['alfredpay'];
        expect(mention).toBeDefined();
        expect(mention.name).toBe('Alfred Pay');
        expect(mention.website).toBeTruthy();
        expect(mention.regions).toContain('mexico');
        expect(mention.regions).toContain('brazil');
    });

    it('includes blindpay', () => {
        const mention = HONORABLE_MENTIONS['blindpay'];
        expect(mention).toBeDefined();
        expect(mention.name).toBe('BlindPay');
        expect(mention.regions).toContain('mexico');
    });

    it('includes abroad', () => {
        const mention = HONORABLE_MENTIONS['abroad'];
        expect(mention).toBeDefined();
        expect(mention.name).toBe('Abroad Finance');
        expect(mention.regions).toContain('brazil');
    });

    it('includes transfero', () => {
        const mention = HONORABLE_MENTIONS['transfero'];
        expect(mention).toBeDefined();
        expect(mention.name).toBe('Transfero');
        expect(mention.regions).toContain('brazil');
    });

    it('each mention has criteria array with 5 items', () => {
        for (const mention of Object.values(HONORABLE_MENTIONS)) {
            expect(mention.criteria).toHaveLength(5);
            for (const criterion of mention.criteria) {
                expect(criterion.id).toBeTruthy();
                expect(criterion.label).toBeTruthy();
                expect(typeof criterion.met).toBe('boolean');
            }
        }
    });
});

describe('getHonorableMentionsForRegion', () => {
    it('returns alfredpay and blindpay for mexico', () => {
        const mentions = getHonorableMentionsForRegion('mexico');
        expect(mentions).toHaveLength(2);
        const ids = mentions.map((m) => m.id);
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('blindpay');
    });

    it('returns alfredpay, abroad, and transfero for brazil', () => {
        const mentions = getHonorableMentionsForRegion('brazil');
        expect(mentions).toHaveLength(3);
        const ids = mentions.map((m) => m.id);
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('abroad');
        expect(ids).toContain('transfero');
    });

    it('returns empty array for nonexistent region', () => {
        expect(getHonorableMentionsForRegion('nonexistent')).toEqual([]);
    });
});

describe('getAllHonorableMentions', () => {
    it('returns all 4 honorable mentions', () => {
        const mentions = getAllHonorableMentions();
        expect(mentions).toHaveLength(4);
    });
});
