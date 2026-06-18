import { describe, it, expect } from 'vitest';
import { buildReadiness, toMarkdown, resolveFormat } from '$lib/config/scorecard';

describe('buildReadiness', () => {
    const entries = buildReadiness();
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

    it('covers the on-main scored anchors and excludes the reference (test) anchor', () => {
        const ids = entries.map((e) => e.id);
        expect(ids).toEqual(['etherfuse', 'koywe', 'alfredpay', 'blindpay', 'abroad', 'transfero']);
        expect(ids).not.toContain('testanchor');
    });

    it('exposes the 5 buildability signals, required-first, each tagged with its severity', () => {
        for (const e of entries) {
            expect(e.signals.map((s) => s.id)).toEqual([
                'local-rails',
                'open-access',
                'high-fidelity-sandbox',
                'accurate-docs',
                'agent-buildable',
            ]);
            expect(e.signals.map((s) => s.severity)).toEqual([
                'required',
                'required',
                'required',
                'friction',
                'friction',
            ]);
        }
    });

    it('omits catalogue metadata (regions/tokens/rails/links) — noise for a readiness read', () => {
        const e = byId.etherfuse;
        expect(e).not.toHaveProperty('regions');
        expect(e).not.toHaveProperty('tokens');
        expect(e).not.toHaveProperty('rails');
        expect(e).not.toHaveProperty('links');
        expect(e).not.toHaveProperty('curated');
        // It keeps just the assessment-relevant fields.
        expect(Object.keys(e).sort()).toEqual(
            ['blockers', 'caveats', 'id', 'localAsset', 'name', 'signals', 'verdict'].sort(),
        );
    });

    it('keeps local-asset as an informational field, never a signal', () => {
        expect(byId.etherfuse.signals.find((s) => s.id === 'local-asset')).toBeUndefined();
        expect(byId.etherfuse.localAsset.status).toBe('met');
        expect(byId.transfero.localAsset.status).toBe('partial');
        const allSignalIds = entries.flatMap((e) => e.signals.map((s) => s.id));
        expect(allSignalIds).not.toContain('competitive-rates');
        expect(allSignalIds).not.toContain('deep-liquidity');
    });

    it('verdicts follow the severity split', () => {
        expect(byId.etherfuse.verdict).toBe('ready'); // all 5 met
        expect(byId.koywe.verdict).toBe('blocked'); // required: high-fidelity-sandbox failed
        expect(byId.alfredpay.verdict).toBe('blocked');
        expect(byId.blindpay.verdict).toBe('partial'); // no required fail; partial/unverified
        expect(byId.abroad.verdict).toBe('blocked');
        expect(byId.transfero.verdict).toBe('blocked'); // required: open-access failed
    });

    it('blockers are failed required signals; caveats are the other not-met signals', () => {
        expect(byId.koywe.blockers.map((s) => s.id)).toEqual(['high-fidelity-sandbox']);
        expect(byId.koywe.caveats.map((s) => s.id).sort()).toEqual(
            ['agent-buildable', 'open-access'].sort(),
        );
        // Abroad's partial local-rails (a required signal, but not failed) is a caveat, not a blocker.
        expect(byId.abroad.blockers.map((s) => s.id).sort()).toEqual(
            ['high-fidelity-sandbox', 'open-access'].sort(),
        );
        expect(byId.abroad.caveats.map((s) => s.id)).toContain('local-rails');
        expect(byId.etherfuse.blockers).toEqual([]);
        expect(byId.etherfuse.caveats).toEqual([]);
    });
});

describe('toMarkdown', () => {
    const md = toMarkdown(buildReadiness());

    it('has a scope note', () => {
        expect(md).toMatch(/owned by BD/i);
    });

    it('explains the signals and their required/friction severity', () => {
        // Each signal's meaning is described...
        expect(md).toContain('Open self-service access');
        expect(md).toContain('lands real on-chain testnet tokens'); // high-fidelity-sandbox label
        // ...and the two severities are spelled out.
        expect(md.toLowerCase()).toContain('required');
        expect(md.toLowerCase()).toContain('friction');
    });

    it('includes a summary row per anchor with the verdict', () => {
        expect(md).toContain('Etherfuse');
        expect(md).toContain('Koywe');
        expect(md).not.toContain('Test Anchor');
        expect(md).toContain('ready');
        expect(md).toContain('blocked');
    });

    it('surfaces blocker and caveat notes in a per-anchor detail section', () => {
        // Koywe's sandbox blocker note must appear (the "why").
        expect(md).toContain('never executes the on-chain delivery');
        // A caveat note too.
        expect(md.toLowerCase()).toMatch(/blocker|caveat/);
    });
});

describe('resolveFormat', () => {
    it('defaults to json', () => {
        expect(resolveFormat(null, null)).toBe('json');
        expect(resolveFormat(null, 'application/json')).toBe('json');
    });

    it('honors ?format=md / markdown', () => {
        expect(resolveFormat('md', null)).toBe('md');
        expect(resolveFormat('markdown', null)).toBe('md');
        expect(resolveFormat('json', null)).toBe('json');
    });

    it('falls back to the Accept header when no format query', () => {
        expect(resolveFormat(null, 'text/markdown')).toBe('md');
        expect(resolveFormat(null, 'text/markdown, text/plain;q=0.9')).toBe('md');
    });

    it('lets an explicit query win over a conflicting Accept header', () => {
        expect(resolveFormat('json', 'text/markdown')).toBe('json');
    });

    it('throws on an unknown format', () => {
        expect(() => resolveFormat('csv', null)).toThrow();
    });
});
