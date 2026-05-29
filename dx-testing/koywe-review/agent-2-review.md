# Koywe Architecture Review — Agent 2 (independent)

Reviewer: independent senior architect, no prior project context. Scope: whole
codebase in each worktree, post-Koywe.

- Worktree A — **unified-interface**: `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-interface`
- Worktree B — **bespoke per-provider**: `/Users/elliotvoris/Dev/stellar/regional/wt-koywe-bespoke`

(I did not read any `dx-testing/`, `KOYWE_DX_NOTES.md`, or prior review/roadmap files.)

---

## UP-FRONT VERDICT

**Worktree B (bespoke per-provider) is the better foundation, decisively.**

It wins on every stated project goal — portability, instructive flow code, and
low-friction anchor addition — and it wins on the one thing that actually
matters most for a starter pack: **the Koywe integration in B is correct and
complete, while the Koywe integration in A is functionally broken.** The shared
`OffRampFlow.svelte` in A cannot drive Koywe's settlement model, and the code
silently produces a self-send that never reaches the anchor (evidence below).
That a brand-new anchor doesn't actually work end-to-end through the shared
machinery is the single most damning fact in this comparison, and it is a direct
consequence of the unified-interface design forcing every provider through a
fixed set of archetypes.

Margin: **clear/strong**, not marginal. B is not merely "cleaner"; A ships a
non-working flow for the freshest integration.

---

## Evidence by goal

### Goal 1 — Portable, copy-paste-friendly anchor clients

**B wins.**

- B's `KoyweClient` (`wt-koywe-bespoke/src/lib/anchors/koywe/client.ts`, 522 LOC)
  is fully self-contained: it defines its own `KoyweError`, its own types, and
  depends only on `@stellar/stellar-sdk` (for `StrKey` pubkey validation,
  client.ts:33,198). A builder copies `client.ts`+`types.ts`+`index.ts` and is
  done. The class header even says so (client.ts:1-31).
- A's `KoyweClient` (`wt-koywe-interface/src/lib/anchors/koywe/client.ts`, 788
  LOC) imports **20 named types plus `AnchorError`** from `../types`
  (client.ts:33-56). To lift it out you must also carry `anchors/types.ts` — an
  **897-line** shared contract (`wt-koywe-interface/src/lib/anchors/types.ts`)
  that models SPEI, PIX, BlindPay wallet registration, Transfero inline identity,
  SEP-24 interactive sessions, KYC requirement discovery, etc. — almost none of
  which Koywe uses. The portability claim in A's own CLAUDE.md ("copy it into any
  TypeScript project") is true only if you copy the entire 897-line union of
  every anchor's needs.
- The 788 vs 522 LOC gap for the *same* anchor is the adaptation tax: A's client
  spends real code translating Koywe's native shape into the shared
  `Quote`/`OnRampTransaction`/`PaymentMethodOption` vocabulary (e.g. inverting
  the exchange-rate convention to match `QuoteDisplay`, client.ts:518-522;
  re-deriving `KycStatus` from account completeness to fit the shared enum).

### Goal 2 — Demo app as builder inspiration (clear, instructive flow code)

**B wins, and it is not close.**

- B's `routes/anchors/koywe/onramp/+page.svelte` (503 LOC) reads top-to-bottom
  as *one* Koywe story: connect → check KYC → pick rail → amount → quote →
  pay → poll. No capability flags, no `{#if pi.type === 'spei'}` branches for
  rails Koywe will never use. A builder learning "how do I integrate an anchor
  like Koywe" reads exactly one file and sees exactly that anchor.
- A's equivalent is `OnRampFlow.svelte` (669 LOC) + `OffRampFlow.svelte` (865
  LOC), each a multi-anchor switchboard. `OnRampFlow` renders SPEI, PIX, *and*
  generic instruction branches in one template (OnRampFlow.svelte:497-560),
  gates a sandbox-simulation block on `capabilities?.sandboxFiatSimulation`
  (590), conditionally shows payment-method radios on
  `selectablePaymentMethods` (368), and threads SEP-10 `ensureAuth()` for
  wallet-auth anchors that Koywe isn't (129-142). To understand Koywe's flow you
  must mentally subtract every other anchor's behavior. That is the opposite of
  instructive.
- A's `OffRampFlow.svelte` hard-codes **three** settlement archetypes in
  `signAndSubmit`/`createOffRamp` (OffRampFlow.svelte:376-387): immediate
  signable XDR, deferred-signing-via-poll, and build-payment-locally. This is
  inherently a "read all anchors at once" artifact.

### Goal 3 — Low-friction, scalable path to ADD a new anchor (the Koywe test)

**B wins on the most important axis: blast radius.**

Diffstat of the Koywe commit in each worktree tells the whole story.

- **B (bespoke):** Koywe added *new* files only — its own routes
  (`routes/api/anchor/koywe/{quotes,onramp,offramp,order,kyc,payment-methods}`),
  its own pages, its own `api/koywe.ts` wrapper, its own
  `server/koyweInstance.ts`. The only pre-existing files touched are the four
  **config** files (`anchors.ts`, `rails.ts`, `regions.ts`, `constants.ts`) —
  which *both* models edit identically. **Zero edits to any other anchor's code
  and zero edits to any shared runtime contract.**
- **A (interface):** Koywe forced edits to shared, cross-cutting code:
  - `anchors/types.ts` (+74): new `WirearFiatAccountInput`, new
    `PaymentMethodOption`, new `selectablePaymentMethods` capability, new
    `paymentMethodId` on `GetQuoteInput`/`CreateOnRampInput`, new
    `paymentInstructions` on `OffRampTransaction`. A single anchor grew the
    contract that **27 files** import (verified: 27 files reference
    `anchors/types`, spanning components, routes, stores, config, every anchor).
  - `OnRampFlow.svelte` (+90): the shared flow now carries Koywe's per-rail
    selection UI for *all* providers.
  - `anchorFactory.ts`, the generic `quotes/+server.ts`, `fiat-accounts/+server.ts`,
    and a new shared `payment-methods/+server.ts`.

  Every existing anchor (Etherfuse, testanchor) now rides on a contract and flow
  components that changed for Koywe. They keep passing tests, but the *coupling*
  is real and grows monotonically with each new anchor.

**The clinching finding — A's Koywe off-ramp is broken:**

Koywe settles off-ramps by the user *sending* USDC to a Koywe-provided deposit
address and then submitting the Stellar tx hash. A's client even has the method
for it — `submitOffRampTxHash` (client.ts:782) — but it is declared **outside**
the `Anchor` interface, so it is unreachable: `grep` finds **no** API route, no
`api/anchor.ts` wrapper, and **no** reference in `OffRampFlow.svelte` to
tx-hash / deposit-address settlement. Worse, A's Koywe `createOffRamp` sets
`OffRampTransaction.stellarAddress = input.stellarAddress` — the **user's own
wallet** (client.ts:688) — and puts the real Koywe deposit address in
`paymentInstructions`. The shared `OffRampFlow`, seeing no `signableTransaction`
and `deferredOffRampSigning:false`, falls into its terminal `else` branch and
builds a payment **to `transaction.stellarAddress`** (OffRampFlow.svelte:384-387,
413-422) — i.e. the user pays themselves; the funds never reach Koywe and the tx
hash is never submitted. The off-ramp cannot complete.

B wires this correctly end-to-end:
`routes/anchors/koywe/offramp/+page.svelte:158-181` →
`signAndSubmit(order.depositAddress, order.sourceAmount)` →
`buildPaymentTransaction` → `submitTransaction` → `koywe.submitTxHash(order.id, hash)`.

This is the decisive demonstration of the thesis: when a new anchor's real
mechanics don't match the shared archetypes, the unified model doesn't gracefully
extend — it produces a plausible-looking but wrong integration, because the path
of least resistance is "make it fit the existing flow" rather than "model what
the anchor actually does."

### General code health

- **Reuse done right (B):** B does NOT just duplicate blindly. It extracts the
  *genuinely* common mechanics into small, honest primitives:
  `utils/poll.svelte.ts` (a reactive `createPoller` replacing hand-rolled
  interval/timeout/count in every page) and `api/http.ts` (`createApiRequester`
  factory shared by all per-anchor wrappers). This is the right seam: share the
  plumbing, keep the *flow* bespoke. A's reuse is at the wrong altitude — it
  shares the flow itself, which is exactly the part that diverges per anchor.
- **Dead surface (A):** `anchors/types.ts` still carries capability flags for
  removed anchors — `requiresBlockchainWalletRegistration`,
  `requiresAnchorPayoutSubmission`, `blockchainWalletId` (BlindPay),
  `RampIdentity`/`identity` (Transfero). The shared contract accretes vocabulary
  that never gets cleaned up because deleting from a 27-importer contract is
  risky. Bespoke types die with their anchor.
- **File sizes:** A concentrates complexity in a few large shared files
  (OffRampFlow 865, OnRampFlow 669, types 897, api/anchor.ts 608). B spreads it
  into many single-purpose files. Both are "big," but B's big files are each
  about one anchor; A's big files are about all anchors at once.
- **Tests:** A 578 / B 477. A's higher count is mostly shared page-spec tests
  for the generic routes; it is not evidence of better Koywe coverage (B's Koywe
  client test is a healthy 503 LOC vs A's 624, both thorough). Both suites pass
  clean (`pnpm test:run`: A 24 files/578; B 23 files/477). Crucially, **A's tests
  pass despite the broken off-ramp** — the unit tests exercise the client in
  isolation, not the shared-flow wiring where the break lives. That is itself a
  cautionary signal about the interface model: the contract is green, the
  integration is red.
- **Multi-user nuance (a point FOR A):** A's Koywe client is genuinely
  multi-tenant — it keys auth tokens by per-call email, parses JWT `exp`, and
  retries once on 401 (client.ts:172-252). B's client bakes in a single fixed
  sandbox email (`koyweInstance.ts:17`) and caches one token for the client
  lifetime. A's client is the more production-shaped artifact in isolation. But
  this capability is driven by the `Anchor` contract's multi-customer assumption,
  and it does not offset a flow that doesn't work.

---

## Strongest counter-argument to my own verdict

The honest case for A:

1. **The break is a bug, not a paradigm verdict.** A's off-ramp could be fixed
   by adding one capability flag (e.g. `offRampViaDepositAddress`) and one branch
   in `OffRampFlow`, plus a tx-hash route. The interface didn't *prevent*
   correctness; this integration just wasn't finished. If you fix that one bug,
   you keep A's benefits: a single place to add cross-cutting features (every
   anchor instantly gets a new shared step), uniform API routes
   (`/api/anchor/[provider]/*`), runtime facet negotiation, and a real shared
   contract that catches drift at compile time across 27 files.

2. **At N anchors, duplication compounds in B.** B already shows it: the
   on-ramp/off-ramp/poll/quote scaffolding is copy-pasted per provider (Etherfuse
   pages, Koywe pages, testanchor pages all repeat the same skeleton). A
   security fix or a UX improvement to the ramp flow is one edit in A and N edits
   in B. For a project explicitly trying to scale to many curated anchors, that
   is a genuine long-term cost the bespoke model never amortizes.

3. **Type safety across the app.** A's shared contract means a component, a
   route, and a client can't disagree about what a `Quote` is. B's per-anchor
   types mean each page re-derives a `displayQuote` adapter inline
   (onramp/+page.svelte:66-79) — small, but repeated, and unchecked across
   anchors.

**Why it doesn't move me:** Counter-argument (1) actually *strengthens* the
bespoke case. The fact that the shared flow silently mis-settled rather than
failing to compile is the failure mode of the unified model — it invites
"make-it-fit" integrations, and the very generality that's supposed to help
produced a wrong result that unit tests didn't catch. The recurring pattern
across both flow components (3 hard-coded off-ramp archetypes, SPEI/PIX/generic
on-ramp branches, capability-flag soup) shows this isn't a one-off; the model
keeps absorbing per-anchor divergence into shared code until it eventually can't,
and Koywe is where it couldn't. Counter-argument (2) is the legitimate cost of B
and the reason this is "strong" rather than "overwhelming" — but the project is a
**starter pack / builder reference**, where copy-paste isolation and read-one-
file clarity are the product, not an anti-pattern. B already proves you can share
the *mechanics* (`poll.svelte.ts`, `http.ts`) without sharing the flow.

---

## Specific findings & recommendations

**If the project keeps B (recommended):**
- Address the duplication head-on by extracting more *mechanism* primitives the
  way `poll.svelte.ts` already does — e.g. a `<RampShell>` layout, a shared
  SEP-10 `ensureAuth` helper, a `signAndSubmit` wallet util — without unifying
  the *flow state machines*. Keep the "one file per anchor flow" property.
- B's Koywe client is single-user (`koyweInstance.ts:17`). Before production,
  lift the fixed email to a per-request/per-customer scope like A's client does
  (client.ts token-by-email map is a good reference pattern to port).
- B's `KoyweClient.supportedCurrencies` lists 6 currencies
  (client.ts:79) but only ARS is wired in routes/pages — trim or clearly mark
  aspirational.

**If the project keeps A:**
- **Blocker:** fix the Koywe off-ramp. `submitOffRampTxHash` (client.ts:782) is
  unreachable; `createOffRamp` mis-assigns `stellarAddress` (client.ts:688);
  `OffRampFlow`'s terminal `else` self-sends. Add an explicit deposit-address
  settlement archetype + tx-hash route, and add an integration-level test that
  exercises the shared flow (not just the client), since the current unit tests
  pass over this break.
- Garbage-collect dead capability flags in `anchors/types.ts`
  (`requiresBlockchainWalletRegistration`, `requiresAnchorPayoutSubmission`,
  `blockchainWalletId`, Transfero `identity`) now that those anchors are gone.
- Treat `OffRampFlow.svelte` (865) and `OnRampFlow.svelte` (669) as the real
  risk centers — every new anchor's quirks land here.

**Verdict restated:** Worktree B is the better foundation for this project as it
now sits. It satisfies all three stated goals, isolates change to one provider,
shares mechanics rather than flows, and — decisively — actually ships a working
Koywe integration where Worktree A does not.
