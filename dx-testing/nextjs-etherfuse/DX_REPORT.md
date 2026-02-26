# Anchor Library Portability: DX Report

## Thesis Under Test

> This repository provides useful information, examples, and copy/paste-friendly code that can be easily incorporated into any TypeScript project to enable anchor integration in a breeze.

## Methodology

An AI subagent (Claude, acting as a Next.js developer with no prior context about the repo) was given the project README and told to build a Next.js application using only the portable library from this repo. The subagent:

1. Read the documentation and source code to understand the library
2. Decided what to copy and what to build from scratch
3. Copied the portable files into a Next.js App Router project
4. Built a full Etherfuse integration with on-ramp, off-ramp, KYC, and an AMM liquidity pool feature
5. Documented every friction point, question, and decision in a build journal

The supervisor (a separate Claude instance) reviewed the output, read every file, diffed copied files against originals, ran the build, and compiled this report.

**Context:** This is round 4. Round 1 tested React+Etherfuse, round 2 tested Next.js+BlindPay, round 3 tested Express+Etherfuse. Several issues from prior rounds have been fixed (barrel index deleted, `erasableSyntaxOnly` fixed, token data moved to `Anchor` interface, `wallet/` documented as portable). This round tests whether those fixes actually improved the experience for the Next.js+Etherfuse combination.

## Test Application

**Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS

**What was built:**

- Wallet connection hook wrapping the portable Freighter helpers
- Customer registration and KYC iframe flow
- On-ramp flow: MXN amount entry, quote with countdown, SPEI payment instructions, status polling, sandbox simulation
- Off-ramp flow: CETES amount entry, quote, deferred signing (poll for signable XDR, sign with Freighter, submit to Stellar), completion polling
- AMM liquidity pool: CETES/XLM pool info, trustline setup, deposit, withdrawal (new feature not in the SvelteKit app)
- 7 API route handlers proxying to the Etherfuse client server-side
- `.env.local` template with all required environment variables

**Lines of code:** ~2,350 lines of new application code (components, hooks, API routes, AMM utilities)

---

## Verdict: 9/10

The portability claim holds strongly. Eight files were copied from the library and all compiled without modification. The fixes from prior rounds are clearly visible: no barrel index confusion, no `erasableSyntaxOnly` breakage, no token config friction. The subagent found the documentation "genuinely excellent" and didn't hit any case where docs diverged from implementation.

The 1-point deduction is for the subagent needing to create its own token configuration (`CETES_TOKEN` constant with issuer), which is now expected behavior — the library surfaces this data via `supportedTokens` on the client class, but the subagent chose to hardcode it rather than read it from the client instance. This is a minor ergonomics observation, not a blocking issue.

---

## What Worked

### 1. All prior fixes landed cleanly

The three issues from round 1 (React+Etherfuse) have been resolved:

| Round 1 Issue | Status in Round 4 |
| --- | --- |
| `erasableSyntaxOnly` broke builds | **Fixed** — `AnchorError` and `WalletError` use explicit field declarations now. Build passed on first try. |
| Barrel `index.ts` broke selective copying | **Fixed** — Barrel deleted. Subagent copied `types.ts` + `etherfuse/` + `wallet/` with no dead-import issues. |
| `wallet/` not advertised as portable | **Fixed** — Subagent found the wallet docs in the README and copied `wallet/` immediately. No discovery friction. |

The round 2 fix (token data on `Anchor` interface instead of `config/tokens.ts`) also worked — the subagent never tried to copy `config/` at all.

### 2. Zero-modification copy-paste

Eight files were copied. Diffing them against originals reveals:

| File | Functional Changes | Notes |
| --- | :---: | --- |
| `anchors/types.ts` | None | Copy dropped future-reference comments (non-functional) |
| `anchors/etherfuse/client.ts` | None | Copy dropped JSDoc `@param`/`@returns` annotations (non-functional) |
| `anchors/etherfuse/types.ts` | None | Byte-identical |
| `anchors/etherfuse/index.ts` | None | Byte-identical |
| `wallet/freighter.ts` | None | Byte-identical |
| `wallet/stellar.ts` | None | Byte-identical |
| `wallet/types.ts` | None | Byte-identical |
| `wallet/index.ts` | Minor | Added `getStellarAsset` and `getNetworkPassphrase` re-exports |

The only functional change was adding two re-exports to `wallet/index.ts` — the subagent wanted those utilities accessible from the barrel. The library code itself compiled in Next.js 16 with zero source changes.

### 3. The anchor factory translation was trivial

The SvelteKit `anchorFactory.ts` uses `$env/static/private`. The Next.js equivalent (`anchor-factory.ts`) is 32 lines — a cached singleton that reads `process.env`. The subagent called this out explicitly: "Dead simple — just a switch statement that creates cached client instances." The `process.env` example already existed in the project README, which made this a non-issue.

### 4. API route translation was mechanical

The SvelteKit `+server.ts` handlers mapped 1:1 to Next.js App Router `route.ts` files. Same pattern: parse request, call anchor method, return JSON, catch `AnchorError`. The subagent created 7 route handlers covering customers, KYC, quotes, on-ramp, off-ramp, fiat accounts, and sandbox simulation. The consistent error handling pattern (`AnchorError` → HTTP status code mapping) translated cleanly.

### 5. The deferred signing pattern worked correctly

The off-ramp component implements the full Etherfuse deferred signing flow:

1. Create order → no signable transaction in response
2. Enter `awaiting_signable` state → poll `getOffRampTransaction()` every 5 seconds
3. When `signableTransaction` appears → transition to `signing` state
4. Sign with Freighter → submit to Stellar
5. Enter `polling` state → poll until `completed`

This is the most complex provider-specific pattern in the library, and the subagent implemented it correctly from documentation alone. The Etherfuse README's explanation of this flow was sufficient.

### 6. The subagent built something new without friction

The AMM liquidity pool feature (`amm.ts` + `LiquidityPool.tsx`) uses the portable `wallet/stellar.ts` utilities alongside raw Stellar SDK operations. The subagent extended the wallet layer with pool-specific helpers (trustline, deposit, withdraw, pool info query) and they integrated cleanly with the existing `signWithFreighter` and `submitTransaction` utilities. This validates that the wallet layer is composable beyond the anchor flows.

### 7. The documentation flow was smooth

From the build journal:

> "The Etherfuse README was genuinely excellent. It explained every flow in detail with code examples. I didn't have to guess at anything."

> "The documentation (README.md, CLAUDE.md, per-provider READMEs) is thorough and accurate. I didn't hit any case where the docs said one thing and the code did another."

The subagent followed the intended reading order: README → CLAUDE.md → types.ts → etherfuse/README.md → client.ts → wallet/ files → SvelteKit API routes (as a template). No wrong turns.

---

## What Didn't Work

### Issue 1: Token configuration requires manual extraction

**Severity:** Low — functional, but slightly ergonomic

**Problem:** The subagent created a `constants.ts` with a hardcoded `CETES_TOKEN` object:

```typescript
export const CETES_TOKEN = {
    symbol: 'CETES',
    name: 'Etherfuse CETES',
    issuer: CETES_ISSUER,
    description: "Mexican Federal Treasury Certificates tokenized on Stellar.",
};
```

This data is available programmatically via `EtherfuseClient.supportedTokens`, but the subagent chose to hardcode it rather than instantiate the client to read it. The `supportedTokens` property is on the class (not a static property), so you need an instance to access it. For client-side code that can't instantiate `EtherfuseClient` (no API key), the token info has to come from somewhere else.

This is the same pattern seen in round 1 (React+Etherfuse), where the subagent also created a `CETES_CONFIG` manually. The token data migration from `config/tokens.ts` to the `Anchor` interface solved the portability problem but didn't solve the "how does the client-side get this info without instantiating the server-side client" question.

**Not a regression** — this is the expected behavior, and the subagent handled it without confusion. The issuer was easy to find in the Etherfuse client source.

---

## Observations (Not Issues)

### Scope of the build

This was the most complete build of any round:

| Feature | Round 1 (React) | Round 2 (Next.js+BlindPay) | Round 4 (This Round) |
| --- | :---: | :---: | :---: |
| Wallet connection | Yes | Yes | Yes |
| Customer registration | Yes | Yes | Yes |
| KYC flow | Skipped | Redirect | Iframe |
| On-ramp | Yes | Yes | Yes |
| Off-ramp | Yes | Yes | Yes |
| Deferred signing | Yes | N/A (BlindPay) | Yes |
| Bank account management | Hardcoded | Yes | Yes (inline in off-ramp) |
| Sandbox simulation | No | No | Yes |
| AMM / DeFi feature | No | No | Yes |
| API route handlers | No (mock service) | Yes | Yes |
| Multi-page routing | No (SPA) | No (SPA) | Yes (4 pages) |

The subagent exercised more of the library surface area than any previous round.

### Dynamic imports for SSR safety

The subagent used dynamic imports (`await import(...)`) for all browser-only wallet code. This is the standard Next.js pattern for code that touches `window` or browser APIs. It worked cleanly with the portable library:

```typescript
const { signWithFreighter } = await import('@/lib/wallet/freighter');
const { submitTransaction } = await import('@/lib/wallet/stellar');
```

The `'use client'` directive on all components that use wallet functions is also correct for Next.js App Router.

### `serverExternalPackages` configuration

The subagent added `serverExternalPackages: ["@stellar/stellar-sdk"]` to `next.config.ts` to prevent the Stellar SDK from being bundled by Turbopack on the server side. This is a Next.js-specific concern that the library can't control, but it's worth noting as a common integration step.

### Build result

The project builds cleanly with zero TypeScript errors on Next.js 16.1.6 (Turbopack):

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/anchor/etherfuse/customers
├ ƒ /api/anchor/etherfuse/fiat-accounts
├ ƒ /api/anchor/etherfuse/kyc
├ ƒ /api/anchor/etherfuse/offramp
├ ƒ /api/anchor/etherfuse/onramp
├ ƒ /api/anchor/etherfuse/quotes
├ ƒ /api/anchor/etherfuse/sandbox
├ ○ /offramp
├ ○ /onramp
└ ○ /pool
```

### Subagent version mismatch catch

The subagent initially wrote `@stellar/freighter-api@^2.0.0` in `package.json` before catching it by checking the SvelteKit project's `package.json` and updating to `^6.0.1`. The Freighter API had breaking changes between v2 and v6. This is a good example of the SvelteKit project serving as a reference for dependency versions — the subagent used `package.json` as a source of truth.

---

## Recommendations

### Priority 1: Consider exposing token info statically (later)

The `supportedTokens` data is only accessible via an instantiated client. For client-side code that can't access the server-side client, token metadata (code, issuer, name) has to be hardcoded or fetched via an API call. Options:

- Add a static `tokens` property on the client class (no instance needed)
- Document the recommended pattern for surfacing token info to the client side
- Accept the current behavior (it's not blocking anyone)

This is a minor ergonomics point, not a priority.

### No other recommendations

The fixes from rounds 1-3 have addressed all previously identified issues. The library worked as advertised in this round.

---

## File Manifest

### Portable library files used (from `src/lib/`)

| File | Copied Verbatim | Notes |
| --- | :---: | --- |
| `anchors/types.ts` | Yes | |
| `anchors/etherfuse/client.ts` | Yes | |
| `anchors/etherfuse/types.ts` | Yes | |
| `anchors/etherfuse/index.ts` | Yes | |
| `wallet/freighter.ts` | Yes | |
| `wallet/stellar.ts` | Yes | |
| `wallet/types.ts` | Yes | |
| `wallet/index.ts` | Minor | Added 2 re-exports |

### Next.js application files created

| File | Lines | Purpose |
| --- | ---: | --- |
| `src/lib/anchor-factory.ts` | 32 | Server-side EtherfuseClient factory using `process.env` |
| `src/lib/constants.ts` | 13 | CETES token config, network constants |
| `src/lib/wallet/amm.ts` | 216 | Stellar AMM pool utilities (new, not in source repo) |
| `src/hooks/useWallet.ts` | 87 | React hook for Freighter wallet state |
| `src/components/WalletConnect.tsx` | 60 | Wallet connection UI |
| `src/components/KycIframe.tsx` | 23 | Etherfuse KYC iframe embed |
| `src/components/QuoteDisplay.tsx` | 66 | Quote summary with countdown timer |
| `src/components/OnRampFlow.tsx` | 383 | MXN → CETES with SPEI instructions + sandbox sim |
| `src/components/OffRampFlow.tsx` | 429 | CETES → MXN with deferred signing |
| `src/components/LiquidityPool.tsx` | 337 | CETES/XLM AMM pool deposit/withdraw |
| `src/app/page.tsx` | 120 | Home page with dashboard and navigation cards |
| `src/app/onramp/page.tsx` | 49 | On-ramp page |
| `src/app/offramp/page.tsx` | 49 | Off-ramp page |
| `src/app/pool/page.tsx` | 49 | Liquidity pool page |
| `src/app/api/anchor/etherfuse/customers/route.ts` | 30 | Customer registration |
| `src/app/api/anchor/etherfuse/kyc/route.ts` | 47 | KYC status and iframe URL |
| `src/app/api/anchor/etherfuse/quotes/route.ts` | 47 | Quote generation |
| `src/app/api/anchor/etherfuse/onramp/route.ts` | 83 | On-ramp creation + polling |
| `src/app/api/anchor/etherfuse/offramp/route.ts` | 116 | Off-ramp creation + polling |
| `src/app/api/anchor/etherfuse/fiat-accounts/route.ts` | 66 | Bank account management |
| `src/app/api/anchor/etherfuse/sandbox/route.ts` | 48 | Sandbox simulation |

### Not copied (SvelteKit-specific)

- `server/anchorFactory.ts` — uses `$env/static/private`
- `config/anchors.ts`, `config/regions.ts`, `config/rails.ts` — SvelteKit UI metadata
- `stores/wallet.svelte.ts`, `stores/customer.svelte.ts` — Svelte 5 runes
- `components/*.svelte` — Svelte 5 components
- `anchors/alfredpay/`, `anchors/blindpay/`, `anchors/sep/`, `anchors/testanchor/` — unused providers

---

## Appendix A: Subagent Prompt

The following prompt was given to the subagent verbatim:

> You are a fullstack developer building a Next.js application. You've come across
> a SvelteKit project at /Users/elliotvoris/Dev/stellar/regional/sveltekit that
> has a portable anchor integration library for building fiat on/off ramps on the
> Stellar blockchain network. You want to use this library in your own Next.js
> project.
>
> Your Next.js project is scaffolded at
> /Users/elliotvoris/Dev/stellar/regional/sveltekit/nextjs-test/ with TypeScript,
> Tailwind, App Router, and src/ directory. Dependencies are installed. You need
> to add @stellar/stellar-sdk and @stellar/freighter-api yourself.
>
> What you want to build:
>
> A Next.js app that integrates with Etherfuse (a Mexican fiat on/off ramp anchor) to let users:
>
> 1. Connect their Stellar wallet (Freighter browser extension)
> 2. Register as a customer and complete KYC verification
> 3. On-ramp: convert MXN to CETES tokens on Stellar via bank transfer (SPEI)
> 4. Off-ramp: convert CETES tokens back to MXN and withdraw to a bank account
> 5. Do something useful with the CETES once they're on-chain — deposit them into
> a Stellar AMM liquidity pool (e.g. CETES/XLM or CETES/USDC), so users can earn
> trading fees on their position
>
> The Etherfuse client requires an API key and must run server-side, so you'll
> need Next.js API route handlers that proxy requests to the anchor.
>
> How to get started:
>
> Read the documentation and source code in the SvelteKit project. Start with the
> READMEs, then dig into the types and client implementations. The project's
> CLAUDE.md has a full map of the codebase. Figure out what you need to copy into
> your project and how to wire it up.
>
> IMPORTANT: Do NOT read anything in the dx-testing/ directory. That directory is
> not relevant to your work. Only read from src/, README.md, and CLAUDE.md.
>
> Build journal:
>
> You MUST maintain a detailed build journal at
> /Users/elliotvoris/Dev/stellar/regional/sveltekit/nextjs-test/BUILD_JOURNAL.md.
> Write to it frequently — not just at the end. Record everything as you go:
>
> - What files you read and what you learned from each one
> - Questions that came up and how you resolved them
> - Decisions you made and why (architecture, what to copy, what to skip)
> - Any confusion, friction, or surprises you encountered
> - What worked smoothly and what didn't
> - Your general impressions of working with the library
> - Every file you copied and whether it needed modifications
> - Every file you created and its purpose
>
> Write the journal in first-person narrative form — like a developer's stream of
> consciousness as they work through the integration. Not a polished README.
> Think "lab notebook", not "documentation."
>
> Verification:
>
> When you're done building, make sure the project compiles and builds cleanly.
> Run whatever type-checking and build commands are standard for a Next.js +
> TypeScript project and fix any errors.
>
> IMPORTANT: You have full permission to use Bash for all operations — installing npm packages, creating directories, running builds, etc. Do not ask for permission. Just proceed with the work.
