# Agent 1 — Independent Review (Round 6)

## Bottom line up front

For the project's stated priority (60% paste-friendly anchor client / 40% demo app), the **`experiment/eff-anchor-interface` state is clearly stronger**. The paste-target test is the cleanest evidence: the experiment's Etherfuse client copies as a single self-contained 3-file directory with zero non-SDK dependencies; v1's Etherfuse client needs a fourth file (`../types.ts`, 654 lines, mostly types the paste-target user doesn't care about) and pulls in the abstract `Anchor` contract whether the user wants it or not.

That said, the experiment pays a real cost on Goal #2: it ships substantially more route-page code and there's no shared flow primitive, so per-anchor flow pages duplicate state-machine plumbing. If a third programmatic anchor lands, that duplication will start to bite. Recommendation and "what would change my mind" at the end.

---

## Empirical paste-target test

I copied `src/lib/anchors/etherfuse/` out of each state into a clean scratch directory, wrote a small Node script that imports `EtherfuseClient`, stubs `globalThis.fetch`, and calls `createCustomer()`, then typechecked with a minimal `tsconfig.json` and ran via `tsx`.

### Experiment (`/tmp/scratch-experiment-fresh`)

Files copied: **3** — `etherfuse/client.ts`, `etherfuse/types.ts`, `etherfuse/index.ts`. Nothing else.

```
$ npx tsc --noEmit
(exit 0, zero diagnostics)
$ npx tsx scratch.ts
EtherfuseError: Invalid Stellar public key: GAAAAAAA...   (StrKey rejects the placeholder)
```

Imports inside the copied tree: only `@stellar/stellar-sdk` (one symbol: `StrKey`) and relative imports between `client.ts` and `types.ts`. The header of `etherfuse/types.ts` literally says "Copy this file alongside `client.ts` and `index.ts` into any TypeScript project — there are no cross-anchor dependencies", and that turns out to be accurate.

`EtherfuseClient`'s shape (`createCustomer({ publicKey, email, country })`, returning `EtherfuseCustomer`, etc.) is Etherfuse-shaped. No mapping ceremony, no `KycStatus`-vs-`EtherfuseKycStatus` confusion: a paste-target user sees the API surface their integration partner gives them.

### v1.0.0 (`/tmp/scratch-v1-fresh`)

Files copied (first attempt): **3** — same shape.

```
$ npx tsc --noEmit
etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'
etherfuse/client.ts(40,29): error TS2307: Cannot find module '../types'
```

Adding the missing `types.ts` from `src/lib/anchors/types.ts` — 654 lines defining the shared `Anchor` interface, `AnchorError`, `Customer`, `KycStatus`, `TransactionStatus`, `PaymentInstructions`, `FiatAccount*`, `OnRampTransaction`, `OffRampTransaction`, etc. — fixes it. Total files copied: **4**.

```
$ npx tsc --noEmit
(exit 0)
$ npx tsx scratch.ts
AnchorError: Invalid Stellar public key: ...
```

So v1 works as a paste target, but with friction:

1. The user must figure out from the import path `from '../types'` that there's a peer file required. The relative path encodes a layout assumption ("`etherfuse/` lives next to `types.ts`") that's easy to miss in a copy-paste.
2. The 654-line `types.ts` is overwhelmingly *not* about Etherfuse. It defines KYC, fiat-account, and ramp shapes designed to be a least-common-denominator across five providers (Etherfuse, AlfredPay, BlindPay, Abroad, Transfero). A paste-target user gets a contract they didn't ask for and now has to either keep it (with five providers' worth of `RampIdentity`, `PixFiatAccountInput`, `blockchainWalletId`, etc.) or rip it apart.
3. The client returns the project's "shared" types (`Customer`, `Quote`, `OnRampTransaction`) rather than Etherfuse-shaped ones — see the `mapOnRampTransaction` in `/tmp/round6-v1/src/lib/anchors/etherfuse/client.ts:229` that throws away `quoteId`, `fromCurrency`, `toCurrency`, `stellarAddress` (set to `""`) because the Etherfuse order response doesn't carry them. A paste-target user sees lossy types and may not realize empty strings aren't data.

### Result

v1: 4 files, 654 lines of peer types that the user mostly doesn't want, lossy `""` returns on fields the upstream API doesn't provide.

Experiment: 3 files, types match the upstream API verbatim, no peer types.

---

## Goal #2 — flow page assessment

### v1 (`OnRampFlow.svelte` 436 lines, `OffRampFlow.svelte` 767 lines, routed via `[provider]/[direction]/+page.svelte` 17 lines)

The route page is gloriously thin — 17 lines, just picks the flow component. The flow components themselves are heavy and capability-flag-driven: `capabilities?.requiresBlockchainWalletRegistration`, `capabilities?.sandbox`, `capabilities?.requiresBankBeforeQuote`, `capabilities?.deferredOffRampSigning`, `capabilities?.requiresAnchorPayoutSubmission`. The state machine has seven steps ('input' | 'quote' | 'bank' | 'awaiting_signable' | 'signing' | 'pending' | 'complete'). The component is doing the union of all anchors' needs.

`OffRampFlow.svelte` separately tracks SPEI fields *and* PIX fields *and* a generic "use saved account" path, because different providers want different things. A capability flag (`requiresBankBeforeQuote`) flips the ordering. The branches will keep growing.

For a single anchor in isolation, this is unnatural — Etherfuse never needs `requiresBlockchainWalletRegistration`. For 5+ anchors, it's the right shape and it does the job today.

### Experiment (`anchors/etherfuse/onramp/+page.svelte` 711 lines, `anchors/etherfuse/offramp/+page.svelte` 759 lines)

The route page *is* the flow — no shared component. The state machine is Etherfuse-specific: `'onboarding' | 'amount' | 'quote' | 'payment' | 'complete'`. The KYC status enum is `EtherfuseKycStatus` ("approved_chain_deploying" is a real value). There's no capability flag for sandbox — the page just calls `ef.simulateFiatReceived` because Etherfuse has sandbox.

Reading this end-to-end is meaningfully easier than reading v1's `OffRampFlow.svelte`. Every branch is "does Etherfuse need this?" not "does the anchor I'm currently dispatching to need this?" For a builder reading the demo as inspiration, the experiment is more legible.

Duplication cost is real: the testanchor pages (4 of them, programmatic × {on,off}-ramp and interactive × {on,off}-ramp) re-implement polling, error-clearing, and quote-display adaptation. They aren't identical to Etherfuse's pages — testanchor uses a different API (`/api/anchor/testanchor/...`) and SEP-10 auth — but the *shapes* of state machines repeat.

---

## Code shape — where each feels forced

**v1 feels forced** in three specific places:

1. `EtherfuseClient.mapOnRampTransaction` (`/tmp/round6-v1/src/lib/anchors/etherfuse/client.ts:229`) returns `quoteId: ''`, `fromCurrency: ''`, `toCurrency: ''`, `stellarAddress: ''` — the Etherfuse order endpoint doesn't carry these; the shared type demands them, so empty strings stand in. This is a real bug surface, not just an aesthetic complaint.
2. `AnchorCapabilities` (`/tmp/round6-v1/src/lib/anchors/types.ts:469`) defines 12 boolean flags — `emailLookup`, `kycUrl`, `sep24`, `sep6`, `requiresTos`, `requiresOffRampSigning`, `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `sandbox`, `kycFlow`. Each is a leak of a specific anchor's quirk into the abstract interface. It's the classic least-common-denominator vs. capability-flag tension and nobody wins.
3. `src/lib/api/anchor.ts` imports `AlfredPay*` types directly (`/tmp/round6-v1/src/lib/api/anchor.ts:25-31`). The "unified" client-side API still has provider-specific imports.

**Experiment feels forced** in two places:

1. `etherfuse/onramp/+page.svelte` derives `region`/`fiatCurrency`/`tokenSymbol`/`tokenIssuer`/`rail`/`currencySymbol` inline as `$derived` ternaries on `region === 'brazil'`. It's fine for two regions; the moment a third Etherfuse region shows up this should move into a lookup table or onto the client class.
2. `displayQuote` adapter inside the page (`/tmp/round6-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte:81`) reshapes `EtherfuseQuote` into a structural shape that `QuoteDisplay` accepts. Per-page adapters are a smell that the demo UI primitives don't quite know their own contract yet.

---

## Adding the next anchor (Koywe, programmatic, ARS, USDC)

**On v1**: Create `src/lib/anchors/koywe/{client.ts,types.ts,index.ts}`, implement the `Anchor` interface, add capability flags (almost certainly need at least one new one — maybe `requiresWalletProof` for SIWE-style auth). Add to `anchorFactory.ts` and `constants.ts`. Add to `config/anchors.ts` and `config/regions.ts`. The flow components mostly Just Work via `[provider]/[direction]/+page.svelte`. **If you can avoid adding a new capability flag, you ship in an afternoon.** If you need one, you also have to add a `{#if capabilities?.requiresKoyweSpecificThing}` branch to one or both flow components, and that branch is now part of the contract for every other anchor too.

**On experiment**: Create `src/lib/anchors/koywe/{client.ts,types.ts,index.ts}`. Create `src/lib/server/koyweInstance.ts`. Create `src/lib/api/koywe.ts`. Create `src/routes/api/anchor/koywe/{customers,quotes,onramp,offramp,kyc,...}/+server.ts` (5–8 files). Create `src/routes/anchors/koywe/{+page.svelte, onramp/+page.svelte, offramp/+page.svelte}`. **All of this is mechanical** — copy/adapt from etherfuse. The risk isn't difficulty, it's drift: the polling state machine, error UI, sandbox-mode rendering will subtly diverge across providers if no one extracts them.

For one new anchor: roughly comparable effort, slightly more files on experiment, slightly more thinking on v1 (about whether to add a capability flag). For ten: experiment without any factoring becomes a maintenance problem.

---

## Drift surfaces & maintenance risk

**v1**: The contract drifts away from any single anchor's reality. Every new anchor either fits into the shared types — at the cost of mapping lossiness (the `''`-string bug pattern) — or it forces a new capability flag. Capability flags rot into knots (`if (a && !b) ... else if (b && c) ...`). The Etherfuse client in v1 is 908 lines vs. 796 in experiment — most of the delta is mapping ceremony.

**Experiment**: Flow pages drift. Today the testanchor `programmatic/onramp` page and the etherfuse `onramp` page solve very similar problems differently. Six months from now they'll be solving them more differently. The fix is normal refactoring (extract a `useRampStateMachine` hook or a `<RampScaffold>` slotted component), but it requires discipline that the v1 design *enforces*.

---

## Risks

**v1 (three):**

1. **Lossy mapping bugs.** The `''` empty strings in `mapOnRampTransaction` will be wrong when a downstream consumer relies on `transaction.fromCurrency` being populated. Already shipped.
2. **Capability-flag explosion.** Each new anchor adds at least one flag; flow components grow more branches and become harder to reason about.
3. **The contract is a barrier for paste-target users.** They get a contract they didn't ask for, in a sibling file they didn't realize they needed.

**Experiment (three):**

1. **Page duplication will increase.** Without a shared scaffold, the third programmatic anchor will be 700 lines of near-identical polling code.
2. **`QuoteDisplay`-style structural reshaping inside pages.** A page-local adapter (`displayQuote`) is a smell; over time these adapters will diverge.
3. **No formal contract for anchors.** A maintainer who hasn't read both providers can't easily see "what must any anchor implement". Documentation has to carry the load that v1's interface used to carry.

---

## Recommendation

Ship the experiment shape. The paste-target test — Goal #1, weighted at 60% — is decisively cleaner: 3 files vs. 4, no peer-type baggage, types that match the upstream API, no lossy mapping. The demo-app cost (Goal #2) is real but recoverable through normal refactoring — extract a `<RampScaffold>` or a state-machine module *after* a third programmatic anchor lands, when the right abstraction is visible. The v1 cost (a contract baked into copy/paste output, lossy mappings, capability-flag knots) is harder to claw back because the abstraction is fixed at the front of the user's journey.

A pragmatic middle: keep the experiment's per-anchor independence as the public-facing shape; let *internal* helpers (e.g. shared polling logic, a shared `QuoteDisplay` shape that providers map *into*) emerge from `src/lib/components/` and `src/lib/utils/` rather than from a shared `Anchor` interface. The demo app gets to share code without contaminating the paste-target.

---

## What would change my mind

1. **Evidence that paste-target users actually want the `Anchor` interface.** If someone integrating Etherfuse said "I love that I can also drop in BlindPay later without rewriting my call sites," the unified-contract argument wins. So far the contract looks designed for the demo app's needs, not the paste-target user's. A real success story would flip me.
2. **A capability-flag set that stabilizes.** If `AnchorCapabilities` has been constant for two new anchors in a row (i.e. Koywe and Coins.ph add zero new flags), the abstraction is paying its rent. Right now the flag set keeps growing with each integration, which is the failure mode.
3. **A clean way to make the `Anchor` interface tree-shakeable / paste-only.** If `src/lib/anchors/types.ts` were split into a small `core.ts` (just the shapes Etherfuse actually returns) and a `unified.ts` (the cross-provider abstraction), so a paste-target user could ignore the latter, v1's footgun goes away. Today they're coupled.
