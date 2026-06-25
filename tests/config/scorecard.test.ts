import { describe, it, expect } from 'vitest';
import { buildReadiness, toMarkdown, resolveFormat } from '$lib/config/scorecard';

describe('buildReadiness', () => {
    const entries = buildReadiness();
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

    it('covers curated, honorable-mention, and in-vetting anchors; excludes the reference anchor', () => {
        const ids = entries.map((e) => e.id);
        expect(ids).toEqual([
            'etherfuse',
            'koywe',
            'manteca',
            'alfredpay',
            'blindpay',
            'abroad',
            'transfero',
            'pdax',
            'coinsph',
            'bitso',
            'yellowcard',
            'fonbnk',
            'bilira',
            'onafriq',
            'flutterwave',
        ]);
        expect(ids).not.toContain('testanchor');
    });

    it('flags in-vetting anchors (and only those)', () => {
        for (const id of [
            'pdax',
            'coinsph',
            'bitso',
            'yellowcard',
            'fonbnk',
            'bilira',
            'onafriq',
            'flutterwave',
        ]) {
            expect(byId[id].vetting, id).toBe(true);
        }
        // Manteca is now fully curated (no longer an in-vetting honorable mention).
        for (const id of [
            'etherfuse',
            'koywe',
            'manteca',
            'alfredpay',
            'blindpay',
            'abroad',
            'transfero',
        ]) {
            expect(byId[id].vetting, id).toBe(false);
        }
        // Markets carry through for the dashboard join.
        expect(byId.manteca.regions).toEqual(['brazil', 'argentina', 'colombia']);
        expect(byId.bitso.regions).toEqual(['mexico', 'brazil', 'argentina', 'colombia']);
        expect(byId.fonbnk.regions).toEqual(['kenya', 'ghana']);
    });

    it('exposes the 6 buildability signals, required-first, each tagged with its severity', () => {
        for (const e of entries) {
            expect(e.signals.map((s) => s.id)).toEqual([
                'local-rails',
                'open-access',
                'high-fidelity-sandbox',
                'accurate-docs',
                'agent-buildable',
                'fee-discoverability',
            ]);
            expect(e.signals.map((s) => s.severity)).toEqual([
                'required',
                'required',
                'required',
                'friction',
                'friction',
                'friction',
            ]);
        }
    });

    it('keeps region (the dashboard join key) but drops other catalogue noise', () => {
        const e = byId.etherfuse;
        // Region is the market a consumer dashboard joins on.
        expect(e.regions).toEqual(['mexico', 'brazil']);
        expect(byId.koywe.regions).toEqual(['argentina']);
        expect(byId.transfero.regions).toEqual(['brazil']);
        // The rest of the catalogue metadata stays out.
        expect(e).not.toHaveProperty('tokens');
        expect(e).not.toHaveProperty('rails');
        expect(e).not.toHaveProperty('links');
        expect(e).not.toHaveProperty('curated');
        expect(Object.keys(e).sort()).toEqual(
            [
                'blockers',
                'caveats',
                'id',
                'localAsset',
                'name',
                'regions',
                'signals',
                'verdict',
                'vetting',
            ].sort(),
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

    it('reflects the live Manteca sandbox findings', () => {
        const sig = (id: string) => byId.manteca.signals.find((s) => s.id === id);
        // Stellar leg is broken in Manteca's sandbox (withdraw no-broadcast, deposit
        // undetected) but the full ramp pipeline completes on EVM and a vendor-side
        // fix is pending → high-fidelity-sandbox is PARTIAL, not a confirmed failure.
        expect(sig('high-fidelity-sandbox')?.status).toBe('partial');
        // Per-quote fee is discoverable on the synthetic (withdrawCost*, effectivePrice).
        expect(sig('fee-discoverability')?.status).toBe('met');
        // Still blocked — but on open-access (sandbox keys sales-gated, no self-serve),
        // a failed REQUIRED signal independent of the Stellar sandbox issue.
        expect(byId.manteca.verdict).toBe('blocked');
        expect(byId.manteca.blockers.map((s) => s.id)).toContain('open-access');
        expect(byId.manteca.blockers.map((s) => s.id)).not.toContain('high-fidelity-sandbox');
    });

    it('verdicts follow the severity split', () => {
        expect(byId.etherfuse.verdict).toBe('ready'); // all 6 met
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
        expect(md).toContain('cannot settle the Stellar USDC leg');
        // A caveat note too.
        expect(md.toLowerCase()).toMatch(/blocker|caveat/);
    });

    it('marks in-vetting anchors as under evaluation', () => {
        expect(md).toContain('PDAX'); // a still-in-vetting honorable mention
        // The report explains the vetting marker and flags the rows.
        expect(md.toLowerCase()).toContain('evaluation');
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
