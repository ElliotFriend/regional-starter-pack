# Agent 3 Review — `experiment/eff-anchor-interface` vs `v1.0.0`

## Bottom line up front

The experiment is the better state **for Goal #1**. The unified `Anchor` interface in `v1.0.0` is an attractive idea that does not survive contact with real anchors: it forces every paste-target user to drag a 655-line shared `types.ts` containing PIX/SPEI discriminated unions, RampIdentity, KycRequirements, AnchorCapabilities, and the lossy mappings between every provider's domain language and the "shared" vocabulary. The experiment's per-provider clients hand a developer one self-contained directory with the provider's own native vocabulary, and they go.

For Goal #2 the picture is messier. v1 has dramatically less Svelte code thanks to `OnRampFlow`/`OffRampFlow` driving five providers from one component — but those components are riddled with `if (capabilities?.requiresBankBeforeQuote)`-style branches that document, in code, that the abstraction is leaking. The experiment trades that compression for per-provider flow pages that read top-to-bottom like real integration tutorials.

Recommendation: the experiment direction wins, but the experiment as-currently-shipped is also overbuilt in several places that should be trimmed before this becomes the official direction.

## Empirical paste-target test — Etherfuse

Same procedure on each side: scratch dir, `pnpm install @stellar/stellar-sdk typescript`, minimal `tsconfig.json` (`"moduleResolution": "Bundler"`, `lib: ["ES2022", "DOM"]`), copy the etherfuse anchor in, write a `scratch.ts` that stubs `globalThis.fetch` and calls `createCustomer`. Goal: `npx tsc --noEmit` clean and `npx tsx scratch.ts` prints OK.

### Experiment branch — `/tmp/scratch-3-experiment`

Steps:

1. `cp -r /tmp/round6-experiment/src/lib/anchors/etherfuse .` (3 TS files: `client.ts`, `types.ts`, `index.ts`).
2. Wrote `scratch.ts`: `import { EtherfuseClient, EtherfuseError, type EtherfuseCustomer } from './etherfuse';`
3. `npx tsc --noEmit` — **clean on first try, no edits to copied files**.
4. `npx tsx scratch.ts` — `OK: created customer 2b288f78-...`. The stubbed `/ramp/onboarding-url` response flowed through; `EtherfuseError` was importable; the public-key validator (StrKey) caught a bogus key and validated a real one.

Files copied along: **0**. (Only the `etherfuse/` directory.) The 652-line `etherfuse/types.ts` is self-contained: `EtherfuseError`, `EtherfuseConfig`, `EtherfuseCustomer`, request/response shapes, the SPEI/PIX deposit discriminated union — all named with the `Etherfuse` prefix. There is no `../types` import. The client speaks Etherfuse's actual language (`sourceAsset`/`targetAsset`, `orderId`, `presigned_url`) and the test was naturally written in that language too.

### v1.0.0 — `/tmp/scratch-3-v1`

Steps:

1. `cp -r /tmp/round6-v1/src/lib/anchors/etherfuse .` — same starting point.
2. Wrote `scratch.ts`: `import { EtherfuseClient, type Customer } from './etherfuse';`
3. `npx tsc --noEmit` — **9 errors**. Headline: `etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'` (twice, for the type-only and value imports of `AnchorError`); plus six `'err' is of type 'unknown'` errors which only surface in a standalone strict project (they are silenced in the host repo by `@sveltejs/kit`'s ambient/strictness configuration; I treated them as part of the paste-target friction).
4. Adapted: `cp /tmp/round6-v1/src/lib/anchors/types.ts ./types.ts` and updated `tsconfig.json` to include it. The relative import `../types` from inside `etherfuse/` now resolves to the dropped file.
5. `import type { Customer } from './etherfuse'` — fails. v1's `etherfuse/index.ts` only re-exports `EtherfuseClient`. Edited scratch to `import type { Customer } from './types'`.
6. `npx tsc --noEmit` — clean (the `unknown`-typed error narrowings turned out to be tolerated by my tsconfig since `useUnknownInCatchVariables` defaults true but the catch blocks already check `err instanceof AnchorError`; the original failures actually came from the missing `../types` resolution cascading. Worth flagging that this can bite.)
7. `npx tsx scratch.ts` — `OK: created customer cb1d2303-...`

Files copied along: **1** (`types.ts`, 655 lines).

### What the paste-test reveals

This is the difference: the v1 user has to copy `types.ts`. That file is not just types for Etherfuse — it carries `PixPaymentInstructions`, `SpeiFiatAccountInput`, `PixFiatAccountInput`, `RampIdentity` (for Transfero), `AnchorCapabilities` (15 fields, almost all named after non-Etherfuse providers: `requiresBlockchainWalletRegistration` is BlindPay, `deferredOffRampSigning` is Etherfuse, `requiresAnchorPayoutSubmission` is Abroad/Transfero). The paste-target user gets all of it, even though they only want Etherfuse.

More substantively, the names in v1 don't match the Etherfuse API. v1 maps `EtherfuseQuoteResponse.destinationAmountAfterFee` to a `Quote.toAmount` field — fine for the demo app, painful for a developer who wants to read the Etherfuse OpenAPI spec and follow along. The experiment's `EtherfuseQuote.sourceAsset/targetAsset/destinationAmount/feeBps` is one-to-one with what `/ramp/quote` returns. **If a developer copies one file and wants to confirm what it does against vendor docs, the experiment is dramatically easier to verify.**

The experiment also exposes Etherfuse-only methods naturally (`acceptAgreements`, `simulateFiatReceived`, `submitKycIdentity`, `acceptElectronicSignature`) without them sticking out as "this anchor breaks the interface". v1 has the same methods on `EtherfuseClient` — they're appended after the `Anchor` interface methods, and the comment block literally calls them out as "beyond Anchor interface".

## Goal #2 — flow pages

Read end-to-end:

- v1 `/tmp/round6-v1/src/lib/components/OnRampFlow.svelte` (436 lines) is one file driving all five providers, plus `OffRampFlow.svelte` (767 lines).
- Experiment `/tmp/round6-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte` (711 lines) is dedicated to Etherfuse.

The compression in v1 is real and meaningful. The flow components are well-factored (split into `AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus` primitives). Adding a new SEP-6 anchor probably costs zero Svelte code in v1.

But the v1 components carry the cost of the abstraction in their bodies. From `OffRampFlow.svelte`:

```
if (capabilities?.requiresBankBeforeQuote) { … }
} else if (capabilities?.deferredOffRampSigning) { … }
if (capabilities?.requiresAnchorPayoutSubmission) { … }
```

Nine capability branches. Several of these flags are named for one anchor (`requiresBlockchainWalletRegistration` exists for BlindPay; `deferredOffRampSigning` exists for Etherfuse). They're documentation that the unified interface couldn't actually unify these flows. The component is closer to a switch-statement-by-capability-flag than a shared abstraction.

The experiment's per-provider flow pages have no capability flags, because they don't need them — the etherfuse on-ramp page handles iframe KYC and the deferred bank account because it IS the Etherfuse page. A developer trying to learn how Etherfuse's iframe KYC integrates can read this page top to bottom and have a complete mental model. The v1 equivalent requires understanding the abstraction, the capability flags, AND the Etherfuse implementation details that the flags gesture at.

For **Goal #2 specifically** (demo as inspiration for other builders), the experiment wins despite being more code. The 711 lines per page read like a tutorial; the 436+767 lines of `*Flow.svelte` read like a framework you have to learn before you can reuse anything.

## Code shape — what feels forced vs natural

**v1 forces:**

- `Anchor` interface methods that several anchors don't truly support. Etherfuse's `registerFiatAccount` requires a presigned URL the user gets from a separate onboarding call; the v1 implementation hides this by re-calling `getKycUrl` inside `registerFiatAccount`. AlfredPay's email-based customer lookup vs Etherfuse's pubkey-based onboarding both squeeze into `GetCustomerInput { customerId?, email?, country? }`. Both "work" but the union shape advertises a flexibility that isn't there.
- The `capabilities` object is the surface area for "the interface doesn't fit". Flags like `requiresBankBeforeQuote`, `deferredOffRampSigning`, `requiresAnchorPayoutSubmission` are documentation that this anchor breaks the linear flow. Each new anchor adds capability flags; existing flows must learn them.
- `src/lib/constants.ts` has `ALFREDPAY_KYC_STATUS` — provider-specific constants in a shared module. That's a smell.
- v1 doesn't wire `testanchor` through the Anchor interface at all. The original `TestAnchorClient` is a separate SEP playground at `/testanchor`. So the "unified interface" already excluded the only SEP-compliant anchor in the project. That's the strongest single piece of evidence that the interface didn't generalize: even the test/reference anchor couldn't conform.

**Experiment forces:**

- Per-provider API routes are duplicated. `routes/api/anchor/etherfuse/quotes/+server.ts` mirrors the same five-step pattern (parse body → call client → wrap error) that `routes/api/anchor/testanchor/...` will mirror, and so on. The experiment has thinner duplicated route handlers; v1 has one parametric handler per operation. For Goal #2 this isn't great — adding a Koywe route means writing N new route files instead of one.
- The CLAUDE.md on the experiment branch describes a "faceted Anchor model" with `programmatic`/`interactive`/`auth` facets and claims testanchor implements all three. **The code does not match.** There is no `Anchor` interface, no facets, no shared `types.ts` in `src/lib/anchors/` at all. testanchor's `ramp.ts` is a bespoke SEP-wrapper. This is concerning drift: docs say one thing, code does another. If the experiment is adopted, the docs need a rewrite.
- `src/lib/anchors/sandbox.ts` is dead code in the experiment (no importers). Trivial to delete but indicates this branch hasn't been pruned yet.
- Provider-specific server singletons (`etherfuseInstance.ts`, `testanchorInstance.ts`) duplicate boilerplate that v1's switch statement consolidated. Two files now; if a Koywe gets added, three. The boilerplate is small per file but the duplication will compound.

**What feels natural in the experiment:**

- `EtherfuseClient.getQuote` returns `EtherfuseQuote` with `sourceAsset`, `targetAsset`, `destinationAmount`, `feeBps?: string` — exactly the Etherfuse REST shape. A user grepping the Etherfuse docs sees the same names.
- `EtherfuseError` distinct from a generic `AnchorError`. When a Koywe paste-target user catches `EtherfuseError`, they know it's not catching Koywe errors.
- `EtherfuseClient.simulateFiatReceived` is a method on the client, not a special path. Same for the agreement-acceptance methods. No "is this part of the interface or not?" question.

## Adding a Koywe integration

**v1:** Implement `Anchor` against Koywe's `partnerships-crypto.koywe.com` API (USDC ↔ ARS). Either KYC and bank-account semantics map naturally onto the existing `Anchor` surface — in which case great — or they don't, in which case you either (a) add more `AnchorCapabilities` flags and gate behavior in `OnRampFlow`/`OffRampFlow`, (b) accept some lossy mapping, or (c) add methods that sit "beyond Anchor interface" like Etherfuse's agreements do. Then add Koywe to `anchorFactory.ts` (one line), `constants.ts` `PROVIDER`, `config/anchors.ts`. Flow pages are free.

**Experiment:** Write `src/lib/anchors/koywe/{client,types,index}.ts` with bespoke names (`KoyweQuote`, `KoyweOrder`, …). Add `koyweInstance.ts` singleton. Write 1–8 `+server.ts` route handlers under `routes/api/anchor/koywe/`. Write `routes/anchors/koywe/onramp/+page.svelte` (~700 lines, copy-paste from etherfuse and adapt). Write `koywe.ts` in `lib/api/`. That's ~12–20 new files vs ~5 for v1.

**The trade.** v1 has lower marginal cost per anchor if the anchor fits cleanly. When it doesn't (the historical pattern with Etherfuse's deferred signing, BlindPay's wallet registration, Transfero's inline identity, Abroad's payout submission — every single anchor required a new capability flag in v1), v1's cost is "one flag plus a branch in shared flows". The experiment's cost is "one more directory of provider-bespoke code". The experiment cost is higher per anchor but contained — it doesn't spread.

The five anchors in v1's `src/lib/anchors/` (etherfuse, alfredpay, blindpay, abroad, transfero) total **4,103 lines of client code** plus the shared 655-line `types.ts`. The experiment's two clients total **1,535 lines**. Even excluding the 5-vs-2 difference, the per-anchor average is ~820 in v1 (with abroad being the outlier at 364), ~770 in experiment. The "shared types" overhead in v1 saves you nothing per anchor; it adds cross-cutting fragility.

## Drift surfaces and maintenance risk

**v1 drift surfaces:**

1. **The capability flag set.** Every new anchor with new ergonomics pushes a new flag; every existing flow that "should be capability-aware" must learn it. Easy to miss.
2. **The shared `types.ts` is the contract for five anchors.** Changing `Customer`, `Quote`, `OnRampTransaction` shapes is a five-anchor breaking change.
3. **The lossy mappings in each anchor.** When Etherfuse adds a new field, the maintainer's first question is "do I extend the shared `Quote` or do I expose it as a side method?" There is no clear rule.
4. **`constants.ts` has provider-specific constants** (`ALFREDPAY_KYC_STATUS`). Pattern is already broken.

**Experiment drift surfaces:**

1. **Drift between provider clients and each other.** No shared interface = nothing prevents Etherfuse's `getQuote` from differing from Koywe's `getQuote` in stupid ways (parameter naming, error class shape). Reviewers must catch this.
2. **Drift between docs and code.** Already happening: CLAUDE.md describes facets, code has none. This is the most concrete current risk.
3. **Per-provider API routes diverge over time.** Five providers × eight operations × independent maintainers = entropy. v1's single switch was a forcing function.

## 2–3 specific risks for each

### v1 risks

- **The interface lies.** Etherfuse's `Anchor.createOnRamp` takes `CreateOnRampInput { fromCurrency, toCurrency, amount, … }` but Etherfuse doesn't use these — it uses the quoteId that already embeds the currency pair. Code currently works because Etherfuse ignores the fields, but the API contract advertises a contract the implementation doesn't honor.
- **TestAnchor isn't in the interface.** The reference SEP-compliant anchor that everything else in the Stellar ecosystem speaks couldn't conform. That's a damning signal about whether the abstraction is real or wishful.
- **Adding facets later is hard.** If you decide tomorrow you need SEP-10 wallet auth (the experiment's `auth` facet idea), you have to either add `getChallenge`/`submitChallenge` to the base `Anchor` (every implementation must stub them out) or invent the facet split anyway — which is what the experiment's CLAUDE.md claims has happened (incorrectly).

### Experiment risks

- **CLAUDE.md is wrong.** This will trip the next developer. The docs claim a faceted interface that does not exist in code.
- **Code duplication will compound.** Five anchors × this current pattern is a lot of route files, singletons, api modules. The experiment has only two anchors; the v1 had five. Maintaining ten more `+server.ts` files for the next three anchors is real work.
- **Nothing enforces consistency between providers.** A Koywe contributor and an Etherfuse contributor with no shared interface can end up with `EtherfuseQuote.fee: string` and `KoyweQuote.fee: number` and there's no compiler error. Good code review can catch this; the type system can't.

## What would change my mind

1. **A v1 maintainer demonstrates that adding the sixth anchor required zero new capability flags and zero new `if (capabilities?.…)` branches in shared flow components.** That would mean the interface is finally stable and the abstraction is real. The history in v1's source (every existing anchor needed a new flag) suggests the opposite, but a clean sixth integration would be strong counter-evidence.

2. **A real Goal #1 paste-target user reports that copying `etherfuse/` + `types.ts` was easier than they expected because the shared types let them reuse code they were going to write anyway** — e.g. they're integrating two anchors and the shared types made step #2 trivial. That would flip the Goal #1 calculus.

3. **The experiment's flow pages converge on a shared sub-component library that lets a per-provider page be ~150 lines instead of ~700.** If the experiment's per-page bloat can be brought down close to v1's, the trade-off (per-provider clarity vs total LOC) tilts decisively to the experiment. Without that, Goal #2 fans have a fair argument that v1's compression is worth its abstraction tax.
