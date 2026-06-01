# Agent 3 Review — Anchor Interface Architecture

**TL;DR.** For Goal #1 (copy/paste-friendly client code), the **experiment** branch is materially better. The paste-target test exposes the difference clearly: experiment's `etherfuse/` directory compiles in a fresh project with zero edits and zero adapted files; main requires copying a sibling `types.ts` (~826 LOC of cross-anchor abstractions) and then teaches the user that the public surface is `client.programmatic.createCustomer(...)`, not `client.createCustomer(...)`. For Goal #2, main wins on shared UI but at a cost (lots of indirection, capability flags); experiment has more total page LOC and obvious duplication between provider flows.

Net: experiment is the better foundation for what this repo is actually trying to be. Main optimizes for an abstraction that the project doesn't yet have enough providers to validate, and the abstraction is leaking into the client surface and the UI in ways that hurt the primary goal. Recommendation: ship experiment's anchor library shape; keep some of main's UI ideas as inspiration for later.

---

## 1. Empirical paste-target test — Etherfuse

I copied `src/lib/anchors/etherfuse/` from each branch into a clean scratch project, added a minimal `tsconfig.json` (target ES2022, moduleResolution Bundler, strict), installed `@stellar/stellar-sdk` + `typescript` + `@types/node`, wrote a `scratch.ts` that imports `EtherfuseClient`, stubs `globalThis.fetch`, and calls `createCustomer`. Then `npx tsc --noEmit` and `npx tsx scratch.ts`.

### Experiment branch — clean

- Copied `etherfuse/` (3 files: `client.ts` 796 LOC, `types.ts` 652 LOC, `index.ts` 3 LOC). Nothing else.
- `npx tsc --noEmit` → exit 0, zero edits.
- `npx tsx scratch.ts` → executed; `EtherfuseError` thrown from `StrKey.isValidEd25519PublicKey` as expected (my fake pubkey was rejected by the real Stellar SDK validator). Success.
- Public API is the class itself: `client.createCustomer({...})`. Reads naturally.

### Main branch — three friction points

- Copied `etherfuse/` (3 files: `client.ts` 935 LOC, `types.ts` 494 LOC, `index.ts` 2 LOC).
- First `tsc` run: **22 errors**. `client.ts` imports `'../types'` (the shared `Anchor` interface, ~826 LOC) which doesn't exist in a paste target. Without those types, every facet wrapper degrades to implicit `any`, and the `instanceof AnchorError` blocks fail.
- Fix: copy `src/lib/anchors/types.ts` from main into the scratch root alongside `etherfuse/`. After that, `tsc` is clean. So the paste unit is actually **4 files**, not 3, and the user has to know the parent-relative import.
- Second friction point: my first `scratch.ts` called `client.createCustomer(...)`. `tsc` error: *"Property 'createCustomer' is private and only accessible within class 'EtherfuseClient'."* The public surface is the `programmatic` facet object: `client.programmatic.createCustomer(...)`. This is non-obvious unless the user reads the class body — `private` on every domain method is a real DX hit. Even the `client.ts` docstring example (`client.createCustomer({...})`) is wrong; it would not compile against the actual class.
- Third friction (smaller): `AnchorError` lives in the shared `../types`, not in `./types`. So a user catching errors has to import from two places.

**Verdict.** Experiment is the unambiguous winner here. The main-branch paste unit drags 826 lines of cross-anchor abstraction (KYC requirement schemas, interactive-session shapes, discriminated payment-instruction unions, etc.) into a project that just wants to talk to one anchor, and then forces the user through a facet indirection to call any method. That isn't paste-friendly; it's framework adoption.

## 2. Goal #2 — Demo SvelteKit app

Compared `/tmp/round2-main/src/lib/components/OnRampFlow.svelte` (581 LOC, generic) against `/tmp/round2-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte` (711 LOC, provider-specific).

**Main**. `OnRampFlow.svelte` reads `page.data.anchor.id`, `page.data.requiresWalletAuth`, `page.data.capabilities`, `page.data.primaryToken`, etc., then walks through a single state machine that handles Etherfuse-with-iframe-KYC, testanchor-with-form-KYC, with/without SEP-10 auth, with/without sandbox simulation. The route shell at `routes/anchors/[provider]/[direction]/+page.svelte` is just 67 LOC — it picks between `OnRampFlow` / `OffRampFlow` / `InteractiveRampFlow` based on capability flags. Adding more providers means more `capabilities.*` booleans in this file. There are already ~12 such flags in `AnchorCapabilities`.

**Experiment**. Each provider has its own flow page that imports `* as ef from '$lib/api/etherfuse'` directly and reads Etherfuse's own types (`EtherfuseCustomer`, `EtherfuseQuote`, `EtherfuseSavedBankAccount`, `EtherfuseKycStatus`). The page knows Etherfuse uses hosted KYC and an iframe — no capability flag, no runtime branching. The flow is longer than main's per page, but each page is self-contained and reads top-to-bottom. There's an obvious adapter line at lines 81–95 that maps `EtherfuseQuote` into the shape of the shared `QuoteDisplay` primitive — small and explicit.

Counts: main has 21 components / 12 route files; experiment has 12 components / 19 route files. Total LOC is comparable (main 16,100 vs experiment 13,551 in `src/`), but experiment is leaner in the anchor library (4831 vs 6160 anchor LOC) at the cost of duplicated flow scaffolding.

**Goal #2 trade-off.** Main's shared flows are nicer when you have N near-identical providers; they're a tax when each provider is genuinely different (which is true today — Etherfuse is hosted-KYC + deferred-signing + presigned-URL bank-account; testanchor is form-KYC + SEP-10 auth + dual-archetype). Right now main is paying the abstraction tax for two providers that don't really fit one mold.

## 3. Code shape — what feels forced

**Main, `src/lib/anchors/types.ts` (826 LOC) + `AnchorCapabilities`.** ~13 flags including very specific ones (`deferredOffRampSigning`, `requiresAnchorPayoutSubmission`, `requiresBlockchainWalletRegistration`, `fiatAccountRegistration: 'inline' | 'hosted'`). Every provider quirk becomes a flag the UI branches on. The flag count scales linearly with provider quirkiness — classic leaky-abstraction smell.

**Main, `testanchor/anchor.ts` (888 LOC).** Pure adaptation layer mapping SEP-6/12/24/38 shapes into the unified types. The SEP modules underneath are already clean. Wrapping loses information (richer SEP fields collapsed into smaller unified shapes) and adds translation surface that has to keep up with SEP changes.

**Experiment, `testanchor/ramp.ts` (355 LOC).** Returns SEP shapes directly. The docstring is honest: *"there's no adaptation layer because testanchor IS SEP."*

**Main, `EtherfuseClient`'s public surface.** All domain methods are `private`; the public surface is the `programmatic` field, populated with arrow-function trampolines. You can't call `client.createCustomer(...)` — only `client.programmatic.createCustomer(...)`. The JSDoc on private methods isn't where IntelliSense surfaces it. The class's own `@example` block actually shows the wrong (uncompilable) calling style.

**Experiment, `EtherfuseClient`.** Public methods named after vendor operations (`createOnRampOrder`, `acceptElectronicSignature`, `listBankAccounts`). Reads like a vendor SDK.

**API & server layers.** Main: one generic `api/anchor.ts` (573 LOC) + one `anchorFactory.ts` (126 LOC). Experiment: per-provider `api/etherfuse.ts` (215) and `api/testanchor.ts` (226), plus trivial 22- and 34-LOC server singletons. Experiment is more files, but each one is small and unambiguous.

## 4. Adding the next anchor — Koywe walkthrough

**Experiment.** `anchors/koywe/{client,types,index}.ts` (self-contained), `server/koyweInstance.ts` (~30 LOC), `api/koywe.ts` (~200 LOC), N route proxies under `api/anchor/koywe/`, two flow pages at `routes/anchors/koywe/{on,off}ramp/+page.svelte` (~700 LOC each, copy-edited from etherfuse), config entries. Many files but each small and obvious. Real duplication in the flow pages — ~80% of state-machine boilerplate repeats.

**Main.** `anchors/koywe/client.ts` implementing `Anchor` — the hard part is mapping Koywe's responses into `Customer`/`Quote`/`OnRampTransaction` and accepting that fields you don't have show up as `undefined`. Three lines in `anchorFactory.ts`. Then capability flags: Koywe's SEP-10 means `auth` (existing); any genuine quirk forces a new flag plus updates to `OnRampFlow.svelte` / `OffRampFlow.svelte` / load functions. No new pages — dynamic routing picks it up.

Main is faster when Koywe is a minor variation on an existing pattern, slower and riskier when it isn't. Capability creep is the failure mode: every new provider needs *just one more flag*, and you pay for that flag forever. Today: ~13 flags for 2 providers. That ratio is already concerning.

## 5. Drift surfaces & maintenance risk

**Main's drift surfaces.**
- Capability flags vs. flow components — flag added but flow doesn't branch on it (silent bug).
- Adapter (testanchor `anchor.ts`) vs. SEP types — SEP module changes don't propagate; the adapter is 888 LOC of translation.
- Shared `Anchor` interface vs. paste-target — every consumer outside the SvelteKit app has to vendor `types.ts`.
- KYC requirement schemas — Etherfuse uses hosted, testanchor uses inline; the shared `KycRequirements` shape is partially used by both, and a third provider with a different KYC story has to fit or grow the schema.

**Experiment's drift surfaces.**
- Provider-specific flow pages diverge — bug fixed in etherfuse's onramp flow doesn't get fixed in testanchor's (real duplication; ~80% of state-machine boilerplate is similar).
- Shared `QuoteDisplay` / `KycIframe` / `WalletConnect` primitives still exist — these can drift from per-provider expectations, but the surface is small.
- Each provider's API route surface is hand-coded — risk of inconsistent error handling between providers.

## 6. Three specific risks each

**Main:**
1. *Capability flag explosion.* Etherfuse alone introduced 6 capability flags. Two more curated anchors will push this past 20, and the flow components turn into a maze of `{#if capabilities.foo && !capabilities.bar}`.
2. *Adapter rot.* `TestAnchorAdapter` (888 LOC) is fragile. SEP responses can change shape (different anchors return different field subsets); the adapter has to keep up, and bugs there are silent (you see a broken UI without an obvious source).
3. *Paste failure for goal #1.* If a developer copies `etherfuse/` alone, it doesn't compile. Add `types.ts`, it compiles but exposes the unified API which makes no sense for a single-anchor user (every method is wrapped through `.programmatic`). The README says "framework-agnostic and can be copied to any TypeScript project" — empirically false without `types.ts` along.

**Experiment:**
1. *Flow-page duplication.* Etherfuse's on-ramp and off-ramp pages are ~700 LOC each; testanchor's are ~450 LOC each. Bug-fix-once-fix-everywhere doesn't work — high cognitive load when fixing UX issues.
2. *Inconsistent UX across providers.* Without a shared flow component, two flows can diverge in subtle ways (error message text, loading states, polling intervals). Three providers in, the UX may feel uneven.
3. *Naming-only consistency between server/client/types.* Three classes — `EtherfuseClient` (server), `EtherfuseApiError` (client wrapper), `EtherfuseError` (server) — that aren't enforced to align. A future contributor could add a method to one but not the other.

## 7. Bottom-line recommendation

**Adopt the experiment branch's anchor-library shape** — per-provider, self-contained, no shared `Anchor` interface, no facets, vendor-typed surface. This is the unambiguous winner for Goal #1 and aligns with how SDK consumers actually use this kind of code.

**Borrow back from main**:
- The shared UI primitives that already exist in experiment (`QuoteDisplay`, `KycIframe`, `WalletConnect`, `AmountInput`, `TrustlineStatus`) are correct — keep them and look for one or two more.
- Consider extracting a small `OnRampStateMachine` helper (composable, not a component) that the per-provider pages can use to deduplicate polling + error-handling logic. This is much smaller than a full `OnRampFlow` component but kills 60% of the page duplication.

**Do not** re-introduce a unified `Anchor` interface unless and until a third or fourth provider proves the abstraction. Two providers is not enough signal; main's interface already shows the strain.

## 8. What would change my mind

These pieces of evidence would flip me toward main:

1. **Three more providers that genuinely fit the unified mold.** If Koywe, Coins.ph, and one more all map cleanly to `Anchor` + a small number (≤2) of new capability flags, the abstraction's value would outweigh its paste-friendliness cost. The strain has to actually be small.
2. **A real downstream paste-target user (not us)** reporting that main's pattern is fine — e.g. a partner team that copies `etherfuse/` + `types.ts` into Next.js and says "the facet thing is intuitive." My test says it isn't, but I'm one data point. A real user trial would beat my judgment.
3. **A capability-flag audit** showing the existing flags are stable (last 6 months: zero new flags added, zero removed). If the flag list is converging, the abstraction is real. If it's growing, the abstraction is fictional.

Conversely, evidence that would lock in experiment as the right call: a *fourth* provider being onboarded in experiment's shape with no significant flow-page friction, or an external developer demonstrably pasting an experiment anchor into their own project in under 10 minutes.
