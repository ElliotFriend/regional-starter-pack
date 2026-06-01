# Agent-2 review — round 5

## Naming note

The prompt's description of which state is which is **swapped**. The directory
labelled `/tmp/round5-v2` is the one with the shared `Anchor` interface
(`src/lib/anchors/types.ts`), capability flags, parameterised routes, and
shared `OnRampFlow`/`OffRampFlow` components. `/tmp/round5-experiment` is the
per-provider bespoke version with no shared types, no shared interface,
per-provider routes and per-provider flow pages. I verified by reading the
code. I use the prompt's names below.

## Bottom line up front

For **Goal #1 (copy-paste-friendly anchor code)** the experiment is meaningfully
better. The Etherfuse client has zero dependencies on cross-anchor abstractions
— a single API-shape vocabulary, a single `EtherfuseError`, a single directory
to copy. For **Goal #2 (the demo app)** the v2 state is meaningfully better.
One `OnRampFlow.svelte` of ~430 lines drives every anchor; the experiment
forks the entire UI per anchor (711 lines for the etherfuse on-ramp page alone,
~1100 more for testanchor on/off ramps once you factor in interactive +
programmatic variants).

Weighted 60/40 toward Goal #1, I'd ship the experiment shape — but only with
a clear-eyed acknowledgement of the UI duplication cost (see "what would change
my mind").

## Empirical paste-target test — Etherfuse

I ran the test on Etherfuse for both states. Setup was identical: scratch dir
+ minimal `tsconfig.json` + `npm install @stellar/stellar-sdk typescript
@types/node` + a `scratch.ts` that stubs `globalThis.fetch` and calls
`getQuote()`.

**Experiment**: copied `anchors/etherfuse/{client.ts,types.ts,index.ts}` — three
files in one flat directory. `npx tsc --noEmit` exited 0 once I matched the
Etherfuse-native arg names (`fromAsset`/`toAsset`/`sourceAmount`). `tsx
scratch.ts` ran. One external dep (`@stellar/stellar-sdk`), one internal
sibling import (`./types`).

**v2**: copied the same three plus `anchors/types.ts` into the parent dir
(because client.ts imports `'../types'`). Four files, two-tier layout. `tsc
--noEmit` passed; `tsx scratch.ts` ran.

### Verdict on the paste test

Closer than I expected. v2's pain isn't file count — it's directory shape:
client.ts says `'../types'`, so the consumer has to either preserve the
two-tier layout or rewrite the import path. Experiment's imports are all
siblings, so three files into one flat folder Just Works.

The subtler difference: v2's client surface is shared abstract vocabulary
(`Customer`, `Quote`, `CreateOnRampInput`); experiment's is the provider's
native vocabulary (`EtherfuseCustomer`, `EtherfuseQuote`,
`CreateOnRampOrderArgs`). For a "I just want Etherfuse" copy-paste, the
native vocabulary maps 1:1 to Etherfuse's docs and is easier to debug. For
multi-anchor systems, the shared vocabulary saves work. Goal #1 is the
former, so experiment wins here.

## Goal #2 — reading the flow pages

v2's `OnRampFlow.svelte` (426 lines) is genuinely shared: it reads `anchor.id`,
`capabilities`, `primaryToken`, `fiatCurrency` from a single
`+layout.server.ts` and uses `capabilities?.deferredOffRampSigning`,
`capabilities?.requiresBankBeforeQuote`,
`capabilities?.fiatAccountRegistration` to branch off-ramp behaviour
(`OffRampFlow.svelte` lines 82, 119, 325, 483). New anchors that fit the
existing capability vocabulary cost little UI work.

Experiment's `etherfuse/onramp/+page.svelte` (711 lines) is hard-coded
Etherfuse: a `Step = 'onboarding' | 'amount' | 'quote' | 'payment' |
'complete'` machine, KYC iframe polling, region derivation, sandbox buttons,
all in Etherfuse vocabulary. Single-purpose, easy to read top-to-bottom — but
`testanchor/programmatic/onramp/+page.svelte` is a separate 440-line file
with its own (similar but not identical) state machine. Testanchor alone
ships **four** ramp pages (`{interactive,programmatic}/{on,off}ramp`).

Goal #2 cost on experiment: ~1500 more `.svelte` lines per new anchor.

## Code shape — what feels forced vs natural

### v2 feels forced

- `AnchorCapabilities` has 11 flags (`requiresBankBeforeQuote`,
  `deferredOffRampSigning`, `requiresAnchorPayoutSubmission`,
  `fiatAccountRegistration`, …) for one curated anchor. Each flag is a leaky
  bit of Etherfuse-specific behaviour pretending to be a generic capability.
- `Customer` carries optional `bankAccountId` (Etherfuse) and
  `blockchainWalletId` (BlindPay, which has been removed). The shared type
  is already a union of provider-specific fields.
- `RampIdentity` exists for Transfero, which isn't even in the codebase.
  The interface is paying for hypothetical anchors.
- `anchorFactory.ts` only registers etherfuse — testanchor never made it
  into the `Anchor` interface. The unified-anchor story is incomplete even
  for two integrated providers.

### v2 feels natural

- `EtherfuseClient implements Anchor` is compiler-enforced.
- `[provider]` dynamic route + `+layout.server.ts` is tight, idiomatic
  SvelteKit. Nowhere for drift to live.
- Etherfuse test file is 3889 lines (vs experiment's 1157) — much of the
  extra weight is asserting the shared-shape contract, which is reusable
  for the next provider's tests.

### experiment feels natural

- Each client speaks the provider's wire vocabulary 1:1. Etherfuse's
  `getQuote(fromAsset/toAsset/sourceAmount)` matches the REST docs.
- `EtherfuseError`, `TestAnchorSepUnsupportedError` are real types you can
  `instanceof` with confidence.
- `testanchorInstance.ts` has `bearerToken(request)`/`requireBearer(request)`
  next to the singleton — SEP-10-specific, no pretense of generality.
- Per-provider routes match the client's body shape exactly; no shared
  schema to diverge from.

### experiment feels forced

- `testanchor/` ships two parallel clients (`TestAnchorClient` for the
  `/testanchor` SEP playground, `TestAnchorRampClient` for the curated
  `/anchors/testanchor` flow). Two clients aimed at one anchor.
- A 4-way cartesian product per dual-facet anchor:
  `testanchor/{interactive,programmatic}/{on,off}ramp/+page.svelte`, all
  sharing ~80% logic.
- No shared customer store — experiment dropped v2's `customer.svelte.ts`,
  so each per-provider page re-implements localStorage caching.

## Adding Koywe (the next anchor)

Koywe = programmatic, SEP-10-authed, ARS↔USDC on Stellar.

**On v2**: write `anchors/koywe/{client.ts,types.ts,index.ts}` implementing
`Anchor`; immediately hit the fact that `Anchor` has no `auth?: string`
parameter on methods — retrofit the interface (the faceted refactor mentioned
in the project memo) or smuggle the token elsewhere. Probably add a Koywe
capability flag or two for Argentine quirks. Register in `anchorFactory.ts`,
`constants.ts`, `config/anchors.ts`, `config/regions.ts`. Shared
`OnRampFlow`/`OffRampFlow` mostly just work. Effort: ~70% client, ~25%
interface surgery, ~5% UI.

**On experiment**: write `anchors/koywe/{client.ts,types.ts,index.ts}` in
Koywe's own vocabulary. Write `api/koywe.ts`, `server/koyweInstance.ts`, ~7
route handlers under `api/anchor/koywe/`, and 2 `+page.svelte` files (~1100
lines, mostly find-and-replace from etherfuse). Add config. Effort: ~30%
client, ~60% UI/route duplication, ~10% config.

Experiment trades interface-wrangling for UI duplication. At small N (≤3)
the per-page model is fine because each page is simple and self-contained.
At large N, cross-cutting UX changes (telemetry, error toasts, a11y) have to
be made in N places. Roadmap has 5 total in view — experiment still works
but starts to hurt.

## Drift surfaces

**v2**: (1) the capability-flag wallpaper — every new weird anchor either
adds a flag or breaks the interface, blast radius is the shared flow. (2)
the `[provider]/quotes/+server.ts` body destructure has 7 optional fields
to accommodate every anchor's quote inputs (only 2 are integrated). (3)
the project's own memo describes a planned faceted refactor
(`ProgrammaticOps`/`InteractiveOps`/`WalletAuthOps`) — meaning the current
unified `Anchor` is already known to be wrong for the next anchor.

**experiment**: (1) UI drift — the four testanchor ramp pages already show
micro-divergences in their `Step` unions. (2) Each `+server.ts` has its own
ad-hoc validation; forgetting a check on a new anchor's route is easy. (3)
The two-track testanchor (`TestAnchorClient` + `TestAnchorRampClient`) is
already a documentation hazard.

## Specific risks

**v2:**
1. **Premature abstraction trap** — the interface is shaped around Etherfuse +
   removed providers (BlindPay, Transfero). The faceted refactor described in
   the project memo exists because the current shape doesn't fit Koywe.
2. **Hidden Etherfuse-isms in shared code** — `OffRampFlow.svelte` line 325's
   `if (capabilities?.deferredOffRampSigning)` is provider-specific code in a
   generic uniform. Each new quirk either copies the pattern or forces a
   generalisation that risks breaking Etherfuse.
3. **Silent Goal #1 failure mode** — a developer copying `etherfuse/` and
   forgetting `../types.ts` gets a TypeScript error, not a friendly README
   pointing at the missing file. The README mentions the shared interface
   but doesn't list `types.ts` as a required file to copy.

**experiment:**
1. **UI rot** — per-page state machines accumulate bugs independently.
   Etherfuse and testanchor/programmatic polling logic are already subtly
   different. Bug fixes don't propagate.
2. **No compiler safety net** — a new anchor client can omit a capability the
   demo app expects; the contract is socialised through docs and tests, not
   the compiler.
3. **Singletons don't compose** — `getEtherfuse()`/`getTestAnchor()`/eventually
   `getKoywe()`/`getCoins()`; no generic `getAnchor(provider)` for
   cross-cutting concerns (admin route, healthcheck, audit log).

## Recommendation

**Ship the experiment shape.** Goal #1 weights the decision: a developer
copying `anchors/etherfuse/` into their Next.js project gets three flat files
with one external dependency and an API that matches the Etherfuse docs
verbatim. v2 only beats it by a single extra file, and pays for that with
an Etherfuse-shaped abstract interface that's already creaking under one
provider's edge cases.

Cost is real: ~1500 duplicated Svelte lines per anchor. If the roadmap
settles at 5 anchors that's 5–10k extra lines — manageable, but only with
discipline. The current experiment isn't disciplined: testanchor ships four
near-identical ramp pages today.

I'd accept the experiment **and** carve out one obvious shared primitive —
probably a `RampStateMachine` module that handles the
`input → quote → payment → polling → complete` arc and lets each provider
inject the anchor-specific work at each step. Low-cost middle ground, no
`Anchor` interface required, kills the worst of the UI duplication.

## What would change my mind

1. **If Koywe + Coins.ph share the SEP-10/SEP-12/SEP-24 vocabulary closely
   enough that a single `SepAnchor` interface fits both without new flags**
   — v2's abstraction would be earning its keep on 60-80% of the curated
   set. Zero data points on this yet; testanchor is the only SEP-compliant
   one integrated.
2. **A scratch-script test where `EtherfuseClient` and `TestAnchorRampClient`
   are swapped in one line via the shared `Anchor` type, and the swap saves
   meaningful code.** That's the multi-anchor benefit my paste test couldn't
   measure. If demonstrable, the v2 abstraction is paying for itself and
   Goal #1 ranking flips.
3. **A public commitment to ≥5 curated anchors within 6 months.** UI
   duplication compounds linearly with N; the capability-flag tax plateaus
   once flags cover the common ground. Two anchors is too few to settle
   the question; five would.
