# Stellar Regional Starter Pack

SvelteKit demo app plus a portable anchor-integration library for fiat on/off ramps on Stellar. Each anchor has its own client in `src/lib/anchors/<name>/` and its own flow pages under `src/routes/anchors/<name>/`. Curated anchors live in `ANCHORS`, candidates in `HONORABLE_MENTIONS` (`src/lib/config/anchors.ts`).

Topic rules load automatically from `.claude/rules/` when you touch matching files: anchor integrations (`anchor-integrations.md`) and curation/scorecard (`curation-and-scorecard.md`). Workflows live in skills: `adding-an-anchor`, `assessing-an-anchor`.

## Commands

- `pnpm test:run` — one Vitest pass (`pnpm vitest run <path>` for a subset). `pnpm check` — svelte-check.
- `pnpm format` and `pnpm lint` — never `npx prettier`.
- Env vars: declare each in `src/env.ts` (`defineEnvVars`; `static: true` = inlined at build time), import from `$app/env/public` / `$app/env/private`, and list it in `.env.example` (a missing static var breaks a fresh clone's build).

## Design decisions

- **Per-provider isolation is deliberate.** No shared anchor interface; each client owns its types and error class. The only cross-anchor dependencies are `@stellar/stellar-sdk` and, for SEP anchors, `src/lib/anchors/sep/`. Don't refactor toward a common abstraction.
- **SEP anchors should run in the browser; API-key anchors go through a proxy.** A SEP-compliant anchor holds no secrets, so its pages call the client directly. Add a server proxy only when something on the anchor's side (e.g. broken CORS) prevents browser use. API-key anchors keep the key server-side behind `src/routes/api/anchor/<name>/*`.
- **Routes are static per provider** — no dynamic `[provider]` segment, so each provider can diverge.
- **Flow pages duplicate on purpose.** Polling, SEP-10 auth, and KYC handling stay inline in each `+page.svelte`; don't extract shared flow logic.
- **Shared components are provider-agnostic.** They take structural props, never anchor-shaped types. Needing `anchorName === '...'` inside a primitive means its props are the wrong shape.
- **Wallet prompts follow a user action**, never a background poll tick (e.g. build and sign a payment when the user clicks Send).

## Conventions

- TDD: write the failing test first. Tests are Vitest + MSW under `tests/`; component specs sit beside pages as `*.svelte.spec.ts`.
- `{#each}` blocks always have a key: `{#each items as item (item.id)}`.
- Unused params take a `_` prefix (ESLint `argsIgnorePattern: '^_'`).
- Lucide icons use per-icon deep imports (`@lucide/svelte/icons/circle-check`).
- `svelte/no-navigation-without-resolve` is off project-wide (bespoke pages use dynamic and external hrefs).
- Import `src/lib` via `#lib/...` with the file's real extension (`#lib/config/anchors.ts`, `#lib/stores/wallet.svelte.ts`, `#lib/anchors/seevcash/index.ts`); `$lib` no longer exists (SvelteKit 3).
- `src/lib/config/` has no barrel; import its files directly.
- Use the Svelte MCP server (`.mcp.json`) to check `.svelte` changes.
