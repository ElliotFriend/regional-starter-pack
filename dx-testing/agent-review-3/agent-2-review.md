# Agent 2 — Architecture Review

Bottom line first: **for a project whose primary goal is copy-pasteable anchor clients, the experiment branch is meaningfully better.** Not because the unified interface is wrong in the abstract, but because it leaks across files in a way that punishes the exact user the project claims to serve. The main branch is the better demo app. The experiment is the better library.

---

## 1. Empirical paste-target test

I picked Etherfuse on both branches and tried to paste the provider into an otherwise empty TypeScript project, stub `globalThis.fetch`, call `getQuote`, and get `tsc --noEmit` to pass.

### Experiment branch — `/tmp/scratch-2-experiment/`

Steps:

1. `cp -r /tmp/round3-experiment/src/lib/anchors/etherfuse /tmp/scratch-2-experiment/etherfuse` — one directory, four files (`client.ts`, `types.ts`, `index.ts`, `README.md`).
2. Wrote `scratch.ts` that does `import { EtherfuseClient } from './etherfuse'`, stubs `globalThis.fetch`, instantiates the client, calls `client.getQuote({ fromAsset: 'MXN', toAsset: 'CETES', sourceAmount: '500', stellarAddress: 'GAAAAA' })`.
3. Minimal `tsconfig.json` with `strict: true`, `moduleResolution: 'Bundler'`.
4. `npx tsc --noEmit -p tsconfig.json` → exit 0 on the first try.
5. `npx tsx scratch.ts` → prints a fully typed quote.

I copied **one directory** containing **three TS files**. Nothing was missing. No shared types had to be backported. `EtherfuseError` lives in `./types.ts` alongside `EtherfuseConfig`, so all errors and config types travel with the client.

### Main branch — `/tmp/scratch-2-main/`

Steps:

1. First attempt: `cp -r .../etherfuse /tmp/scratch-2-main/etherfuse`. Typecheck failed immediately:
   ```
   etherfuse/client.ts(39,8): error TS2307: Cannot find module '../types'
   etherfuse/client.ts(40,29): error TS2307: Cannot find module '../types'
   ```
   The cascading error fallout was 20+ implicit-`any` errors on the `programmatic` facet's arrow-function delegations, plus `'error' is of type 'unknown'` errors at every `catch` site.
2. Had to **restore the original two-level directory layout**: create `anchors/etherfuse/` and drop `anchors/types.ts` alongside it. `client.ts` imports `from '../types'` so a flat copy doesn't work — the user has to either preserve the `anchors/` parent dir or hand-edit every import. The 825-line `types.ts` is itself almost entirely reusable for any future anchor, but a developer who only wants Etherfuse is forced to bring along (and read) interfaces for SEP-24's `WalletAuthOps`, `InteractiveOps`, `StartInteractiveInput`, etc. — none of which Etherfuse uses.
3. After mirroring the layout, `tsc --noEmit` passed and `tsx scratch.ts` ran.

Final main paste-target footprint: **two directories, four TS files**, with one file being the 825-line shared `types.ts` of which Etherfuse uses maybe 30%.

### What this proves

Goal #1 asks "can a developer grab one anchor's code and drop it in?" On the experiment branch the answer is **yes, one directory, done**. On the main branch the answer is **yes, but you have to bring `anchors/types.ts` along, preserve the parent-folder layout, and visually skim a generic interface designed for providers you don't have**. The main branch is not unusable — it's just measurably more friction at exactly the moment you most want there to be none.

A subtler issue: on the main branch, calling Etherfuse from outside the framework feels weird. `EtherfuseClient implements Anchor`, so the natural call site is `client.programmatic.getQuote({ fromCurrency: 'MXN', toCurrency: 'CETES', fromAmount: '500', ... })`. The `programmatic` indirection exists for the facet pattern, which only matters when you're swapping anchors generically. If you're using *just* Etherfuse, you're paying ergonomic overhead for an abstraction you'll never exercise. The experiment exposes `client.getQuote({ fromAsset, toAsset, sourceAmount })` directly — same call, half the words, vocabulary that matches Etherfuse's actual API.

---

## 2. Goal #2 — demo app comparison

Read both Etherfuse on-ramp flows end to end.

- `/tmp/round3-main/src/lib/components/OnRampFlow.svelte` — 581 lines, generic across providers, driven by `page.data.anchor.id`, `capabilities`, `flowStyles`, `requiresWalletAuth`. Routes through `[provider]/[direction]` (`/tmp/round3-main/src/routes/anchors/[provider]/[direction]/+page.svelte`, 67 lines) that selects `OnRampFlow` / `OffRampFlow` / `InteractiveRampFlow` based on capabilities.
- `/tmp/round3-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte` — 711 lines, Etherfuse-specific from the first line. Uses `EtherfuseQuote`, `EtherfuseSavedBankAccount`, `EtherfuseKycStatus` directly. SPEI/PIX rail branching is hard-coded in the template.

**Main branch wins clearly here.** This is exactly what shared interfaces are for. The main branch's `OnRampFlow` is one file that drives both Etherfuse and the test anchor, plus any future programmatic anchor. The experiment's per-provider flows duplicate the polling logic, the state machine, the error handling, the sandbox helper, the trustline gating. The experiment ships **four testanchor flow files** (`programmatic/onramp`, `programmatic/offramp`, `interactive/onramp`, `interactive/offramp`) totaling 1,570 lines of Svelte where the main branch handles all four with a single mode toggle.

There's also a real footgun on the experiment side: the off-ramp pages are 759 lines each (Etherfuse) and 458 lines (testanchor programmatic). Most of that is polling and signing boilerplate. If you fix a bug in one — say the polling timeout — you have to fix it everywhere by hand. The main branch has one place to fix.

But: Goal #2 is the *secondary* goal, and the demo flows are not what a Next.js or Express user will copy. They'll copy the client. So the demo win mostly matters for keeping this repo internally maintainable, not for the developer audience.

---

## 3. Code shape: forced vs natural

**Where the main branch feels forced.** `EtherfuseClient` has both `private async createCustomer(input)` and a public `programmatic: ProgrammaticOps` object that delegates back via arrow-function trampolines (`client.ts:106-118`). Two surfaces per method, pure overhead to satisfy the interface. Shared `OnRampTransaction` carries `requiredInfo` and `awaitingCustomerInfo` that only the SEP-6 test anchor populates — the shape is becoming a union-by-convention. `CreateOnRampInput.bankAccountId` is optional in the interface but required by Etherfuse at runtime.

**Where the experiment feels forced.** Four testanchor flow pages (1,570 lines of Svelte) duplicating polling/sandbox/error scaffolding around a single 355-line client. Server-side singleton-per-provider files (`etherfuseInstance.ts`, `testanchorInstance.ts`) are functionally identical boilerplate; will trend toward a factory at provider count 3+. Eight `/api/anchor/etherfuse/*` routes + five `/api/anchor/testanchor/*` routes — each new anchor adds another six to eight.

**Overbuilt.** Main: the `flowStyles` capability flag with mode-toggle UI is impressive engineering for a project with one dual-facet anchor today. The 825-line `types.ts` includes commented `// Ready to add when needed: ACH, SWIFT` stubs. Experiment: thin per-provider client wrappers (`api/etherfuse.ts` 215 LOC, `api/testanchor.ts` 226 LOC) reproduce wrapping work; main's `api/anchor.ts` handles both in 573 LOC.

**Underbuilt.** Experiment lacks any shared base for flow-page bookkeeping. Main offers zero typed safety around which optional fields a specific anchor populates.

---

## 4. Adding the next anchor — hypothetical Koywe

Per `project_koywe_integration.md`: Koywe is programmatic, USDC-on-Stellar + ARS, Argentina.

**Experiment branch:**

1. `mkdir src/lib/anchors/koywe`. Create `client.ts`, `types.ts`, `index.ts`. ~600 LOC. No shared interface to satisfy, no facets, no capability flag matrix.
2. Create `src/lib/server/koyweInstance.ts` (~20 LOC clone).
3. Add `src/lib/api/koywe.ts` thin client (~200 LOC).
4. Add 6-8 `/routes/api/anchor/koywe/*/+server.ts` files.
5. **Build new `routes/anchors/koywe/{onramp,offramp}/+page.svelte` flows from scratch** — there's no shared `OnRampFlow`. Can start by copying Etherfuse's pages but they're Etherfuse-shaped (KYC iframe, SPEI/PIX, 409 recovery). Probably 700-900 LOC per direction.
6. Add to `config/anchors.ts`, `config/regions.ts`, `constants.ts`.

Total new code: ~2,500–3,500 LOC. Most of it Svelte UI duplication.

**Main branch:**

1. `mkdir src/lib/anchors/koywe`. Implement `Anchor` (with just the `programmatic` facet), satisfying the shared interface. Wire up the public `programmatic` delegation table. ~700-900 LOC because you're also mapping to the shared types — some impedance because Koywe's API may use different field names than `fromCurrency/toCurrency`.
2. Add a case to `anchorFactory.ts` (2 lines).
3. Add to `AnchorProvider` union type (1 word).
4. Add to `config/anchors.ts`, `config/regions.ts`, `constants.ts`.
5. **No new flow pages** — the existing `[provider]/[direction]` route picks it up automatically because `OnRampFlow.svelte` is generic.
6. May need a new capability flag or two if Koywe has a quirk not yet modelled (e.g. ARS-specific requirements).

Total new code: ~1,200–1,500 LOC. UI for free.

**This is the strongest argument for the main branch's architecture in its current form: the marginal cost of provider #3 is much lower on main.** If the project really does add Koywe + Coins.ph + PDAX, the main branch's investment in shared UI pays back hard.

But notice the trade-off: on main, the new client has to *fit* the interface. If Koywe's quirk doesn't fit cleanly, you either add a new capability flag (interface bloat) or smuggle the quirk through optional fields (semantic drift, see §5). On the experiment branch, Koywe can be whatever Koywe is.

---

## 5. Drift surfaces and maintenance risk

**Main branch.** Sentinel-value drift in shared types — Etherfuse's `mapOnRampTransaction` returns `quoteId: ''`, `fromCurrency: ''`, `toCurrency: ''`, `stellarAddress: ''` because Etherfuse's API doesn't surface those, but the interface promised strings. Capability-flag explosion: `AnchorCapabilities` already has 13 flags (`deferredOffRampSigning`, `requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `fiatAccountRegistration: 'inline' | 'hosted'`, etc.). Each new provider with a quirk adds another. The `requiredInfo` / `awaitingCustomerInfo` fields on `OnRampTransaction` exist purely for the test anchor's SEP-6 `pending_customer_info_update` path; provider #3's quirk will add another pair.

**Experiment branch.** UI duplication will calcify — six flow pages averaging 400–760 LOC each, sharing no polling/error/sandbox base. CORS-proxy routes duplicate per provider (6–8 `+server.ts` files each). Cross-layer renames are unprotected: rename a client method and you must hand-update server route, client wrapper, and every page. No constraint that future providers' clients converge on a shape, so mental models will gradually fragment.

---

## 6. Specific risks

**Main branch.** (1) The shared interface will need a breaking refactor at provider #4 or #5 — today's shape is fit to Etherfuse + test anchor and will pressure-bloat with each new provider's quirk. (2) Pastability degrades silently as `types.ts` grows; the "drop-in" promise erodes one type at a time with no test catching it. (3) The `programmatic` facet's delegation table is pure duplication — every method written twice (private class method + arrow trampoline), easy to forget to wire.

**Experiment branch.** (1) UI duplication will calcify — six flow pages at 400–760 LOC, polling/timeout knobs will drift. (2) Adding provider #3 is genuinely expensive — ~2,500–3,500 LOC including UI duplication. (3) No shared "pattern for integrating anchors" affordance — a developer learning the project has to learn each anchor's idioms separately.

---

## 7. Bottom-line recommendation

**Recommend the experiment branch's architecture for the client code; recommend porting the main branch's shared UI components into the experiment branch as a separate layer.**

Rephrased — the right architecture is roughly:

- **Client code (`/anchors/*`)**: experiment's per-provider, self-contained, no shared interface. This is the paste-target, and self-contained beats unified for paste-targets.
- **Demo app**: main's shared flow components, but built *on top of* the per-provider clients via a thin adapter layer that lives in `/lib/components/` or `/lib/flows/`, not in `/lib/anchors/`. The shared types should be a demo-app concept, not an anchor-library concept.

If forced to pick one branch as-is, I'd pick the experiment. Here's why: the project's stated primary goal is paste-targets, and the empirical paste test punishes the main branch concretely. The maintenance cost of the experiment's UI duplication is real but bounded (two anchors today, maybe five by end-of-year, all internal). The cost of the main branch's interface drift is unbounded — every provider adds capability flags and sentinel-string fields, and that compounds.

The main branch is the better library *if* you're building a hosted multi-anchor SaaS. It's the worse library if you're publishing reference code for other builders to copy.

---

## 8. What would change my mind?

1. **A paste-target test where the main `Anchor` interface adds value externally** — a scratch project importing two anchors and swapping at runtime, where the unified type makes the consumer code meaningfully smaller. If the target audience is multi-anchor integrators (an aggregator), my conclusion flips.
2. **Three production builders who copied a single anchor's directory from main and shipped.** If they survived the `types.ts` adjacent-file dependency and reported the shared types were *helpful*, the friction I measured is in practice trivial.
3. **Evidence that the experiment's UI duplication caused a real user-visible bug.** If polling timeouts drift between Etherfuse and testanchor flows in a way users hit, the main branch's deduplication wins on operational grounds. Today the duplication is theoretical risk.
