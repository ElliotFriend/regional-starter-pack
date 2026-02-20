# Anchor Library Portability: DX Report

## Thesis Under Test

> This repository provides useful information, examples, and copy/paste-friendly code that can be easily incorporated into any TypeScript project to enable anchor integration in a breeze.

## Methodology

An AI subagent (Claude, acting as a React developer with no prior context about the repo) was given the project README and told to build a React + TypeScript application using only the portable library from this repo. The subagent:

1. Read the documentation and source code to understand the library
2. Decided what to copy and what to build from scratch
3. Copied the portable files into a Vite React project
4. Built a CETES yield dashboard with on-ramp and off-ramp flows
5. Documented every friction point, question, and decision in a build journal

The supervisor (a separate Claude instance) reviewed the output, read every component, and compiled this report.

## Test Application

**Stack:** Vite + React 18 + TypeScript (standard `react-ts` template)

**What was built:**
- Wallet connection hook wrapping the portable Freighter helpers
- CETES yield position dashboard (balance, MXN value, projected returns at 5.78% APY)
- On-ramp flow: amount entry, quote, SPEI payment instructions, polling
- Off-ramp flow: amount entry, quote, deferred signing (Etherfuse pattern), polling
- Mock anchor service implementing the `Anchor` interface for demo mode

**Lines of code:** ~1,000 lines of React (App + 4 components + 1 hook + 1 service)

---

## Verdict: 8/10

The portability claim holds. A developer can copy the anchor library into a non-SvelteKit project and build against it with minimal friction. The type design is the standout — programming against the `Anchor` interface and `AnchorCapabilities` flags made the React components provider-agnostic without effort.

The gaps are real but small, and all are fixable without architectural changes.

---

## What Worked

### 1. The library really is framework-agnostic

Six files were copied from the repo. Four required zero modifications:

| File | Source | Changes |
|------|--------|---------|
| `anchors/etherfuse/client.ts` | `src/lib/anchors/etherfuse/client.ts` | None |
| `anchors/etherfuse/types.ts` | `src/lib/anchors/etherfuse/types.ts` | None |
| `wallet/freighter.ts` | `src/lib/wallet/freighter.ts` | None |
| `wallet/stellar.ts` | `src/lib/wallet/stellar.ts` | None |
| `anchors/types.ts` | `src/lib/anchors/types.ts` | Parameter property fix (see below) |
| `wallet/types.ts` | `src/lib/wallet/types.ts` | Parameter property fix (see below) |

The relative import structure (`../types` from `etherfuse/client.ts`) means the files resolve correctly as long as you maintain the directory layout. Good design choice.

### 2. The type system guides correct usage

The subagent built its React components by programming against `Anchor` — not `EtherfuseClient`. This happened naturally because the types made it the obvious approach:

```typescript
// The React components accept the interface, not the implementation
interface OnRampFlowProps {
    anchor: Anchor;  // not EtherfuseClient
    publicKey: string;
    customerId: string;
}
```

The `AnchorCapabilities` flags drove correct branching without provider-name checks:

```typescript
// Off-ramp: check the capability flag, not the provider name
if (anchor.capabilities.deferredOffRampSigning) {
    setStep('awaiting_signable');
    startPollingForSignable(tx.id);
} else if (tx.signableTransaction) {
    setStep('signing');
}
```

This is the intended design pattern and the subagent arrived at it independently.

### 3. The documentation was sufficient

The subagent cited the README and `etherfuse/README.md` as "genuinely useful." The flow documentation (customer -> KYC -> quote -> order -> poll) and the capability flags table gave enough information to build the flows correctly, including the Etherfuse-specific deferred signing pattern.

### 4. The wallet helpers are equally portable

`freighter.ts` and `stellar.ts` copied into React with no changes (aside from the error class fix in `types.ts`). The subagent used `checkTrustline()` and `getStellarAsset()` directly in the yield dashboard:

```typescript
const asset = getStellarAsset(CETES_CONFIG.code, CETES_CONFIG.issuer);
const result = await checkTrustline(publicKey, asset, network);
```

This validates that `/src/lib/wallet/` is as portable as `/src/lib/anchors/`.

---

## What Didn't Work

### Issue 1: `erasableSyntaxOnly` incompatibility

**Severity:** Medium — blocks builds in modern Vite/esbuild/SWC projects

**Problem:** Two error classes use TypeScript parameter properties:

```typescript
// src/lib/anchors/types.ts:274-282
export class AnchorError extends Error {
    constructor(
        message: string,
        public code: string,           // parameter property
        public statusCode: number = 500, // parameter property
    ) { ... }
}

// src/lib/wallet/types.ts:12-20
export class WalletError extends Error {
    constructor(
        message: string,
        public code: WalletErrorCode,  // parameter property
    ) { ... }
}
```

Modern frontend tooling sets `erasableSyntaxOnly: true` (Vite's `react-ts` template, esbuild, SWC). This flag rejects TypeScript syntax that generates JavaScript — parameter properties, enums, namespaces. The error message (`TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled`) is not self-explanatory to someone unfamiliar with the flag.

Extra trap: `tsc --noEmit` passes (uses root tsconfig with no compiler options), but `tsc -b --noEmit` fails (uses `tsconfig.app.json` with the flag). A developer might think everything is fine until they run `npm run build`.

**Fix:** Expand parameter properties into explicit field declarations:

```typescript
export class AnchorError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'AnchorError';
        this.code = code;
        this.statusCode = statusCode;
    }
}
```

This is backwards-compatible with the existing SvelteKit project and compatible with all TypeScript configurations.

### Issue 2: Barrel `index.ts` conflicts with selective copying

**Severity:** Low — easy to work around, but confusing

**Problem:** `src/lib/anchors/index.ts` re-exports all three providers, the SEP modules, and the test anchor:

```typescript
export { EtherfuseClient } from './etherfuse';
export { AlfredPayClient } from './alfredpay';
export { BlindPayClient } from './blindpay';
export * as sep from './sep';
export { TestAnchorClient, ... } from './testanchor';
```

The README says "copy the directories you need," but if you copy `anchors/` wholesale, the barrel index causes import errors for providers you didn't include.

The subagent's solution was to skip `index.ts` entirely and import directly from `types.ts` and `etherfuse/`. This works, but the disconnect between "copy the directory" and "but skip this file" is a papercut.

**Fix options:**
- Remove the barrel `index.ts` entirely (consumers import from specific paths)
- Make the README explicitly say "copy `types.ts` and the provider directories you need — skip `index.ts`"
- Use dynamic imports or optional re-exports that don't break when modules are missing

### Issue 3: Wallet directory not advertised as portable

**Severity:** Low — the code works fine, it's just a documentation gap

**Problem:** The README and `anchors/README.md` emphasize that `/src/lib/anchors/` is portable and framework-agnostic. But `/src/lib/wallet/` is equally portable — no SvelteKit imports, just `@stellar/stellar-sdk` and `@stellar/freighter-api`. The subagent discovered this by reading the source code, not the docs.

The wallet helpers (`checkTrustline`, `addTrustline`, `buildPaymentTransaction`, `submitTransaction`, `getStellarAsset`) are exactly the kind of utilities a developer building anchor integrations needs.

**Fix:** Add a section to the README calling out `wallet/` as portable and listing the key utilities.

### Issue 4: No guidance for non-SvelteKit consumers

**Severity:** Low-Medium — doesn't block usage, but would accelerate adoption

**Problem:** The README mentions portability but doesn't show what it looks like outside SvelteKit. A developer needs to figure out on their own:

- That they need a backend proxy (CORS + API keys)
- How to instantiate the client without `anchorFactory.ts`
- How to handle the `fetchFn` parameter in SEP modules for non-SvelteKit SSR
- That `config/tokens.ts` uses `$lib` paths and isn't part of the portable layer

The subagent had to recreate token configuration (`CETES_CONFIG`) from scratch because `config/tokens.ts` imports from `$lib/config/tokens` and isn't portable.

**Fix:** Add a "Usage Outside SvelteKit" section with:
- A 10-line Express/Next.js example showing client instantiation + proxy pattern
- A note about CORS and why a backend proxy is needed
- A note that `config/` is SvelteKit-specific (or make it portable)

---

## Observations (Not Issues)

### Things the subagent chose not to port

- **KYC flow** — The SvelteKit app has `KycIframe`, `KycForm`, and redirect handling. The subagent skipped this entirely, building a simpler flow that assumes KYC is already done. This is reasonable for a demo but means the KYC capability flags (`kycFlow: 'form' | 'iframe' | 'redirect'`) weren't exercised.

- **Trustline management in ramp flows** — The SvelteKit app's `TrustlineStatus.svelte` handles trustline detection and the "Add Trustline" button inline. The subagent's yield dashboard checks trustlines but doesn't offer to add them. The ramp flows don't check at all.

- **Bank account selection** — The off-ramp uses a hardcoded `fiatAccountId` instead of implementing account selection with `getFiatAccounts()` and `registerFiatAccount()`.

These omissions are scope decisions, not portability failures. The types and methods exist; they just weren't used.

### Patterns that emerged naturally

The subagent independently arrived at patterns that mirror the SvelteKit app:

- Step-based state machines for flows (`'amount' | 'quote' | 'payment' | 'polling' | 'complete'`)
- Polling with cleanup on unmount
- Mock service implementing the `Anchor` interface for demo mode
- Capability flag checks for provider-specific behavior

This suggests the library's architecture guides consumers toward the right patterns even without seeing the SvelteKit implementation.

---

## Recommendations

### Priority 1: Fix `erasableSyntaxOnly` (do now)

Expand parameter properties in `AnchorError` and `WalletError`. Two files, ~10 lines changed. Zero impact on existing code. Eliminates the most likely build failure for new consumers.

### Priority 2: Improve copy instructions (do now)

Update the "Installation / Copying" section in `anchors/README.md`:
- Explicitly say to skip `index.ts` when copying selectively
- Call out `wallet/` as portable
- Add a "Usage Outside SvelteKit" section with a backend proxy example

### Priority 3: Consider making token config portable (later)

The `config/tokens.ts` file has useful data (asset codes, issuers) but uses `$lib` paths. Either:
- Extract a framework-agnostic `tokens.ts` into the portable layer
- Or document that token configuration is the consumer's responsibility

### Priority 4: Optional cleanup

- Remove the barrel `anchors/index.ts` or make it resilient to missing providers
- Add `wallet/` to the "portable" callout in the top-level README

---

## File Manifest

### Portable library files used (from `src/lib/`)

| File | Copied Verbatim | Notes |
|------|:-:|-------|
| `anchors/types.ts` | No | Parameter property fix in `AnchorError` |
| `anchors/etherfuse/client.ts` | Yes | |
| `anchors/etherfuse/types.ts` | Yes | |
| `wallet/freighter.ts` | Yes | |
| `wallet/stellar.ts` | Yes | |
| `wallet/types.ts` | No | Parameter property fix in `WalletError` |

### React application files created

| File | Lines | Purpose |
|------|------:|---------|
| `src/App.tsx` | 187 | Shell: header, tabs, wallet connection |
| `src/services/anchorService.ts` | 282 | Mock `Anchor` implementation + CETES config |
| `src/hooks/useWallet.ts` | 123 | Freighter hook with mock fallback |
| `src/components/WalletConnect.tsx` | 57 | Connect/disconnect UI |
| `src/components/YieldDashboard.tsx` | 235 | Balance, value, APY, projected returns |
| `src/components/OnRampFlow.tsx` | 357 | MXN -> CETES with SPEI instructions |
| `src/components/OffRampFlow.tsx` | 407 | CETES -> MXN with deferred signing |

### Not copied (SvelteKit-specific)

- `server/anchorFactory.ts` — uses `$env/static/private`
- `config/tokens.ts`, `config/anchors.ts`, `config/regions.ts`, `config/rails.ts` — use `$lib` paths
- `stores/wallet.svelte.ts`, `stores/customer.svelte.ts` — Svelte runes
- `components/*.svelte` — Svelte 5 components
