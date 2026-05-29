# Agent 1 — Independent Review (Round 5)

> CLAUDE.md in the experiment branch describes a faceted `Anchor` interface,
> but no `src/lib/anchors/types.ts` exists there — experiment is bespoke
> per-provider clients (`EtherfuseClient` + `EtherfuseError`, `TestAnchorRampClient`
> composing SEP modules, fully independent). v2.0.0 is the unified-interface
> state with a 667-line `types.ts` and `EtherfuseClient implements Anchor`.
> That matches the user's task description, so I align there. The CLAUDE.md
> drift is itself a finding.

## TL;DR

For Goal #1 (paste-target), **the experiment branch wins outright**. The
Etherfuse client copies as 3 files with one external dep, zero cross-directory
imports, its own error class, and its own types. `v2.0.0` copies as 4 files
because `EtherfuseClient` imports `../types` — and the user must replicate the
parent-relative directory layout for `tsc` to resolve it.

For Goal #2 (demo app), **v2.0.0 wins**. One pair of flow components
(`OnRampFlow.svelte`, `OffRampFlow.svelte`) drives every provider through a
dynamic `[provider]` route, with capability flags branching the few
divergences. The experiment branch ships ~2,600 lines of mostly-similar Svelte
across six dedicated page files, and the drift is already visible (different
quote field names, slightly different state machines, divergent error wrappers).

Goal #1 is weighted 60% and the gap there is concrete and demonstrable.
**I recommend the experiment branch's anchor-package shape, with the
v2.0.0 flow components grafted back on top.**

---

## 1. Empirical paste-target test

Both tests target `EtherfuseClient`. Real stub for `globalThis.fetch`, real
Stellar public key, real `@stellar/stellar-sdk` install.

### Test A — experiment branch

Steps:

1. `cp -r /tmp/round5-experiment/src/lib/anchors/etherfuse /tmp/scratch-experiment-r5a1/etherfuse` — 3 files (`client.ts`, `types.ts`, `index.ts`, plus a README).
2. Grep for cross-directory imports (`from '../'`): **zero hits**. The only external import is `@stellar/stellar-sdk`.
3. Write `scratch.ts` that imports `EtherfuseClient` and `EtherfuseError` from `./etherfuse`, stubs `globalThis.fetch`, calls `createCustomer({ publicKey, email, country })`.
4. Minimal `tsconfig.json` (strict, ES2022, Bundler resolution), `npm i @stellar/stellar-sdk typescript @types/node tsx`.
5. `npx tsc --noEmit -p tsconfig.json` → **zero errors first try**.
6. `npx tsx scratch.ts` → ran end-to-end. Got a real `EtherfuseError` with `code: 'INVALID_PUBLIC_KEY'` from `StrKey.isValidEd25519PublicKey` validation when I used a placeholder pubkey, then swapped for a valid one and saw the client log its POST, call the stub, parse the response, return a customer object.

Findings: self-contained (client + types + index); provider-local `EtherfuseError` reachable via index; `export type * from './types'` so one import path covers everything.

### Test B — v2.0.0

Steps:

1. `cp -r /tmp/round5-v2/src/lib/anchors/etherfuse /tmp/scratch-v2-r5a1/etherfuse`.
2. Grep imports — found `import { AnchorError } from '../types'` and `import type { … } from '../types'`. **One cross-directory import**.
3. Wrote `scratch.ts` importing `EtherfuseClient` + (incorrectly) `Customer` from `./etherfuse`.
4. First `tsc --noEmit`: **8 errors**. Six TS18046 (`err is of type 'unknown'` — these are pre-existing strict-mode regressions inside `client.ts` itself, not paste-related; they reproduce on the source repo with the same tsconfig), two TS2307 `Cannot find module '../types'`, and one TS2305 because `Customer` isn't re-exported from `./etherfuse`.
5. Copied `/tmp/round5-v2/src/lib/anchors/types.ts` (667 lines) up one level so `../types` resolves. Adjusted `scratch.ts` to import `Customer` and `AnchorError` from `'./types'`.
6. `tsc --noEmit`: **passes**. `tsx scratch.ts`: ran end-to-end like the experiment version.

Findings: 4 files; directory layout matters (`etherfuse/` must sit one level below `types.ts`); user learns two import paths (`'./etherfuse'` for client/provider types, `'./types'` for shared types + `AnchorError`). The 6 pre-existing TS18046 `err: unknown` errors inside `client.ts` surface on fresh strict configs but reproduce in both states.

### Empirical scorecard (Goal #1)

|                           | experiment | v2.0.0                       |
|---------------------------|------------|-------------------------------|
| Files copied              | 3          | 4                             |
| Cross-dir imports         | 0          | 1 (`../types`)                |
| Layout the user must mirror | none     | parent-relative               |
| Import paths              | 1          | 2                             |
| Provider-local error class | yes       | no (shared `AnchorError`)     |
| First-try `tsc --noEmit`  | clean      | 8 errors (6 pre-existing remain after fixing layout) |
| Runtime smoke             | passed     | passed                        |

experiment is faster to paste, less surprising, error class travels with it.

---

## 2. Goal #2 — demo app assessment

I read end-to-end:
- `/tmp/round5-v2/src/lib/components/OnRampFlow.svelte` (426) +
  `OffRampFlow.svelte` (799) + `RampPage.svelte` (460) + the per-provider
  `[provider]/[direction]/+page.svelte` (17 lines, just composes the above).
- `/tmp/round5-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte` (711)
  end-to-end, then skim of `offramp/+page.svelte` (759), `testanchor/programmatic/onramp/+page.svelte` (440), `testanchor/interactive/onramp/+page.svelte` (332).

**v2.0.0** is the better Svelte demo: one place to improve UX, every provider
gets it; capability-flag branching in `OffRampFlow.svelte` (~11 references) is
heavy but localized and each branch maps to a real protocol difference;
`+layout.server.ts` centralizes anchor/region/capabilities. Testanchor is the
awkward stepchild — `/testanchor` is a 934-line monolith outside the Anchor
interface. v2 doesn't try to force it in, which is honest.

**experiment** gives absolute fidelity to each anchor's natural API shape —
`EtherfuseQuote.sourceAsset/sourceAmount`, native SEP-38 fields, no mapping.
You can see the cost of that: the etherfuse on-ramp page (lines 81-95) builds
a `displayQuote = $derived(...)` adapter so `QuoteDisplay` accepts it. That's
exactly the adaptation v2 hides inside the client. Penalty: ~2,600 lines of
Svelte across six pages with near-identical step machines, polling loops,
sandbox simulate buttons, and error handling. The textbook duplication tax.

One genuine experiment win: programmatic vs interactive pages live
side-by-side, which makes the SEP-6 vs SEP-24 archetype difference visible in
a way v2's capability flags actively hide. As a *demo*, that's a real
teaching artifact.

Net: v2 has a moderate Goal-#2 edge, narrower than I expected.

---

## 3. Code shape — where each feels forced vs natural

**v2.0.0 natural**: `page.data.capabilities` is exactly how SvelteKit wants
shared UI wired. `anchorFactory.ts` is a clean DI seam. The `Anchor` interface
reads like a competent SDK contract (discriminated `PaymentInstructions`,
separate input/output types, good JSDoc).

**v2.0.0 forced**: `Anchor` is already leaking provider specifics into the
contract — `capabilities` has 12 flags, several single-provider semantics
(`deferredOffRampSigning`, `fiatAccountRegistration`, `requiresBankBeforeQuote`).
`Customer` carries optional Etherfuse-`bankAccountId` + BlindPay-`blockchainWalletId`
fields. `types.ts` is 667 lines for paste-targets to vendor. Testanchor doesn't
fit — the unified interface only unifies one anchor.

**experiment natural**: each client is itself; field names match the upstream
API; provider-shaped error codes; the README ships *inside* the package.
Pasteability is a design goal you feel in the file layout.

**experiment forced**: six near-identical Svelte pages; two server-side
singleton modules instead of one factory; the `displayQuote = $derived(...)`
adapter in each provider page is a textbook "you needed an abstraction here"
smell.

---

## 4. Adding the next anchor (Koywe, programmatic, ARS)

**v2.0.0**: implement `KoyweClient implements Anchor` (forces ARS quirks
through shared types — extend `Quote` or hide it); add `CbuPaymentInstructions`
discriminant; register in factory; add config. **No new components, no new
routes.** ~5-6 files touched. Possibly one new capability flag.

**experiment**: create `anchors/koywe/`, `server/koyweInstance.ts`,
`api/koywe.ts` (~225 LOC), 7-8 thin route handlers, three new Svelte pages
including two ~700-LOC ramp pages that are 80% the same as Etherfuse's.
~15-18 files. Duplication concentrated in pages and routes.

Goal #1: same cost per client; experiment ships a cleaner artifact.
Goal #2: v2 wins decisively for the third anchor onward — marginal cost
near-zero vs roughly constant.

---

## 5. Drift surfaces and maintenance risk

**v2.0.0**: `AnchorCapabilities` is already 12 flags at 2 providers — Koywe +
Coins.ph + PDAX *will* add more. LCD types (`Customer` already carries
provider-specific optional fields) force cap-flag branching in shared UI to
use them. Hidden coupling: a Koywe-only behavior in `OffRampFlow.svelte` lands
as a new flag + new branch in shared code, and one anchor's test can break
another's render path.

**experiment**: 2,600-line page-level duplication risks subtle drift between
on-ramp/off-ramp behavior across providers; no shared error contract (UI
catches `Error` and pulls `.message`, losing the provider's `code`/`statusCode`);
server-side singleton modules grow linearly. CLAUDE.md is already wrong about
the architecture — that's meta-drift, a forward indicator the branch is
mid-flight, not the destination.

---

## 6. Three specific risks each

**v2.0.0**: (1) the third anchor will hurt — capability flags sprout, shared
types accumulate required-for-one-anchor optional fields; (2) testanchor
sitting outside the Anchor system is load-bearing — when Coins.ph (SEP-24)
lands, you'll either widen `Anchor` for interactive flows or duplicate the
side-channel; (3) 667-line `types.ts` is the paste-target's vendor tax, full
of types they didn't write for providers they don't use.

**experiment**: (1) N-way drift across flow pages — KYC polling, sandbox
simulate-fiat, error rendering already exist twice, about to exist 4× with
testanchor pages, every UX polish gets applied N times; (2) no unified error
story — UI can't reliably switch on error codes across providers; (3) doc
drift signals the branch is mid-flight.

---

## 7. Bottom line

60/40 toward paste-friendliness. The empirical test makes the Goal-#1
delta concrete: **3 files, 0 cross-dir imports, clean first-try `tsc`** vs
**4 files, 1 cross-dir import, layout-sensitive resolution**.

**Recommended direction**: keep experiment's anchor-package shape
(self-contained, provider-named errors, no shared `types.ts`) and **port
v2.0.0's flow components back on top**. The flows don't need a shared SDK
contract — they need a page-level adapter (per-provider in
`$lib/api/[provider].ts`) that exposes a `QuoteShape`/`TransactionShape`
view. Goal #1 maximized (independent paste-clean folders); Goal #2 preserved
(shared flow components survive); `AnchorCapabilities` becomes per-page UI
metadata, not SDK contract.

If forced to pick as-is: **experiment** — Goal #1 is primary and the demo
can be re-shared later, but a tightly-coupled unified interface is hard to
break apart once five anchors depend on it.

---

## 8. What would change my mind

I'd flip toward v2.0.0 if:

1. **The shared `Anchor` absorbs the next 1-2 anchors with ≤1 new capability
   flag and no new optional fields on `Quote`/`Customer`.** If Koywe and
   Coins.ph slot in without bloating `AnchorCapabilities` past ~14 fields
   and without growing `Quote`, the unified-interface tax is affordable and
   the demo win dominates.

2. **A real downstream user paste-targeted v2's `etherfuse/` + `types.ts`
   and shrugged at the 4-file/cross-dir layout.** It's a friction point, not
   a blocker — "5 minutes finding where `types.ts` goes," not "fails to
   compile." If real users don't notice, my weighting was wrong.

3. **Per-page duplication in experiment is actually necessary specialization,
   not cosmetic drift.** If etherfuse's UX *must* look fundamentally different
   from testanchor's, the unified `OnRampFlow.svelte` would need a capability
   branch of comparable size — making the duplication a wash. I didn't see
   strong evidence of this (the step machines are near-identical), but a
   side-by-side diff of just the unique logic per page would settle it.
