# Agent 2 Review — `main` vs `experiment/eff-anchor-interface`

## Bottom line up front

For **Goal #1** (copy-paste-friendly anchor clients), the **experiment branch wins decisively for the Etherfuse case** and is **roughly a wash for testanchor**. For **Goal #2** (a working demo app that exercises every anchor), **main wins clearly** — its shared flow components eliminate hundreds of lines of duplicated polling/wallet/Freighter glue per provider, and the `[provider]` routing keeps the SvelteKit app small.

The two goals weight 60/40 in favor of #1, so the experiment branch is *closer* to optimal for the stated priorities, but it pays for that with substantial demo-app duplication. The right architectural answer is the experiment branch's anchor library plus main's flow-component approach for the demo — but as currently shipped, **I'd take main**, because main's drawbacks (a slightly fatter shared `types.ts` to copy) are smaller than experiment's (every flow page reinvents itself). More on that below.

## Empirical paste-target test (the heart of Goal #1)

I tested by copying one provider out of each branch into a fresh Node project with only `@stellar/stellar-sdk` and `@types/node` installed, then writing a `scratch.ts` that instantiated the client, stubbed `globalThis.fetch`, and called `createCustomer`.

### Experiment branch — Etherfuse

- **What I copied:** `src/lib/anchors/etherfuse/` (3 files: `client.ts` 796 lines, `types.ts` 652 lines, `index.ts` 3 lines).
- **What was missing:** Nothing. The directory is fully self-contained. Only external dep is `@stellar/stellar-sdk` (for `StrKey`).
- **Typecheck:** `npx tsc --noEmit` — clean immediately.
- **Runtime:** `npx tsx scratch.ts` — created a customer, hit the stub, mapped the response. Worked.
- **Import surface (verbatim):**
    ```ts
    import { EtherfuseClient, EtherfuseError } from './etherfuse';
    const c = new EtherfuseClient({ apiKey, baseUrl });
    await c.createCustomer({ publicKey, email, country: 'MX' });
    ```

### Main branch — Etherfuse

- **What I copied:** `src/lib/anchors/etherfuse/` (3 files: `client.ts` 935 lines, `types.ts` 494 lines, `index.ts` 2 lines) **plus** `src/lib/anchors/types.ts` (825 lines).
- **What was missing initially:** Without `types.ts` the `client.ts` `import { AnchorError } from '../types'` fails. Once I copied the shared file, fine.
- **Typecheck:** Clean once `types.ts` was present.
- **Runtime:** Worked identically — same call site after rewording.
- **Import surface (verbatim):**
    ```ts
    import { EtherfuseClient } from './etherfuse';
    import { AnchorError } from './types';
    const c = new EtherfuseClient({ apiKey, baseUrl });
    await c.programmatic!.createCustomer({ publicKey, email, country: 'MX' });
    ```

### Concrete differences a paste-target user would feel

1. **One extra file to copy on main.** Not a huge deal, but `types.ts` is 825 lines defining the entire shared anchor protocol (every provider's KYC unions, payment-instruction unions, fiat-account unions, identity, etc.). For a developer who only wants Etherfuse, ~85% of that file is irrelevant noise they have to keep around (and now must understand if they want to extend anything). On experiment, every type they see lives next to the client that uses it.
2. **Optional-chaining on main.** Methods live on `anchor.programmatic`, which is `ProgrammaticOps | undefined`. You either `!`-assert (`anchor.programmatic!`) or narrow with `if (anchor.programmatic)`. For a single-provider paste target this is friction with no payoff — the developer already *knows* Etherfuse has the programmatic facet.
3. **Method names.** Experiment uses the domain vocabulary the actual Etherfuse API speaks: `createOnRampOrder`, `getOnRampOrder`, `listBankAccounts`, `getKycUrl({ customerId, publicKey, bankAccountId })`. Main uses the generic interface vocabulary: `createOnRamp`, `getOnRampTransaction`, `getFiatAccounts`, `getKycUrl(customerId, publicKey, bankAccountId)` (positional). Experiment's surface reads like the Etherfuse docs; main's reads like an abstraction.
4. **Status fidelity.** Experiment exposes Etherfuse's actual status strings (`'created' | 'funded' | 'completed' | 'failed' | 'refunded' | 'canceled'`). Main maps them to a unified `TransactionStatus` (`pending | processing | completed | failed | expired | cancelled | refunded`). Useful for a unified UI; *destructive* for a paste-target user who wants Etherfuse semantics. They'd have to look at `client.ts` to learn that `'funded'` got folded into `'processing'`.

### Testanchor paste

Both worked. Both required copying `testanchor/` *and* `sep/` (and `@types/node` for `Buffer` in challenge signing). On main you also have to copy `types.ts` because `testanchor/anchor.ts` imports `AnchorError` and the facet types from it. On experiment, `testanchor/` only depends on `sep/`. So the gap repeats: experiment is self-contained, main pulls in the shared types file.

**Net of the paste test:** Experiment wins for Goal #1, more so on Etherfuse than on testanchor. Etherfuse-style API-key anchors are exactly the case the unified interface hurts most (positional `publicKey` parameters, KycUrl signatures generalized to fit hosted-vs-iframe-vs-redirect anchors, etc.).

## Goal #2 assessment — reading the flow code

I read on-ramp end-to-end on each branch.

- **Main: `src/lib/components/OnRampFlow.svelte`** — 581 lines. One file drives every programmatic provider (Etherfuse, future Koywe, etc.). It pulls `provider`, `capabilities`, `fiatCurrency`, `primaryToken`, `requiresWalletAuth` from `page.data` (set in `[provider]/+layout.server.ts`), wires `ensureAuth()` for SEP-10 anchors, branches on `capabilities.kycFlow` and `capabilities.deferredOffRampSigning`, and uses the generic `Quote` / `OnRampTransaction` types throughout. Reads cleanly because the abstractions match what every provider needs.
- **Experiment: `src/routes/anchors/etherfuse/onramp/+page.svelte`** — 711 lines, 100% Etherfuse-specific. Hardcodes `CETES_ISSUER`, branches `region === 'brazil'` for currency/token/rail (the kind of thing main puts in config), defines a local `displayQuote` adapter to fit the shared `QuoteDisplay` primitive, owns its own KYC polling and order polling. Off-ramp `+page.svelte` is **another 759 lines** of mostly the same shape. The testanchor pages are similar — `programmatic/onramp/+page.svelte` is 440 lines, `interactive/onramp/+page.svelte` 332 lines. That's **~2,800 lines of provider-bespoke flow pages** on experiment vs. ~2,300 lines of *shared* flow components on main that work for all providers.

The shared OnRampFlow being 581 lines is not because it's complex per provider, it's because it covers the union of all programmatic provider quirks (deferred signing, sandbox simulation, customer-info-update SEP-6 retry, etc.). With one provider that's noise; with three it's amortized.

Critically: **the dynamic `/anchors/[provider]/[direction]` route on main is one flow page**. On experiment, adding Koywe means writing `routes/anchors/koywe/onramp/+page.svelte` and `routes/anchors/koywe/offramp/+page.svelte` from scratch, almost certainly copy-pasting `etherfuse/onramp/+page.svelte` and find-replacing. That's the textbook scenario where shared components win.

## Code shape — where each feels forced

**Main feels forced at:**

- The `programmatic`/`interactive` facets on the `Anchor` interface (lines 674–761 of `types.ts`). Etherfuse implements `programmatic` only and stores its API-driven methods as `private` instances *plus* a `programmatic: ProgrammaticOps = {...}` object that wraps them with arrow functions (client.ts:106–118). That double-layer (`private createCustomer` + `programmatic.createCustomer = (input) => this.createCustomer(input)`) exists purely to satisfy the interface. The `auth?: string` parameter threaded into every facet method just to support SEP-10 anchors is consumed by Etherfuse and ignored. These are the seams where the unification pinches.
- The `PaymentInstructions` discriminated union (SPEI + PIX + generic SEP-6) is doing real work to keep the shared UI rail-agnostic — but on experiment, `EtherfuseDeposit` is a tighter `'spei' | 'pix'` union that matches Etherfuse exactly. Main pays interface tax to interoperate; experiment gets to be precise.
- Status mapping (`mapOrderStatus`) collapses `'funded'` → `'processing'` and `'canceled'` → `'cancelled'`. Information loss is real, and a programmer reading mapped statuses in the UI can't tell which Etherfuse status they came from without looking at the table.

**Experiment feels forced at:**

- Every flow page is a copy-pasted variant. `etherfuse/onramp/+page.svelte` and `etherfuse/offramp/+page.svelte` both maintain their own `displayQuote` adapter, their own polling state machine, their own KYC iframe wiring. Drift between them within a single anchor is already visible (different `MAX_POLL_COUNT` and timer-cleanup patterns between the testanchor and Etherfuse pages, for instance).
- Two server singleton files (`testanchorInstance.ts`, `etherfuseInstance.ts`) that share `bearerToken`/`requireBearer` helpers in only one of them. Already mild duplication.
- The API client surface is split into `$lib/api/etherfuse.ts` and `$lib/api/testanchor.ts`, each ~220 lines, against main's single `$lib/api/anchor.ts` of 573 lines — but adding Koywe on experiment requires authoring a third `api/koywe.ts`, whereas main needs zero new client-side API code.

**Overbuilt on main:** `Anchor` interface and `AnchorCapabilities` (~25 capability flags) feel like they're trying to predict every future quirk; some flags (`requiresAnchorPayoutSubmission`, `requiresBlockchainWalletRegistration`, `deferredOffRampSigning`) read like one-off escape hatches for providers that aren't even integrated yet.

**Underbuilt on experiment:** No shared affordance for KYC polling, no shared `OrderPolling` helper, no shared `signWithFreighter` retry wrapper — each flow page reimplements them. The README claims it's the "portable" version, but in practice the *demo* code is the most-copied, least-extractable surface.

## Adding the next anchor (Koywe)

Koywe is a programmatic, SEP-10-authed Argentine anchor for ARS↔USDC.

**On main:**
1. Author `src/lib/anchors/koywe/{client.ts,types.ts,index.ts}` implementing `Anchor` with `auth` + `programmatic` facets. This is *real* work — you fight the unified `Quote`/`Transaction` shapes for Koywe's actual fields.
2. Add Koywe to `AnchorProvider` union in `anchorFactory.ts` (~5 lines).
3. Add `KOYWE_*` env vars and a switch case.
4. Add to `src/lib/constants.ts`, `src/lib/config/anchors.ts`, `src/lib/config/regions.ts`.
5. **No new API routes.** `[provider]/auth/+server.ts` already dispatches via `requireAuth(provider)`.
6. **No new flow pages.** `[provider]/[direction]/+page.svelte` already handles both modes.

Effort: ~one anchor file + config. Days, not weeks.

**On experiment:**
1. Author `src/lib/anchors/koywe/{client.ts,types.ts,index.ts}` — easier because no facet interface to fit.
2. Author `src/lib/server/koyweInstance.ts`.
3. Author `src/lib/api/koywe.ts` (~225 lines, parallel to `etherfuse.ts`).
4. Author 5–8 server routes under `src/routes/api/anchor/koywe/*` (customer, quote, onramp, offramp, kyc, auth, …).
5. Author `src/routes/anchors/koywe/+page.svelte`, `src/routes/anchors/koywe/onramp/+page.svelte`, `src/routes/anchors/koywe/offramp/+page.svelte` — almost certainly by copying Etherfuse's pages and editing. ~1500 lines of mostly-duplicate code.
6. Add to config files.

Effort: paste-and-edit a lot of files. The client itself is cleaner to write; the demo wiring is significantly more.

Concretely, I counted **22 files** containing "etherfuse" on experiment vs **13 files** on main. Multiply by every new anchor.

## Drift surfaces and maintenance risk

**Experiment branch — primary risks:**
1. **Flow-page drift.** `etherfuse/onramp/+page.svelte` (711 lines) and `etherfuse/offramp/+page.svelte` (759 lines) are 95% the same code with different verbs. A bug in the polling-timeout logic gets fixed in one and forgotten in the other. With Koywe added, you have 6+ such pages.
2. **Status string drift.** Each provider's status enum (`EtherfuseOrderStatus`, `Sep24Transaction.status`, future `KoyweOrderStatus`) leaks into the UI. The honest fix is provider-specific UI lookup tables, which… already differ subtly between testanchor and etherfuse pages (`getStatusColor` lives in `$lib/utils/status.ts` and assumes the *main-branch* unified status enum — on experiment some pages bypass it, some don't).
3. **API-client surface drift.** `$lib/api/etherfuse.ts` and `$lib/api/testanchor.ts` invented different conventions for error parsing (`EtherfuseApiError` vs untyped throws). Adding `$lib/api/koywe.ts` will reinvent yet again.

**Main branch — primary risks:**
1. **Interface ossification.** Every time a new provider has a quirky field, the choice is "add an optional field to the shared types" (which then exists on *every* anchor's type forever) or "stash it on a capability flag". Watch `AnchorCapabilities` slowly grow into a `Record<string, boolean>`.
2. **Lossy status mapping.** Already happening — Etherfuse's `'funded'` collapses to `'processing'`. If a UI ever needs "funded but not completed" it has to add a side-channel.
3. **Shared-component complexity tax.** `OnRampFlow.svelte` (581 lines) and `OffRampFlow.svelte` (865 lines) already branch on a handful of capability flags. When the third programmatic anchor needs a flow style neither Etherfuse nor testanchor does, the temptation is to add `capabilities.koyweQuirk: true` and another `{#if}`. Death by a thousand flags.

## Bottom-line recommendation

**Keep main**, but specifically:
- Treat the experiment branch as evidence that the *anchor library directory* should be improved on main: collapse `etherfuse/types.ts` + the relevant subset of `anchors/types.ts` so a paste-target user only needs to copy the etherfuse folder. The cleanest cut is to have each anchor folder re-export the small set of shared types it actually uses, *plus* its own concrete types, so the cross-anchor types file is only needed by code that consumes multiple anchors at once.
- Keep `OnRampFlow.svelte`, `OffRampFlow.svelte`, `InteractiveRampFlow.svelte`, and the dynamic `[provider]/[direction]` route — they're earning their keep already and will earn more as Koywe/Coins/PDAX land.
- Trim `AnchorCapabilities`. Half its flags exist for anchors that haven't been integrated yet. YAGNI.

If the project's actual priorities flipped to 60% paste-friendly / 40% demo, I'd switch to recommending experiment — *and* immediately invest in a shared flow scaffolding layer to undo experiment's duplication. The cost of that retrofit is real.

## What would change my mind

If I saw any one of these, I'd flip toward the experiment branch:

1. **A real Koywe-like client on main where the unified `Anchor` interface bends.** Specifically, an anchor whose `createOnRamp` takes 3 mandatory fields that aren't on `CreateOnRampInput`, forcing either a `metadata: Record<string, unknown>` escape hatch or a new optional field. That's the moment the abstraction stops paying its tax.
2. **Evidence that paste-target users actually adopt only one anchor.** The README claims someone might grab "Etherfuse and drop it into their project." If three real downstream users do exactly that and zero use the unified `Anchor` interface to plug in their own provider, the unified interface is theory and the per-provider directories are practice.
3. **Demo flows on experiment that diverge usefully per provider** — i.e., if the bespoke Etherfuse on-ramp page does something materially better for UX than a shared component could (richer error messages tied to real Etherfuse error codes, a deposit-instruction widget that knows about CLABE checksums, etc.). Right now the experiment pages do *not* do this — they're copy-pasted shells. If a developer were inspired to specialize them, that's a Goal #2 win.
