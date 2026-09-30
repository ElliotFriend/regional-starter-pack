import { describe, it, expect } from 'vitest';
import {
    getAnchor,
    getAllAnchors,
    ANCHORS,
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

    it('returns Manteca profile with Brazil region (BRL/USDC via PIX)', () => {
        const anchor = getAnchor('manteca');
        expect(anchor).toBeDefined();
        expect(anchor!.id).toBe('manteca');
        expect(anchor!.name).toBe('Manteca');
        expect(anchor!.regions.brazil).toBeDefined();
        expect(anchor!.regions.brazil.onRamp).toBe(true);
        expect(anchor!.regions.brazil.offRamp).toBe(true);
        expect(anchor!.regions.brazil.paymentRails).toContain('pix');
        expect(anchor!.regions.brazil.tokens).toContain('USDC');
    });

    it('Manteca also serves Argentina (CVU) and Colombia (BRE-B) with USDC', () => {
        const anchor = getAnchor('manteca');
        expect(anchor!.regions.argentina).toBeDefined();
        expect(anchor!.regions.argentina.onRamp).toBe(true);
        expect(anchor!.regions.argentina.offRamp).toBe(true);
        expect(anchor!.regions.argentina.paymentRails).toContain('cvu');
        expect(anchor!.regions.argentina.tokens).toContain('USDC');
        expect(anchor!.regions.colombia).toBeDefined();
        expect(anchor!.regions.colombia.paymentRails).toContain('breb');
        expect(anchor!.regions.colombia.tokens).toContain('USDC');
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
    it('returns the curated Etherfuse + Koywe + Manteca + Chipper anchors, the test anchor, and the TR Mock Anchor', () => {
        const ids = getAllAnchors().map((a) => a.id);
        expect(ids).toContain('chipper');
        expect(ids).toContain('etherfuse');
        expect(ids).toContain('koywe');
        expect(ids).toContain('manteca');
        expect(ids).toContain('testanchor');
        expect(ids).toContain('trmock');
        expect(ids).toHaveLength(6);
    });
});

describe('two-lens criteria', () => {
    it('commercial lens has the four commercial criteria, all tagged commercial', () => {
        const ids = COMMERCIAL_CRITERIA.map((c) => c.id);
        expect(ids).toEqual(['local-asset', 'local-rails', 'competitive-rates', 'deep-liquidity']);
        expect(COMMERCIAL_CRITERIA.every((c) => c.lens === 'commercial')).toBe(true);
    });

    it('developer lens has the five developer criteria, all tagged developer', () => {
        const ids = DEVELOPER_CRITERIA.map((c) => c.id);
        expect(ids).toEqual([
            'open-access',
            'accurate-docs',
            'high-fidelity-sandbox',
            'agent-buildable',
            'fee-discoverability',
        ]);
        expect(DEVELOPER_CRITERIA.every((c) => c.lens === 'developer')).toBe(true);
    });

    it('QUALITY_CRITERIA is the combined nine (commercial then developer)', () => {
        expect(QUALITY_CRITERIA).toHaveLength(9);
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
    // Build a full 9-criterion scorecard, overriding specific statuses.
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
    it('has 12 entries (4 vetted + 8 in-vetting pipeline; Manteca and Chipper graduated to curated)', () => {
        const mentions = Object.keys(HONORABLE_MENTIONS);
        expect(mentions).toHaveLength(12);
        expect(mentions).not.toContain('manteca');
    });

    it('includes alfredpay', () => {
        const mention = HONORABLE_MENTIONS['alfredpay'];
        expect(mention).toBeDefined();
        expect(mention.name).toBe('Alfred Pay');
        expect(mention.website).toBeTruthy();
        expect(mention.regions).toEqual(['mexico', 'brazil', 'argentina', 'colombia']);
        expect(mention.rails).toEqual(['spei', 'pix', 'cvu', 'bank']);
    });

    it('curates Chipper: not a mention; Ghana and Kenya over mobile money, USDC only', () => {
        expect(HONORABLE_MENTIONS['chipper']).toBeUndefined();
        expect(ANCHORS.chipper.regions.ghana.paymentRails).toEqual(['mobile-money']);
        expect(ANCHORS.chipper.regions.kenya.paymentRails).toEqual(['mpesa', 'mobile-money']);
        expect(ANCHORS.chipper.regions.kenya.tokens).toEqual(['USDC']);
        expect(ANCHORS.chipper.logo).toBe('/anchor-logos/chipper.svg');
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

    it('includes the in-vetting branch anchors, flagged vetting', () => {
        for (const id of ['pdax', 'coinsph']) {
            expect(HONORABLE_MENTIONS[id], id).toBeDefined();
            expect(HONORABLE_MENTIONS[id].vetting, id).toBe(true);
            expect(HONORABLE_MENTIONS[id].scorecard).toHaveLength(9);
        }
        expect(HONORABLE_MENTIONS['manteca']).toBeUndefined(); // now curated
        expect(HONORABLE_MENTIONS['pdax'].regions).toContain('philippines');
        expect(HONORABLE_MENTIONS['coinsph'].regions).toContain('philippines');
    });

    it('includes the additional vetting anchors, with their markets', () => {
        for (const id of ['bitso', 'yellowcard', 'fonbnk', 'bilira', 'onafriq', 'flutterwave']) {
            expect(HONORABLE_MENTIONS[id], id).toBeDefined();
            expect(HONORABLE_MENTIONS[id].vetting, id).toBe(true);
            expect(HONORABLE_MENTIONS[id].scorecard).toHaveLength(9);
        }
        expect(HONORABLE_MENTIONS['bitso'].regions).toEqual([
            'mexico',
            'brazil',
            'argentina',
            'colombia',
        ]);
        expect(HONORABLE_MENTIONS['fonbnk'].regions).toEqual(['kenya', 'ghana']);
        expect(HONORABLE_MENTIONS['bilira'].regions).toEqual(['turkiye']);
    });

    it('does not flag the vetted mentions', () => {
        for (const id of ['alfredpay', 'blindpay', 'abroad', 'transfero']) {
            expect(HONORABLE_MENTIONS[id].vetting, id).toBeFalsy();
        }
    });

    it('each mention has a scorecard scoring all 8 two-lens criteria', () => {
        for (const mention of Object.values(HONORABLE_MENTIONS)) {
            expect(mention.scorecard).toHaveLength(9);
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
    it('returns alfredpay, blindpay, and bitso for mexico', () => {
        const ids = getHonorableMentionsForRegion('mexico').map((m) => m.id);
        expect(ids).toContain('alfredpay');
        expect(ids).toContain('blindpay');
        expect(ids).toContain('bitso');
    });

    it('returns the brazil mentions (bitso etc.; manteca is curated, not a mention)', () => {
        const ids = getHonorableMentionsForRegion('brazil').map((m) => m.id);
        expect(ids).toEqual(expect.arrayContaining(['alfredpay', 'abroad', 'transfero', 'bitso']));
        expect(ids).not.toContain('manteca');
    });

    it('returns the in-vetting PH anchors for philippines', () => {
        const ids = getHonorableMentionsForRegion('philippines').map((m) => m.id);
        expect(ids).toContain('pdax');
        expect(ids).toContain('coinsph');
    });

    it('returns the Africa pipeline anchors for kenya', () => {
        const ids = getHonorableMentionsForRegion('kenya').map((m) => m.id);
        expect(ids).toEqual(
            expect.arrayContaining(['fonbnk', 'yellowcard', 'onafriq', 'flutterwave']),
        );
    });

    it('returns empty array for nonexistent region', () => {
        expect(getHonorableMentionsForRegion('nonexistent')).toEqual([]);
    });
});

describe('getAllHonorableMentions', () => {
    it('returns all 12 honorable mentions', () => {
        const mentions = getAllHonorableMentions();
        expect(mentions).toHaveLength(12);
    });
});

describe('Koywe multi-country', () => {
    it('serves Argentina, Mexico, and Colombia', () => {
        expect(Object.keys(ANCHORS.koywe.regions).sort()).toEqual([
            'argentina',
            'colombia',
            'mexico',
        ]);
    });
    it('uses SPEI in Mexico and PSE in Colombia', () => {
        expect(ANCHORS.koywe.regions.mexico.paymentRails).toContain('spei');
        expect(ANCHORS.koywe.regions.colombia.paymentRails).toContain('pse');
    });
});

describe('TR Mock Anchor', () => {
    it('is a reference anchor flagged as a mock', () => {
        const anchor = getAnchor('trmock');
        expect(anchor).toBeDefined();
        expect(anchor!.name).toBe('TR Mock Anchor');
        expect(anchor!.referenceAnchor).toBe(true);
        expect(anchor!.mock).toBe(true);
    });

    it('is not named after BiLira', () => {
        const anchor = getAnchor('trmock')!;
        expect(anchor.id).not.toContain('bilira');
        expect(anchor.name.toLowerCase()).not.toContain('bilira');
    });

    it('serves Türkiye with TRY↔USDC over FAST, both directions', () => {
        const anchor = getAnchor('trmock')!;
        expect(anchor.regions.turkiye).toBeDefined();
        expect(anchor.regions.turkiye.onRamp).toBe(true);
        expect(anchor.regions.turkiye.offRamp).toBe(true);
        expect(anchor.regions.turkiye.paymentRails).toContain('fast');
        expect(anchor.regions.turkiye.tokens).toContain('USDC');
    });

    it('is exempt from the commercial gate as a reference anchor', () => {
        const anchor = getAnchor('trmock')!;
        expect(anchor.referenceAnchor).toBe(true);

        // trmock's own scorecard has no failures, so the exemption is moot
        // against it as written. Fail two commercial criteria to prove the
        // flag path is live, then prove `exempt` overrides it.
        const wouldFlag: ScoredCriterion[] = anchor.scorecard!.map((c) =>
            c.id === 'local-asset' || c.id === 'deep-liquidity'
                ? { ...c, status: 'failed' as const }
                : c,
        );
        expect(curationStatus(wouldFlag).status).toBe('flagged');
        expect(curationStatus(wouldFlag, { exempt: anchor.referenceAnchor }).status).toBe(
            'curated',
        );
    });

    it('scores the developer lens from the 2026-09-15 verification', () => {
        const byId = Object.fromEntries(
            getAnchor('trmock')!.scorecard!.map((c: ScoredCriterion) => [c.id, c]),
        );
        expect(byId['open-access'].status).toBe('met');
        expect(byId['high-fidelity-sandbox'].status).toBe('met');
        expect(byId['fee-discoverability'].status).toBe('met');
        // OpenAPI was removed upstream on 2026-09-08; the exchange endpoints
        // also deviate from SEP-6.
        expect(byId['agent-buildable'].status).toBe('partial');
        // /guide documents an exchange parameter form the server rejects.
        expect(byId['accurate-docs'].status).toBe('partial');
    });

    it('warns that it is a stand-in, not operated by BiLira', () => {
        const issues = getAnchor('trmock')!.knownIssues ?? [];
        const text = issues.map((i) => i.text).join(' ');
        expect(text).toContain('BiLira');
        expect(text.toLowerCase()).toContain('mock');
    });
});

describe('BiLira honorable mention', () => {
    it('is still in vetting and ramps over FAST in Türkiye', () => {
        const mention = HONORABLE_MENTIONS.bilira;
        expect(mention).toBeDefined();
        expect(mention.vetting).toBe(true);
        expect(mention.regions).toEqual(['turkiye']);
        expect(mention.rails).toEqual(['fast']);
    });

    it('records that SEP-6 is agreed but unscheduled', () => {
        expect(HONORABLE_MENTIONS.bilira.description).toMatch(/SEP-6/);
    });

    it('marks unassessed criteria unverified rather than failed', () => {
        const byId = Object.fromEntries(
            HONORABLE_MENTIONS.bilira.scorecard.map((c: ScoredCriterion) => [c.id, c]),
        );
        // We hold their API PDF but have never checked it against the wire,
        // and we have not assessed the agent surface at all. Neither is a
        // confirmed failure.
        expect(byId['accurate-docs'].status).toBe('unverified');
        expect(byId['agent-buildable'].status).toBe('unverified');
        // These are confirmed.
        expect(byId['local-asset'].status).toBe('failed');
        expect(byId['open-access'].status).toBe('failed');
        expect(byId['high-fidelity-sandbox'].status).toBe('failed');
    });
});
