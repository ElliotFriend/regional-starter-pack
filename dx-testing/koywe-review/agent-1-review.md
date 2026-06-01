# Koywe Architecture Review — Agent 1 (independent)

Scope: full-codebase comparison of two worktrees after a fresh Koywe (Argentina, ARS↔USDC on Stellar) integration.

- Worktree A — **unified-interface**: `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-interface`
- Worktree B — **bespoke per-provider**: `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-bespoke`

Both suites are green and both typecheck clean (interface: 578 tests / 0 check errors; bespoke: 477 tests / 0 check errors), so this verdict turns on architecture and code health, not on broken builds — with one important runtime exception called out below.

---

## UP-FRONT VERDICT

**Worktree B (bespoke per-provider) is the better foundation, and the margin is clear — not a coin-flip.**

The project's own stated goals are (1) portable, copy-paste-friendly anchor clients, (2) the demo app as readable builder inspiration, and (3) a low-friction path to add an anchor. The bespoke model wins (1) decisively, wins (2) clearly, and roughly ties (3) on raw effort while being far safer. On top of that, the *flagship Koywe off-ramp is functionally broken in the interface worktree* and works end-to-end in the bespoke one — a concrete demonstration that the shared abstraction failed to absorb the newest anchor's shape, which is exactly the test this exercise was designed to run.

---

## Evidence by goal

### Goal 1 — Portable, copy-paste-friendly anchor clients → **B wins decisively**

- The bespoke Koywe folder is genuinely self-contained. Its only external import is `@stellar/stellar-sdk` (`wt-koywe-bespoke/src/lib/anchors/koywe/client.ts:33`); everything else is local to `./types`. Total drag to lift it into another TS project: ~904 LOC (client + types + index). `index.ts` even re-exports its own `KoyweError`.
- The interface Koywe client imports the shared contract — `import type { Anchor, ProgrammaticOps, ... } from '../types'` and `import { AnchorError } from '../types'` (`wt-koywe-interface/src/lib/anchors/koywe/client.ts:33-56`). To copy it out, a builder must also drag the **898-line** `wt-koywe-interface/src/lib/anchors/types.ts`. That file is saturated with concepts Koywe never uses: `blockchainWalletId`/`requiresBlockchainWalletRegistration` (BlindPay), `RampIdentity`/inline-identity (Transfero), the full `InteractiveOps`/SEP-24 facet, `SpeiPaymentInstructions`/`PixPaymentInstructions`, etc. Effective copy-paste surface ≈ **1,986 LOC vs 904** for the same anchor.
- The contract also forces *fictional* code into the Koywe client purely to conform: `createCustomer` fabricates a `Customer` record (Koywe has no partner-created customer concept) (`wt-koywe-interface/.../koywe/client.ts:417-438`), and `getKycUrl` is a method that exists only to `throw` a 501 (`:763-769`). The bespoke client simply doesn't have a customer method and its `getKycUrl` 501 is its own honest surface (`wt-koywe-bespoke/.../koywe/client.ts:331-338`) — but it isn't pretending to satisfy a cross-provider interface, so the shape is Koywe's, not a procrustean bed.

This is the cleanest, most objective axis in the whole comparison, and the project's CLAUDE.md leads with "portable / copy-pasteable." B is built for it; A actively works against it.

### Goal 2 — Demo app as readable builder inspiration → **B wins**

- Bespoke flow pages are self-contained state machines a builder can read top-to-bottom: `wt-koywe-bespoke/src/routes/anchors/koywe/onramp/+page.svelte` (503 LOC) and `offramp/+page.svelte` (470 LOC). The onramp page reads like a tutorial: explicit `Step` union (`:39`), native `KoyweQuote` adapted to the structural `QuoteDisplay` shape inline via `$derived` (`:66-79`), a shared `createPoller` util (`:61`). Duplication across pages is real but local and obvious.
- The interface model pushes all flow logic into three large shared components — `OnRampFlow.svelte` (669), `OffRampFlow.svelte` (865), `RampPage.svelte` (545) — and the per-anchor page is a 67-LOC shell (`wt-koywe-interface/src/routes/anchors/[provider]/[direction]/+page.svelte`). To its credit, these contain **no `provider === 'koywe'` sniffing** (grep found none) — variation is driven by capability flags, which is the *right* way to do an abstraction. But the cost is that `OffRampFlow` now branches on `fiatAccountRegistration`, `requiresBankBeforeQuote`, `deferredOffRampSigning`, `signableTransaction` presence, and build-payment-locally fallback (`wt-koywe-interface/.../OffRampFlow.svelte:146,323-339,376-387`; 20 `{#if}/{:else}` blocks in that one file). A builder wanting to understand "how do I integrate *my* anchor's off-ramp" must reverse-engineer a matrix of flags rather than read one linear flow. As inspiration, the linear bespoke page is more instructive.

### Goal 3 — Low-friction path to add an anchor → **roughly tied on effort; B much safer**

- Interface "add an anchor" looks cheap on paper: implement `Anchor`, register in `anchorFactory.ts` (one switch case + `isValidProvider` array, `wt-koywe-interface/src/lib/server/anchorFactory.ts:52-61,78`), add config, done — the generic `[provider]` routes and shared flows "just work." That's the model's headline pitch.
- But the Koywe integration shows the pitch failing exactly where anchors diverge. **Koywe's off-ramp is broken in the interface worktree.** Koywe settles off-ramp by giving the user a Stellar *deposit address* (surfaced in `OffRampTransaction.paymentInstructions`) and then accepting a tx hash via `submitOffRampTxHash` (`wt-koywe-interface/.../koywe/client.ts:782-787`). The shared `OffRampFlow` has **no handling for `paymentInstructions`, no deposit-address payment, and no tx-hash submission** (grep for `paymentInstructions|submitOffRampTxHash|txHash|deposit` in `OffRampFlow.svelte` → 0 hits). The off-ramp API route exposes only `createOffRamp` + `getOffRampTransaction` — no tx-hash action (`wt-koywe-interface/src/routes/api/anchor/[provider]/offramp/+server.ts`). The client method `submitOffRampTxHash` is **dead code**: referenced only by its own client + README, never by `api/anchor.ts` or any route. The shared flow falls through to "build a payment to `transaction.stellarAddress` and sign it" (`OffRampFlow.svelte:413-423`), but Koywe puts the deposit address in `paymentInstructions`, not `stellarAddress`. Net: a user cannot complete a Koywe off-ramp in worktree A.
- The bespoke worktree wires it correctly: `wt-koywe-bespoke/src/routes/anchors/koywe/offramp/+page.svelte:155-181` reads `order.depositAddress`, builds + signs the payment, and calls `koywe.submitTxHash(...)`. End-to-end.
- So the *real* cost of adding an anchor in the interface model isn't the factory line — it's extending the shared flow components (and the shared `types.ts`, and the generic routes) to absorb the new anchor's quirks without regressing the others. Koywe needed a new settlement style and it simply wasn't added. In the bespoke model the new page owns its quirks and can't regress anyone else.

### General code health

- **File sizes / blast radius**: Interface concentrates risk: `types.ts` 898, `OffRampFlow` 865, `OnRampFlow` 669, `RampPage` 545, `api/anchor.ts` ~18KB single file. A change for one anchor touches files every other anchor shares. Bespoke spreads it: per-anchor pages ~470-657, per-anchor `api/koywe.ts` 126 LOC, per-anchor `koyweInstance.ts` 33 LOC. Bespoke also factored out genuine shared helpers where it's safe — `src/lib/api/http.ts` (`createApiRequester`) and `src/lib/utils/poll.svelte.ts` (`createPoller`) — so duplication is mitigated without coupling provider semantics.
- **Type clarity**: Interface's single contract is elegant in the abstract but is accreting per-provider leakage (BlindPay/Transfero fields live in the shared type even though neither provider is present). Bespoke's `KoyweQuote`/`KoyweOnRampOrder` name exactly what Koywe returns.
- **Auth model divergence (note, not decisive)**: the two Koywe clients diverge on user scoping. Interface caches tokens per-email in a `Map` and threads `customerId`/email through every call (multi-user safe). Bespoke uses a single `config.email` per instance + a fixed Argentina sandbox user (`wt-koywe-bespoke/src/lib/server/koyweInstance.ts:17`), so the singleton is effectively one-user. The interface design is more correct for a real multi-user deployment; for a sandbox demo it's moot, but it's the one place A's generality buys something real.
- **Tests**: Comparable structure and depth (interface Koywe client test 624 LOC/24 `it`; bespoke 503 LOC/16 `it`). The interface's extra cases largely cover the extra surface its contract forces (e.g. the faked customer methods). Critically, **neither worktree tests the flow components/pages** — which in the interface model means its single most complex and most shared file (`OffRampFlow`, 865 LOC) is untested, and that's precisely where the Koywe off-ramp regression slipped through.

---

## Strongest counter-argument to my own verdict

The honest case for worktree A: *the interface didn't fail because abstraction is wrong — it failed because someone left the Koywe off-ramp half-wired, and that's a fixable bug, not an architectural verdict.* The model has a real, demonstrated virtue the bespoke side lacks: the flow components carry **zero `provider ===` sniffing** — every divergence is expressed as a declarative capability flag. That is a genuinely clean abstraction, and it means a SEP-24 interactive anchor, a per-rail-priced anchor (Koywe), and an iframe-KYC anchor (Etherfuse) all reuse one tested flow. As anchor count grows, A amortizes UI/polling/auth fixes across every provider for free, while B will copy each bug fix into N pages by hand. If the project's true north is "ship many anchors against a stable UI," A's ceiling is higher, and the multi-user token cache shows its client is the more production-shaped of the two.

Why it doesn't change my verdict: the abstraction's promise is "absorb the next anchor cheaply and safely," and the live test of that promise — Koywe — produced a broken off-ramp, dead client code, a shared type bloated with absent-provider concepts, and a 2x copy-paste tax that directly contradicts the project's stated #1 goal of portability. The capability-flag matrix is exactly what made the off-ramp gap easy to miss: the flow silently fell through to a wrong default instead of failing loudly. B's duplication is visible and contained; A's coupling is invisible and global. For a *starter pack whose product is copy-pasteable reference integrations*, B is the better foundation today, and the gap is wide enough that I'd want A to both fix the off-ramp and trim `types.ts` before reconsidering.

---

## Specific findings & recommendations

1. **(A, blocking) Koywe off-ramp is non-functional.** Wire deposit-address settlement + tx-hash submission into `OffRampFlow.svelte`, add a tx-hash action to `routes/api/anchor/[provider]/offramp/+server.ts`, and expose it in `api/anchor.ts`. `submitOffRampTxHash` (`koywe/client.ts:782`) is currently dead code. Add a flow-level test so this can't regress.
2. **(A) Trim the shared contract.** `types.ts` carries BlindPay (`blockchainWalletId`) and Transfero (`RampIdentity`, inline identity) concepts with no present implementer. Either delete or move them behind the providers that need them; today they tax every copy-paste of every anchor.
3. **(A) Reconsider faked conformance.** `KoyweClient.createCustomer` fabricating a `Customer` and `getKycUrl` existing only to throw 501 are interface-satisfaction artifacts, not Koywe behavior. They mislead a reader about what Koywe actually does.
4. **(B) Watch UI-fix fan-out.** B's risk is real: a polling/auth bugfix must be applied to each `+page.svelte`. The extracted `poll.svelte.ts` and `http.ts` helpers are the right instinct — keep pushing genuinely-shared, provider-agnostic logic there (without re-introducing a provider-shaped uber-component).
5. **(Both) Add flow/page tests.** The highest-risk code in both models is untested. This is the single change that would most improve either foundation; in A it's near-mandatory given the 865-LOC shared off-ramp.
