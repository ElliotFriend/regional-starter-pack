# Agent-2 Independent Review: `main` vs `experiment/eff-anchor-interface`

**TL;DR.** For Goal #1 (copy/paste-friendly anchor client), the `experiment` branch is the better architecture. Etherfuse on `experiment` is genuinely standalone — its directory typechecks against `@stellar/stellar-sdk` alone with zero shared files dragged along. On `main`, every paste pulls in the 826-line shared `types.ts`, which is dominated by abstractions Etherfuse will never use. For Goal #2, `main` is meaningfully better — it has one set of polished flow components that work for every provider, while `experiment` reproduces ~3,000 LOC of flow pages once per provider/direction. Net, given the 60/40 weighting and that the project bills itself as "portable anchor client code that anyone can paste into their own TypeScript project," I'd ship `experiment` but file follow-ups to extract shared step components, not to re-introduce the `Anchor` interface.

---

## 1. Empirical paste-target test (Etherfuse)

I ran the same test on both branches: copy out the Etherfuse directory, write `scratch.ts` that imports `EtherfuseClient`, instantiates it, stubs `globalThis.fetch`, calls `createCustomer`, typechecks under a minimal `tsconfig.json`.

### `experiment` branch — `/tmp/scratch-2-experiment`

```
cp -r /tmp/round2-experiment/src/lib/anchors/etherfuse /tmp/scratch-2-experiment/etherfuse
# 4 files copied: client.ts, types.ts, index.ts, README.md
grep -n "from '\.\." etherfuse/*.ts   # → no matches
```

The directory has zero references to its former siblings. I dropped in a flat `scratch.ts` next to it, installed `@stellar/stellar-sdk` + `typescript`, and ran `npx tsc --noEmit` — clean, exit 0, first try.

Total files copied: **4** (3 source + README). Layout: anything you want, as long as `index.ts`, `client.ts`, `types.ts` stay together. The README at `/tmp/round2-experiment/src/lib/anchors/etherfuse/README.md:1-20` says "copy these three files" and that is literally true.

### `main` branch — `/tmp/scratch-2-main`

```
cp -r /tmp/round2-main/src/lib/anchors/etherfuse /tmp/scratch-2-main/etherfuse
grep -n "from '\.\." etherfuse/*.ts
# → etherfuse/client.ts:39: } from '../types';
# → etherfuse/client.ts:40: import { AnchorError } from '../types';
```

I also had to copy `/tmp/round2-main/src/lib/anchors/types.ts` (826 lines) up one level so the relative import resolved. The paste-target's layout is constrained — sibling/parent layout must be preserved or import paths rewritten. Once arranged, `tsc --noEmit` was clean.

Total files copied: **5**. What's in `types.ts` that Etherfuse will never use: `WalletAuthOps`, `InteractiveOps`, all `Interactive*`/`Auth*` types, `RampIdentity`, the full SEP-12 `KycRequirements*` family, `KycFieldRequirement`, `KycDocumentRequirement`, the SEP-6-flavoured `Generic` variant of `PaymentInstructions`, and `awaitingCustomerInfo`/`requiredInfo` on the transaction types. A downstream developer either keeps it all and tracks drift, or prunes aggressively.

### Specific differences observed

- `main`'s `EtherfuseClient implements Anchor` forces a `programmatic: ProgrammaticOps` facet that wraps its own methods (`/tmp/round2-main/src/lib/anchors/etherfuse/client.ts:106-118`). Dead-weight for a developer who just wants `client.createCustomer(...)`.
- `experiment` types are Etherfuse-native: `EtherfuseQuote` exposes `sourceAsset`/`destinationAmount` as the API returns them. `main` re-shapes to a generic `Quote`, requires mapping in `client.ts`, and creates a UI mismatch — the `experiment` page even has a `displayQuote` adapter that re-shapes back the other way for the shared display component.
- File counts: experiment etherfuse `client.ts` 796 LOC, types 652. Main etherfuse client 935 (heavier because of `Anchor`-shaped mapping), types 494, plus +826 shared.

**Goal #1 verdict: `experiment` clearly wins.** A developer who pastes Etherfuse into their Express/Next/Node project gets exactly the Etherfuse API in TypeScript form, no extra concepts to learn, no abstraction to delete.

---

## 2. Goal #2 — Demo SvelteKit app

I read end-to-end:
- `main`: `src/lib/components/OnRampFlow.svelte` (581 LOC) + the dynamic `src/routes/anchors/[provider]/[direction]/+page.svelte` (67 LOC orchestrator).
- `experiment`: `src/routes/anchors/etherfuse/onramp/+page.svelte` (711 LOC), `testanchor/programmatic/onramp/+page.svelte` (440), `testanchor/interactive/onramp/+page.svelte` (332).

Totals: `main` flow components ~2,300 LOC across `OnRampFlow`/`OffRampFlow`/`InteractiveRampFlow`/`RampPage`. `experiment` flow pages ~3,040 LOC across six bespoke `+page.svelte`s. ~30% more code in `experiment`.

The experiment's flow code is **dramatically easier to read in isolation**. The Etherfuse on-ramp page reads top-to-bottom as state machine + REST + render. `OnRampFlow.svelte` on `main` is a soup of capability-flag conditionals (`requiresWalletAuth`, `kycFlow`, `sandboxFiatSimulation`, `kycUrl`, `requiresBankBeforeQuote`, ...) plus runtime `page.data` derivations. To answer "what does Etherfuse on-ramp actually do?" on `main` you mentally execute the capability branches; on `experiment` you read one file.

The cost on `experiment` is that fixing a polling-loop bug or improving the quote-expiry UI means editing it ~6 times. `main`'s `OnRampFlow.svelte` is the single fix site.

For Goal #2's "inspiration for other builders" framing, `experiment` is **better-shaped**: a builder copying the on-ramp UI wants a working reference, not a capability-flag matrix. `main`'s flow is engineered for this app's specific provider set, not as a template.

Two parts of `main` are real wins worth porting: the step sub-components (`QuoteStep`, `FiatAccountStep`, `CompletionStep`) in `src/lib/components/ramp/` that `experiment` only partly kept, and the interactive/programmatic mode toggle in `[provider]/[direction]/+page.svelte`. Both can be ported without re-introducing the `Anchor` interface.

---

## 3. Adding the next anchor (Koywe)

**On `main`:** implement `KoyweClient implements Anchor`, add to `anchorFactory.ts`, extend `AnchorProvider` union, add config wiring. The friction comes if Koywe's quote shape diverges from the shared `Quote` (lossy-map or extend the shared type and ripple), or if it needs a new capability flag (adds a branch to `OnRampFlow.svelte`). Fast path when it slots in; slow path is non-local.

**On `experiment`:** `cp -r etherfuse koywe`, rewrite to Koywe's API, add `koyweInstance.ts`, build API proxy routes, duplicate and rewrite the flow pages. Slow path is real (~1,000 LOC of new flow page) but mechanical and isolated. No risk of breaking existing anchors, and **no design decision** about whether Koywe's response shapes "should" map to shared types.

For an integrator on a deadline, `experiment` is more predictable. For a long-lived monorepo of N anchors, `main` is better factoring — but only if the abstraction holds. Two anchors isn't enough to know it will.

---

## 4. Drift surfaces and maintenance risk

**`main` drift surfaces:**
- The `Anchor` interface is the contract. If anchor N+1 needs a method the interface doesn't have, you either extend the interface (touching every existing client and every consuming UI) or hang a one-off escape hatch on `capabilities`. The capability-flag list at `/tmp/round2-main/src/lib/anchors/types.ts:555-602` already shows 14 flags after 2 providers; that scales badly.
- `OnRampFlow.svelte` (581 LOC) is a god component. Conditional logic on `requiresWalletAuth`, `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `kycFlow`, `sandbox`, `fiatAccountRegistration`, `deferredOffRampSigning`, `requiresAnchorPayoutSubmission` is the kind of code where a bug for one anchor is invisible to the tests of every other anchor.
- The lossy mapping in `etherfuse/client.ts` (lines 270-310, payment-instruction mapping) is fine for what `main` exposes, but if someone wants Etherfuse-specific fields (e.g. `confirmedTxSignature`), they're either gone or shoehorned into a generic `OnRampTransaction`. There's no escape hatch back to the raw response.

**`experiment` drift surfaces:**
- Six bespoke flow pages mean six places to fix a polling bug, six places to update an error message, six retry-mechanics inconsistencies waiting to happen. The 711-LOC `etherfuse/onramp/+page.svelte` is itself doing too much — it should at minimum extract the same step sub-components `main` has.
- No interface means no compile-time guarantee that all anchors expose the operations they advertise. If a future "list anchors" page wants to render a uniform table, it'll either grow its own ad-hoc adapter or skip the consistency check.
- The two `auth` stores and two `api/etherfuse.ts`/`api/testanchor.ts` modules will inevitably grow conventions that diverge (error shape, retry policy, fetch wrapper). I already see it: testanchor's API helper threads tokens through `authStore`, Etherfuse's doesn't (because it's API-key) — a contract that lives in the heads of the maintainers, not in types.

---

## 5. Risks

### Risks for `main`
1. **Abstraction debt.** With two anchors confirming the shape, the `Anchor` interface looks good. The third anchor's first surprising requirement is where this approach pays its real cost — and the design-pressure points (capability flags, lossy mapping, awkward `programmatic` facet wrapper) suggest the interface is already stretching.
2. **Type-soup paste cost.** The 826-line shared types file mixes SEP-24 wallet-auth concepts into the same file an Etherfuse-only copy/paste user has to take. The README says "framework-agnostic and can be copied" but doesn't say "and you'll inherit interactive/auth/SEP-6 abstractions you don't need."
3. **Demo-flow flatness.** `OnRampFlow.svelte` is a single switch-statement-of-truth for many providers. A new builder reading it can't quickly tell what's essential vs accidental for the specific provider they're integrating.

### Risks for `experiment`
1. **Flow-page duplication.** ~3,000 LOC of pages that share 80% of their step machinery. A real maintenance hazard if the project grows to 5+ anchors. Mitigation: extract step sub-components (which `main` already has and `experiment` should steal).
2. **Cross-anchor consistency.** If a UI consistency contract emerges (e.g. "all anchors must surface a status-page link"), there's nothing forcing every flow page to honour it. Discoverability of provider-side surface relies on README + docs, not types.
3. **Anchor-listing/cross-cutting UIs.** Anything that wants to enumerate "all anchors and their capabilities" gets harder — there's no shared type to iterate. The factory pattern in `main` (`requireInteractive`, etc.) is a real ergonomic win for cross-cutting server code.

---

## 6. Bottom-line recommendation

**Ship `experiment`. Don't re-introduce the shared `Anchor` interface. Do extract shared step components and a thin shared error type.**

The project's primary stated goal is paste-friendly anchor code. The paste test is unambiguous: `experiment`'s Etherfuse is a 4-file directory that typechecks against `@stellar/stellar-sdk` alone, and the README claim "copy these three files" is literally true. `main`'s Etherfuse drags in 826 lines of mostly-unrelated abstractions that a downstream Node/Express/Next consumer either has to keep or aggressively prune.

The Goal #2 cost is real but bounded: ~700 extra LOC of flow pages, and the fix is local extraction (step sub-components like `main` already has), not architectural retreat. `main`'s factor — capability flags + god component — is what good engineers do when they're forced to write one set of flow code for an unknown future set of anchors. But for a curated showcase of 2-5 providers where each one is being held up as a paste-target reference, per-provider pages are a *feature*, not a bug. A builder forking the Etherfuse on-ramp page gets exactly the Etherfuse on-ramp.

Where `main` is straightforwardly better and worth porting in: the `ramp/` step sub-components (`QuoteStep`, `FiatAccountStep`, `CompletionStep`), the interactive/programmatic toggle UX, and the cleaner `RampPage` chrome. None of these require the shared `Anchor` interface to exist.

---

## 7. What would change my mind?

1. **A real third anchor lands cleanly on `main` with no new capability flags and no lossy mapping in either direction.** If Koywe or PDAX implements `Anchor` and `OnRampFlow.svelte` doesn't grow new branches and the shared types don't grow new fields, the abstraction is paying its rent. As-is, the 14-flag `AnchorCapabilities` and the SEP-6-shaped `awaitingCustomerInfo`/`requiredInfo` fields leaking into `OffRampTransaction` are early warning signs.
2. **Evidence that real paste-target users prefer the unified interface.** If someone integrating Etherfuse into a Next.js app says "I love that I can swap to a different anchor later without rewriting my call sites," that's a Goal #1 argument for `main` I underweighted. A README quote, a Discord testimonial, an issue from a downstream consumer — anything empirical.
3. **A working extracted-component refactor on `experiment` that brings flow-page LOC under `main`'s.** If the duplication can't be cleanly extracted, the maintenance argument for `main` gets stronger. I assumed extraction is straightforward because `main` already has the sub-components — but if `experiment`'s pages diverge in non-trivial ways during real use, the abstract `Anchor`-driven flow may end up being the only sustainable shape.
