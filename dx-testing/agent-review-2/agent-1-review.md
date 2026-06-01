# Agent 1 — Architecture review: `main` vs. `experiment/eff-anchor-interface`

Reviewer disposition: I am weighing Goal #1 (copy-pasteability of the anchor client) at 60% and Goal #2 (the SvelteKit demo) at 40%, per the brief.

## TL;DR

**`experiment` is the better architecture for Goal #1, by a meaningful margin.** The bespoke per-provider Etherfuse client is genuinely self-contained — I literally copied one directory into an empty scratch project and it typechecked and ran. The `main` branch's "portable" facet model is portable on paper, but in practice the Etherfuse client cannot be lifted out of the repo without dragging in the entire `Anchor` superstructure, and its own JSDoc examples don't compile because the public API surface lives on a facet sub-object that the docs don't mention.

For Goal #2, `main` is somewhat cleaner — a single `OnRampFlow.svelte` handles every provider — but the wins are smaller than they appear, because today there is exactly one programmatic provider (Etherfuse) and the testanchor demo is gated to its own `/testanchor` route anyway. Most of `main`'s flow-sharing is paying interest on a loan that hasn't been taken out yet.

Recommendation: **adopt the experiment.** Carry forward a small handful of `main`'s nicer pieces — the `Sidebar` with anchor logo, the `RampPage` framing, the `auth` store — without the `Anchor` interface.

## Empirical paste-target test

For each branch I copied **only** `src/lib/anchors/etherfuse` into a fresh `/tmp` directory, installed `@stellar/stellar-sdk` + `typescript` + `tsx`, wrote a tiny `scratch.ts` that constructs the client and calls `getQuote`, stubbed `globalThis.fetch`, then ran `npx tsc --noEmit` followed by `npx tsx scratch.ts`.

### Experiment (`/tmp/scratch-exp-etherfuse`)

- Files copied: `etherfuse/{client.ts, index.ts, types.ts, README.md}` — **one directory, end of story.**
- `npx tsc --noEmit` → **clean on first try.** Zero errors.
- Runtime: ran the quote call successfully.
- The class is plain: `client.getQuote({ fromAsset, toAsset, sourceAmount, ... })`. The method names on the class match the JSDoc.
- `types.ts` has zero imports. `client.ts` has two: `@stellar/stellar-sdk` and `./types`.

### Main (`/tmp/scratch-main-etherfuse`)

First pass (one directory copied):

- `npx tsc --noEmit` → **22 errors.** The first two:
  ```
  etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'
  etherfuse/client.ts(40,29): error TS2307: Cannot find module '../types'
  ```
- The remaining 20 errors cascade from those (implicit `any` on every facet method).
- Plus: my script used the obvious-looking `client.getQuote(...)` (taken straight from the class's own JSDoc `@example`) — but it errored with `Property 'getQuote' is private`. The actual public API is `client.programmatic!.getQuote(...)`. The class's documented example does not compile.

After remediation (copy `src/lib/anchors/types.ts` next to `etherfuse/`, fix the script to call `.programmatic!.getQuote(...)`): clean compile, runs.

So `main`'s minimum paste payload is **two locations** (`etherfuse/` + `types.ts`), not one. And `types.ts` is **826 lines** of shared types covering features Etherfuse doesn't use: `WalletAuthOps`, `InteractiveOps`, `StartInteractiveInput`, `RampIdentity`, `GenericPaymentInstructions`, the `awaitingCustomerInfo`/`requiredInfo` SEP-6-isms. All has to come along. A developer dropping Etherfuse into their Next.js project gets a lot of code that has nothing to do with Etherfuse.

`experiment`'s `etherfuse/types.ts` (652 lines) is bigger as a single file but **fully self-contained**. Every type is Etherfuse-shaped, `EtherfuseError` lives next door, README is right there.

### What this told me

The facet model on `main` is **doing the opposite of what it claims**. The `Anchor` interface centralizes types for the demo's benefit (Goal #2) by forcing every individual anchor client to import a giant shared type module (Goal #1 cost). The wrapper-of-facets pattern (`readonly programmatic: ProgrammaticOps = { createCustomer: (input) => this.createCustomer(input), ... }`) is pure indirection to satisfy the interface; worse, it makes every real method `private`, so the class is unusable through its own documented surface.

## Goal #2 (the demo app) — flow pages

### `main`: `OnRampFlow.svelte` (581 lines)

Reads `page.data.anchor.id`, `page.data.capabilities`, `page.data.requiresWalletAuth` and decides which sub-components to render. Real engineering — handles polling, `pending_customer_info_update` retry, simulate-fiat. The component is genuinely provider-agnostic.

But the seams show. `api/anchor.ts` is 573 lines because it needs every operation any provider might want. `anchorFactory.ts` has three guard helpers (`requireProgrammatic`, `requireInteractive`, `requireAuth`). `[provider]/+layout.server.ts` denormalizes capabilities into a `flowStyles` runtime shape. The shared `Customer` type already carries Etherfuse's `bankAccountId`, BlindPay's `blockchainWalletId`, and `OnRampTransaction` carries SEP-6's `awaitingCustomerInfo`/`requiredInfo`. Two providers in and the shared type is already accumulating provider-specific scars.

### `experiment`: `routes/anchors/etherfuse/onramp/+page.svelte` (711 lines)

130 more lines than `OnRampFlow.svelte`, but all of it is Etherfuse. `import * as ef from '$lib/api/etherfuse'`; args match the client's args exactly; one 14-line `$derived` block adapts `EtherfuseQuote` into the shape `QuoteDisplay.svelte` (a structural-props primitive) expects. This adapter is the one concrete thing `main` saves you — ~15 lines per page.

`KycIframe`, `AmountInput`, `QuoteDisplay`, `TrustlineStatus`, `WalletConnect`, `CopyableField`, `ErrorAlert`, `DevBox` remain shared dumb primitives. **Reuse happens at the primitive layer, not at flow orchestration.** Healthier place for it.

What gets duplicated: polling loop, wallet-connect gate, trustline block — real duplication, ~80–100 lines of state-machine code per page. But Etherfuse's `simulateFiatReceived` + iframe KYC + deferred-signing, testanchor SEP-24's popup, and testanchor SEP-6's retry all want to live in different flow shapes anyway. Trying to express all that through one component is exactly what makes `OnRampFlow.svelte` 581 lines.

## Code shape

Where each branch feels natural / forced:

- **`main` natural**: the `Anchor` interface is well-thought-out — `AnchorCapabilities` flags, discriminated `PaymentInstructions` union, SEP-12 → `KycRequirements` mapping. Unified `[provider]` routes + one `api/anchor.ts` are objectively more cohesive than per-provider equivalents.
- **`main` forced**: `TestAnchorAdapter` (888 lines) wraps `TestAnchorClient` (388 lines) to map SEP shapes onto the `Anchor` interface. `resolveRequiredInfo` carries a comment "the form re-appears forever after a successful submission" — exactly the lossy-translation tax that bites later.
- **`experiment` natural**: each client returns its own shapes. `EtherfuseQuote.sourceAsset`/`targetAsset` matches Etherfuse; `Sep6Transaction.amount_in_asset` matches SEP-6. No impedance mismatch.
- **`experiment` forced**: testanchor's `index.ts` re-exports both `TestAnchorClient` (the namespaced SEP playground) **and** `TestAnchorRampClient` (the new focused ramp client) — two clients for one anchor. A wart.

## Adding the next anchor (Koywe)

Koywe is the leading candidate, per `MEMORY.md`. It's programmatic, USDC-on-Stellar + ARS, Argentina.

**On `main`**: Implement `KoyweClient implements Anchor`. Map Koywe's customer/quote/order/status shapes onto `Customer` / `Quote` / `OnRampTransaction` / `OffRampTransaction` / `TransactionStatus` / `KycStatus`. Map ARS bank-account fields onto `FiatAccountInput` (new discriminant) or hide them as Koywe-private. Register in `anchorFactory.ts`. Then hope `OnRampFlow` actually fits Koywe — if it has UX quirks (KYC review step, national ID pre-quote), pick: bend Koywe to fit, add another `AnchorCapabilities` flag + `OnRampFlow.svelte` conditional, or fork the component. The file is already 581 lines and 9 conditionals deep.

**On `experiment`**: Implement `KoyweClient` with its own shapes and error class. Add `koyweInstance.ts`. Add 6–8 small `/api/anchor/koywe/*` handlers. Create `routes/anchors/koywe/{,onramp,offramp}/+page.svelte` — copy from Etherfuse and adapt. More clone-and-modify total, but it happens **at the leaf**, visible and locally deletable. A Koywe quirk cannot break Etherfuse — they share nothing but UI primitives.

## Drift surfaces and maintenance risk

- **`main`**: the seam is the `Anchor` interface itself. Every quirky anchor either (a) gets a new capability flag, (b) gets a new optional field on a shared input/output type with a `// only used by X` comment, or (c) gets dropped (Etherfuse's `submitKycIdentity`, `acceptAgreements`, etc. all live as untyped `unknown`-returning methods outside the interface). The interface is already showing patches for Etherfuse (`bankAccountId`), BlindPay (`blockchainWalletId`), Transfero (`RampIdentity`), and SEP-6 (`awaitingCustomerInfo`, `requiredInfo`). The fifth provider's quirk is the one that makes you genuinely regret the interface.
- **`experiment`**: the seam is the `+page.svelte` files. Each one is ~700 lines, and once you have four of them, fixing a polling bug means fixing it in four places. This is real cost — but it's the cost of duplication, which is local and obvious, vs. the cost of premature abstraction, which is global and invisible until it isn't.
- **The SEP modules are identical on both branches** — they're already the right shape (`fetchFn` parameter, framework-agnostic). The `Anchor` interface adds nothing on top of them.

## Risks

### `main` (3 risks)

1. **Lossy mapping in `TestAnchorAdapter`** — the SEP-6/12 → `Anchor` translation is already 888 lines and contains comments like "Best-effort enrichment — leave requiredInfo unset on failure." Each translation hides upstream signal from the UI. The first time a real bug requires going around the adapter, the value proposition collapses.
2. **The `private` facet methods + facet-of-functions pattern** is genuinely confusing. The JSDoc `@example` on `EtherfuseClient` shows `await etherfuse.createCustomer(...)`. This **does not compile** — it has to be `etherfuse.programmatic.createCustomer(...)`. A future contributor will hit this.
3. **Shared types accreting per-provider fields** — `bankAccountId`, `blockchainWalletId`, `awaitingCustomerInfo`, `requiredInfo`. With one more provider this becomes an `optional`-everywhere bag.

### `experiment` (3 risks)

1. **Polling/wallet-gate duplication in flow pages.** With three providers you have ~2.1k lines of similar-but-not-identical onramp code. A polling bug-fix is a three-place edit. Worth extracting `usePolling.svelte.ts` proactively.
2. **No type-level guarantee that all anchor clients expose the same operations.** If Koywe forgets `simulateFiatReceived` for sandbox, nothing tells you. (Counterpoint: that's also a feature — Koywe might not have sandbox.)
3. **Two `testanchor` clients (`TestAnchorClient` + `TestAnchorRampClient`)** is a wart that needs cleanup. Probably collapse `TestAnchorRampClient` into the original by adding a small `ramp.*` namespace.

## Bottom-line recommendation

**Adopt `experiment`.** Specifically:

1. Keep the per-provider directory layout, per-provider client class, per-provider error class, per-provider API routes.
2. Keep the per-provider flow page (onramp/offramp `+page.svelte`) as the unit of variation.
3. Promote the shared *UI primitives* (`AmountInput`, `QuoteDisplay`, `TrustlineStatus`, `KycIframe`, `CopyableField`, `DevBox`, `ErrorAlert`, `Sidebar`) — they're already structural-props-only, which is the right amount of sharing.
4. Extract a `usePolling` rune-module to kill the obvious duplication.
5. Drop the `Anchor` interface, `anchorFactory.ts`'s facet guards, and the unified `[provider]` routes. Keep `getEtherfuse()` / `getTestAnchor()` singletons.
6. Lift the nice things from `main` that don't depend on the interface: the anchor-logo `Sidebar`, the `RampPage` framing, the `authStore` for caching SEP-10 tokens.

The Etherfuse client in `experiment` is the single best argument: a developer can `cp -r etherfuse/ ~/their-project/src/lib/` and it works. That's what Goal #1 promises and only one branch delivers it.

## What would change my mind?

1. **A real third programmatic provider lands on `main` without a new capability flag or a new optional field on a shared type.** If Koywe genuinely slots into `OnRampFlow.svelte` and `Anchor` unchanged, the abstraction is paying for itself and my critique is wrong. Today the score is 1-1 (Etherfuse fits, testanchor needed an 888-line adapter) and there's a hidden 3-2 (Etherfuse needed `bankAccountId`, testanchor needed `awaitingCustomerInfo` + `requiredInfo`).
2. **A second developer successfully copy-pastes `etherfuse/` from `main` into their own project in <30 minutes without help.** My test took maybe 4 minutes of friction (compile error → copy `types.ts` → compile error → fix `.programmatic` → green). That's small but real, and the JSDoc example being wrong is a knife in a dark room. If users routinely figure it out painlessly, my Goal #1 weighting was too harsh.
3. **The flow-page duplication on `experiment` produces a real production bug** — i.e. the polling logic drifts between Etherfuse and Koywe and ships broken in one of them. I'd take that as evidence that "duplication is fine" is wrong here and that `OnRampFlow.svelte` was earning its keep.
