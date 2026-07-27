# Stellar Regional Starter Pack — LLM Guide

SvelteKit app demonstrating fiat on/off ramps on Stellar using locally denominated assets. Ships a portable anchor integration library (curated: Etherfuse, Koywe; plus a reference client for the Stellar test anchor and a composable SEP library) and a demo app that exercises every anchor.

## Curation: two lenses

Defined in `src/lib/config/anchors.ts`. Each criterion scores `met` / `partial` / `failed` / `unverified` via `makeCriteria()`.

- **Commercial** (`COMMERCIAL_CRITERIA`) — the end-user-value bar: locally denominated asset on Stellar, local payment-rail support, competitive rates (<25 bps), deep liquidity. Passes unless two or more are a confirmed failure; a single failure — typically the missing local asset, since most anchors default to USDC — is tolerated. Fee + liquidity are vetted elsewhere and are often `unverified`.
- **Developer** (`DEVELOPER_CRITERIA`) — the buildability bar: open self-service access, accurate docs (match the wire), high-fidelity sandbox (a completed test ramp lands real on-chain testnet tokens), agent-buildable. Passes unless any one is a confirmed failure.

**`curationStatus()` is advisory.** It computes a `curated` / `flagged` verdict but does not move anchors — placement in `ANCHORS` vs `HONORABLE_MENTIONS` is a manual editorial call. An anchor that can genuinely ramp on Stellar self-serve, end-to-end, is a curated candidate; everything else stays an honorable mention. Reference/test anchors set `referenceAnchor: true` and are exempt from the commercial gate.

Honorable mentions may carry `vetting: true` — a candidate still being actively evaluated, whose scorecard is preliminary and hand-authored from research rather than a verified live integration. These render an "Under evaluation" badge and are how the BD partner pipeline is tracked.

`tests/config/anchors.test.ts` and `tests/config/scorecard.test.ts` pin these semantics — read them for the authoritative contract.

## Design decisions

**Per-provider isolation is deliberate.** Each anchor's client is standalone: no shared interface, types defined within its own directory, its own error class (`EtherfuseError`, `TestAnchorSepUnsupportedError`). The only cross-anchor dependencies are `@stellar/stellar-sdk` and, for SEP-compliant anchors, `src/lib/anchors/sep/`. Don't refactor toward a common abstraction. The boundary that matters at runtime is the server-side instance singleton (`getEtherfuse()`, `getTestAnchor()`).

**Routes mirror that isolation.** There is no dynamic `[provider]` segment — static routes per provider take precedence in SvelteKit's router and let each provider diverge freely.

**Flow pages duplicate on purpose.** Polling, SEP-10 auth, and KYC handling are inline in each `+page.svelte`, so each page is one mental model deep. The duplication buys readability — leave it.

**Anchor clients take a `debug?: boolean` that gates ALL console logging** (default off): log everything — requests, responses, errors — when set, nothing when not, and **never log credentials, even in debug.** Server-side singletons pass `debug: dev` from `$app/environment`. Cover both behaviors with tests (see the `debug logging` blocks in existing anchor tests).

**Credentials never reach the browser.** API-key anchors (Etherfuse) proxy through `src/routes/api/anchor/<name>/*` so the key stays server-side. SEP-10 tokens travel as the browser's `Authorization: Bearer ...` header; test-anchor route handlers use `requireBearer(request)`.

**Shared components are provider-agnostic and dumb** — they take structural props, not anchor-shaped types. Wanting `anchorName === 'etherfuse'` inside a primitive means the primitive is the wrong shape: narrow its props, or render the variant inline in the page.

**Anchor landing pages must use `AnchorRegionSelector`** (`<AnchorRegionSelector {profile} />`) for the region section — don't hand-roll it.

`src/lib/config/` has no barrel; import its four files directly.

## Developer-readiness scorecard

`src/lib/config/scorecard.ts` reframes the two-lens data around one question — _can a developer build on this anchor today?_ — for consumers like the BD team's agents. `buildReadiness()` projects `ANCHORS` + `HONORABLE_MENTIONS` (skipping `referenceAnchor`s) into a `ready` / `partial` / `blocked` verdict via a severity split:

- **Required** signals — `local-rails`, `open-access`, `high-fidelity-sandbox`. A confirmed failure → `blocked`.
- **Friction** signals — `accurate-docs`, `agent-buildable`. A confirmed failure → `partial`, as does any partial or unverified signal.
- All met → `ready`.

The BD-owned commercial criteria (`competitive-rates`, `deep-liquidity`) are intentionally omitted. `/api/scorecard` serves the data (JSON default; Markdown via `?format=md` or `Accept: text/markdown`, query wins; CORS `*`); `/anchors/scorecard` renders the human page. The drop-in prompt for BD's agent and the latest pipeline assessment live in `docs/` (untracked).

## Conventions

- `{#each}` blocks must have a key: `{#each items as item (item.id)}`.
- Unused function params take a `_` prefix (ESLint `argsIgnorePattern: '^_'`).
- `svelte/no-navigation-without-resolve` is disabled project-wide; bespoke pages use dynamic hrefs (e.g. `/anchors/${id}`) and external URLs that the rule's typed-routes model doesn't fit.
- Lucide icons use per-icon deep imports (`@lucide/svelte/icons/circle-check`) to stay tree-shakeable.
- Tests are Vitest + MSW under `tests/`. Write them first — this project is TDD.
- `pnpm format` and `pnpm lint`, never `npx prettier`. `pnpm test:run` for a single pass.

Env vars: see `.env.example`.
