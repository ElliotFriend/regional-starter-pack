import { describe, it, expect } from 'vitest';
import {
    getAnchor,
    getAllAnchors,
    QUALITY_CRITERIA,
    COMMERCIAL_CRITERIA,
    DEVELOPER_CRITERIA,
    curationStatus,
    HONORABLE_MENTIONS,
    getHonorableMentionsForRegion,
    getAllHonorableMentions,
    type ScoredCriterion,
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

    it('Etherfuse has brazil region with on and off ramp via PIX/TESOURO', () => {
        const anchor = getAnchor('etherfuse');
        expect(anchor).toBeDefined();
        expect(anchor!.regions.brazil).toBeDefined();
        expect(anchor!.regions.brazil.onRamp).toBe(true);
        expect(anchor!.regions.brazil.offRamp).toBe(true);
        expect(anchor!.regions.brazil.paymentRails).toContain('pix');
        expect(anchor!.regions.brazil.tokens).toContain('TESOURO');
        expect(anchor!.regions.brazil.comingSoon).toBeFalsy();
    });

    it('returns Koywe profile with Argentina region (ARS/USDC via WIREAR + QRI)', () => {
        const anchor = getAnchor('koywe');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('koywe');
        expect(anchor!.name).toBe('Koywe');
        expect(anchor!.regions.argentina).toBeDefined();
        expect(anchor!.regions.argentina.onRamp).toBe(true);
        expect(anchor!.regions.argentina.offRamp).toBe(true);
        expect(anchor!.regions.argentina.paymentRails).toContain('wirear');
        expect(anchor!.regions.argentina.paymentRails).toContain('qri');
        expect(anchor!.regions.argentina.tokens).toContain('USDC');
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
    it('returns the curated Etherfuse + Koywe anchors and the test anchor', () => {
        const ids = getAllAnchors().map((a) => a.id);
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('koywe');
        expect(ids).toContain('testanchor');
        expect(ids).toHaveLength(3);
    });
});

describe('two-lens criteria', () => {
    it('commercial lens has the four commercial criteria, all tagged commercial', () => {
        const ids = COMMERCIAL_CRITERIA.map((c) => c.id);
        expect(ids).toEqual(['local-asset', 'local-rails', 'competitive-rates', 'deep-liquidity']);
        expect(COMMERCIAL_CRITERIA.every((c) => c.lens === 'commercial')).toBe(true);
    });

    it('developer lens has the four developer criteria, all tagged developer', () => {
        const ids = DEVELOPER_CRITERIA.map((c) => c.id);
        expect(ids).toEqual([
            'open-access',
            'accurate-docs',
            'high-fidelity-sandbox',
            'agent-buildable',
        ]);
        expect(DEVELOPER_CRITERIA.every((c) => c.lens === 'developer')).toBe(true);
    });

    it('QUALITY_CRITERIA is the combined eight (commercial then developer)', () => {
        expect(QUALITY_CRITERIA).toHaveLength(8);
        expect(QUALITY_CRITERIA).toEqual([...COMMERCIAL_CRITERIA, ...DEVELOPER_CRITERIA]);
    });

    it('each criterion has id, full label, brief shortLabel, and lens', () => {
        for (const criterion of QUALITY_CRITERIA) {
            expect(criterion.id).toBeTruthy();
            expect(criterion.label).toBeTruthy();
            expect(criterion.shortLabel).toBeTruthy();
            // The short label is the compact list form: briefer than the full
            // label and with no parenthetical detail.
            expect(criterion.shortLabel.length).toBeLessThanOrEqual(criterion.label.length);
            expect(criterion.shortLabel).not.toContain('(');
            expect(['commercial', 'developer']).toContain(criterion.lens);
        }
    });
});

describe('curationStatus', () => {
    // Build a full 8-criterion scorecard, overriding specific statuses.
    function scorecard(
        overrides: Record<string, ScoredCriterion['status']> = {},
    ): ScoredCriterion[] {
        return QUALITY_CRITERIA.map((c) => ({
            ...c,
            status: overrides[c.id] ?? 'met',
        }));
    }

    it('is curated when everything is met', () => {
        const result = curationStatus(scorecard());
        expect(result.status).toBe('curated');
        expect(result.flags).toEqual([]);
    });

    it('tolerates a single commercial failure (e.g. no local asset)', () => {
        const result = curationStatus(scorecard({ 'local-asset': 'failed' }));
        expect(result.status).toBe('curated');
        // The failure is still surfaced for display even though it does not demote.
        expect(result.flags.map((f) => f.id)).toEqual(['local-asset']);
    });

    it('flags when two or more commercial criteria fail', () => {
        const result = curationStatus(
            scorecard({ 'local-asset': 'failed', 'deep-liquidity': 'failed' }),
        );
        expect(result.status).toBe('flagged');
        expect(result.flags.map((f) => f.id)).toEqual(['local-asset', 'deep-liquidity']);
    });

    it('flags when any single developer criterion fails', () => {
        const result = curationStatus(scorecard({ 'high-fidelity-sandbox': 'failed' }));
        expect(result.status).toBe('flagged');
        expect(result.flags.map((f) => f.id)).toContain('high-fidelity-sandbox');
    });

    it('never counts partial or unverified against either lens', () => {
        const result = curationStatus(
            scorecard({
                'competitive-rates': 'unverified',
                'deep-liquidity': 'unverified',
                'open-access': 'partial',
                'agent-buildable': 'partial',
            }),
        );
        expect(result.status).toBe('curated');
        expect(result.flags).toEqual([]);
    });

    it('treats a reference (exempt) anchor as curated without evaluating commercial', () => {
        const result = curationStatus(
            scorecard({ 'local-asset': 'failed', 'competitive-rates': 'failed' }),
            { exempt: true },
        );
        expect(result.status).toBe('curated');
        expect(result.flags).toEqual([]);
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

    it('each mention has a scorecard scoring all 8 two-lens criteria', () => {
        for (const mention of Object.values(HONORABLE_MENTIONS)) {
            expect(mention.scorecard).toHaveLength(8);
            for (const criterion of mention.scorecard) {
                expect(criterion.id).toBeTruthy();
                expect(criterion.label).toBeTruthy();
                expect(['commercial', 'developer']).toContain(criterion.lens);
                expect(['met', 'partial', 'failed', 'unverified']).toContain(criterion.status);
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
