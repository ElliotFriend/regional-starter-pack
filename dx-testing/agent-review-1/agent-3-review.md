# Agent 3 — Independent Review: `main` vs `experiment/eff-anchor-interface`

## Bottom line up front

**`experiment/eff-anchor-interface` is the better branch for this project's stated goals**, but it has not finished the job. It serves Goal #1 (copy/paste-friendly clients) clearly better, and probably serves Goal #2 (builder inspiration) better as well — at the cost of ~3000 lines of duplicated route code that *will* drift if not actively managed. The right move is to keep going down this path, but harden two specific things before declaring victory: (a) shared `<script>` modules for the polling/auth/wallet patterns that are now copy-pasted across six page files, and (b) restoring meaningful test coverage on the testanchor client (the experiment dropped `tests/anchors/testanchor/anchor.test.ts` entirely — 589 lines — and shrank `tests/anchors/etherfuse/client.test.ts` from 3902 → 1157 lines, a 70% cut). The headline numbers — **`+6592 / −12521 ≈ 5,929 net lines deleted**, 70 files touched — overstate the win because much of the deletion is test code, but the architectural simplification under that is real and good.

---

## Goal #1 (portable clients): experiment wins, decisively

Pretend I'm pasting one client into a Node CLI tool I'm writing for a hackathon. I open one file and want to call the anchor.

### `main`'s Etherfuse client (`src/lib/anchors/etherfuse/client.ts`, 935 lines)

The first thing I see is `implements Anchor`, followed by a 50-line capability-flag block (`kycFlow: 'iframe'`, `deferredOffRampSigning: true`, `fiatAccountRegistration: 'hosted'`, etc.) and a `programmatic: ProgrammaticOps = { createCustomer: (input) => this.createCustomer(input), ... }` adapter object that re-binds every method. Every method takes an input of type `CreateCustomerInput | GetQuoteInput | …` imported from `../types`, mapping back and forth between the Etherfuse API shape and the shared shape. Even the error type is `AnchorError` from `../types`, not an Etherfuse type. To use this in my Node CLI I need:
- `client.ts` itself
- `types.ts` (Etherfuse-specific types) 
- `../types.ts` (the 825-line shared interface — most of which I don't need)

So copying this is "copy one file" only if I'm willing to inherit a 825-line shared-types file describing 4 capability facets, KycRequirementsQuery, PaymentInstructions discriminated unions, RampIdentity, FiatAccountInput, and concepts (interactive sessions, wallet auth) that have nothing to do with Etherfuse. The class signature `implements Anchor` constrains the API surface to the lowest common denominator: `getQuote(input: GetQuoteInput)` takes `fromAmount`/`toAmount` because *some other anchor* might price-by-receive — Etherfuse can't.

### `experiment`'s Etherfuse client (`src/lib/anchors/etherfuse/client.ts`, 797 lines)

The class is `EtherfuseClient` — no `implements`. Methods read like the Etherfuse docs: `createOnRampOrder(args: CreateOnRampOrderArgs): Promise<EtherfuseOnRampOrder>`, returning a domain type named after the actual concept ("order", not "transaction"; "bankAccount", not "fiatAccount"). Error type is `EtherfuseError`. Mapping helpers (`mapOnRampOrder`, `buildDepositInstructions`) are module-private functions, not methods, so they're easy to keep or strip. The header comment is explicit: "copy `client.ts`, `types.ts`, and `index.ts` together into any TypeScript project." That promise is real — there's no `../types` import; the only external dep is `@stellar/stellar-sdk` for `StrKey`.

Concretely, the experiment branch's client is 138 lines shorter and ~200 lines clearer in intent because there's no "now adapt the shape" layer. Compare:

- `main`'s `createOnRamp` returns a generic `OnRampTransaction` with empty-string filler for `fromCurrency`, `toAmount`, etc. (because Etherfuse doesn't give those back on creation — the shared type demands them).
- `experiment`'s `createOnRampOrder` returns `EtherfuseOnRampOrder` with rail-specific fields (`deposit.clabe` or `deposit.pixCode`/`pixKey`/`pixKeyType`) and honest `''` for not-yet-known amounts — but at least the *type* admits they're optional through being absent on the rail union.

Same story for `testanchor`. On `main`, the `TestAnchorAdapter` (`anchor.ts`, 888 lines) wraps the SEP modules in a faceted `Anchor` shape and does heavy lifting like `requirementsFromSepFields` (mapping SEP-12 fields → `KycFieldRequirement[]`) and `resolveRequiredInfo` (best-effort fallback through SEP-12 to discover what `pending_customer_info_update` is asking for). All of that exists *only* to make SEP-6 fit the shared shape. The experiment branch's `testanchor/ramp.ts` (356 lines) is just a method-per-SEP wrapper that returns `Sep6Transaction`, `Sep24Transaction`, `Sep12CustomerResponse` — the actual SEP types. If you're building a SEP wallet, that's exactly what you want; the adapter layer is noise.

**Verdict on Goal #1: experiment wins.** If the goal is "this code is genuinely copy-pasteable", the experiment branch delivers it; `main` only sort-of does.

---

## Goal #2 (demo as inspiration): more nuanced, but I still lean experiment

The argument for `main`: a developer who lands on `/anchors/etherfuse/onramp` and `/anchors/testanchor/programmatic/onramp` and views source sees the same `<OnRampFlow />` component. They learn *one* flow pattern that supposedly works for any SEP-6-style anchor. That's a powerful demo if it's true.

The argument against `main` (and for experiment): the unified component is full of `capabilities?.requiresBankBeforeQuote`, `capabilities?.deferredOffRampSigning`, `fiatAccountRegistration === 'hosted'`, `flowStyles.includes('interactive')` (7+ capability branches in `OffRampFlow.svelte` alone). A developer reading that file is reading a *configurator*, not a flow. To understand Etherfuse's specific flow they have to mentally evaluate the capability flags for Etherfuse and discard the other branches. That's worse pedagogy than reading the actual Etherfuse-shaped page on the experiment branch, even if the experiment branch's page is 711 lines.

Crucially, the experiment branch's pages **read like the integration guide an anchor would write**. `src/routes/anchors/etherfuse/onramp/+page.svelte` calls `ef.createCustomer`, `ef.getKycUrl`, `ef.getKycStatus` (polled), `ef.getQuote`, `ef.createOnRampOrder`, then polls `ef.getOnRampOrder` until `status === 'completed'`. That sequence is the Etherfuse on-ramp integration — full stop. On `main`, the same sequence is fragmented across `RampPage.svelte` (registration + KYC), `OnRampFlow.svelte` (quote + order), the `customerStore`, the `authStore`, and three `+server.ts` files behind a `[provider]` parameter — and you can only follow it by mentally specializing capabilities to Etherfuse-truth.

The experiment branch also exposes the interesting *contrast* between programmatic and interactive flows by putting them at `testanchor/programmatic/onramp` (440 lines) vs `testanchor/interactive/onramp` (332 lines). On `main`, that contrast is hidden inside a tab toggle in `[provider]/[direction]/+page.svelte`. A developer choosing between SEP-6 and SEP-24 archetypes is the headline use case for this demo, and the experiment makes that choice tangible by separating the URLs and the source files.

The cost: there's noticeable code duplication across the six flow pages — `ensureAuth`/`cachedAuth`/`signWithFreighter`, the `pollCount` / `MAX_POLLS` polling skeleton, the `Step` state machine. The four testanchor pages re-do the SEP-10 auth handshake locally. None of this is hard to read, but it's not "DRY" in any sense.

**Verdict on Goal #2: experiment wins, but not by as wide a margin.** Healthy reuse for the demo would have been: keep the pages bespoke, but extract small modules (`$lib/wallet/sep10-session.ts`, `$lib/utils/poll.svelte.ts`) for the truly identical bits. The experiment branch hasn't done that yet.

---

## Code-shape evidence

| | `main` | `experiment` |
|---|---|---|
| `anchors/etherfuse/client.ts` | 935 LOC, `implements Anchor`, methods take generic inputs | 797 LOC, no interface, methods take Etherfuse-specific inputs |
| `anchors/etherfuse/types.ts` | 416 LOC | 530 LOC (absorbed the input/output types previously in shared) |
| `anchors/testanchor/anchor.ts` (main) vs `testanchor/ramp.ts` (exp) | 888 LOC adapter | 356 LOC SEP wrapper |
| `anchors/types.ts` | 825 LOC shared interface, 3 facets, 30+ types | Removed |
| `anchors/sep/*` | unchanged | unchanged (still the portable SEP library) |
| `lib/api/*` | 1 file, `anchor.ts` (573 LOC) | 2 files, `etherfuse.ts` (215) + `testanchor.ts` (226), no shared base |
| `server/anchorFactory.ts` | 126 LOC, `getAnchor / requireProgrammatic / requireInteractive` | Replaced by per-provider `etherfuseInstance.ts` (22) + `testanchorInstance.ts` (34) |
| API routes | 9 files under `api/anchor/[provider]/*` | 13 files under `api/anchor/etherfuse/*` and `api/anchor/testanchor/*` |
| Flow components | 4 shared (`OnRampFlow` 581, `OffRampFlow` 865, `InteractiveRampFlow` 320, `RampPage` 545) + 3 step components | None — all logic in page files |
| Page-level Svelte | `[provider]/+page.svelte` 343 LOC + `[provider]/[direction]/+page.svelte` 67 LOC | 6 bespoke pages totaling 3040 LOC across `etherfuse/{onramp,offramp}`, `testanchor/{programmatic,interactive}/{onramp,offramp}` |
| Tests | `etherfuse/client.test.ts` 3902 LOC; `testanchor/anchor.test.ts` 589 LOC | `etherfuse/client.test.ts` 1157 LOC; testanchor adapter test **removed** |

Where each approach feels forced:

- **`main` feels forced** in `OffRampFlow.svelte` (865 LOC with 7 capability branches and a fallback `if (fiatAccountRegistration === 'hosted' && !selectedAccountId)` switching path that exists *only* for Etherfuse's iframe-registered bank accounts), in the `programmatic: ProgrammaticOps = { createCustomer: (input) => this.createCustomer(input) }` adapter object on `EtherfuseClient` (re-binds 10 methods just to satisfy the facet), and in `TestAnchorAdapter.requirementsFromSepFields` (a 30-line translator from `Sep12Field` → `KycFieldRequirement` — useful, but it exists to feed a shared form component, not because SEP-12 callers naturally want this shape).
- **`experiment` feels forced** in the duplicated `ensureAuth`/`cachedAuth`/SEP-10 cache plumbing across four testanchor pages, in the per-anchor `EtherfuseApiError` / equivalent classes that don't share a base, and in the absence of *any* abstraction for "poll a status until terminal" — which is now hand-written 6 times.

Where each feels natural:

- **`main`** is at its best in `[provider]/[direction]/+page.svelte` (66 LOC): the toggle between Hosted/Programmatic, and the routing of a single `direction` to one of three flow components, is genuinely clean. The shared payment-instructions discriminated union (`SpeiPaymentInstructions | PixPaymentInstructions | GenericPaymentInstructions`) is also a nice piece of design — better than the experiment's per-anchor ad-hoc deposit objects.
- **`experiment`** is at its best in `anchors/etherfuse/client.ts` (the example in `@example` actually works as written) and in `testanchor/ramp.ts` returning SEP-typed responses directly. Both files read like API client SDKs you'd ship as a library.

---

## Adding the next anchor (hypothetical Koywe)

### On `main`

1. Create `src/lib/anchors/koywe/client.ts`. Decide which facets apply (`programmatic` only per the memory notes), so `implements Anchor` and write a `programmatic: ProgrammaticOps = { ... }` block. Pick capability flags (`emailLookup`? `kycFlow`?). 
2. Cram Koywe's `quote` response into the shared `Quote` shape. If Koywe returns fields the shared type doesn't have (e.g. a `validity_seconds` separate from `expiresAt`), either drop them or push for a `types.ts` change.
3. Register in `anchorFactory.ts`: add `'koywe'` to the `AnchorProvider` union and the switch.
4. Add `'koywe'` to `src/lib/constants.ts` and `src/lib/config/anchors.ts` / `regions.ts`.
5. **No new routes needed.** Existing `[provider]/*` routes pick up Koywe immediately. Visit `/anchors/koywe/onramp` and the flow renders against the shared components — assuming Koywe's API maps to the existing capability flags.

Time to a working demo: ~1 day if the API maps cleanly. If it doesn't (e.g. requires bank-before-quote AND inline-identity, a combo not currently exercised), expect to add capability flags and branch the flow components — closer to 2–3 days, plus PR review on the shared interface.

### On `experiment`

1. Create `src/lib/anchors/koywe/{client.ts,types.ts,index.ts}` shaped however Koywe actually works. No interface to satisfy.
2. Create `src/lib/server/koyweInstance.ts` (~22 LOC, copy `etherfuseInstance.ts`).
3. Create `src/lib/api/koywe.ts` (~200 LOC, copy `etherfuse.ts` and adjust the URLs/types).
4. Create `src/routes/api/anchor/koywe/{quotes,onramp,offramp,...}/+server.ts` — ~6–8 files, ~30 LOC each. Copy from etherfuse equivalents.
5. Create `src/routes/anchors/koywe/{+page.svelte, onramp/+page.svelte, offramp/+page.svelte}`. Copy from etherfuse, swap the imports, adjust the Koywe-specific UI bits.
6. Add to `constants.ts` and `config/`.

Time to a working demo: ~2 days regardless of API shape. **There is no abstraction to fight.** Every Koywe quirk is local to Koywe files.

The crossover: `main` is faster when the new anchor's API shape *fits* the existing capability flags. `experiment` is more predictable when it doesn't — and the project's pipeline (Koywe, Coins.ph, possibly PDAX, possibly more) is heavily weighted toward "doesn't fit cleanly" given Coins.ph is interactive-only and Brazil/PIX has been thrashing for months in the auto-memory notes.

---

## Maintenance & drift

### `main`'s drift surface
- **The `Anchor` interface is a contract that's hard to evolve.** Adding a new capability flag (e.g. `requiresIdentityPerRamp` for Transfero — which was in the type union; see `RampIdentity` in `types.ts`) means touching every flow component and every anchor that does or doesn't set it. Removing a flag means auditing every `capabilities?.x` site.
- **Capability flags are easy to set wrong silently.** Nothing in the type system catches "Etherfuse sets `kycFlow: 'iframe'` but `OffRampFlow` reads `capabilities?.fiatAccountRegistration` independently." Two flags, both anchored to Etherfuse's iframe story, can drift apart.
- **The `programmatic: ProgrammaticOps = { ... }` adapter blocks** in `EtherfuseClient` (lines ~100-118 of main's client) and in `TestAnchorAdapter` are pure boilerplate that gets stale: a method renamed in `ProgrammaticOps` doesn't auto-rename in the binding, you get a TS error and fix it, but it's a tax on every interface change.
- **Test brittleness**: main's 3902-line etherfuse test file is the canary. Every shared-type tweak (e.g. renaming `fromCurrency` → `sourceCurrency`) ripples through hundreds of fixtures.

### `experiment`'s drift surface
- **Polling/auth boilerplate divergence.** The 6 page files each have their own `pollCount` / `MAX_POLLS` / `startPolling` / `stopPolling` — easy to fix bugs in one and forget the others. Especially risky: the SEP-10 token cache logic in `ensureAuth` is duplicated across 4 testanchor pages.
- **API-route shape drift.** Each anchor's routes hand-roll error mapping (`EtherfuseError → status code` in one place, `requireBearer` + `TestAnchorSepUnsupportedError` elsewhere). A change to error envelope conventions has to be made N times.
- **Shared step components (`AmountInput`, `TrustlineStatus`, `QuoteDisplay`, `KycIframe`) still exist** and the experiment pages import them — but with a thin "adapt my type to QuoteDisplay's structural shape" `$derived` block (see the `displayQuote` block at line 81 of `etherfuse/onramp/+page.svelte`). That's a *good* kind of duplication boundary (data shape adapter at the call site), but the components themselves are quietly load-bearing and would need re-pasting to a Node CLI consumer.
- **Tests dropped, not migrated.** The experiment loses `testanchor/anchor.test.ts` entirely and shrinks the etherfuse test by 2.7x. Some of that is appropriate (less behavior to test in the smaller surface), but losing the testanchor coverage outright is a regression and should be restored.

---

## Specific risks

### Risks on `main`
1. **Premature abstraction tax compounds.** The pipeline (Koywe, Coins.ph, PDAX) plus removed-or-renamed providers (AlfredPay, BlindPay) means the `Anchor` interface is being defined against ~2 living providers and a graveyard. Every new provider that doesn't fit will either bend the interface or live in a `capabilities?.someNewQuirk` branch — both are corrosive.
2. **The capability-flag soup is an LLM-generated-looking artifact.** `AnchorCapabilities` has 13 optional boolean/enum fields including pairs like `kycUrl` + `kycFlow`, `sandbox` + `sandboxFiatSimulation`, `requiresOffRampSigning` + `deferredOffRampSigning`. These read as accreted state, not designed state. The Anchor interface itself has *three* optional facets where the docstring says "at least one of programmatic/interactive must be present" — invariant-in-the-comments, not in the type. Future devs will get this wrong.
3. **`OffRampFlow.svelte` at 865 LOC with 7 capability switches is the single component that will rot fastest.** Any new off-ramp flavor (e.g. Coins.ph's hypothetical no-trustline mobile-money payout) will land here as another branch.

### Risks on `experiment`
1. **Duplication will actually become drift without discipline.** With 6 onramp/offramp pages today and Koywe/Coins.ph/PDAX coming, that's potentially 10–12 page files. A bug fix to polling, auth, error display, or trustline UX must be applied N times. Without a code-review checklist enforcing "did you update the other pages?", this fails open.
2. **The portable SEP library (`src/lib/anchors/sep/`) is now the only shared anchor abstraction left**, and the experiment branch's testanchor client returns `Sep6Transaction`/`Sep24Transaction`/`Sep12CustomerResponse` directly. That's great for SEP-shaped anchors, but the next non-SEP, non-Etherfuse anchor (Koywe with its own Koywe-shaped API) will have *zero* shared infrastructure. The pattern doesn't yet exist for "I'm a non-SEP, non-API-key anchor" — Etherfuse just *happens* to be the only template.
3. **Tests are under-invested.** Dropping `testanchor/anchor.test.ts` (589 LOC) without replacing it is a real coverage regression. Also: there are no page-level component tests on the experiment branch (the `page.svelte.spec.ts` files were deleted). For a project whose value proposition is "this code is your starter pack," tests are doubly important — they're the spec for what each anchor's flow is supposed to do.

---

## Recommendation

**Continue on `experiment/eff-anchor-interface`, but don't merge yet.** Before considering it done:

1. **Restore testanchor tests.** Port the substance of `tests/anchors/testanchor/anchor.test.ts` to the new `TestAnchorRampClient` shape. Some scenarios won't survive the simplification — that's expected — but cover SEP-1 discovery, SEP-10 challenge/submit, SEP-6 deposit/withdraw + signable XDR construction, SEP-12 get/put customer, SEP-38 price, and 404 handling.
2. **Extract two small modules to halt the imminent duplication drift:**
   - `src/lib/wallet/sep10-session.ts` — wraps `ensureAuth`/`cachedAuth` + `authStore` for any page that needs a SEP-10 token. The 4 testanchor pages should import this.
   - `src/lib/utils/poll.svelte.ts` — a tiny reactive helper (`createPoller({ intervalMs, maxAttempts, fn })` returning `{ start, stop, count, timedOut }`). All 6 ramp pages should use it.
   These are not "abstractions over the anchor API" — they're project-wide UI utilities, which the experiment branch happens to be missing.
3. **Add a `KycIframeFlow.svelte` mini-component** — just the iframe + status-polling UI, parameterized by `url`, `onApproved`. Right now the Etherfuse pages re-do this; Coins.ph and any future iframe-using anchor will too. This is *not* the same as `main`'s heavy shared flow components — it's a leaf UI primitive, like `QuoteDisplay`.
4. **Update `CLAUDE.md`.** The repo-root `CLAUDE.md` still describes the unified `Anchor` interface and the shared flow components in detail. Anyone (human or LLM) using it as a guide will be misled. The experiment branch shipped 70 files of changes and a docs update for the README files, but missed the project's primary instruction file.
5. **Document the anchor authoring pattern.** A short `src/lib/anchors/README.md` section: "Each anchor is one `client.ts` + one `types.ts` + one `index.ts`. Server instance + API proxy routes + page files follow the etherfuse template." Make the duplication intentional, named, and reviewable.

Once those land, the experiment branch is unambiguously the better artifact — for the portable-client goal *and* for the demo-as-inspiration goal. The unified-interface approach on `main` is a respectable piece of engineering, but it's solving a problem (uniform programmatic surface across heterogeneous anchors) that the project doesn't actually have, while making the problem the project *does* have (legibly demonstrating each anchor's real shape) measurably harder.
