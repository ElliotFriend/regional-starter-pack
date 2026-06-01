# Round 4 Architecture Review — Agent 1

**TL;DR:** For Goal #1 (copy/paste portability), the experiment branch wins decisively. The unified-`Anchor`-interface on `main` makes Etherfuse *not paste-cleanly* — a naive `cp -r etherfuse/` into a fresh project fails with 20+ TS errors because the client imports an 825-line shared `types.ts` from the parent directory. For Goal #2 (SvelteKit demo), `main` is clearly nicer: one `OnRampFlow.svelte` drives every provider via dynamic `[provider]` routing, while the experiment open-codes each provider's flow page at 700+ lines. Given the stated 60/40 weighting and that this project sells itself as a *curated portable showcase*, I lean experiment, with a caveat below.

---

## 1. Empirical paste-target test

I chose **Etherfuse** on each branch. Both worktrees were pristine; I set up scratch dirs under `/tmp/paste-test-{main,experiment}/`.

**Step 1 — naive paste.** `cp -r src/lib/anchors/etherfuse /tmp/paste-test-X/etherfuse`, then dropped in a minimal `tsconfig.json`, `package.json` (only `@stellar/stellar-sdk` + `typescript` + `@types/node`), and a `scratch.ts` that imports `EtherfuseClient`, stubs `globalThis.fetch` to mock `/ramp/onboarding-url`, and calls `createCustomer`.

**Step 2 — `npx tsc --noEmit`.**

- **Experiment:** clean compile, exit 0. Zero adaptation. `npx tsx scratch.ts` printed the expected mock customer.
- **Main:** **21 errors.** Top of the list:
    ```
    etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types' …
    etherfuse/client.ts(40,29): error TS2307: Cannot find module '../types' …
    etherfuse/client.ts(107,26): error TS7006: Parameter 'input' implicitly has an 'any' type. (×11)
    etherfuse/client.ts(426,47): error TS18046: 'err' is of type 'unknown'. (×5)
    ```
    The root cause is `import type { Anchor, ProgrammaticOps, … } from '../types'` and `import { AnchorError } from '../types'` at the top of `client.ts`. `'../types'` is the 825-line shared file at `/tmp/round4-main/src/lib/anchors/types.ts` that defines every cross-anchor type.

**Step 3 — fix.** On `main`, I had to also `cp src/lib/anchors/types.ts /tmp/paste-test-main/types.ts`. That brought it down to 0 errors. `tsx scratch.ts` ran identically.

**What was actually different in the paste experience:**

| | experiment | main |
|---|---|---|
| Files copied | 3 (`client.ts`, `types.ts`, `index.ts`) — one directory | 4 (the 3 above + parent `../types.ts`) |
| Type imports outside the dir | none | `../types` (Anchor, ProgrammaticOps, AnchorError, 20+ types) |
| Coupling | self-contained; `EtherfuseError` lives in `etherfuse/types.ts` | Etherfuse depends on shared `Anchor`, `ProgrammaticOps`, `AnchorError`, `PaymentInstructions`, `CreateCustomerInput`, … |
| API surface for caller | `client.createCustomer({ … })` | `client.programmatic!.createCustomer({ … })` |

The main-branch failure isn't catastrophic — `../types.ts` is itself framework-agnostic — but it's an instant footgun for anyone following the README's `cp -r etherfuse` instruction. The non-null assertion on `programmatic!` is also a smell: every consumer has to acknowledge the facet might be missing, even though for Etherfuse it provably is not.

---

## 2. Goal #2 assessment — flow page reading

I read end-to-end:
- main: `OnRampFlow.svelte` (581) + `OffRampFlow.svelte` (865) + `InteractiveRampFlow.svelte` (320) + `RampPage.svelte` (545) + the 67-line `[provider]/[direction]/+page.svelte` glue.
- experiment: `etherfuse/onramp/+page.svelte` (711) + `…/offramp` (759) + `testanchor/interactive/onramp` (332) + `testanchor/programmatic/{onramp,offramp}` (~450 each).

**Main reads nicely until you see what it's doing.** `OnRampFlow.svelte` references `page.data.requiresWalletAuth`, `capabilities?.sandboxFiatSimulation`, `capabilities?.deferredOffRampSigning`, `capabilities?.fiatAccountRegistration`, `kycFlow`, etc. Every provider passes through the same `if (capabilities.X)` ladder. The shared `OffRampFlow.svelte` has 5+ capability branches. `InteractiveRampFlow.svelte` was added specifically because the SEP-6-shaped flow couldn't handle SEP-24.

**Experiment is honest about the divergence.** The Etherfuse on-ramp page hardcodes `region === 'brazil' ? 'TESOURO' : 'CETES'` and knows about SPEI/PIX directly — same shape as main's flow minus capability indirection. The duplication is real (~2000 lines of similar polling/error/step machines across 4 page files for two anchors), but there's no shared `RampPage` frame extracted yet.

**Net:** Adding the next anchor on `main` means an entry in `anchorFactory.ts` + `config/anchors.ts` and capability flags — flow code "just works" if your anchor fits the unified interface. On `experiment` you write 4 page files + 4 API-route files. That's a real Goal-#2 regression — the price of paste-portability.

---

## 3. Code shape: what's forced, what's natural

**main, forced:**

- **Facet pattern is double-bookkeeping.** `auth?`, `programmatic?`, `interactive?` plus a parallel `flowStyles: ('programmatic'|'interactive')[]` capability. The factory needs `requireProgrammatic`/`requireInteractive`/`requireAuth` to bounce 400s — work that doesn't exist on experiment.
- **Capability-flag inflation.** `AnchorCapabilities` has 12+ flags (`kycUrl`, `sep24`, `sep6`, `requiresTos`, `requiresOffRampSigning`, `kycFlow`, `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `sandbox`, `sandboxFiatSimulation`, `fiatAccountRegistration`, `flowStyles`). Every new anchor claims a value for each.
- **`TokenInfo` is anaemic.** It's `{ symbol, name, issuer?, description }` — Etherfuse's MXN-vs-BRL / SPEI-vs-PIX linkage moved to `config/{anchors,regions}.ts`, splitting per-anchor truth across files. Experiment's `EtherfuseTokenInfo` carries `fiatCurrency` and `rail` inline.
- **`testanchor/anchor.ts` is 888 lines** of pure adaptation (SEP-12 → `KycStatus`, SEP-6 → `TransactionStatus`, SEP-12 fields → `KycRequirements`). Experiment's `testanchor/ramp.ts` is 384 lines and returns SEP shapes directly. The adapter exists solely to feed the shared flow components.

**main, natural:** the factory + `[provider]` dynamic routing is genuinely elegant — the 67-line page is a "thin routing, fat components" model. Dual-facet providers (testanchor) read cleanly via `if (anchor.interactive) ...`.

**experiment, forced:** per-provider API routes (each ~50 lines, near-identical), per-provider `lib/api/*.ts` wrappers, and divergent error classes (`EtherfuseError` vs `TestAnchorSepUnsupportedError`) that component code has to track.

**experiment, natural:** Etherfuse's client reads like real production code, not adapted code — no `mapStatus`/`mapKycStatus` indirection. SEP client returns SEP-12 customers and SEP-6/24 transactions as-is. Provider-scoped errors are self-documenting.

---

## 4. Adding the next anchor — Koywe walkthrough

Koywe is in the pipeline: Argentina, programmatic, USDC-on-Stellar + ARS.

**On main:** implement `KoyweClient implements Anchor` + `ProgrammaticOps`, write mappers from Koywe's status/KYC shapes to shared `TransactionStatus`/`KycStatus`, claim every capability flag (~600 lines). Add to `anchorFactory.ts`, `constants.ts`, `config/anchors.ts`, `config/regions.ts`. Zero new UI — *if* Koywe fits the existing flags. If it uses bank-account-before-quote or has a new KYC mode, the capability union expands and shared flow components change too.

**On experiment:** implement `KoyweClient` against Koywe's API alone (~400 lines, no mappers). Add `koyweInstance.ts`. Copy-paste `lib/api/etherfuse.ts` → `koywe.ts` (~200 lines). Add `routes/api/anchor/koywe/{…}/+server.ts` (~250 lines, 5–6 files). Add `routes/anchors/koywe/{onramp,offramp}/+page.svelte` (~1500 lines, copy-paste-adapt).

**Verdict:** experiment is ~2–3x the LOC, mostly UI duplication. But every line is straight Koywe code with no capability-flag negotiation. If Koywe has any quirk the unified interface didn't anticipate, main forces a change in shared `types.ts` *and* all flow components; experiment lets you handle it inline.

---

## 5. Drift surfaces and maintenance risk

- **main, capability-flag drift.** Flip `fiatAccountRegistration = 'inline'` and the flow component is supposed to do the right thing — but capability × flow is N×M and untested branches silently break.
- **main, type drift in shared `Anchor`.** `types.ts` is already 825 lines and modelling SEP-6-specific things like `awaitingCustomerInfo`, `signableTransaction`, `requiredInfo`. The shared interface is becoming SEP-6's interface.
- **experiment, duplicated UI logic.** Polling, error display, and step-machine state machines copy-pasted across 4 page files. Bugs must be fixed in 4 places.
- **experiment, error-class divergence.** A central error renderer has to know `EtherfuseError`, `TestAnchorSepUnsupportedError`, ... or render generic strings.
- **experiment, no structural pressure on consistency.** Nothing in the type system says all anchors must have a `getQuote`. Cross-provider features (e.g. "quote me from every Brazil anchor") cost more.

---

## 6. Three specific risks per approach

### Risks of the unified-Anchor approach (main):
1. **Goal #1 is silently broken.** Anyone following the project's pitch ("copy this client into your project") and not noticing the `../types` import will hit a wall. The `EtherfuseClient.programmatic` facet API is also more awkward than the experiment's flat methods — `client.programmatic!.createCustomer(...)` is a worse advertisement than `client.createCustomer(...)`.
2. **The interface is brittle to anchors that don't fit.** The very fact that `TestAnchorAdapter` is 888 lines (vs `TestAnchorRampClient` at 384) tells you how much shape-conversion the abstraction demands. Each new anchor either pays this tax or distorts the interface.
3. **Two parallel sources of truth** for what an anchor supports (`AnchorCapabilities` flags + facet presence + `supportedTokens`/`supportedCurrencies`/`supportedRails`). Easy to set inconsistent values.

### Risks of the bespoke-per-provider approach (experiment):
1. **UI duplication is real and will rot.** Four ramp pages with their own polling, error, and step-machine logic guarantees subtle inconsistencies. The DX of "this anchor's flow does X but that one's does Y" is bad for the demo.
2. **API-route duplication is busywork.** Eight near-identical `+server.ts` files for two anchors. Five anchors means 20+. The "anchor factory" pattern was a real cleanup; reverting it imposes a tax.
3. **No structural pressure to keep providers consistent.** When the next builder asks "what should a Stellar anchor client look like?", there's no canonical answer — just N examples. The unified interface, for all its compromises, at least *documented* the shape.

---

## 7. Bottom-line recommendation

**Keep the experiment branch's portable-client architecture, but lift the demo app back toward main's shape.**

The paste-test settles Goal #1: a copy-paste-friendly client cannot import types from outside its own directory. Main fails that test, and there's no easy fix — the whole point of the shared `Anchor` interface is the shared `types.ts`, and inlining it into each anchor's dir defeats the purpose. Experiment ships clients that paste exactly as advertised.

The demo app *should* share components where it can: main's `RampPage.svelte`, `QuoteStep.svelte`, `CompletionStep.svelte`, `FiatAccountStep.svelte` would slot into experiment's per-provider pages without dragging a shared `Anchor` type along. The two SEP-shaped programmatic pages could share an `Sep6Flow.svelte`. Bespoke clients don't preclude shared UI components — they just preclude *unified data shapes*.

Concrete path:
1. Keep experiment's clients, per-provider error classes, server singletons.
2. Steal main's `RampPage.svelte` + `components/ramp/*` primitives.
3. Add one shared `+server.ts` helper for "proxy body, return JSON" — API routes are mostly boilerplate.
4. Drop per-provider `lib/api/*.ts` in favour of generated fetchers, or accept the duplication.

If forced to ship one branch unchanged today: **experiment**, because Goal #1 is primary and main flunks the paste test.

---

## 8. What would change my mind?

1. **If you showed me a third-party developer who successfully pasted main's `etherfuse/` directory into their Next.js project, followed the README, and got it compiling on the first try** — I'd reconsider. My test says they'd hit `Cannot find module '../types'` immediately. If there's documentation/tooling that makes the dependency obvious and provides a one-liner copy command (`cp -r etherfuse ../types.ts`), the gap narrows substantially.
2. **If Goal #1 is actually being interpreted as "copy the whole `src/lib/anchors/` directory, not one anchor"** — I would flip toward main. The shared `types.ts` is then just another file in the same paste-able tree, the API surface is consistent, and the unification's benefits dominate. Worth confirming what "copy/paste-friendly" actually means in user research.
3. **If anchor #3, #4, #5 (Koywe, Coins.ph, PDAX) all turn out to fit cleanly into the existing `AnchorCapabilities` ladder without adding new flags** — that's evidence the unified interface generalises well, and the testanchor adapter's 888 lines were a one-time tax rather than a recurring one. So far the `comingSoon` flag and Etherfuse's 5+ bespoke capability flags suggest the opposite, but with more data points I could be wrong.
