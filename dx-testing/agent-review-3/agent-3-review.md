# Round 3 review — `main` (unified `Anchor`) vs `experiment/eff-anchor-interface` (bespoke per provider)

## Bottom line up front

For Goal #1 (paste-target portability), **the experiment branch is the better
shape**. The unified `Anchor` interface on `main` is well-designed and well-doc'd,
but every pasted client drags along a generic 825-line `types.ts` that contains
substantial scaffolding for capabilities and facets the recipient's project does
not have and may never need. The experiment branch's clients are genuinely
self-contained — one directory, one external dep (`@stellar/stellar-sdk`), zero
references to a shared interface module.

For Goal #2 (demo app), the trade is real but smaller: `main` saves substantial
code via shared flow components; experiment's per-provider pages are duplicated
but each page reads top-to-bottom as one story and is an excellent reference
implementation. Given the stated weighting (60/40), the portability win on
experiment outweighs the demo-app duplication on `main`.

I'd ship the experiment branch — but with the caveats below.

## Empirical paste-target test

Same test on both branches: copy Etherfuse, write `scratch.ts` that stubs
`globalThis.fetch`, instantiate the client, call `createCustomer` with an
intentionally invalid pubkey to trigger the `INVALID_PUBLIC_KEY` error path,
then `npx tsc --noEmit` and `npx tsx scratch.ts`.

### Experiment branch

Steps:

1. `cp -r /tmp/round3-experiment/src/lib/anchors/etherfuse /tmp/scratch-3-experiment/etherfuse` — done.
2. Wrote `scratch.ts` importing `{ EtherfuseClient, EtherfuseError }` and `type { EtherfuseCustomer }` from `./etherfuse`.
3. `npm install @stellar/stellar-sdk typescript`.
4. `npx tsc --noEmit` — passed with zero output (clean).
5. `npx tsx scratch.ts` — printed `expected error path INVALID_PUBLIC_KEY 400`.

Files copied: 3 (`client.ts`, `types.ts`, `index.ts`) plus `README.md`. Payload
1,451 lines of TS. The only `import` from outside the directory is
`@stellar/stellar-sdk` (for `StrKey`). No further adaptation needed.

### Main branch

Steps:

1. `cp -r /tmp/round3-main/src/lib/anchors/etherfuse /tmp/scratch-3-main/etherfuse`.
2. `grep "from '../"` revealed `client.ts` imports ~14 types and `AnchorError` from `../types`. So I had to also `cp /tmp/round3-main/src/lib/anchors/types.ts ...` AND preserve the parent directory structure (etherfuse must sit under an `anchors/` parent for `../types` to resolve), so I restructured the scratch into `anchors/types.ts` + `anchors/etherfuse/...`.
3. Wrote `scratch.ts` importing `EtherfuseClient` from `./anchors/etherfuse` and `{ AnchorError, type Customer }` from `./anchors/types`. Calls had to go through `client.programmatic.createCustomer(...)` rather than `client.createCustomer(...)` because the public-facing surface is the facet.
4. `npx tsc --noEmit` — passed cleanly.
5. `npx tsx scratch.ts` — printed `expected error path INVALID_PUBLIC_KEY 400`.

Files copied: 4 (`client.ts`, `types.ts`, `index.ts` from etherfuse plus the
shared `anchors/types.ts`) plus README. Payload 2,256 lines, including ~825
lines of `Anchor`/facet/capability scaffolding the recipient project has no use
for: `WalletAuthOps`, `InteractiveOps`, `StartInteractiveInput`,
`KycSubmissionData`, `KycRequirementsQuery`, `PixPaymentInstructions`, etc. The
recipient's IDE will autocomplete these types even though their project doesn't
have a SEP-24 anchor. The directory structure has to be preserved or every
`../types` import has to be rewritten.

### What this tells me

Both compile and run. The honest difference is in the **payload shape**:

- Experiment: a single directory you can drop anywhere, named after the
  provider, with provider-named types (`EtherfuseCustomer`, `EtherfuseQuote`,
  `EtherfuseError`). Cognitively self-contained.
- Main: a directory plus a sibling `types.ts` that the recipient now owns. That
  `types.ts` is the union of every anchor's needs — useful inside this repo,
  noise outside it. Renaming or trimming it requires editing every type import
  in `client.ts`. Until they do, they pay a maintenance tax on code they don't
  use.

For Goal #1 ("a developer should be able to grab one anchor's code, drop it
into their project, and use it") the experiment branch wins this test on every
axis that matters: file count, parent dir requirement, dead-type surface,
self-explanatory names, and absence of `client.programmatic.method()`
indirection.

## Goal #2 — Demo app shape

I read `/tmp/round3-main/src/lib/components/OnRampFlow.svelte` (581 lines) and
`/tmp/round3-experiment/src/routes/anchors/etherfuse/onramp/+page.svelte` (711
lines) end-to-end.

**Main's `OnRampFlow`** is impressively generic: it never mentions a provider
name; it reads `page.data.capabilities` to branch behavior. A single flow plus
a single `[provider]/[direction]` route serves every anchor. Elegant.

**Experiment's `etherfuse/onramp/+page.svelte`** is the opposite trade. The
entire onramp story is in one file: region-specific defaults, state machine,
polling, sandbox button, KYC iframe. Longer per file but every step is in
front of the reader. As a *reference implementation* for someone building
their own Etherfuse on-ramp, this is the artifact you'd want. Main's
`OnRampFlow.svelte` demands the reader load capabilities, the api layer, the
factory, `RampPage.svelte`, the load function, and the auth store
simultaneously to follow what's happening.

Total app code is roughly comparable; the *distribution* differs. Main is
denser per LOC; experiment is more linear per page.

## Code shape — where each approach feels forced

**On `main`:**

- `EtherfuseClient` in `main` doesn't really want to be faceted. It exposes
  `programmatic: ProgrammaticOps` (lines 106–118) that just delegates each
  method to a `private async` method. The private methods do the work; the
  facet object is glue. For a single-archetype provider, this is overhead.
- The `Anchor` interface has `AnchorCapabilities` with ~17 boolean flags
  (`kycUrl`, `requiresOffRampSigning`, `deferredOffRampSigning`,
  `requiresAnchorPayoutSubmission`, ...) — these are runtime-detectable feature
  flags that the UI consumes. Every new wrinkle in a new anchor's flow tends to
  produce a new flag. That's a growing surface.
- `OnRampFlow.svelte` + `OffRampFlow.svelte` + `RampPage.svelte` together are
  ~2,000 lines of "drive every anchor through one form". Whenever a new anchor
  has a quirk that doesn't fit, you either bake a new capability flag or split
  the component.

**On `experiment`:**

- The Etherfuse client's `getKycStatus` returns `EtherfuseKycStatus` (the raw
  string `'not_started' | 'proposed' | 'approved' | 'approved_chain_deploying'
  | 'rejected'`). On `main` it's already mapped to the shared `KycStatus`. This
  pushes the "is approved_chain_deploying still 'approved'?" decision into the
  page component (and yes, it has the check; see line 138 of the onramp page).
  Reasonable but easy to forget for a third anchor.
- Per-provider API client modules (`$lib/api/etherfuse.ts`, `testanchor.ts`)
  duplicate the apiRequest/postJson helpers (lines 39–57 of each). Small but
  it'll grow with each new anchor.
- The on/off-ramp pages for Etherfuse share ~70% of their structure. Two files
  drift over time.
- `TestAnchorRampClient` does not have a dedicated test file (`main` has
  `tests/anchors/testanchor/anchor.test.ts`).

## Adding the next anchor (e.g. Koywe)

**On `main`:**

1. New client implementing `Anchor` with `programmatic` facet. Map Koywe's
   field names to the shared `Customer`/`Quote`/`OnRampTransaction` types.
2. Add to `anchorFactory.ts` (one switch case, one type literal).
3. Add one CORS proxy line where needed — most existing `[provider]` routes
   already handle it.
4. Configure profile + regions in `config/anchors.ts` + `config/regions.ts`.
5. Done. The dynamic `[provider]/[direction]` route serves the UI immediately.

Risk: if Koywe has any flow quirk that doesn't match the shared
on/off-ramp pages, you either add a capability flag and an `{#if
capabilities.…}` branch, or fall back to a per-provider page (and now you've
got both architectures in the codebase).

**On `experiment`:**

1. New client in `anchors/koywe/`, with its own `KoyweClient`, `KoyweError`,
   `Koywe*` types.
2. New `lib/server/koyweInstance.ts`, `lib/api/koywe.ts`.
3. New `/api/anchor/koywe/*` routes (one per operation).
4. New `routes/anchors/koywe/onramp/+page.svelte` and `offramp/+page.svelte`.
   Roughly 700 lines each, cloned from etherfuse's pages, then heavily edited.
5. Configure profile + regions.

Risk: more boilerplate per anchor. The third + fourth pages start to feel
copy-pasta-y. If a developer adds Koywe sloppily, drift between Etherfuse and
Koywe pages will compound (one might have polling timeouts the other doesn't,
or differing error display patterns).

## Drift & maintenance risks

### `main`

1. **`AnchorCapabilities` will keep growing.** It already has 17 flags. Each
   new flag adds another piece of trivia future maintainers must learn, and
   another branch the unified flow component needs. The next anchor's quirky
   thing will be the test.
2. **Shared types ratchet upward.** Adding fields to `Customer` or
   `OnRampTransaction` for one anchor changes the public shape of every
   pasted client. There's gravitational pressure to keep adding optional
   fields rather than break compatibility.
3. **The faceted interface adds indirection on the paste path.** The
   recipient must learn that `client.programmatic.method()` is the entry
   point, that `programmatic` is just a delegation table, and that `auth`
   parameters are optional and ignored by some providers. That's three
   non-obvious things for an API-key-only provider.

### `experiment`

1. **Per-provider page duplication will drift.** Two on-ramp pages today, six
   already (etherfuse onramp/offramp + testanchor programmatic/interactive
   onramp/offramp). A polling-timeout fix on one needs to be applied to the
   others by hand.
2. **Server-side singleton duplication.** Each new anchor gets its own
   `*Instance.ts` (literally 20 lines of the same template). Trivial but adds
   up.
3. **No shared "anchor health" surface.** Where main has `instance.capabilities`
   to surface kyc style, expected rails, deferred signing etc, experiment's
   pages just *know* their anchor — there's no programmatic listing of "what
   does this provider support". The `/anchors` index page can't introspect
   uniform feature info. (It still works, but it shows what's there based on
   manual config.)

## Recommendation

**Ship `experiment`.** It nails Goal #1 (the higher-weighted goal): a developer
can `cp -r etherfuse/` and they have a working client with provider-named
types, one external dep, and no inherited scaffolding. The demo pages are
longer but they read end-to-end as honest reference implementations — which is
also Goal #2's actual point (inspiration for other builders), not "show off a
clever abstraction".

Things I would change on `experiment` before merging:

1. Extract a tiny `apiRequest`/`postJson` helper that the per-provider API
   modules can re-use. Maybe 30 lines in `$lib/api/_http.ts`.
2. Add a `TestAnchorRampClient` test file mirroring main's `anchor.test.ts`.
3. Provide a small `mapToCanonicalKycStatus(status)` helper or normalize
   `approved_chain_deploying` → `approved` inside the client so consumers don't
   have to memorize Etherfuse's edge case.
4. The on/off-ramp pages share a lot — pull just the polling state-machine and
   the trustline-status interaction into a small `lib/utils/`. Resist further
   extraction; the current shape is most of the win.

## What would change my mind

1. **A third "weird" anchor.** If you integrate Koywe and PDAX and find that
   `main`'s capability flags + shared flow components absorb both with only
   minor tweaks (no new flow components, ≤2 new capability flags), then the
   payoff of the unified abstraction starts to dominate. Conversely if `main`
   needs a bespoke flow page for either, the experiment shape wins by a wider
   margin.

2. **Evidence the paste-target audience is internal only.** If the actual
   primary consumer is the Stellar team's other apps (which already depend on
   the shared `Anchor` interface and benefit from a single contract), the
   60/40 weighting flips. The pasted-into-Express-app developer is hypothetical
   today; the Stellar team is real.

3. **A consumer who needs to swap anchors at runtime.** `main`'s `Anchor`
   interface earns its complexity when there's polymorphism over anchors —
   e.g. "let the end user choose Etherfuse or Koywe at runtime, same code
   handles both". If that becomes a real product need (it isn't right now —
   each region has one curated anchor), the unified interface stops being
   over-engineering and starts being load-bearing.
