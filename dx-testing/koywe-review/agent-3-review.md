# Koywe Architecture Review — Agent 3 (independent)

Scope: full evaluation of both worktrees post-Koywe.
- Worktree A (unified-interface): `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-interface`
- Worktree B (bespoke per-provider): `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-bespoke`

Both worktrees typecheck clean (`pnpm check`: 0 errors) and pass tests (A: 578 passing / 24 files; B: 477 passing / 23 files).

---

## UP-FRONT VERDICT

**Worktree B (bespoke per-provider) is the better foundation, and I hold this with moderate-to-strong conviction.**

The deciding factor is not aesthetics or LOC — it is **correctness under the project's own stated priorities**. The project's headline goals are (1) portable, copy-paste anchor clients, (2) the demo app as builder inspiration via clear flow code, and (3) a low-friction path to add an anchor. Koywe is the live test of all three, and on the two that matter most the bespoke model wins outright:

- **Portability (goal #1): bespoke wins cleanly.** B's `KoyweClient` imports nothing outside its own folder except `@stellar/stellar-sdk` (`wt-koywe-bespoke/src/lib/anchors/koywe/client.ts:33` is the only external import). A's `KoyweClient` depends on the 897-line shared `../types.ts` (`wt-koywe-interface/src/lib/anchors/koywe/client.ts:33-56`), ~70% of which is foreign to Koywe (Etherfuse/BlindPay/Transfero/SEP-24 fields). A builder copying A's Koywe folder drags the whole contract or rewrites the imports; copying B's folder is genuinely three self-contained files, exactly as B's README claims.

- **Correctness of the Nth anchor's flow (goal #2): the interface abstraction is leaking, and on Koywe's off-ramp it leaks into an actual bug.** A's shared `OffRampFlow.svelte` supports three signing strategies (immediate XDR, deferred-poll XDR, build-payment-locally) but **not** Koywe's "send USDC to the anchor's returned deposit address, then submit the tx hash" strategy. A's `KoyweClient.submitOffRampTxHash` exists but is **never reachable** from the unified pipeline (referenced only in the README, not in any component/route/api wrapper — confirmed by grep). Worse, A's `createOffRamp` sets `stellarAddress: input.stellarAddress` (the user's own key, `wt-koywe-interface/src/lib/anchors/koywe/client.ts:688`) and surfaces the real deposit address inside `paymentInstructions.fields`; the shared `signAndSubmit()` with no XDR builds a payment to `transaction.stellarAddress` (`wt-koywe-interface/src/lib/components/OffRampFlow.svelte:414-422`) — i.e. the user paying themselves, and no tx-hash callback. B's off-ramp page does it correctly and legibly: send to `order.depositAddress`, then `koywe.submitTxHash(...)` (`wt-koywe-bespoke/src/routes/anchors/koywe/offramp/+page.svelte:155-181`).

That second point is the crux: the unified interface's value proposition is "one contract, every anchor conforms, the shared flow just works." For Koywe's off-ramp that promise is unmet today — the shared flow silently does the wrong thing — whereas the bespoke page is both correct and reads top-to-bottom as builder documentation.

This is a genuinely close call on **maintainability-at-scale**, where A is the stronger model (see counter-argument). But the project is a *curated showcase / starter pack*, not a 30-anchor aggregator. For that mission, isolation + readable correct flows beats a shared abstraction that is already straining at anchor #3.

---

## Evidence by goal

### Goal 1 — Portable, copy-paste anchor clients

| | Worktree A (interface) | Worktree B (bespoke) |
|---|---|---|
| Koywe client LOC | 788 (`koywe/client.ts`) | 522 |
| Koywe types LOC | 299 | 379 |
| External imports | `../types` (897-LOC shared contract) | `@stellar/stellar-sdk` only |
| Own error class | shared `AnchorError` | own `KoyweError` |
| Copy unit | folder + shared `types.ts` | folder (3 files) |

B is the clear winner here, and it directly serves the stated goal. A's client is *longer* than B's despite reusing shared types, because conforming to the interface forces a `programmatic` facet object that re-wraps every private method (`wt-koywe-interface/src/lib/anchors/koywe/client.ts:128-141`) plus adapter glue (symbol mapping, rail metadata, instruction parsing) that exists to satisfy the shared `PaymentInstructions`/`PaymentMethodOption` shapes. B's client maps straight to its own native types (`KoyweQuote`, `KoyweOnRampOrder`, etc.) and is easier to read against the Koywe API docs.

One real wart in **both**: `console.log`/`console.error` of full request/response bodies in the client `request()` method (A `client.ts:228,250,257`; B `client.ts:409,422,445`). For a "copy into your project" client this is noisy and could log PII/credentials. Neither worktree is better here.

### Goal 2 — Demo app as builder inspiration (flow clarity)

A centralizes flows into `OnRampFlow` (669), `OffRampFlow` (865), `InteractiveRampFlow` (320), `RampPage` (545) — ~2,399 LOC of shared components driven by capability flags and a discriminated `PaymentInstructions` union. The Koywe route is a 67-line shell (`wt-koywe-interface/src/routes/anchors/[provider]/[direction]/+page.svelte`). Impressive that Koywe added **zero** new flow files — `RampPage` already understood `kycFlow: 'redirect'` and `selectablePaymentMethods`, so Koywe slotted into the existing register→KYC→ready pipeline.

But the cost is that understanding "how a Koywe on-ramp works" means tracing `[direction]/+page.svelte` → `RampPage` → `OnRampFlow` → capability branches → `api/anchor.ts` → generic `[provider]` route → factory → client, holding which `if (capabilities.x)` branches apply to Koywe in your head. The off-ramp bug above is a direct symptom: the shared component accreted three signing modes and still missed Koywe's, and nothing in the type system caught it.

B's `koywe/onramp/+page.svelte` (503) and `offramp/+page.svelte` (470) are each one self-contained state machine you read top to bottom — `connect → method → amount → quote → payment → complete`, with Koywe's WIREAR-vs-QRI branch rendered inline (`onramp/+page.svelte:389-444`). This is exactly the "one mental model deep" readability the project's CLAUDE.md sells, and it is materially better *builder documentation*. B also factored the genuinely repetitive bits well: a shared `createPoller` (`utils/poll.svelte.ts`) and a shared `http.ts` API-requester used by all three provider wrappers — so "bespoke" is not "blindly duplicated."

### Goal 3 — Low-friction path to add an anchor

A: edit `anchorFactory.ts` (one `case`), `isValidProvider`, config, done — if the anchor fits the existing capability flags. Koywe *mostly* did, which is the model's best showcase. **But** when it doesn't fit (the off-ramp tx-hash strategy), the friction reappears as either a new capability flag + new branch in an 865-line shared component, or a silent bug — and that edit risks every other anchor sharing the component. The blast radius of a Koywe change is global.

B: 6-9 new files, all Koywe-namespaced (`server/koyweInstance.ts` 33 LOC, `api/koywe.ts` 126, 6 route files, 2 flow pages, client/types). More files, more boilerplate, but **zero shared files touched** beyond config + `constants.ts`. A Koywe change cannot break Etherfuse or the test anchor. Route count reflects this: A has 12 `+server.ts` under `api/`, B has 21. That is B's real, honest cost.

Adding-an-anchor is the goal where A is *designed* to win, yet Koywe demonstrates the win is conditional on the anchor fitting the contract — and the project keeps onboarding idiosyncratic LatAm anchors (email-as-customer identity, hosted redirect KYC, deposit-address off-ramp). Each idiosyncrasy taxes the shared contract.

### General code health

- **Type clarity:** A's shared `types.ts` is genuinely well-documented but is now a 897-line god-file accumulating optional fields for every anchor's quirks (`requiredInfo`, `awaitingCustomerInfo`, `deferredOffRampSigning`, `selectablePaymentMethods`, `fiatAccountRegistration`, `signableTransaction`, ...). Reading `OnRampTransaction` you can't tell which fields apply to which anchor. B's per-anchor types are smaller in aggregate cognitive load even if larger in total LOC.
- **Test coverage:** A's Koywe client test is richer (624 LOC / 24 cases vs B 503 / 16) — A edges this. Both follow the MSW pattern well. A's faceted interface also gets a `testanchor/anchor.test.ts` adapter test. Tests are a point *for* A.
- **Identity-model mismatch (A):** Koywe identifies users by email with no partner-created customer record, so A's `KoyweClient.createCustomer` fabricates a `Customer` using the email as id (`wt-koywe-interface/src/lib/anchors/koywe/client.ts:417-438`) purely to satisfy the `RampPage`/`customerStore` register-step pipeline. It works, but it's an impedance-match artifact the interface forces. B sidesteps this entirely (fixed sandbox test-user email in `koyweInstance.ts:17`).

---

## Strongest counter-argument to my own verdict

**The interface model is the better long-term bet and I may be over-weighting one fixable off-ramp bug.**

Everything I flagged as an A "leak" is repairable: add a `requiresDepositAddressOffRamp` capability + one branch in `OffRampFlow.signAndSubmit` (read the deposit address from `paymentInstructions`, call a generic `submitOffRampTxHash` api wrapper), and Koywe's off-ramp works through the unified pipeline like everything else. That is a few-dozen-line fix, after which A gives you: Koywe on-ramp **and** off-ramp with essentially zero bespoke UI, full reuse of KYC/auth/polling/trustline/payment-method machinery, and the richest test suite. A's `RampPage` already absorbing `redirect` KYC and `selectablePaymentMethods` for free is real evidence the abstraction is *paying off*, not collapsing. B's "isolation" is partly illusory — its flow pages still depend on shared `poll.svelte.ts`, `http.ts`, `stellar.ts`, `WalletConnect`, `QuoteDisplay`, etc., so a breaking change to those ripples through every bespoke page anyway, just without the type system helping you find the call sites. And B's duplication compounds: the koywe on-ramp and off-ramp pages already share ~60% of their `<script>` (wallet/quote/poll/reset boilerplate, confirmed by diff), duplicated again per future anchor. At 6+ anchors, B is a maintenance drag and A is where you'd wish you'd started.

I find this argument serious but not decisive, because: (a) the bug is *latent in shipped code today* and the whole pitch of the unified model is that conforming anchors "just work" — a model that needs a new capability flag + shared-component surgery for anchor #3's off-ramp is already demonstrating the exact coupling cost B avoids; (b) the project is explicitly a *curated* starter pack optimizing for builder copy-paste and legible reference flows, not an aggregator optimizing for internal DRY at 30 anchors; and (c) B's duplication is bounded and was deliberately factored (shared poller/http/wallet helpers), so the "compounding" is real but smaller than it looks.

---

## Specific findings & recommendations

1. **(A, bug, high) Koywe off-ramp is broken through the unified pipeline.** `OffRampFlow.signAndSubmit()` (`wt-koywe-interface/src/lib/components/OffRampFlow.svelte:401-435`) builds a payment to `transaction.stellarAddress`, which for Koywe off-ramp is the user's own address (`koywe/client.ts:688,724`); the real deposit address is in `paymentInstructions`, and `submitOffRampTxHash` is never called (grep finds it only in the README). Fix: add a deposit-address-off-ramp capability + branch and wire a `submitOffRampTxHash` api route, or document Koywe off-ramp as unsupported in the unified UI.
2. **(B, gap, medium) Koywe off-ramp bank-account registration is stubbed.** `koywe/offramp/+page.svelte` asks the user to paste an already-registered `bankAccountId` (TODO at top of page); registration UI isn't wired. Same TODO exists on both sides' clients re: `setTxHashOrder`/off-ramp field shape — neither verified against live sandbox. Acceptable for a sandbox starter but should be tracked.
3. **(Both, hygiene, low) Remove or guard the `console.log` of full request/response bodies** in the Koywe client `request()` methods before this is held up as copy-paste reference code.
4. **(A, design, medium) `anchors/types.ts` is becoming a god-file.** Consider splitting per-facet or documenting per-anchor field applicability; the current optional-field soup hurts the "is this field mine?" question that the off-ramp bug stemmed from.
5. **(B, DRY, low) Factor the shared `<script>` between koywe `onramp`/`offramp` pages** (wallet/quote/poll/reset) into a small composable if a third Koywe-style anchor lands — to keep bespoke duplication bounded, which is B's main risk.
6. **Recommendation:** ship on **B**, and lift A's two best ideas into it incrementally — the richer Koywe test suite, and (only if/when a true SEP-24 hosted anchor like Coins.ph lands) a *single* shared interactive flow component, without retrofitting the programmatic anchors onto a universal contract.
