# Stellar Regional Starter Pack — LLM Guide

This is a SvelteKit application demonstrating fiat on/off ramps on the Stellar network using locally denominated assets. It ships a portable anchor integration library (one curated provider — Etherfuse — plus a reference client for the Stellar test anchor, plus a composable SEP protocol library) and a demo app that exercises every anchor.

The project curates anchor integrations against **two lenses**, defined in `src/lib/config/anchors.ts`:

- **Commercial** (`COMMERCIAL_CRITERIA`) — the end-user-value bar: locally denominated asset on Stellar, local payment-rail support, competitive rates (<25 bps), deep liquidity. Passes unless two or more are a confirmed failure (a single failure — typically the missing local asset, since most anchors default to USDC — is tolerated). Fee + liquidity are vetted elsewhere and are often `unverified`.
- **Developer** (`DEVELOPER_CRITERIA`) — the buildability bar: open self-service access, accurate docs (match the wire), high-fidelity sandbox (a completed test ramp lands real on-chain testnet tokens), agent-buildable. Passes unless any one is a confirmed failure.

Each criterion is scored on a 4-state scale (`met` / `partial` / `failed` / `unverified`). `curationStatus(scorecard)` computes an advisory `curated` / `flagged` verdict (it does not move anchors automatically — placement in `ANCHORS` vs `HONORABLE_MENTIONS` stays a manual editorial call). Reference/test anchors are `referenceAnchor: true` and exempt from the commercial gate. Anchors that don't clear the bar appear as "honorable mentions" on region pages.

## Project Structure

Each curated anchor owns its own client, its own server-side instance singleton, its own client-side API wrapper, its own API routes, and its own bespoke flow pages.

- `src/lib/anchors/` — **Portable**, framework-agnostic anchor code (no SvelteKit imports). Each subdirectory is self-contained and copy-pasteable:
    - `etherfuse/` — `EtherfuseClient`, types, README. Programmatic flow, iframe KYC, SPEI + PIX deposit instructions.
    - `testanchor/` — Two clients side-by-side: `TestAnchorRampClient` (SEP-shaped wrapper used by the curated `/anchors/testanchor` flows) and `TestAnchorClient` (a stateful SEP playground used by the `/testanchor` demo page).
    - `sep/` — Composable SEP modules (`sep1`, `sep6`, `sep10`, `sep12`, `sep24`, `sep31`, `sep38`).
- `src/lib/server/` — Server-only singletons that read `$env/static/private`:
    - `etherfuseInstance.ts` — lazily-instantiated `EtherfuseClient`.
    - `testanchorInstance.ts` — lazily-instantiated `TestAnchorRampClient` + a `requireBearer(request)` helper for the `Authorization: Bearer <SEP-10 token>` pattern.
- `src/lib/api/` — Client-side fetch wrappers per provider:
    - `etherfuse.ts` — typed wrappers around `/api/anchor/etherfuse/*`.
    - `testanchor.ts` — typed wrappers around `/api/anchor/testanchor/*`.
- `src/lib/wallet/` — Freighter wallet API + Stellar helpers (Horizon, transactions, trustlines).
- `src/lib/components/` — Shared UI primitives. None of them encode anchor-specific logic; each bespoke flow page composes them.
    - Top-level: `WalletConnect`, `QuoteDisplay`, `KycIframe`.
    - `ramp/`: `AmountInput`, `TrustlineStatus`.
    - `ui/`: `Header`, `Footer`, `Sidebar`, `DevBox`, `ErrorAlert`, `CopyableField`.
- `src/lib/stores/` — `wallet.svelte.ts` (Freighter connection state) and `auth.ts` (SEP-10 JWT cache, keyed by provider + public key).
- `src/lib/config/` — Three files (no barrel): `anchors.ts` (`AnchorProfile`, `ANCHORS`, `QUALITY_CRITERIA`, `HONORABLE_MENTIONS`), `regions.ts`, `rails.ts`.
- `src/lib/utils/` — `status.ts`, `currency.ts`, `quote.ts`, `stellar-asset.ts`.
- `src/lib/constants.ts` — `PROVIDER`, `TX_STATUS`.
- `src/routes/` —
    - `anchors/` listing + `anchors/etherfuse/{,onramp,offramp}/` + `anchors/testanchor/{,interactive/{onramp,offramp},programmatic/{onramp,offramp}}/`. Each flow page is a self-contained state machine.
    - `regions/` + `regions/[region]/`. Region pages are config-driven.
    - `testanchor/` — the standalone SEP playground demo.
    - `api/anchor/etherfuse/{customers,quotes,onramp,offramp,bank-accounts,kyc,sandbox,assets}/+server.ts` — CORS proxy routes per Etherfuse operation.
    - `api/anchor/testanchor/{auth,customer,price,sep6,sep24}/+server.ts` — CORS proxy routes per SEP for the test anchor.
    - `api/testanchor/` — separate proxy for the `/testanchor` playground demo.

## Key Concepts

### Per-provider isolation

Each anchor's client is standalone. It does not implement a shared interface. Its types are defined within its own directory. Its error class is its own (`EtherfuseError`, `TestAnchorSepUnsupportedError`). The only cross-anchor dependency is `@stellar/stellar-sdk` and (for SEP-compliant anchors) `src/lib/anchors/sep/`.

The boundary that matters at runtime is the server-side instance singleton: `getEtherfuse()` returns a configured `EtherfuseClient`, `getTestAnchor()` returns a configured `TestAnchorRampClient`.

### Routes

Routes mirror the per-provider isolation. There is no dynamic `[provider]` segment. Static routes per provider take precedence in SvelteKit's router and each provider's routes can diverge freely.

### Flow pages

Each on-ramp and off-ramp lives in its own `+page.svelte`:

- `routes/anchors/etherfuse/onramp/+page.svelte` (~711 LOC) — Connect wallet → email + customer create → KYC iframe → bank account confirm → amount + quote → deposit instructions + polling → complete. Sandbox-only "Simulate fiat received" affordance.
- `routes/anchors/etherfuse/offramp/+page.svelte` (~759 LOC) — Same onboarding flow → quote → create off-ramp → poll for burn XDR → sign with Freighter → submit to Stellar → poll for fiat payout → complete.
- `routes/anchors/testanchor/interactive/{onramp,offramp}/+page.svelte` (~330 LOC each) — SEP-10 challenge → SEP-24 start → open hosted URL → poll until status terminal.
- `routes/anchors/testanchor/programmatic/{onramp,offramp}/+page.svelte` (~440-460 LOC each) — SEP-10 challenge → SEP-12 KYC discovery + submit → SEP-6 deposit/withdraw → (off-ramp only: sign + submit XDR) → poll.

Each page is one mental model deep. Polling, SEP-10 auth, and KYC handling are inline; the bespoke approach trades duplication for readability.

### SEP library (`anchors/sep/`)

Framework-agnostic implementations of SEP-1, SEP-6, SEP-10, SEP-12, SEP-24, SEP-31, SEP-38. Optional `fetchFn` for SSR. The `TestAnchorRampClient` wraps these with discovery caching; pages can also use the SEP modules directly if they prefer.

### CORS proxy pattern

Browser → SvelteKit route → anchor API:

1. Browser calls `/api/anchor/etherfuse/quotes` (or `/api/anchor/testanchor/sep24?action=deposit`, etc.).
2. The route handler imports `getEtherfuse()` / `getTestAnchor()` and calls the client method.
3. Server proxies the response back to the browser.

API-key anchors (Etherfuse) never expose their key. SEP-10 tokens travel via the browser's `Authorization: Bearer ...` header; the test anchor route handlers use `requireBearer(request)`.

## Common Tasks

### Adding a new curated anchor

1. Create `src/lib/anchors/<name>/{client,types,index}.ts` shaped however the anchor's API works. No interface to satisfy. Define your own error class. Give the config a `debug?: boolean` flag (default off) that gates ALL console logging — log everything (requests, responses, errors) when set, nothing when not, and never log credentials even in debug. Cover both behaviors with tests (see the `debug logging` blocks in existing anchor tests).
2. Create `src/lib/server/<name>Instance.ts` — singleton getter that reads env vars. Pass `debug: dev` (from `$app/environment`) so the client logs in local dev and stays quiet in production.
3. Create `src/lib/api/<name>.ts` — client-side fetch wrappers per route. Mirror the per-provider shape from `etherfuse.ts` / `testanchor.ts`.
4. Create `src/routes/api/anchor/<name>/<operation>/+server.ts` per operation.
5. Create `src/routes/anchors/<name>/+page.svelte` (landing) and `<name>/<flow>/+page.svelte` per flow. Compose primitives from `src/lib/components/`. Don't try to share flow logic with another anchor in this PR — let it duplicate.
6. Add the provider to `src/lib/constants.ts` (`PROVIDER`).
7. Add to `src/lib/config/anchors.ts` (`ANCHORS`).
8. Add to `src/lib/config/regions.ts` if the anchor serves a region.
9. Add tests under `tests/anchors/<name>/`.
10. Document in `src/lib/anchors/<name>/README.md`.

If the anchor doesn't clear the two-lens bar (commercial + developer; see the top of this guide), add it to `HONORABLE_MENTIONS` in `src/lib/config/anchors.ts` instead — no client code needed. Give it a `scorecard` (via `makeCriteria`) so its gaps render.

### Sharing UI primitives

Anything in `src/lib/components/` should be **provider-agnostic** and **dumb** — it takes structural props, not anchor-shaped types. Examples in the current codebase:

- `QuoteDisplay.svelte` takes a structural `{ fromCurrency, toCurrency, fromAmount, toAmount, exchangeRate, fee, expiresAt }` shape — not any anchor's native quote type. Bespoke pages adapt their native data via a `$derived` shape inline.
- `KycIframe.svelte` takes only a URL and an `onComplete` callback.
- `WalletConnect.svelte` reads `walletStore` and exposes connect/disconnect.

If you find yourself wanting to put `anchorName === 'etherfuse'` inside a primitive, the primitive is the wrong shape. Either narrow its props or render the variant inline in the page.

### Adding SEP support

1. Create `src/lib/anchors/sep/sep<N>.ts` modeled on the existing modules (pure functions, optional `fetchFn`).
2. Add types to `sep/types.ts`.
3. Export from `sep/index.ts`.
4. Cover with tests under `tests/anchors/sep/`.

## Linting Conventions

- `{#each}` blocks must have a key: `{#each items as item (item.id)}`.
- Unused function params use `_` prefix (ESLint config has `argsIgnorePattern: '^_'`).
- `svelte/no-navigation-without-resolve` is disabled project-wide; bespoke pages use dynamic hrefs (e.g. `/anchors/${id}`) and external URLs that the rule's typed-routes model doesn't fit.
- Run `pnpm format` (not `npx prettier`) and `pnpm lint`.

## Environment Variables

```env
# Etherfuse
ETHERFUSE_API_KEY=""
ETHERFUSE_BASE_URL="https://api.sand.etherfuse.com"

# Stellar (public, accessible client-side)
PUBLIC_STELLAR_NETWORK="testnet"
PUBLIC_USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
```

## Tech Stack

- **SvelteKit** with Svelte 5 (runes: `$state`, `$derived`, `$effect`).
- **TypeScript** throughout.
- **Tailwind CSS** for styling.
- **@stellar/stellar-sdk** for Stellar blockchain.
- **@stellar/freighter-api** for wallet connection.

---

## Svelte MCP Tools

You have access to the Svelte MCP server for comprehensive Svelte 5 and SvelteKit documentation.

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.

## Development Approach

### Test-Driven Development (TDD)

This project follows a test-driven development approach. When adding new features or integrations:

1. **RED**: Write comprehensive failing tests first — cover config, client methods, status mappings, error paths, and edge cases.
2. **GREEN**: Implement the code to make all tests pass.
3. **VERIFY**: Run `pnpm test:run` to confirm all tests pass before any other verification step.

Tests use **Vitest** + **MSW** (Mock Service Worker) and live in `tests/`. Follow existing patterns in `tests/anchors/etherfuse/` for anchor client tests and `tests/config/` for config tests.

Use `pnpm format` for code formatting (not `npx prettier`).
