# Architectural review: `main` vs `experiment/eff-anchor-interface`

**Reviewer:** Agent 1 (independent)
**Date:** 2026-05-28
**Verdict up front:** **`experiment` is the better foundation for this project.** Not by a small margin, and not because the unified-interface design is bad — it isn't — but because the project's *stated goals* (paste-friendly clients + builder inspiration) are actively undermined by the abstraction layer, and the test anchor case proves it. The experiment branch's main weakness — flow-page duplication — is fixable with focused component extraction. Main's abstraction tax is structural and gets worse with every new anchor.

---

## Goal #1: copy-paste-friendly clients

This is the project's stated north star. Pick a single client file from each branch and read it as if you were going to drop it into a Node CLI.

### Main: `src/lib/anchors/etherfuse/client.ts` (935 lines)

Open the file and the first thing you see is an import block pulling 16 types from `../types` (`Anchor`, `ProgrammaticOps`, `Customer`, `Quote`, `CreateCustomerInput`, …). If you paste this file into a new project, **none of it compiles** until you also bring `src/lib/anchors/types.ts` (826 lines). And you can't trim `types.ts` — it carries cross-anchor concepts (`BlindPay`, `Transfero`, `RampIdentity`, `KycRequirementsQuery`, `GenericPaymentInstructions`, `SpeiFiatAccountInput`, `PixFiatAccountInput`) that have nothing to do with Etherfuse. A user copying this gets *a Mexican stablebond client wired through a Brazilian PIX KYC abstraction and a SEP-12 binary-document field shape they will never touch*.

Worse, the public surface is misshapen by the abstraction. The `createCustomer` method internally takes `CreateCustomerInput` (`main_etherfuse_client.ts:385`), which has `taxIdCountry?: string` and `name?: string` — fields Etherfuse can't use. The on-ramp `createOnRamp` takes `CreateOnRampInput` with a generic `amount: string` and `fromCurrency`/`toCurrency` strings, then maps them internally via `resolveAssetPair`. The user reading the source can't tell from the type which fields Etherfuse actually requires.

The implementation is also *bifurcated*: the public surface is `programmatic: ProgrammaticOps` (`main_etherfuse_client.ts:106-118`), which is a hand-built object delegating to private methods. That means the developer has to mentally trace `etherfuse.programmatic.createCustomer(input)` → arrow function in a field initializer → private `this.createCustomer` → `this.request`. Three layers of indirection for one HTTP call.

### Experiment: `src/lib/anchors/etherfuse/client.ts` (796 lines)

Same file, on the experiment branch. The import block at the top is *all from `./types`* — the entire module is self-contained. Drop the three-file `etherfuse/` folder into a Node CLI and it just works. The README at `src/lib/anchors/etherfuse/README.md` (11KB) even calls this out explicitly: "Copy `client.ts`, `types.ts`, and `index.ts` together into any TypeScript project."

The public methods are direct: `createCustomer(args: CreateCustomerArgs)`, `getQuote(args: GetQuoteArgs)`, `createOnRampOrder(args)`. The arg types are Etherfuse-shaped — `EtherfuseRail = 'spei' | 'pix'`, `EtherfuseKycStatus` with the exact five values Etherfuse returns, `EtherfuseTokenInfo` with `fiatCurrency: 'MXN' | 'BRL'` and `rail: EtherfuseRail`. A reader knows immediately what the API actually offers.

There's no `implements Anchor`. No `programmatic: ProgrammaticOps = { ... }` delegating wrapper. Methods are public methods on a class. The 796 lines do the same work as main's 935.

### Test anchor: an even sharper contrast

Main's `testanchor/anchor.ts` (888 lines, see `/tmp/main_testanchor_anchor.ts`) is the worst case of forced abstraction in the codebase. It's an *adapter wrapping an adapter*: SEP modules → `TestAnchorAdapter implements Anchor` → three facets (`auth`, `programmatic`, `interactive`) → arrow-fn delegates → `private` helpers. The whole point of SEP is that it's *already* the unified interface; bolting another unified interface on top is genuinely redundant. `main_testanchor_anchor.ts:430-560` is full of code like

```ts
createOnRamp: async (input: CreateOnRampInput, auth?: string): Promise<OnRampTransaction> => {
    const token = this.requireAuth(auth, 'createOnRamp');
    // ...12 lines of mapping CreateOnRampInput → SEP-6 params...
    const response = await sep6.deposit(transferServer, token, { ... });
    // ...10 more lines mapping the response back to OnRampTransaction...
}
```

The experiment branch's `testanchor/ramp.ts` (355 lines) just exposes SEP directly: `sep6Deposit(token, request: Sep6DepositRequest)`, `sep24Deposit(token, request: Sep24DepositRequest)`. A reader sees the actual SEP shapes — `pending_customer_info_update`, `required_info_updates`, `more_info_url`. **For a project whose audience is builders integrating SEP anchors, this is a dramatic win.** They're seeing the spec, not a layer over the spec.

### Goal #1 winner: experiment, by a wide margin.

---

## Goal #2: the demo app as builder inspiration

The argument *for* the unified interface is that the app code becomes the inspiration: one `<OnRampFlow />` component that works for every provider shows builders "look how easy it is when you abstract well." Look at the actual file.

### Main: `src/lib/components/OnRampFlow.svelte` (581 lines) + `OffRampFlow.svelte` (865) + `InteractiveRampFlow.svelte` (320) + `RampPage.svelte` (545)

That's **2,311 lines of shared component**. They read `page.data.anchor.id`, `page.data.capabilities`, `page.data.requiresWalletAuth`, `page.data.flowStyles`, `page.data.activeRegion`, `page.data.primaryToken`, `page.data.fiatCurrency`. They branch on `if (transaction.requiredInfo)`, `if (capabilities.deferredOffRampSigning)`, `if (mode === 'interactive')`. The KYC step is a separate `KycForm.svelte` that takes a `KycRequirements` discriminated by `mode: 'file_upload' | 'url_reference'`.

These components are *the abstraction collapsing into runtime conditionals*. They're harder to read than per-provider code because at every junction you have to ask "which provider's path is this serving?" A builder lifting them learns the project's capability-flag model — not the anchor API.

Look at `RampPage.svelte:42-52` on main: there's a whole `ensureAuth()` flow inside a layout-y wrapper that *quietly does nothing for Etherfuse* because `requiresWalletAuth` is false. The dead-code branch lives in the component forever.

### Experiment: per-provider bespoke pages

- `routes/anchors/etherfuse/onramp/+page.svelte` — 711 lines
- `routes/anchors/etherfuse/offramp/+page.svelte` — 759 lines
- `routes/anchors/testanchor/programmatic/onramp/+page.svelte` — 440 lines
- `routes/anchors/testanchor/programmatic/offramp/+page.svelte` — 458 lines
- `routes/anchors/testanchor/interactive/onramp/+page.svelte` — 332 lines
- `routes/anchors/testanchor/interactive/offramp/+page.svelte` — 340 lines

Total: **3,040 lines** vs main's 2,311. That's the cost.

But — read one of them. `routes/anchors/etherfuse/onramp/+page.svelte:30-42` declares region/token derivation inline as plain Etherfuse: `const tokenSymbol = $derived(region === 'brazil' ? 'TESOURO' : 'CETES')`. The state machine on line 48 is `'onboarding' | 'amount' | 'quote' | 'payment' | 'complete'` — exactly the steps a builder needs to implement. The whole page is *one mental model deep*: Etherfuse customer → Etherfuse KYC iframe → Etherfuse quote → Etherfuse SPEI/PIX deposit instructions. A builder lifting this gets a working Etherfuse on-ramp end-to-end.

The testanchor pages are even cleaner. Line 14: `import * as ta from '$lib/api/testanchor'`. Line 56: `const challenge = await ta.getChallenge(fetch, walletStore.publicKey)`. Line 119: `deposit = await ta.sep6Deposit(fetch, token, { asset_code: 'SRT', funding_method: 'bank_account', ... })`. **The page reads like the SEP spec.** That is *exactly* the inspiration a SEP integrator needs.

### Goal #2 winner: experiment, less decisively, but still clear.

The unified components on main *would* be ideal inspiration if the project's actual mandate were "build a generic ramp UI." It isn't — it's "show builders how to integrate each anchor." Per-provider pages serve that better even at +30% lines, because the lines are *signal*, not abstraction plumbing.

---

## Code shape: where it feels forced, where it feels natural

### Forced on main

- `types.ts:780-800` — the `Anchor` interface with three optional facets. The mandatory comment "at least one of `programmatic`/`interactive` must be present" cannot be expressed in the type system. Every call site narrows: `if (anchor.programmatic) { ... }`. The factory exposes `requireProgrammatic(provider)` and `requireInteractive(provider)` precisely to hide that.
- `anchorFactory.ts:requireProgrammatic` throws at runtime. This is a type guard the type system can't help with.
- `OffRampFlow.svelte` is 865 lines partly because it has to handle both `capabilities.deferredOffRampSigning` (Etherfuse polls for an XDR) and the SEP-6 "build XDR locally" path (test anchor pre-builds via Horizon). That's the same operation through two completely different state machines, jammed into one component.
- The KYC story is the worst: `KycRequirements` shape, `KycRequirementsQuery` for SEP-12 discovery, `KycForm.svelte` rendering a generic field array, `kycFlow: 'form' | 'iframe' | 'redirect'` capability flag. This abstraction exists to handle three concrete cases (Etherfuse iframe, BlindPay form, test anchor SEP-12 fields), of which BlindPay is now removed. The cost is permanent; the payoff was always one provider's specifics.

### Forced on experiment

- The testanchor `programmatic` vs `interactive` route subtrees both implement the same wallet-connect → SEP-10 auth flow. ~50 lines of `ensureAuth()` plumbing is repeated in each of the four testanchor pages.
- The two Etherfuse pages each redeclare the `CETES_ISSUER`/`TESOURO_ISSUER` constants and the region→fiat/token derivation. That's 12 lines duplicated.
- The `displayQuote` adapter struct (`etherfuse/onramp/+page.svelte:81-95`) is *because* `QuoteDisplay.svelte` was kept as a shared primitive with a generic shape. Mild leak from the abstraction era.

### Natural on main

- The `sep/` library itself. It's framework-agnostic, well-tested, and survives unchanged on the experiment branch. This is the part of the abstraction that wasn't speculative.
- The discriminated union `PaymentInstructions = SpeiPaymentInstructions | PixPaymentInstructions | GenericPaymentInstructions` — clean shape that handles three real rails.
- `KycStatus` and `TransactionStatus` enums as a normalized vocabulary across providers. (Though see *Risks* — they were normalized prematurely.)

### Natural on experiment

- Self-contained per-anchor packages. `anchors/etherfuse/{client,types,index}.ts` truly does paste-and-go.
- The split between `TestAnchorClient` (the SEP playground demo) and `TestAnchorRampClient` (the curated ramp) is intentional and clean; main's "adapter wraps client wraps SEPs" stack collapses to two purpose-built clients.
- The two-tier server factory (`etherfuseInstance.ts` 22 lines, `testanchorInstance.ts` 34 lines) is dramatically simpler than main's 126-line `anchorFactory.ts` with its provider union, capability requires, and bearer-token plumbing.

---

## Adding the next anchor: hypothetical Koywe

### On main

1. Implement `Anchor` in `src/lib/anchors/koywe/client.ts`. Decide which facets to provide (Koywe is programmatic).
2. Map Koywe's customer/quote/order shapes into `Customer`/`Quote`/`OnRampTransaction`. **Lossy** — Koywe's ARS-specific fields and rate context must be flattened or stuck on `metadata`.
3. Pick `AnchorCapabilities` flags. Decide whether ARS warrants new fields on `AnchorCapabilities` (`requiresIdNumber`? `argentinaTaxId`?). If yes, you're modifying a shared interface that affects every existing provider's type-check.
4. If KYC differs from existing providers, extend `KycFieldRequirement` or `KycRequirements`.
5. Add `'koywe'` to `AnchorProvider` union in `anchorFactory.ts` and to `isValidProvider`. Add a case to `getAnchor`. Add to the factory tests.
6. The unified API routes (`/api/anchor/[provider]/*`) "just work" — but only if the new provider fits the existing endpoint contracts. Koywe's quote sequencing (it requires a customer ID up front for FX rates) is awkward to expose via the existing `/quotes` route.
7. Existing `OnRampFlow.svelte` *should* render correctly... unless Koywe needs a new step. If so, add another `capabilities.X` flag and another `{#if}` branch.

**Most-likely real outcome:** the abstraction holds for the happy path, but a 2-day integration becomes 4 days of "where should this leak through the abstraction" decisions, plus a permanent extra capability flag that only Koywe uses.

### On experiment

1. `src/lib/anchors/koywe/{client,types,index}.ts`. Self-contained. Write it to fit Koywe's API exactly.
2. `src/lib/server/koyweInstance.ts`. 20 lines.
3. `src/routes/api/anchor/koywe/{customers,quotes,onramp,offramp}/+server.ts`. Each ~40-50 lines. Copy from `etherfuse/` and adjust to taste.
4. `src/lib/api/koywe.ts`. 200 lines. Copy from `api/etherfuse.ts`, rename, adjust shapes.
5. `src/routes/anchors/koywe/{onramp,offramp}/+page.svelte`. Yes, ~700 lines each (probably less — Koywe has simpler KYC). Copy the etherfuse pages and edit. **The Koywe builder lifting just `koywe/` gets working code immediately.**

**Most-likely real outcome:** more code total (maybe +400 LOC over main), zero coordination across the codebase, no shared-interface decisions, no capability-flag debate. Adding Koywe doesn't perturb anything else. The Koywe pages diverge from the Etherfuse pages exactly where Koywe's API differs.

The experiment approach scales *linearly with provider count*. Main's approach scales linearly *too*, but with a coordination tax: every new provider risks bending the shared interface, and every existing provider has to re-validate against it.

---

## Maintenance over time

### What breaks easily on main

- **Capability flag drift.** `AnchorCapabilities` has 13 fields. Six are used by only one provider. Adding the 14th for Koywe is technically free, but it's a one-way ratchet — nothing ever gets removed.
- **The `requiredInfo`/`awaitingCustomerInfo` fields on `OnRampTransaction`/`OffRampTransaction`** (types.ts:266-279) are SEP-6-specific concepts that leak into the shared shape because the test anchor needs them. Etherfuse will never set them, but every component must defensively handle them. Drift between concept and use will widen.
- **The "delegated facet" pattern.** `programmatic: ProgrammaticOps = { createCustomer: (input) => this.createCustomer(input), ... }`. Easy to forget a method, hard to type-check that the delegation is exhaustive (TypeScript will catch it via `implements Anchor`, but only because `Anchor` enforces the shape). New optional methods on `ProgrammaticOps` won't get added to existing clients automatically.
- **The shared flow components.** A bugfix for Etherfuse's polling logic in `OnRampFlow.svelte` will be evaluated against the test anchor's polling logic in the same component. Subtle regressions are easy.

### What breaks easily on experiment

- **Cross-cutting policy changes drift.** Want to change the poll interval from 5s to 3s for all providers? It's now a find-replace across six page files. No worse than the current Etherfuse-only state, but worse than main.
- **Bug found in one provider's flow page** may exist in two-or-more provider pages and require fixing all of them. Mitigation: factor the polling/auth/wallet-connect helpers into shared utilities (the experiment already keeps `WalletConnect`, `KycIframe`, `QuoteDisplay`, `AmountInput`, `TrustlineStatus`, `CopyableField` shared).
- **The anchors/README.md is now stale** — it still describes the unified `Anchor` interface in detail. Documentation drift is a real cost. The two provider READMEs were updated; the parent wasn't.
- **Test coverage took a hit.** The etherfuse test went from 3902 → 1157 lines, and the 589-line testanchor adapter test was deleted outright. Some of that is right-sizing (testing fewer adapter mappings), but it deserves a second look before merge.

### Verdict on maintenance

Both have drift risks. Main's are systemic (any new provider reshapes the shared types); experiment's are local (any cross-cutting change touches each provider). For a codebase that's positioned as *showcase* rather than *production library*, local drift is preferable — it's visible and contained.

---

## Risks specific to each approach

### Main (unified interface) — 3 risks

1. **The next anchor will bend the interface.** Koywe needs a customer ID before a quote. PDAX might not exist on Stellar at all in the form expected. Coins.ph's interactive-only model is already a stretch for `InteractiveOps`. Each new anchor is a vote on whether to widen the abstraction or add another capability flag. There is no off-ramp.
2. **The faceted model is conceptually elegant but practically lossy.** SEP-10/SEP-6/SEP-24 are conceptually a single integration story for SEP anchors. Splitting them into three facets makes the test anchor easier to fit into the type-system grid but harder for a reader to understand. The adapter file (`testanchor/anchor.ts`, 888 lines) is mostly mapping code — none of which the next SEP integrator wants to write or read.
3. **The shared flow components calcify around the existing two providers.** They already have Etherfuse-specific branches (`deferredOffRampSigning`, `capabilities.sandboxFiatSimulation`) and SEP-specific branches (`requiredInfo`, `awaitingCustomerInfo`). Adding Koywe will require either Koywe to fit one of these existing molds or another branch. The components are heading for unreadability.

### Experiment (bespoke) — 3 risks

1. **Duplication erodes consistency.** Subtle UX choices (poll interval, error message phrasing, how completion screens look) will diverge between provider pages. Showcase consistency is a value of its own; on the experiment branch you have to *fight* for it.
2. **Flow-page sizes are intimidating.** 700-line `+page.svelte` files are real. They're readable as one mental model deep, but they violate every modern Svelte convention about component size. A new contributor to the project will recoil. Mitigation: extract step-level sub-components (`AmountStep`, `PaymentStep`, `KycStep`) per provider — the experiment already has some at `lib/components/ramp/` but they're sparse.
3. **The shared/per-provider split is informal.** `WalletConnect`, `QuoteDisplay`, `KycIframe`, `CopyableField` remain shared. There's no rule about which primitives may live in `lib/components/` and which belong per-provider. As new providers arrive, the "common primitives" set will need active stewardship or it will rot.

---

## Two specific findings

- **The CLAUDE.md is wrong.** It describes the unified `Anchor` faceted interface in full detail — and the experiment branch deleted that interface. Update or annotate CLAUDE.md before merging or new agents will write code against the old model.
- **`src/lib/anchors/README.md` is stale on experiment.** It still describes the "two ways to integrate" model centered on the `Anchor` interface (lines 7-46). Either rewrite it to describe the bespoke-client approach honestly, or remove it. The Etherfuse and Testanchor READMEs were updated; this one wasn't.

---

## Bottom line

**Merge `experiment` and don't look back.** The unified `Anchor` interface is a *good design* for a *different project* — a production multi-anchor SDK with a stable provider set. For *this* project, which is explicitly "curated showcase + paste-friendly client library," the abstraction is the wrong tool. The experiment branch's per-anchor isolation:

- Makes each client genuinely portable (no shared-types tail to bring along).
- Makes each demo page genuinely instructive (read top-to-bottom, no capability-flag puzzle).
- Removes the runtime "narrow on facet presence" dance that the type system can't enforce anyway.
- Removes 588 net lines and a deleted adapter test, but more importantly removes ~800 lines of mapping code (`testanchor/anchor.ts`) that existed purely to bridge SEP into a non-SEP shape.

The work remaining on the experiment branch before merge:

1. Update `CLAUDE.md` and `src/lib/anchors/README.md` to reflect the new model.
2. Restore meaningful test coverage for testanchor (the 589-line adapter test is gone; whatever its successor looks like, it shouldn't be zero).
3. Consider extracting per-provider step components (`EtherfuseOnboarding.svelte`, `EtherfusePaymentStep.svelte`, etc.) to bring per-page file sizes under 400 lines without re-introducing cross-provider coupling.
4. Hold the line on "shared primitives only, no shared flows." Resist the gravitational pull of adding capability flags back.

If Koywe, Coins.ph, and PDAX all land cleanly using the experiment pattern, the case is closed. If one of them genuinely needs a shared abstraction, build it then — narrow and provider-aware — rather than maintaining a speculative one now.
