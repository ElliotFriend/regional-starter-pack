---
paths:
    - 'src/lib/config/**'
    - 'tests/config/**'
    - 'src/routes/anchors/scorecard/**'
    - 'src/routes/api/scorecard/**'
    - 'src/routes/regions/**'
---

# Curation and the readiness scorecard

`tests/config/anchors.test.ts` and `tests/config/scorecard.test.ts` pin these semantics; treat them as the contract.

## Two lenses (`src/lib/config/anchors.ts`)

Each criterion scores `met` / `partial` / `failed` / `unverified`; build scorecards with `makeCriteria()` (unspecified criteria default to `unverified`).

- **Commercial** (`COMMERCIAL_CRITERIA`): local asset on Stellar, local rails, competitive rates (<25 bps), deep liquidity. Passes unless two or more are `failed`; one failure (usually the missing local asset, since most anchors use USDC) is tolerated. Rates and liquidity are BD-vetted and often `unverified`.
- **Developer** (`DEVELOPER_CRITERIA`): open self-service access, accurate docs (match the wire), high-fidelity sandbox (a completed test ramp lands real testnet tokens), agent-buildable, fee discoverability. Passes unless any one is `failed`.

`curationStatus()` is advisory. Placement in `ANCHORS` vs `HONORABLE_MENTIONS` is a manual editorial call: an anchor that genuinely ramps on Stellar self-serve, end to end, is a curated candidate. Reference/test anchors set `referenceAnchor: true` (exempt from the commercial gate); `mock: true` marks a third-party stand-in.

Honorable mentions with `vetting: true` are BD pipeline candidates with preliminary, research-based scorecards; they render an "Under evaluation" badge.

Keep scorecard notes and `knownIssues` concise and factual: one or two clauses.

## Readiness scorecard (`src/lib/config/scorecard.ts`)

`buildReadiness()` projects `ANCHORS` + `HONORABLE_MENTIONS` (skipping `referenceAnchor`s) into `ready` / `partial` / `blocked` over six signals:

- **Required:** `local-rails`, `open-access`, `high-fidelity-sandbox`. Any `failed` → `blocked`.
- **Friction:** `accurate-docs`, `agent-buildable`, `fee-discoverability`. A `failed` friction signal, or any `partial`/`unverified` signal → `partial`.
- All met → `ready`.

`competitive-rates` and `deep-liquidity` are intentionally omitted. `/api/scorecard` serves JSON by default, Markdown via `?format=md` or `Accept: text/markdown` (query wins), with CORS `*`. `/anchors/scorecard` is the human page.

## Regions and markets

A region or rail id used by an honorable mention but missing from `regions.ts` / `rails.ts` fails `tests/config/config-integrity.test.ts` unless baselined in its `KNOWN_DANGLING` map.
