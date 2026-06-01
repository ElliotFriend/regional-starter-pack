# Agent 2 Review — Round 6

**Bottom line up front:** For Goal #1 (copy-paste-friendly client code), the **experiment is clearly better**. For Goal #2 (SvelteKit demo app), v1.0.0 has a tighter component story but pays for it in capability-flag spaghetti, and that price gets worse — not better — as you add anchors. Weighted 60/40 toward Goal #1, I'd ship the experiment's anchor library shape and keep some — not all — of v1's component reuse where it still earns its keep.

---

## 1. Empirical paste-target test

For both states I copied the Etherfuse provider into a fresh scratch dir at `/tmp/round6-scratch-{v1,experiment}/`, wrote an identical `scratch.ts` that constructs the client and calls `createCustomer`, stubbed `globalThis.fetch`, and ran `npx tsc --noEmit` + `tsx scratch.ts`.

### Experiment

- Copied: **one directory** — `src/lib/anchors/etherfuse/` (4 files, 3 source).
- Set up `tsconfig.json` + `package.json` with `@stellar/stellar-sdk` and `@types/node`. Nothing else.
- `npx tsc --noEmit` → exit 0 on first try.
- `tsx scratch.ts` → ran, logged the stubbed POST, printed the customer UUID and `kycStatus: not_started`.
- Total time-to-first-call: < 2 minutes. Zero adaptation.

### v1.0.0

- Copied `src/lib/anchors/etherfuse/`, then immediately got `Cannot find module '../types'` from `client.ts:39`. The client imports the shared `Anchor` interface and `AnchorError` from `../types` (`src/lib/anchors/types.ts`, 654 lines).
- Copied `types.ts` into the parent dir.
- Got a second error: `Module '"@stellar/stellar-sdk"' has no exported member 'StrKey'` — this is just my scratch's older SDK version, identical on both states, ignorable.
- After copying `types.ts`, `npx tsc --noEmit` → exit 0; `tsx scratch.ts` → ran.
- Files needed: **2 source files plus the shared interface module**. Time-to-first-call was longer because a paste-target user has to (a) discover that `types.ts` exists at the parent level, (b) decide what to do with its 654 lines of mostly-unrelated content — types covering BlindPay's `blockchainWalletId`, Transfero's `RampIdentity`, AlfredPay's bank account shapes, KYC document requirements, capability flags this user will never read, etc.

**Key observation about v1's `types.ts`:** Of its ~30 exported types, only ~12 are actually used by Etherfuse (`AnchorCapabilities`, `TokenInfo`, `Customer`, `Quote`, the on/off-ramp transactions, the customer/quote inputs, `KycStatus`, `TransactionStatus`, `AnchorError`). Everything else is dead weight when pasted into a non-Etherfuse project — and worse, the payment-instructions discriminated union (`SpeiPaymentInstructions | PixPaymentInstructions`) is a closed set; if you paste this into a project that needs ACH or SWIFT, you have to edit the shared file.

The experiment's `etherfuse/types.ts` is bigger (652 vs 449 lines) because it inlines its own client output types and raw API shapes — but every line is Etherfuse-specific. A paste-target reader can grep for what they need in one file.

### Verdict on Goal #1

Experiment wins decisively. The directories really are self-contained — `etherfuse/` has zero cross-anchor imports; `testanchor/` only pulls `../sep` (and that's documented). v1's claim that `anchors/` is portable is technically true, but in practice you must paste **the whole anchors directory** to keep `../types` resolvable. A developer who wants just Etherfuse for their Next.js project gets a 654-line shared types file full of code paths for four anchors they'll never use.

---

## 2. Goal #2 — flow page comparison

I read v1's `OnRampFlow.svelte` (436 lines) and the experiment's `/anchors/etherfuse/onramp/+page.svelte` (711 lines).

**v1's `OnRampFlow.svelte`** is genuinely elegant when you squint at it: one component, one URL, switches on `page.data.anchor.id`. But the body is riddled with `capabilities?.requiresBlockchainWalletRegistration`, `capabilities?.deferredOffRampSigning`, `capabilities?.requiresBankBeforeQuote`, `capabilities?.requiresAnchorPayoutSubmission`, `capabilities.kycFlow === 'iframe' | 'form' | 'redirect'`. `RampPage.svelte` (527 lines) and `OffRampFlow.svelte` (767 lines) compound this — `RampPage` has at least nine separate `capabilities.x` branches in setup logic alone. Every flag exists because **one specific anchor needed it**: `requiresBlockchainWalletRegistration` is BlindPay's; `requiresBankBeforeQuote` is Abroad's; `kycFlow: 'iframe'` is Etherfuse's. This is the classic "shared abstraction that drifts into a switch statement" pattern.

**The experiment's `etherfuse/onramp/+page.svelte`** is 711 lines, all Etherfuse-shaped, no capability flags, no branching on provider. Reads top-to-bottom like a tutorial. Lines 81–95 do an in-place adaptation from `EtherfuseQuote` to `QuoteDisplay`'s structural shape — explicit and discoverable.

The experiment has duplication: every anchor reimplements wallet-connect → KYC → amount-input → quote → polling → done. ~3000 lines across six flow pages vs ~2200 across v1's shared components. ~30% more code for now, but each flow stays the shape its anchor wants.

For Goal #2, v1's component reuse looks great with N=2 anchors and starts collapsing around N=4. With five anchors implementing the same `Anchor` interface, v1's shared components have already absorbed every quirk of every anchor.

---

## 3. Code shape — natural vs. forced

**Where v1 feels forced:**
- `AnchorCapabilities` (14 flags, `src/lib/anchors/types.ts:469-494`) is a museum of "this one anchor needs this." Adding an anchor that needs anything new = adding a flag = touching every consumer.
- `PaymentInstructions` as a closed discriminated union (`SpeiPaymentInstructions | PixPaymentInstructions`) means new rails (ACH/SWIFT/Koywe's CBU) require editing the shared types file.
- `CreateCustomerInput` (lines 298-312) is the union of every anchor's needs — `publicKey?` for Etherfuse, `name?` for Transfero, `taxId?` for Brazil, `country?` for everyone — with no type-level guarantee that the caller passed what their specific anchor requires.
- The `Anchor` interface methods carry every parameter every anchor might need: `getKycUrl?(customerId, publicKey?, bankAccountId?)` exists only because Etherfuse needs the publicKey and bankAccountId.

**Where the experiment feels forced:**
- `RampPage.svelte` is gone, but each `+page.svelte` reimplements layout/header/sidebar wiring. Drift is plausible (a fix to spacing in Etherfuse won't reach testanchor).
- The CLAUDE.md describes a "faceted Anchor interface" with `programmatic`/`interactive`/`auth` facets; the actual code has **no shared interface at all** — it's per-provider client classes with no common type. Docs and code already drift on this branch (`TestAnchorAdapter` in CLAUDE.md doesn't exist; the code has `TestAnchorRampClient`). The committed direction looks unfinished.

**Where v1 is overbuilt:** the unified `Anchor` interface for five providers that don't really share a shape. SEP-24 (interactive/hosted) and SEP-6 (programmatic) don't fit the same set of method signatures — the interface bends to a programmatic model and `interactiveUrl?: string` gets sprinkled in.

**Where the experiment is underbuilt:** the README claims a shared `sandbox.ts` helper but no shared facet pattern, no per-provider error class hierarchy, and the anchor-listing pages still need to know about every anchor by name. The factory has been replaced with per-anchor `*Instance.ts` files — 22 lines each — that will multiply linearly.

---

## 4. Adding Koywe (the next anchor)

**On v1:**
1. Create `anchors/koywe/` with `client.ts implements Anchor`.
2. Map Koywe's KYC flow onto `kycFlow: 'form' | 'iframe' | 'redirect'` — Koywe (looking at the memory file) seems programmatic, so map to whatever flow fits. Probably need a new capability flag, e.g., `requiresPhoneOtp`.
3. Add the flag to `AnchorCapabilities`, then teach `RampPage.svelte` and `OnRampFlow.svelte` how to render it.
4. Add Koywe to `anchorFactory.ts` and the `AnchorProvider` union.
5. Routes "just work" because of `[provider]/[direction]`.

**Hidden cost:** every capability flag added for Koywe ripples through the shared components. The shared OnRampFlow is now ~470 lines and gains conditional logic that fires only for Koywe but is loaded for every anchor's flow.

**On the experiment:**
1. Create `anchors/koywe/` with a standalone `KoyweClient` — no interface to implement.
2. Add `src/lib/server/koyweInstance.ts` (~22 lines).
3. Add `src/lib/api/koywe.ts` (~200 lines of client-side fetch wrappers).
4. Create `src/routes/api/anchor/koywe/{customers,quotes,onramp,offramp,...}/+server.ts` — five-to-eight new route files. Real work but mechanical.
5. Create `src/routes/anchors/koywe/{onramp,offramp}/+page.svelte` — two new ~700-line flow pages. Copy/adapt from Etherfuse's.

**Hidden cost:** flow-page duplication. If you fix a polling bug in Etherfuse you have to remember to fix it in Koywe and testanchor too. Each new anchor adds ~1500 lines of UI.

**Net:** v1 wins on raw line count, experiment wins on blast radius. Adding Koywe to v1 risks regressing Etherfuse (shared components); adding it to the experiment is verbose but won't break what already works.

---

## 5. Drift surfaces and maintenance risk

**v1's drift surfaces:**
1. The `Anchor` interface evolves whenever any anchor needs a new method/parameter. Five implementers means five places to update on every change.
2. Capability flags are the central register that everything reads — adding a flag is a multi-file change.
3. Type narrowing is loose: `CreateOnRampInput.bankAccountId?` is optional at the type level but required at runtime for Etherfuse only. No compile-time enforcement.

**Experiment's drift surfaces:**
1. Flow-page duplication: same bug fix has to land in N places.
2. No shared type means the SvelteKit app can't write provider-agnostic helpers (the doc claim of facets isn't backed by code).
3. CLAUDE.md / README drift: the docs describe a faceted `Anchor` interface that doesn't exist on this branch. Anyone reading docs and code together gets confused immediately.

---

## 6. Specific risks

**v1 risks:**
1. **Adding a fundamentally different anchor breaks the abstraction.** A SEP-24-pure anchor (Coins.ph) doesn't have a `createCustomer`/`createOnRamp` story the way Etherfuse does — the `Anchor` interface as written assumes a programmatic flow. testanchor not being plumbed through `Anchor` in v1 is the warning sign.
2. **The shared types file is a copy-paste anti-pattern for Goal #1.** Anyone pasting one provider into another project has to chainsaw the 654-line file.
3. **Capability flags will keep multiplying.** There are already 14; Koywe will add at least one, Coins.ph (interactive-only) will require restructuring rather than adding.

**Experiment risks:**
1. **Flow-page duplication is real maintenance cost.** A polling/retry/error-handling pattern improved in one anchor doesn't propagate. Six pages today, twelve at four anchors.
2. **Sidebar/header/listing pages still need to enumerate anchors.** This is fine for a curated showcase (small N) but the docs imply something more disciplined.
3. **The facet-interface story in CLAUDE.md is aspirational, not real.** Either delete it or implement it; right now it's a bear trap for the next contributor.

---

## 7. Bottom-line recommendation

Ship the **experiment's anchor library shape** (per-provider self-contained directories, no shared interface in `anchors/`). This is the only choice that makes Goal #1 honest — the paste-target test makes that unambiguous.

For Goal #2, lean back toward v1's instincts but tactically:
- Keep flow pages per-anchor (the experiment is right), but extract a few mid-level component primitives — a `<PollingTransaction>` helper, a `<QuoteWithRefresh>` — so polling/refresh patterns can be shared without forcing all anchors through one mega-component.
- Delete the unimplemented "faceted Anchor interface" story from CLAUDE.md or implement it as a thin structural type. Don't ship docs that lie about the code.
- Keep the listing page provider-agnostic via the config files, not via a shared client interface.

The experiment has the right architecture but is half-documented and half-implemented. v1 has a complete-feeling architecture that's structurally wrong for the project's stated #1 goal.

---

## 8. What would change my mind

1. **If a real paste-target succeeds for v1.** If someone produces a Next.js or Express app that has just `etherfuse/` + `types.ts` and demonstrates it works without the 600+-line shared file feeling like dead weight to the receiving project — and crucially, the receiving developer reports it felt clean — then the unified interface earns its keep. My test made it compile; the experience of reading and maintaining the result is what matters.
2. **If v1 demonstrates that a SEP-24-only anchor (testanchor or Coins.ph) fits the `Anchor` interface naturally.** Right now v1 doesn't even plumb testanchor through `Anchor` — that's evidence the abstraction can't handle the interactive archetype. If v1 grew a clean facet split (the experiment's CLAUDE.md story, but actually implemented) without bloating the interface further, the architectural critique weakens.
3. **If the experiment's flow-page duplication produces a real, repeated bug** — same `pollTransaction` issue patched in three different files within a few months — that's exactly the maintenance cost v1's abstraction was paying for, and it would make the trade-off real instead of hypothetical. (I expect this *will* happen eventually; the question is how soon and how often.)
