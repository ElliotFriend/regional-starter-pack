/**
 * Developer-readiness view over the anchor scorecards.
 *
 * Reframes the two-lens `scorecard` data (see `anchors.ts`) around a single
 * question for the BD team's agents: *can a developer build on this anchor
 * today?* Self-updating — derived entirely from `ANCHORS` +
 * `HONORABLE_MENTIONS` — and deliberately omits the commercial fee/liquidity
 * criteria (BD owns those), catalogue metadata (regions/tokens/rails/links —
 * noise for a readiness read), and the internal curated/honorable framing.
 *
 * Pure / framework-agnostic: no SvelteKit imports.
 */
import {
    ANCHORS,
    HONORABLE_MENTIONS,
    COMMERCIAL_CRITERIA,
    DEVELOPER_CRITERIA,
    type AnchorProfile,
    type HonorableMention,
    type CriterionStatus,
    type ScoredCriterion,
} from './anchors';

export type ReadinessVerdict = 'ready' | 'partial' | 'blocked';

/**
 * Signal severity. `required` signals block readiness if `failed`; `friction`
 * signals only downgrade to `partial`.
 */
export type SignalSeverity = 'required' | 'friction';

/** One buildability signal scored for an anchor. */
export interface ReadinessSignal {
    id: string;
    label: string;
    severity: SignalSeverity;
    status: CriterionStatus;
    note?: string;
}

export interface ReadinessEntry {
    id: string;
    name: string;
    /** Region/market ids the anchor serves — the join key for market-organized consumers. */
    regions: string[];
    /** Dev-readiness verdict, from the 5 buildability signals. */
    verdict: ReadinessVerdict;
    /** The 5 buildability signals, required-first. */
    signals: ReadinessSignal[];
    /** Failed required signals — the reasons a verdict is `blocked`. */
    blockers: ReadinessSignal[];
    /** Other not-met signals (friction failures + any partial/unverified). */
    caveats: ReadinessSignal[];
    /** Locally denominated asset — informational only, never part of the verdict. */
    localAsset: { status: CriterionStatus; note?: string };
}

const CRITERION = new Map([...COMMERCIAL_CRITERIA, ...DEVELOPER_CRITERIA].map((c) => [c.id, c]));

/** The 5 buildability signals, required-first, with severity + labels. */
const SIGNALS = (
    [
        ['local-rails', 'required'],
        ['open-access', 'required'],
        ['high-fidelity-sandbox', 'required'],
        ['accurate-docs', 'friction'],
        ['agent-buildable', 'friction'],
    ] as const
).map(([id, severity]) => ({
    id,
    severity,
    label: CRITERION.get(id)?.label ?? id,
    shortLabel: CRITERION.get(id)?.shortLabel ?? id,
}));

/** Minimal projection of either config shape. */
interface Source {
    id: string;
    name: string;
    regions: string[];
    scorecard?: ScoredCriterion[];
    referenceAnchor?: boolean;
}

function fromProfile(p: AnchorProfile): Source {
    return {
        id: p.id,
        name: p.name,
        regions: Object.keys(p.regions),
        scorecard: p.scorecard,
        referenceAnchor: p.referenceAnchor,
    };
}

function fromMention(m: HonorableMention): Source {
    return { id: m.id, name: m.name, regions: m.regions, scorecard: m.scorecard };
}

function entryFor(src: Source): ReadinessEntry | null {
    if (!src.scorecard) return null;
    const byId = new Map(src.scorecard.map((c) => [c.id, c]));

    const signals: ReadinessSignal[] = SIGNALS.map((def) => {
        const scored = byId.get(def.id);
        return {
            id: def.id,
            label: def.label,
            severity: def.severity,
            status: scored?.status ?? 'unverified',
            note: scored?.note,
        };
    });

    const blockers = signals.filter((s) => s.severity === 'required' && s.status === 'failed');
    const caveats = signals.filter((s) => s.status !== 'met' && !blockers.includes(s));
    const verdict: ReadinessVerdict =
        blockers.length > 0 ? 'blocked' : caveats.length > 0 ? 'partial' : 'ready';

    const la = byId.get('local-asset');

    return {
        id: src.id,
        name: src.name,
        regions: src.regions,
        verdict,
        signals,
        blockers,
        caveats,
        localAsset: { status: la?.status ?? 'unverified', note: la?.note },
    };
}

/**
 * Build the developer-readiness entries from on-main config. Reference/test
 * anchors and any without a scorecard are skipped.
 */
export function buildReadiness(): ReadinessEntry[] {
    const sources = [
        ...Object.values(ANCHORS).map(fromProfile),
        ...Object.values(HONORABLE_MENTIONS).map(fromMention),
    ];
    return sources
        .filter((s) => !s.referenceAnchor)
        .map(entryFor)
        .filter((e): e is ReadinessEntry => e !== null);
}

const MD_SYMBOL: Record<CriterionStatus, string> = {
    met: '✓',
    partial: '~',
    failed: '✕',
    unverified: '?',
};

/** Render the readiness entries as a self-describing Markdown report. */
export function toMarkdown(entries: ReadinessEntry[]): string {
    const out: string[] = [
        '# Anchor developer-readiness',
        '',
        '_Derived live from on-main config. Fees and liquidity are owned by BD and omitted;' +
            ' branch candidates and the reference test anchor are excluded._',
        '',
        '## How to read this',
        '',
        'Each anchor is scored on five buildability signals. A failed **required** signal makes' +
            ' an anchor `blocked`; a failed **friction** signal (or any `partial`/`unverified`)' +
            ' makes it `partial`; all signals met is `ready`. **Local asset** is shown for' +
            ' reference only and does not affect the verdict.',
        '',
        ...SIGNALS.map((s) => `- **${s.shortLabel}** _(${s.severity})_ — ${s.label}`),
        '',
        'Status: ✓ met · ~ partial · ✕ failed · ? unverified',
        '',
        '## Summary',
        '',
    ];

    const headers = [
        'Anchor',
        'Region',
        'Verdict',
        ...SIGNALS.map((s) => s.shortLabel),
        'Local asset',
    ];
    out.push(`| ${headers.join(' | ')} |`);
    out.push(`|${'---|'.repeat(headers.length)}`);
    for (const e of entries) {
        const cells = e.signals.map((s) => MD_SYMBOL[s.status]).join(' | ');
        out.push(
            `| ${e.name} | ${e.regions.join(', ')} | ${e.verdict} | ${cells} | ${MD_SYMBOL[e.localAsset.status]} |`,
        );
    }

    out.push('', '## Details', '');
    for (const e of entries) {
        out.push(`### ${e.name} — ${e.verdict}`);
        const line = (s: ReadinessSignal, kind: string) =>
            `- ${MD_SYMBOL[s.status]} **${s.label}** (${kind})${s.note ? ` — ${s.note}` : ''}`;
        if (e.blockers.length === 0 && e.caveats.length === 0) {
            out.push('All buildability signals met.');
        } else {
            for (const s of e.blockers) out.push(line(s, 'blocker'));
            for (const s of e.caveats) out.push(line(s, 'caveat'));
        }
        out.push('');
    }

    return out.join('\n');
}

/**
 * Pick the response format for the scorecard endpoint. An explicit `?format=`
 * query wins; otherwise an `Accept: text/markdown` header selects markdown.
 * Defaults to JSON. Throws on an unrecognized explicit format.
 */
export function resolveFormat(
    formatParam: string | null,
    acceptHeader: string | null,
): 'json' | 'md' {
    if (formatParam !== null) {
        const f = formatParam.toLowerCase();
        if (f === 'json') return 'json';
        if (f === 'md' || f === 'markdown') return 'md';
        throw new Error(`Unsupported format "${formatParam}" (use json or md)`);
    }
    if (acceptHeader && acceptHeader.toLowerCase().includes('text/markdown')) return 'md';
    return 'json';
}
