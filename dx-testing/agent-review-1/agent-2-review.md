# Agent 2 review — `main` vs `experiment/eff-anchor-interface`

## Bottom line up front

**Keep `main`'s unified-interface architecture for the library code. Adopt some of the experiment's instincts inside the demo app.**

The experiment correctly diagnoses two real problems on `main` — the shared flow components leak provider-specific concerns through capability flags, and the `Anchor` interface flattens information that's interesting precisely *because* it differs per provider. But the fix it ships (delete the interface, fork everything) is a textbook overcorrection that pays an enormous duplication tax and only makes goal #1 marginally better while making goals #2 and "next anchor" materially worse. There is a third path — keep the unified types, soften the runtime interface to a structural recommendation, slim the shared flows — that I'd recommend instead of either branch as-is.

## Goal #1 — copy-pasteable clients

I read both etherfuse `client.ts` files end-to-end pretending I was going to drop them into a Node CLI.

**Experiment branch** (`src/lib/anchors/etherfuse/client.ts`, 796 lines): genuinely standalone. The only out-of-directory import is `StrKey` from `@stellar/stellar-sdk`. Errors are `EtherfuseError`, types live in `./types`, the constructor takes plain config. No `Anchor`, `ProgrammaticOps`, `AnchorCapabilities`, `Customer`, `Quote`, or `PaymentInstructions` imports from `../types`. If I copy `etherfuse/` into a Node project, I get a working client and zero dead references. Same story for `testanchor/ramp.ts` — 355 lines, returns SEP-shaped responses directly (`Sep6DepositResponse`, `Sep24Transaction`, `Sep10TokenResponse`) without mapping them into a generic shape.

**Main branch** (`src/lib/anchors/etherfuse/client.ts`, 935 lines): the public surface is a `programmatic: ProgrammaticOps` facet object full of arrow-fn delegators (lines 105-118) bound to private methods. To copy this anywhere, I also have to copy `src/lib/anchors/types.ts` — 825 lines of `Anchor`, `WalletAuthOps`, `ProgrammaticOps`, `InteractiveOps`, `Customer`, `Quote`, `OnRampTransaction`, `OffRampTransaction`, `PaymentInstructions`, `KycRequirements`, `RampIdentity`, etc. Most of that file is unused by Etherfuse — Etherfuse never calls `RampIdentity`, never produces `OffRampTransaction.signableTransaction` at create time, never uses `InteractiveOps`, has no `WalletAuthOps`. The dependency is real but the surface area I have to import is ~5x what I actually need.

So on the *literal* "copy-pasteable" axis, the experiment wins. But there are two qualifiers:

1. The experiment's *types.ts* is 652 lines vs. main's 494 lines for the same provider — because it now duplicates the SPEI/PIX deposit shapes, the customer/quote/order shapes, and the error class as Etherfuse-prefixed versions of things `types.ts` already defined generically. The bytes-to-copy went down at the directory level but up per-provider, and the *concepts* (payment-instruction discriminated union, anchor error class, KYC field requirements) are now reinvented for every provider. Across 5 anchors that adds up fast.

2. Main's grievance — that the `Anchor` interface forces Etherfuse-isms like `bankAccountId` into a shared `CreateOnRampInput` — is real but solvable without nuking the interface. The fix is to relax the runtime `Anchor` contract while keeping the *type vocabulary* (`Customer`, `Quote`, `PaymentInstructions`, `KycRequirements`, `AnchorError`) shared.

**Verdict on #1**: experiment is concretely easier to paste, but at the cost of forking the conceptual vocabulary every anchor needs to express.

## Goal #2 — demo as builder inspiration

This is where the experiment loses badly.

A developer landing on the repo to figure out "how do I build a fiat ramp on Stellar?" is going to look at the *flow pages*, not the client files. On `experiment` the four-times-duplicated flow code is the first thing they read.

Concrete numbers (Svelte page line counts):

| Page                                    | experiment | main equivalent             |
| --------------------------------------- | ----------:| ---------------------------:|
| `etherfuse/onramp/+page.svelte`         |        711 | shared `OnRampFlow` 581     |
| `etherfuse/offramp/+page.svelte`        |        759 | shared `OffRampFlow` 865    |
| `testanchor/programmatic/onramp`        |        440 | (same `OnRampFlow`)         |
| `testanchor/programmatic/offramp`       |        458 | (same `OffRampFlow`)        |
| `testanchor/interactive/onramp`         |        332 | shared `InteractiveRampFlow` 320 |
| `testanchor/interactive/offramp`        |        340 | (same)                      |
| **Experiment total flow code**          |   **3,040** | **main total: 1,766**       |

That's a 72% increase in flow code for *two* providers. Each of those six pages reimplements: `ensureAuth()`/`cachedAuth()` for SEP-10 token caching, a `startPolling`/`stopPolling` pair with a `pollCount`/`MAX_POLLS` guard, a `step` state machine, `reset()`/`clearError()`, error/loader UI, the same `WalletConnect` + `TrustlineStatus` + `AmountInput` layout, the same `KycIframe` mounting…

`etherfuse/onramp/+page.svelte` lines 56-65 reinvent the polling primitive that's identical in `testanchor/programmatic/onramp/+page.svelte` lines 38-44, which is identical to `interactive/onramp/+page.svelte` lines 32-37. The `ensureAuth/cachedAuth/signWithFreighter/authStore` block (`testanchor/programmatic/onramp` lines 50-65) is byte-for-byte identical across all four testanchor pages. It will be byte-for-byte copied a 7th and 8th time when Koywe and Coins.ph land.

A builder reading this is going to take the wrong lesson. "Oh, every anchor needs its own polling loop." They'll fork it again in their own app and inherit every off-by-one bug we accidentally introduce on one page and forget on the others.

`main`'s flow components have the opposite problem at smaller scale — `OnRampFlow.svelte` (581 lines) is genuinely doing too much: KYC-required state, deferred-signing branches, `pending_customer_info_update` resume, sandbox simulation. But it's *one* place that knows about those things, with capability flags that a reader can grep. The drift surface is one file, not four.

**Verdict on #2**: main wins decisively. The experiment is demonstrably copy-paste-with-edits programming presented as architecture, and the demo is the place that wound was supposed to be healed.

## Code shape, where each feels forced

**Where `main` feels forced:**

- `AnchorCapabilities` has 14 boolean/enum flags (`src/lib/anchors/types.ts` lines 553-597): `emailLookup`, `kycUrl`, `sep24`, `sep6`, `requiresTos`, `requiresOffRampSigning`, `kycFlow`, `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `sandbox`, `sandboxFiatSimulation`, `fiatAccountRegistration`, `flowStyles`. That's a smell. Several of those (e.g. `requiresBlockchainWalletRegistration`) exist for providers (BlindPay) that aren't even in the curated set anymore. The capability bag became a coordination protocol between client and UI, and it's accreting.

- `EtherfuseClient`'s public facet pattern (lines 105-118) — a `readonly programmatic: ProgrammaticOps = { createCustomer: (i) => this.createCustomer(i), ... }` block of arrow-fn delegators — is busywork. The facet exists purely to satisfy `Anchor`. The actual implementation methods are then marked `private`. That's two surfaces for one behavior.

- `CreateOnRampInput` carries a `bankAccountId?` (Etherfuse), an `identity?: RampIdentity` (Transfero, which is now an honorable mention and not even instantiated), and a `memo?` that has provider-dependent semantics. The interface promised shape uniformity it can't actually deliver.

**Where `experiment` feels forced:**

- `src/lib/anchors/etherfuse/types.ts` (652 lines, vs. 494 on main) now defines `EtherfuseSpeiDeposit`, `EtherfusePixDeposit`, `EtherfuseKycStatus`, `EtherfuseOrderStatus`, `EtherfuseCustomer`, `EtherfuseQuote`, `EtherfuseError`. Every one is a slightly-different copy of something in `main`'s `types.ts`. Once Koywe lands, there will be `KoyweCustomer`, `KoyweQuote`, `KoyweError`, and the same SPEI-shaped fields will be re-described for the ARS/Argentina rail.

- `src/lib/api/etherfuse.ts` (215 lines) + `src/lib/api/testanchor.ts` (226 lines) = 441 lines of client-side fetch wrappers that are 80% identical (`apiRequest`/`postJson`/`authHeader`/`*ApiError`). Compare to `main`'s single `src/lib/api/anchor.ts` (573 lines covering both providers and SEP-10 + KYC + sandbox).

- The experiment retains `src/lib/anchors/sep/` unchanged — meaning the *only* truly shared layer between testanchor and any future SEP-compliant anchor is the SEP modules. There's no story for "Koywe also supports SEP-10". Each new SEP-compliant anchor gets its own ramp wrapper that re-implements the `toml() → endpoint() → sep* call` pattern from scratch, even though the experiment branch shows that pattern is reusable (see `TestAnchorRampClient.endpoint` at `ramp.ts:148-154`).

**Where each feels natural:**

- Main's `sep/` modules + `TestAnchorAdapter` composition is genuinely elegant — the adapter is 888 lines but most of it is mapping logic that *has* to exist somewhere, and it's the only file that knows about the SEP↔shared shape translation. Cf. the experiment's `ramp.ts` + four pages, where the SEP-→-display mapping is now scattered across UI code (e.g. the experiment's etherfuse onramp page builds a `displayQuote` adapter inline at lines 80-94 because `QuoteDisplay` still wants the shared shape).

- The experiment's `client.ts` files are easier to *read* top-to-bottom because there's no interface contract to mentally cross-reference. As a one-shot tutorial artifact, that's nice.

## Adding Koywe

**On main:**
1. `src/lib/anchors/koywe/{client,types,index}.ts` implementing `Anchor` with a `programmatic` facet.
2. Add `'koywe'` to `AnchorProvider` in `anchorFactory.ts`, add one `case` to the switch.
3. Add to `PROVIDER`, `ANCHORS`, region arrays.
4. Define a few token shapes via existing `TokenInfo`.
5. **Zero changes** to flow components, API routes, or pages. The shared `[provider]` route renders Koywe automatically.
6. Tests: file an `anchors/koywe/client.test.ts` mirroring `etherfuse/client.test.ts`.

Net: one new client + config rows. ~1,000–1,500 LOC depending on Koywe's surface.

**On experiment:**
1. `src/lib/anchors/koywe/{client,types,index}.ts` with its own `KoyweError`, `KoyweCustomer`, `KoyweQuote`, `KoyweOnRampOrder`, `KoyweOffRampOrder`.
2. `src/lib/server/koyweInstance.ts`.
3. `src/lib/api/koywe.ts` (~200 LOC of fetch wrappers, ~80% copy of `etherfuse.ts`/`testanchor.ts`).
4. `src/routes/api/anchor/koywe/{customers,quotes,onramp,offramp,kyc,...}/+server.ts` — one route per operation, ~50 LOC each.
5. `src/routes/anchors/koywe/+page.svelte` (hub).
6. `src/routes/anchors/koywe/onramp/+page.svelte` (~700 LOC, 90% copy of etherfuse onramp).
7. `src/routes/anchors/koywe/offramp/+page.svelte` (~750 LOC, ditto).

Net: ~2,500–3,000 LOC, where roughly 60% of the page code is copy-with-edits of an existing page. Every time someone fixes a polling bug in one onramp page, there are now three other places it needs to be fixed and might not be.

This is the killer trade. The experiment optimizes one-time copy-out-of-the-repo at the cost of every-time copy-within-the-repo. There are going to be more incoming anchors than outgoing copies.

## Maintenance over time

**Drift surfaces on `main`:**

- The capability bag. Once a flag exists in `AnchorCapabilities`, removing it requires touching every flow component. Etherfuse's `requiresBlockchainWalletRegistration` flag survived BlindPay's removal as a comment-only artifact.
- The shared `OnRampFlow` quietly grows new branches as new anchors land. It's already 581 lines.
- `CreateOnRampInput` accumulates fields (`bankAccountId`, `identity`, `memo`) that only some anchors use.
- `customerStore`/`authStore` global state — works, but coupling.

**Drift surfaces on `experiment`:**

- The four flow pages will diverge in subtle ways: `startPolling` interval, `MAX_POLLS`, error UI, the auth caching key shape, the way `step` transitions, sandbox-fiat simulation UI. Even between this PR's etherfuse onramp (711 LOC) and testanchor sep6 onramp (440 LOC) there are already drifty differences in how each handles the "wallet not connected" state.
- `src/lib/api/etherfuse.ts` and `src/lib/api/testanchor.ts` already disagree on the error class shape (`EtherfuseApiError` vs `TestAnchorApiError` — same fields, different name).
- I noticed `src/routes/anchors/+page.svelte` lost the `resolve()` lint fix on the experiment branch (line 60 uses a bare `` href={`/anchors/${anchor.id}`} `` instead of `resolve()`). Small, but exactly the kind of thing that breaks when you stop having one place that does it right.
- Documentation drift: the root `CLAUDE.md` on the experiment branch still describes the unified-interface model. Within-repo docs already disagree with the code.

The experiment also has a real *capability drop*: tests went from 170 `it()` blocks on main to 57 on the experiment side for Etherfuse, and the entire `tests/anchors/testanchor/anchor.test.ts` (589 LOC) was deleted with no replacement. The reduction isn't "we deleted redundant tests" — the deleted ones covered KYC requirements discovery, transaction status mapping, and `pending_customer_info_update` handling, which still need to work (the page code does them inline). Those concerns moved from tested logic in a client to untested branches in Svelte pages.

## Risks specific to each approach

**Main (unified interface):**

1. **Capability flag accretion** — the next anchor (Koywe, Coins.ph) likely adds 1-2 more flags to `AnchorCapabilities`. At some point this becomes the *de facto* contract between anchors and UI that the `Anchor` interface was meant to be, but it's typed as a boolean bag.
2. **Premature generalization risk for interactive anchors** — Coins.ph as a hosted widget that may not be SEP-24-compliant probably *won't* fit cleanly into `InteractiveOps` if it has a non-trivial auth dance. Adding `WalletAuthOps` already split the interface non-orthogonally; another hosted-widget pattern could double the facet count.
3. **Performance/SSR coupling** — `+layout.server.ts` calls `getAnchorInstance(...)` which constructs the SEP-1 toml-fetching adapter just to read static fields like `displayName`. Cheap today, but a bigger anchor with async-init won't fit.

**Experiment (bespoke clients):**

1. **N² drift on UI patterns** — already visible at N=2. By N=5 (Etherfuse, testanchor×2 flows, Koywe, Coins.ph, possibly PDAX), there's no chance the polling/auth/error code stays in sync. A bug fix to one page won't propagate.
2. **Lost discoverability** — the experiment's repo has no single place a builder can read to learn "what does it mean to integrate a Stellar anchor". Each page tells one provider's story; the abstraction across them lives only in your head. As a *showcase* this undersells the project.
3. **Type vocabulary fragmentation** — `EtherfuseError` vs `TestAnchorSepUnsupportedError` vs the future `KoyweError`/`CoinsPhError` — code that wants to handle "any anchor failure" has nothing to catch on. This bites the server route handlers first (already visible in `routes/api/anchor/testanchor/sep6/+server.ts` lines 29-43, which has a duck-typed `if (err instanceof Error && 'statusCode' in err)` fallback to compensate).

## Specific things I'd cherry-pick from the experiment

The experiment isn't wrong about everything. Even if the recommendation is to keep main's interface, these are real improvements:

- **The `EtherfuseClient`'s shape — no `programmatic:` arrow-fn delegators block.** Just expose methods directly on the class. The `Anchor` interface should be a *structural*/duck-typed recommendation (and we should write tests that assert each curated anchor implements the recommended shape), not a `implements Anchor` constraint that drives the facet-object pattern.
- **`getEtherfuse()`/`getTestAnchor()` per-provider instance accessors.** They're clearer than the generic `getAnchor(provider: AnchorProvider)` because callers know exactly what they're getting back.
- **Per-provider hub pages.** The single shared `[provider]/+page.svelte` (343 lines) doing dual duty for Etherfuse and testanchor is in fact awkward. Letting each provider have its own hub (the experiment's `anchors/etherfuse/+page.svelte` at 141 lines is honest about being Etherfuse-specific) without giving up the shared flow components would be a strict improvement.
- **The experiment's `auth?: string` parameter being passed explicitly instead of threaded through stores** is cleaner architecturally even though it produces more duplication at the page level.

## What I'd actually recommend

1. **Keep `src/lib/anchors/types.ts`** as a shared *type vocabulary* — `Customer`, `Quote`, `PaymentInstructions`, `KycRequirements`, `AnchorError`, status enums. Mark it as "structural — implement this shape; don't `implements`".
2. **Drop the `Anchor`/`ProgrammaticOps`/`InteractiveOps` runtime interface constraint.** Let each client expose methods directly (experiment's shape). Provide one or two narrow runtime helpers in `anchorFactory.ts` (e.g. `hasInteractiveFlow(client)`) instead of the facet existence test.
3. **Keep main's shared flow components** — `OnRampFlow`, `OffRampFlow`, `InteractiveRampFlow`. They are the demo's value proposition. But shrink them by extracting a couple of reusable hooks: a `useAnchorPolling()` rune, an `ensureSep10Token()` helper.
4. **Per-provider hub pages**, like the experiment. Kill the dynamic `[provider]/+page.svelte`.
5. **Keep the per-operation API routes shared (`[provider]/customers/+server.ts`, etc.)** — they're a thin proxy layer and the experiment's per-provider routes pay duplication cost for no gain.
6. **Trim `AnchorCapabilities`** to the flags actually consumed by shared components today.

The experiment was a productive spike: it correctly showed that some abstractions on `main` were doing too much. But the conclusion "remove all of them" throws away the part that was earning its keep (the shared flows and the type vocabulary) along with the part that wasn't (the runtime interface constraint and the capability flag bag). The right move is a scalpel, not the hammer the experiment swings.
