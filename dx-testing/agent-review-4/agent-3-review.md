# Agent 3 — Independent Review

**Bottom line up front:** for Goal #1 (copy/paste-friendly anchor code), the `experiment/eff-anchor-interface` branch wins decisively. For Goal #2 (demo app), `main` wins on code reuse but the win is smaller and partially illusory — the shared components carry a real complexity tax. Given the stated 60/40 weighting, **I recommend the experiment branch, with one targeted concession: keep the shared `Anchor` interface as an *optional* port adapter, not the mandatory return shape of every client.**

---

## Empirical paste-target test

I picked Etherfuse (richer surface area than testanchor: hosted KYC, presigned URLs, 409-recovery, deferred off-ramp signing). Method: copy the directory into a clean dir, write a minimal `scratch.ts` that imports the client, stub `globalThis.fetch`, install only `@stellar/stellar-sdk` + `typescript`, then `npx tsc --noEmit` and `npx tsx scratch.ts`.

### Experiment branch — clean paste

```
cp -r /tmp/round4-experiment/src/lib/anchors/etherfuse /tmp/scratch-etherfuse-exp/
# wrote scratch.ts, tsconfig.json
npm install @stellar/stellar-sdk typescript @types/node
npx tsc --noEmit -p tsconfig.json   # zero output, zero errors
npx tsx scratch.ts                  # prints customer id + kyc status
```

- **Files copied: 3** (`client.ts`, `types.ts`, `index.ts`). That's it.
- Typechecks first try. No `Cannot find module` errors.
- The ergonomic API call was the literal example from the README: `client.createCustomer({ publicKey, email })` returning `EtherfuseCustomer`. No facet narrowing, no `programmatic!.`, no awareness of any other anchor in the world.
- The error class lives next to the client (`EtherfuseError`) and is named after the provider, which is what a paster expects.

### Main branch — fails on first try

```
cp -r /tmp/round4-main/src/lib/anchors/etherfuse /tmp/scratch-etherfuse-main/
# same scratch.ts, tsconfig.json
npx tsc --noEmit
# → etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'
# → 20+ subsequent errors as the facet object becomes implicit-any
```

Add the missing file:

```
cp /tmp/round4-main/src/lib/anchors/types.ts ./types.ts
npx tsc --noEmit
# → scratch.ts(23,35): error TS2341: Property 'createCustomer' is private
```

That second error is the one that hurts. **On main, `createCustomer`/`createOnRamp`/etc. are all `private`** — the *only* public way to call them is through `client.programmatic!.createCustomer(...)`. A paster who copies the README's own example snippet (`await etherfuse.createCustomer(...)`) will get a compile error.

Final result on main:

- **Files copied: 4** (`client.ts`, `types.ts`, `index.ts`, plus the shared `../types.ts` — 826 lines of cross-anchor union types).
- ~85% of `types.ts` is irrelevant to a paster who only wants Etherfuse (PIX/SPEI/Generic instruction unions, `RampIdentity` for Transfero, `requiresBlockchainWalletRegistration` for BlindPay, KYC requirements interfaces only the test anchor produces, etc.). They get all of it whether they want it or not.
- The discoverability is bad. Nothing in the README mentions that `../types.ts` must also be copied, nor that the methods are private. The class signature says `implements Anchor` — implementing an interface from a missing file silently degrades into the dreaded "twenty implicit-any errors" wall.

This is the single most decisive piece of evidence in the review. The experiment branch is paste-clean; the main branch is paste-hostile.

---

## Goal #2 assessment — demo app

I read `OnRampFlow.svelte` (581 lines) and `OffRampFlow.svelte` (865 lines) on main, and the experiment's `etherfuse/onramp/+page.svelte` (711) and `etherfuse/offramp/+page.svelte` (759).

**Main's shared flow approach pays off… less than you'd expect.** The flow components are heavily branched on capability flags:

- `OffRampFlow.svelte` references `capabilities.kycFlow`, `capabilities.requiresBankBeforeQuote`, `capabilities.deferredOffRampSigning`, `capabilities.fiatAccountRegistration`, `capabilities.emailLookup` — at least 9 capability checks in 865 lines. Each one is a `if (this provider) do X else do Y` branch.
- `OnRampFlow.svelte` is cleaner (no capability flags visible on grep), but only because the SEP-6 / Etherfuse on-ramps happen to converge on the same KYC iframe + payment-instructions story. The next provider that doesn't will add more branches.
- The dual-archetype mode toggle (`[provider]/[direction]/+page.svelte`) is a thin shell that just picks between `OnRampFlow`/`OffRampFlow`/`InteractiveRampFlow` based on `flowStyles`. Sensible.

**Experiment's per-provider pages duplicate scaffolding but eliminate ALL the branches.** The Etherfuse on-ramp page reads top-to-bottom as a single state machine (`'onboarding' | 'amount' | 'quote' | 'payment' | 'complete'`) with no "what does this anchor want" conditionals. The testanchor programmatic page is 440 lines, and it returns SEP-shaped responses directly (no adapter layer). Each page is genuinely understandable in one sitting.

The duplication is real: amount-entry / quote-display / trustline-status / dev-box markup all repeat. But the duplicated parts are decomposed into shared atomic components (`AmountInput`, `QuoteDisplay`, `TrustlineStatus`, `KycIframe`, `WalletConnect`, `DevBox`). What gets duplicated is **state-machine wiring**, which is provider-specific anyway. That feels right.

Verdict on Goal #2: the experiment branch's flow pages are easier to read, harder to break, and a better source of inspiration for a builder copying *the whole pattern* — exactly the stated use case.

---

## Code shape — what's forced, what's natural

### Main feels forced at three seams

1. **`testanchor/anchor.ts` (888 lines) is a square-peg adapter.** Maps `Sep6Transaction` → union `OnRampTransaction`. `customerId` is fabricated from the SEP-10 JWT subject. `quoteId` is `''`. `requiredInfo` requires a second SEP-12 round-trip (`resolveRequiredInfo`) because the shared type wants pre-resolved `KycRequirements` while SEP-6 returns `required_info_updates` lazily. Real architectural lossage from forcing two protocols into one shape.

2. **`EtherfuseClient.programmatic` is a 12-line delegation object** (`client.ts:106-118`) — one line per facet method. Add a method → add it twice (private + facet). The `auth?` parameters are ignored because Etherfuse uses an API key. Pure ceremony.

3. **`AnchorCapabilities` has 18 fields**, several added for a single provider (`deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `requiresBlockchainWalletRegistration`, `sandboxFiatSimulation`, `fiatAccountRegistration`). Smell of premature abstraction over a population of two.

### Experiment feels forced at one seam

- **Two API-client modules (`api/etherfuse.ts` 215 lines, `api/testanchor.ts` 226 lines) duplicate fetch-wrap-error scaffolding.** Main's unified `api/anchor.ts` is 573 lines and a single source of truth. The duplication is real, but it's flat and obvious, not polymorphism debt.

### Other observations

- Main overbuilds `RampPage.svelte` (545 lines) — exists mostly to host the dual-archetype toggle.
- Experiment has no cross-provider abstraction. A future SEP-6-shaped provider would just be a thin wrapper over the existing `sep/` modules — which are already extracted. Not a deficit.

---

## Adding the next anchor — Koywe

Koywe is programmatic, ARS/USDC, Argentina.

**On experiment:** add `anchors/koywe/{client,types,index,README}`, a `koyweInstance.ts` (~15 lines), 4 thin `api/anchor/koywe/*` route handlers (copy-paste from etherfuse, ~50 lines each), a client `api/koywe.ts` (~200 lines), and two flow pages. ~2,500 lines, all provider-local; nothing existing can break.

**On main:** same paste-target dir, but must implement `Anchor`. Koywe's tax-ID-per-request shape doesn't match Etherfuse's pubkey-per-request shape doesn't match Test Anchor's session-token shape — each one is a different field on the shared `CreateCustomerInput` (`taxId` vs `publicKey` vs `auth`). Touching `OnRampFlow.svelte` / `OffRampFlow.svelte` for any provider-specific quirk means retesting Etherfuse and Test Anchor too because they share the file. Also ~2,500 lines, but with real regression risk on existing providers.

The experiment lets you add anchors **independently**. Main does not — the third anchor is where the union-types start hurting most.

---

## Drift surfaces and maintenance risk

### Main

- **Mapping drift.** `mapOrderStatus`/`mapKycStatus`/`mapOnRampTransaction` coerce each anchor's real shape into the union types. When the anchor's semantics shift (e.g. `feeAmount` flips from gross to net), the shared types still compile — bugs hide here.
- **Capability-flag explosion.** 18 fields on `AnchorCapabilities`, several added for a single provider (`deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `sandboxFiatSimulation`, `fiatAccountRegistration`). Dead flags accumulate when providers are removed.
- **Test mass.** Etherfuse client test on main is **3902 lines** for a 935-line client. Testanchor adapter has a **589-line** test that's almost entirely "did the shared-shape mapping work?" — testing the adapter, not the SEP. Experiment's Etherfuse test is 1157 lines and testanchor needs no dedicated test (SEP modules already covered).
- **README/code mismatch.** Main's README says "implements the shared `Anchor` interface" but doesn't mention you must also copy `../types.ts` or that methods are private.

### Experiment

- **Duplication drift.** Bug fix in Etherfuse polling doesn't auto-propagate to Koywe. Mitigated by shared atomic components (`AmountInput`, `TrustlineStatus`) and the `sep/` modules covering protocol-level reuse.
- **`testanchor/index.ts` exports both `TestAnchorClient` (playground) and `TestAnchorRampClient` (curated).** Two clients in one dir — documented but mildly confusing.
- **No type-level "is provider X programmatic?" guarantee.** Provider-agnostic code is nominal-only. Acceptable; the project rarely needs it.

---

## Specific risks

### Main — 3 risks

1. **Every new provider that doesn't fit the union is a ratchet on the shared types.** `CreateCustomerInput` already has 6 optional fields (`bankAccountId`, `publicKey`, `taxId`, `identity`, `resourceId`, `blockchainWalletId`), each carrying one provider's identity model. Adding the next provider almost certainly adds another. Existing provider tests must reconfirm the new field doesn't break them.
2. **The `Anchor` interface ships in the paste-target.** Copying `anchors/etherfuse/` doesn't compile without also copying `anchors/types.ts`, which references providers (Transfero `RampIdentity`, BlindPay `requiresBlockchainWalletRegistration`) the paster has never heard of. The "shared types" file is leaky at the paste boundary.
3. **`testanchor/anchor.ts`'s `resolveRequiredInfo` is a future bug nest.** It does a two-step SEP-6 → SEP-12 negotiation purely to fit the shared `KycRequirements` shape — when SEP specs evolve, this is where the breakage will hide.

### Experiment — 3 risks

1. **Each new anchor pays full per-provider tax** — ~2,000 lines of route/api/page scaffolding that doesn't reuse. Costly if you ship 10 anchors.
2. **UI consistency depends on shared atomic components staying in lockstep across pages.** Adding a required prop to `TrustlineStatus.svelte` requires updating every page. TypeScript catches the required-prop case.
3. **Per-provider error classes mean each route's `instanceof` is provider-specific.** Fine for two providers, mildly annoying for ten. The route-per-provider structure means each handler only ever sees one error class anyway.

---

## What would change my mind

1. **3+ providers ported into main without growing `AnchorCapabilities` or `CreateCustomerInput`.** If Koywe, Coins.ph, and PDAX all fit through existing facets with zero new flags or fields, the abstraction earns its keep. Right now: two providers, 18 capability flags, 6 `CreateCustomerInput` fields — the union looks like it's barely holding two, not generalizing.

2. **A successful paste of *only* `anchors/etherfuse/` from main into a clean Express/Node app, with no `types.ts` copied.** If maintainers can demonstrate this works — e.g. by inlining the relevant shared types into each anchor's `types.ts` — main's paste story is no longer broken.

3. **A real demo-app fork in the wild that's reused `OnRampFlow.svelte` rather than writing its own page.** If a builder is benefiting from the shared flow component, main is justified. If they all throw it out and write their own (which I'd predict), the shared flow is overhead nobody asked for.

---

## Recommendation

**Ship the experiment branch.** The 60% paste-target weight is decisive: the experiment is genuinely paste-friendly, the main branch is paste-hostile, and the README claims on main are misleading about how copyable the code is. The flow-page duplication in experiment is a real cost but it's a cost of *the right kind* — it scales with provider count, it doesn't propagate bugs across providers, and the duplicated parts are decomposed into shared atoms where reuse is genuinely safe.

If you want to keep some of main's good ideas, two narrow concessions are worth porting back to experiment:

- **The dual-archetype mode toggle UX.** Testanchor's "Hosted (Interactive) ↔ Programmatic" switch is genuinely useful for a teaching demo and the experiment currently splits these into separate routes (`testanchor/interactive/*` vs `testanchor/programmatic/*`) — a small toggle wrapper around them would be nice.
- **Optional `Anchor` port adapter as a *separate* file in `sep/` or `anchors/`** — not required, not implemented by clients, just an *interface only* developers can opt into if they want polymorphism. Pasters who don't need it never see it.
