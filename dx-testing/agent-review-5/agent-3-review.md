# Agent 3 Review — `v2.0.0` vs `experiment/eff-anchor-interface`

## Bottom line up front

For Goal #1 (copy-paste-friendly anchor clients), **`experiment` wins clearly**. The paste test below makes the gap concrete: Etherfuse copies as a self-contained directory with zero adaptation on `experiment`; on `v2.0.0` it requires copying a sibling `types.ts` and the consumer has to learn that the error class lives there and not in the anchor's barrel.

For Goal #2 (demo app), v2 wins on raw consistency — one OnRampFlow / OffRampFlow do every anchor — but pays for it with capability-flag soup in the flow components, and a couple of the unified types are already strained (e.g. `paymentInstructions` baked into `OnRampTransaction`). The experiment's per-provider pages duplicate aggressively (~3,400 LOC across 8 pages), but each page is honest about its provider and never lies about the data shape.

Given the user's stated weighting (~60% Goal #1, ~40% Goal #2), I recommend **`experiment`**, with a caveat: trim page-level duplication before this calcifies. The anchor-layer architecture is right; the routing layer is over-eager.

---

## Empirical paste-target test

I picked Etherfuse for both states. Procedure: copy `src/lib/anchors/etherfuse/` into a fresh scratch dir, write a `scratch.ts` that imports `EtherfuseClient`, instantiates it, stubs `globalThis.fetch`, calls `createCustomer`, then `npx tsc --noEmit` with `strict: true`.

### `experiment` (per-provider): clean

- Copied: `etherfuse/{client.ts,index.ts,types.ts}` — **3 files, one directory.**
- Installed: `typescript`, `@stellar/stellar-sdk`.
- Code (excerpted):
  ```ts
  import { EtherfuseClient, EtherfuseError } from './etherfuse';
  const client = new EtherfuseClient({ apiKey: 'fake', baseUrl: '…' });
  await client.createCustomer({ publicKey: 'G…', email: 'x@y', country: 'MX' });
  ```
- `npx tsc --noEmit -p tsconfig.json` → **EXIT 0 on the first try.** No adaptation, no missing imports, no surprise re-exports.
- Reading the barrel (`etherfuse/index.ts`) makes the surface obvious: client + error + types.

### `v2.0.0` (unified `Anchor`): adaptation needed

- First attempt: copied `etherfuse/` only and ran tsc. **Hard failure**:
  ```
  etherfuse/client.ts(38,8): error TS2307: Cannot find module '../types'
  etherfuse/client.ts(39,29): error TS2307: Cannot find module '../types'
  scratch.ts(4,10): error TS2305: Module './etherfuse' has no exported member 'AnchorError'
  ```
- Fix #1: copy `src/lib/anchors/types.ts` to the sibling location (the client imports `../types` relative to `etherfuse/client.ts`). The consumer has to recreate the *exact* `anchors/etherfuse/`-next-to-`anchors/types.ts` layout, or rewrite the imports.
- Fix #2: change `scratch.ts` to import `AnchorError` from `./types`, not from `./etherfuse` — the etherfuse barrel deliberately doesn't re-export it.
- After both fixes: **EXIT 0.**

### What the test shows

| Metric                                | experiment | v2.0.0                   |
| ------------------------------------- | ---------- | ------------------------ |
| Files to copy for one provider        | 3          | 4 (+ correct layout)     |
| Extra directories to preserve         | 0          | 1 (parent `anchors/`)    |
| Surface a consumer has to learn       | 1 barrel   | 1 barrel + shared types  |
| Error class location                  | local      | shared (different import)|
| Time-to-first-tsc-pass                | immediate  | one error, one investigation |

This isn't catastrophic — it's the real cost of *any* shared interface — but the friction scales wrong: every additional provider keeps the consumer tied to `types.ts`, with the temptation to prune unused fields and break it for someone else. Scratch files: `/tmp/scratch-exp-fresh/scratch.ts`, `/tmp/scratch-v2-fresh/scratch.ts`.

---

## Goal #2 — reading the flow pages end-to-end

### v2's `OnRampFlow.svelte` (426 LOC) + `RampPage.svelte` (460 LOC) + `OffRampFlow.svelte` (799 LOC)

`OnRampFlow.svelte` is a beauty in places — `step` state machine, `TrustlineStatus` / `AmountInput` / `QuoteStep` / `CompletionStep` factored out, polling well isolated. Then you hit lines like `{#if pi.type === 'spei'}` vs `{:else if pi.type === 'pix'}` and you see what's actually happening: the *flow* is generic but the *rendering* is provider-aware. The discriminated union pays its rent here.

`OffRampFlow.svelte` is where the abstraction starts straining. Greps for `capabilities?.` find: `requiresBankBeforeQuote`, `deferredOffRampSigning`, `fiatAccountRegistration === 'inline' | 'hosted'`. Each is an Etherfuse quirk leaking into a "generic" component. With one anchor, this is fine. With three, it'll be a feature-flag jungle.

`RampPage.svelte` has its own zoo: `if (capabilities.kycFlow === 'iframe')` vs `'form'`, `capabilities.emailLookup`, and so on. The component understands hosted iframe KYC, form KYC, email-vs-id customer lookup. That's a lot of branching for "the customer step before any ramp."

**v2's win is real:** one place to add a new step, one place to fix a bug, every anchor shares the polish. But the v2 README still references AlfredPay and BlindPay clients that don't exist in this repo — already a drift smell from the previous unified-interface era.

### experiment's `routes/anchors/etherfuse/onramp/+page.svelte` (711 LOC)

The page owns the entire flow: onboarding → KYC iframe → bank confirmation → amount → quote → payment → completion. Provider-aware constants are written inline (CETES_ISSUER, TESOURO_ISSUER, currency symbol, region derivation). There's a small `displayQuote = $derived(...)` adapter that maps `EtherfuseQuote` → the structural shape `QuoteDisplay.svelte` expects. That adapter is the cost of having no shared `Quote` type — but it's a tiny localized cost (~13 lines) and *every component reading it knows exactly what it is.*

The pages duplicate. `etherfuse/onramp/+page.svelte` vs `testanchor/programmatic/onramp/+page.svelte` differ in ~890 lines out of ~1,150 combined. That's not a refactor I'd celebrate. But each page is *legible without holding a capability matrix in your head*. A new contributor reads one file and knows what's going on.

I'd take "honest and duplicative" over "tidy with hidden coupling" for a demo app whose job is to inspire, but it's much closer than the paste test.

---

## Adding the next anchor — Koywe (Argentina, programmatic, USDC+ARS)

### On `v2.0.0`

1. Implement `Anchor` in `anchors/koywe/client.ts`.
   - Koywe doesn't fit the `paymentInstructions` discriminated union — Argentina has CVU/CBU/alias, none of which is `spei` or `pix`. So you add `KoywePaymentInstructions extends PaymentInstructionsBase { type: 'cvu' | 'cbu' | 'alias'; ... }` to the *shared* `types.ts`, recompile, hope no other code path silently broke.
   - Or you bend Koywe's response into one of the existing types and lose information.
2. Add to `anchorFactory.ts` (one line).
3. Add to `config/anchors.ts` (profile + region).
4. Existing `OnRampFlow` / `OffRampFlow` / `RampPage` should "just work" — *if* Koywe's flow is structurally identical (input → quote → payment → poll). For an inline-account, form-KYC, no-trustline-needed flow, it might. For anything weirder you'd be in the capability-flag soup.
5. Pages: dynamic route auto-renders.

Net cost: ~1 client + 2 config edits + N type extensions to `anchors/types.ts` and N capability flag branches in flow components, where N depends on how unique Koywe is.

### On `experiment`

1. Implement `KoyweClient` in `anchors/koywe/{client.ts,types.ts,index.ts}` — entirely on its own terms (`KoyweOrder`, `KoyweCustomer`, native field names).
2. Server-side singleton in `lib/server/koyweInstance.ts` (mirrors etherfuseInstance/testanchorInstance — ~20 LOC).
3. API routes under `routes/api/anchor/koywe/*` (one `+server.ts` per endpoint).
4. `lib/api/koywe.ts` client wrapper.
5. Pages: copy `etherfuse/onramp/+page.svelte` → `koywe/onramp/+page.svelte` and adapt. **This is the painful step.**

Net cost: ~1 client + ~5 server route files + ~2 page files (duplicated), but everything is local to `koywe/`. The shared types never bend; you never re-test Etherfuse and testanchor because you didn't touch them.

The tension is real. `v2` is cheaper to *add a Koywe-shaped* anchor; `experiment` is cheaper to add a *weird-shaped* anchor.

---

## Drift surfaces and maintenance risk

### `v2.0.0` drift surfaces

- `anchors/types.ts` is **the** schema. Every anchor's quirk eventually wants to live there, and once it does, it's load-bearing for everyone. Etherfuse's `signableTransaction`, `statusPage`, `feeBps`, `feeAmount` on `OffRampTransaction` are already telltale — they're all optional, only Etherfuse populates them, and they're sitting in the shared shape forever.
- Capability flags. `AnchorCapabilities` has 13 boolean/string fields, and the flow components branch on most of them. Adding a 14th is cheap; understanding the matrix of combinations is not.
- v2 README references AlfredPay/BlindPay clients that no longer exist. Documentation drift is already happening; the unified contract makes it look broader than it is.
- `getKycUrl?(...)`, `registerFiatAccount?(...)`, `submitKyc?(...)` all optional. Components have to null-check before calling — `anchor.getKycUrl?.()` calls scattered around — and every call site can silently regress.

### `experiment` drift surfaces

- Page duplication. The eight `+page.svelte` files under `routes/anchors/{provider}/{facet?}/{direction}/` total ~3,400 LOC. A polling bug fixed in one will get forgotten in seven. The `displayQuote` adapter is fine as a one-off; replicated eight times it's eight independent definitions of "what does the UI need from a quote?"
- No shared `Anchor` type means tooling can't enforce a baseline. If a new anchor forgets to export a `simulateFiatReceived` shape and copies the etherfuse page template, you only find out at runtime.
- Two TestAnchor clients (`TestAnchorClient`, `TestAnchorRampClient`) in one directory. Easy to grab the wrong one. The README explains, but it's the kind of "two near-identical things side by side" that produces support tickets.

---

## Specific risks

### `v2.0.0`

1. **Type contagion**: the third anchor will force a change to `types.ts` that breaks the first two. This already happened with `paymentInstructions` (PIX added to a shape originally written for SPEI).
2. **Capability-flag explosion in flow components**: `OffRampFlow.svelte` is already 799 LOC of branching. Adding Koywe's CVU + Argentina-tax-id quirks adds two more branches. Adding Coins.ph (interactive-only) requires a *whole new flow*, which means either bolting it onto `RampPage.svelte` or admitting the abstraction was wrong.
3. **Paste-target gap**: a developer who wants only Etherfuse leaves with a `types.ts` cluttered with fields for anchors they don't use (`requiresAnchorPayoutSubmission`, `blockchainWalletId`, `RampIdentity.taxIdCountry`). It's confusing noise in the file they were told to copy.

### `experiment`

1. **Page-level rot from duplication**: someone fixes a polling timeout edge case in `etherfuse/onramp/+page.svelte`, doesn't notice the same bug in `testanchor/programmatic/onramp/+page.svelte`. Eight pages, eight chances to drift.
2. **No structural enforcement**: a new anchor can ship without `getKycStatus`, without `simulateFiatReceived`, with any method-naming convention they choose. Reviewers have to catch convention drift by eye.
3. **Cross-anchor UI inconsistencies**: the demo's job is to inspire by showing a polished UX. With duplicated pages, "polish" becomes a per-file effort; v2 polishes once.

---

## What would change my mind?

1. **A third curated anchor with a perfectly orthogonal shape** — if Koywe (programmatic CVU/CBU) and Coins.ph (interactive-only PHP) both end up cleanly modeled by extensions to v2's `types.ts` and `AnchorCapabilities` without needing flow-component refactors, the unified approach was right and I underrated it. So far the project has *one* fully unified anchor (Etherfuse); the abstraction is unfalsified, but also under-tested.
2. **An empirical case of paste-test pain in `experiment`** — if a developer realistically wants to paste Etherfuse + testanchor SEP modules + their own SEP-31 work together, the lack of any cross-anchor shared type might bite. If I saw two `experiment` provider directories develop inconsistent error-handling conventions to the point that *consumers using both* had to write their own normalization layer, that would push me back toward unification.
3. **Significant deduplication of the experiment's page layer** — extracting a `RampStepMachine` or similar reusable scaffolding that cuts page LOC by ~50% without reintroducing capability flags would lock in `experiment`'s win. Conversely, if such extraction proves impossible without reinventing v2's capability flags, that's evidence v2 was on the right track and the experiment is just lower-LOC at the type layer at the cost of higher LOC everywhere else.

---

## Recommendation

Adopt `experiment`'s **anchor-layer** architecture: per-provider, self-contained, no shared interface. Goal #1 is concretely better — verified by tsc.

Push back on `experiment`'s **route-layer** duplication before this calcifies. Extract a reasonable amount of shared step machinery (the polling pattern, the trustline-then-amount step, the completion step) into headless utilities or composables that pages opt into — *not* into capability-flagged mega-components. The aim is to make page #3 cost less than page #2, without making page #3 lie about its data shape.

If you must have one shared concept, make it the *operational contract* (you can `getQuote`, then `createOnRamp`, then poll `getOnRampTransaction`) rather than the *data shape* (everyone returns the same `Quote` object). That's what protocol-shaped APIs do well and what `experiment` is already most of the way to.
