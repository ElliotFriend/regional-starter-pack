# Round-3 Agent Review (Agent 1)

## Bottom line up front

For the project's stated primary goal — **copy/paste-friendly anchor client code that drops into any TypeScript project** — the `experiment/eff-anchor-interface` branch is materially better, and the gap is not subtle. I'd recommend the experiment's per-provider architecture for the portable library (`src/lib/anchors/`), while keeping a thin shared piece (the SEP modules and maybe one or two shared error/type primitives) inside whatever providers compose them.

For the demo app (`src/routes`, `src/lib/components`), `main` is cleaner today because of shared `OnRampFlow`/`OffRampFlow` components — but the cleanliness is partly an illusion: the shared components carry conditional logic for capability shapes that only exist because of the unified interface. Experiment trades app-layer DRY for clearer per-provider stories.

Goal #1 weights this at ~60%. My recommendation: **go with the experiment's portable-library shape and accept the cost of per-provider flow pages.** Below are the details.

---

## Empirical paste-target test

I ran the same test on both branches using Etherfuse.

### Setup (identical on both)

`/tmp/scratch-{main,experiment}/`, each with:

- `pnpm init -y` then `pnpm add -D typescript @types/node @stellar/stellar-sdk`
- A minimal `tsconfig.json` (`module: ESNext`, `moduleResolution: Bundler`, `strict: true`, includes `etherfuse/**/*.ts` and `scratch.ts`)
- A `scratch.ts` that stubs `globalThis.fetch` and calls `createCustomer(...)`

### Experiment branch — clean three-file paste

```
cp -r /tmp/round3-experiment/src/lib/anchors/etherfuse /tmp/scratch-experiment/etherfuse
```

Files copied: **3** (`client.ts`, `types.ts`, `index.ts`).

`npx tsc --noEmit` — exit 0 on the first try, no edits.

`npx tsx scratch.ts` succeeded against the stubbed fetch and produced a real, typed `EtherfuseCustomer` value. When I passed a bogus pubkey, I got a proper `EtherfuseError` with `code: 'INVALID_PUBLIC_KEY'`, `statusCode: 400` — exactly the surface a paste-target consumer would expect.

Surface call: `client.createCustomer({ publicKey, email, country })`. No facets, no `!`, no `narrow-on-presence` pattern.

### Main branch — three files isn't enough

```
cp -r /tmp/round3-main/src/lib/anchors/etherfuse /tmp/scratch-main/etherfuse
```

First `tsc --noEmit` run: **20+ errors** starting with `etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'`. Cascading "implicit any" errors flowed from the un-typed facet object once the import collapsed.

Fix: copy `/tmp/round3-main/src/lib/anchors/types.ts` to be a *sibling of* `etherfuse/` (the layout is load-bearing — the client imports `'../types'`). Files needed: **4 + the layout** (`etherfuse/{client,types,index}.ts` and a sibling `types.ts`, with the directory hierarchy preserved).

Second `tsc --noEmit` run: clean. `npx tsx scratch.ts` worked.

But the surface call: `client.programmatic!.createCustomer({...})`. The non-null assertion is needed because `Anchor.programmatic` is optional. A real paste-target user has to either learn the facet model or sprinkle `!` everywhere.

Additional cost: `types.ts` is **826 lines** of shared interfaces; the user pulling in just Etherfuse takes along `InteractiveOps`, `WalletAuthOps`, `StartInteractiveInput`, the full `KycRequirements`/`KycFieldRequirement` ladder, etc. None of it is used at runtime for Etherfuse, but it's all in the consumer's source tree and they'll wonder what to delete.

### Verdict on the paste test

Experiment is a textbook three-file paste. Main is a four-file paste with a directory-layout constraint, a heavier dependency footprint, and a more awkward call site. For Goal #1, that's a real and recurring delta — every developer who tries to use this pays the tax.

---

## Goal #2: the demo app

I read `/tmp/round3-main/src/lib/components/OnRampFlow.svelte` end-to-end against `/tmp/round3-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte`, then the off-ramp pair.

**Main** — ~2,755 lines of shared flow code (`OnRampFlow` 581, `OffRampFlow` 865, `RampPage` 545, `InteractiveRampFlow` 320, `KycForm` 444). Real DRY win: one place to fix bugs in the on-ramp UX. But DRY comes with capability-flag branching: `RampPage.svelte` has 7 distinct `capabilities.*` checks (`kycFlow === 'iframe' | 'form' | 'redirect'`, `emailLookup`, ...). `OffRampFlow.svelte` does a deferred-signing dance: `if (signableTransaction)` happy path → `else if (capabilities?.deferredOffRampSigning)` poll-for-XDR path → else "build a payment locally" fallback. That fallback isn't exercised by any current provider; both real ones either defer (Etherfuse) or host (SEP-24 / testanchor.interactive). The "neither" branch is dead-on-arrival code that exists because the abstraction posits providers who don't exist.

**Experiment** — ~3,040 lines across per-provider pages (`etherfuse/onramp` 711, `etherfuse/offramp` 759, plus per-archetype testanchor pages). More total lines, real duplication: each on-ramp page reimplements polling, ErrorAlert wiring, KYC-iframe handling. Bug in the polling logic? Fix it in five places. But each page reads like a story of one provider. The Etherfuse on-ramp page has named state for things that exist in Etherfuse (`bankAccounts`, `customer: EtherfuseCustomer | null`, `kycStatus: EtherfuseKycStatus`). No facet narrowing, no `capabilities?.kycFlow === 'iframe'` — just `<KycIframe url={kycUrl} />`. The `displayQuote` adapter (lines 81–95) is the visible cost — mapping `EtherfuseQuote` into the generic shape that the shared `QuoteDisplay.svelte` expects. That's the right place to pay the abstraction cost: at the rendering boundary, not at the API boundary.

**My read**: main's flow components are well-engineered but the abstraction load they carry is the *symptom* of the unified interface, not the cause of better UX. For code meant to inspire integrators, experiment's per-provider pages are more useful: each is a complete, copy-able recipe. The duplication is real but localized.

---

## Code shape: where each feels forced

### Forced in main

- **`Anchor.programmatic?` is optional**, but the only providers here are programmatic-only (Etherfuse) and tri-facet (testanchor). Every call site `!`-asserts or narrows, paying for an abstraction with no third member yet. Coins.ph would justify it, but it's not here.
- **`testanchor/anchor.ts`** is 888 lines vs experiment's `ramp.ts` at 355. The delta is almost entirely SEP→Anchor field mapping (`Sep6Transaction.status` → `TransactionStatus`, `Sep12Field` ladders → `KycFieldRequirement[]`). This adapter exists so the unified interface can hide that testanchor is SEP — but everyone reaching for testanchor as a reference *wants to see the SEP calls*. Hiding them defeats the reference value.
- **`AnchorCapabilities`** has 16+ flags. A few are real (`kycFlow`, `deferredOffRampSigning`), but many read as leaky abstractions: `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `requiresAnchorPayoutSubmission`, `sandboxFiatSimulation` — "things one provider needs that the others don't." Each is a branch point for shared flows.
- **The `/anchors/[provider]/[direction]` route** is elegant but pushes complexity into `+layout.server.ts` + `RampPage.svelte` (decides programmatic-vs-interactive from `flowStyles`). The testanchor case is awkward: it has both `programmatic` and `interactive` facets, so the URL alone can't tell you which one the user wants. Experiment's `/anchors/testanchor/{programmatic,interactive}/{onramp,offramp}` is honestly clearer.

### Forced in experiment

- **Per-provider API client modules** (`$lib/api/etherfuse.ts` 215 lines, `$lib/api/testanchor.ts` 226 lines — grows per provider). Main has one `anchor.ts` at 573 lines that scales with capabilities, not providers.
- **Per-provider server-instance files** (small, ~22 lines each), but they grow linearly with providers.
- **Per-provider error class** (`EtherfuseError` vs `TestAnchorSepUnsupportedError` vs nothing for raw SEP modules). Genuinely worse if anything ever wants `instanceof AnchorError`. Nobody needs that today; a future shared retry/telemetry layer would.
- **No type-level enforcement that providers expose comparable surfaces.** Discipline (and tests/README) is the only thing keeping them comparable.

---

## Adding the next anchor (Koywe)

Koywe is "programmatic, USDC-on-Stellar + ARS" per the project memory.

### On main

Create `src/lib/anchors/koywe/{client,types,index}.ts` implementing `Anchor`. Map Koywe's quote/order/KYC shapes into `Quote`/`OnRampTransaction`/`OffRampTransaction`/`KycFieldRequirement[]`. If Koywe needs something the interface doesn't expose, you either widen the interface (every adapter must reconsider) or add a capability flag (every consumer must branch). Add `'koywe'` to `AnchorProvider`; the `[provider]` routes pick it up. CORS proxy endpoints come free *if* Koywe's operations map onto the existing `customers`/`quotes`/`onramp`/`offramp`/`fiat-accounts`/`kyc` set — otherwise you need a new generic endpoint or a per-provider escape hatch that the architecture doesn't have. Flow components work out of the box *if* Koywe matches the assumed shape; otherwise you're adding capability flags.

**Net**: low friction if Koywe fits, medium-to-high if not. The interface is a contract you argue with.

### On experiment

Create `src/lib/anchors/koywe/{client,types,index}.ts` — no interface to satisfy. Add `koyweInstance.ts` (~22 lines). Add `$lib/api/koywe.ts` (~200 lines of thin wrappers). Add API proxy routes under `/routes/api/anchor/koywe/*` matching Koywe's real endpoints. Add `/routes/anchors/koywe/{onramp,offramp}/+page.svelte`, forking Etherfuse as a starting point.

**Net**: more files (linearly), but each is a Koywe story. No retroactive abstraction work — adding Koywe doesn't touch Etherfuse code. Forking flow pages is the real cost.

---

## Drift surfaces and maintenance risk

**Main**: Every new provider need is a choice between widening the interface (every adapter reconsiders) or adding a capability flag (every consumer branches). Over time the interface accretes. Dead code multiplies as the abstraction anticipates hypothetical providers — the "build a payment locally" off-ramp branch is the canonical example. And SEP→Anchor mapping in `testanchor/anchor.ts` doubles the surface that needs updating when SEP fields evolve (the recent SEP-6 `funding_method` rename had to land in both the SEP module *and* the adapter).

**Experiment**: Five copies of the on-ramp polling loop will diverge over time; a bug fix in Etherfuse may not reach Koywe. No type-level contract enforces provider comparability — the README and config become the human-maintained source of truth. Trivial code repeats per-provider (each client has its own `withRequestLogging`, its own error-narrowing).

---

## Three risks per side

### Main

1. **The third facet never arrives.** Coins.ph stays in research, no interactive-only widget provider materializes. The faceted design is then justified only by testanchor — a non-customer.
2. **A real provider doesn't fit cleanly.** First time you integrate a provider whose KYC isn't `'form' | 'iframe' | 'redirect'`, or whose off-ramp is SEP-31-style, you're back-fitting capability flags. Each retrofit compounds.
3. **Paste-target value erodes silently.** Developers copying `etherfuse/` + `types.ts` (826 lines) won't complain — they'll just delete what they don't need and now their copy is forked from upstream. The "drop in updates" value is lost.

### Experiment

1. **Flow pages drift in UX, not just code.** Today Etherfuse on-ramp and testanchor programmatic on-ramp solve similar problems and the duplication is mechanical. The per-page pattern can encourage UX inconsistency as providers diverge.
2. **Test discipline matters more.** No interface contract means only tests enforce comparability. Skipping coverage for a new provider is now riskier.
3. **No upstream for "the on-ramp flow."** Developers who fork `+page.svelte` alongside the client can't follow improvements to the flow itself.

---

## What would change my mind

1. **A real interactive-only provider integration lands and works cleanly through the faceted interface.** Coins.ph or PDAX showing up in main and revealing that `interactive` was load-bearing all along would justify the abstraction. Today the testanchor adapter is the only consumer of `InteractiveOps` and it's a testnet client — a thin justification.
2. **A side-by-side timing study shows that adding Koywe took less calendar-time on main than on experiment, with comparable code quality.** I'm predicting the opposite — that the per-provider experiment is faster to integrate because there's no interface to satisfy — but a head-to-head would settle it.
3. **An external developer reports they pasted `etherfuse/` (plus `types.ts`) into a Next.js or Express app and it Just Worked, including following an upstream bump.** My paste test on main worked, but it required understanding the layout. Real paste-target value is verified by actual paste-target users, not synthetic tests. If main's paste experience is fine in practice, the 60% weight on Goal #1 stops favoring experiment as strongly.

