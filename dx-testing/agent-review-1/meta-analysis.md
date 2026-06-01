# Meta-analysis: three independent reviews of `main` vs `experiment/eff-anchor-interface`

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

## Disposition

| Reviewer | Goal #1 winner | Goal #2 winner | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (wide margin) | experiment (clear) | **Merge experiment, don't look back** |
| Agent 2 | experiment (narrow) | **main (decisively)** | **Keep main + cherry-pick experiment instincts** (proposes a "third path") |
| Agent 3 | experiment (decisive) | experiment (smaller margin) | **Continue on experiment but don't merge yet** — fix tests + extract helpers + update CLAUDE.md first |

Two votes for experiment, one for main. But that headline understates the signal — the reviewers agree on more than they disagree on, and the disagreement isn't really about *which branch is better*, it's about *what kind of demo the project is supposed to be*. That distinction matters more than the vote tally.

---

## Strong agreements (robust signals across all three)

These are the things every reviewer landed on independently. Treat them as conclusions even if you reject the rest of this document.

1. **Goal #1 (paste-friendly clients) favors experiment.** Even agent 2, the dissenter, concedes this. Main's Etherfuse client `implements Anchor` and drags in the 825-line shared `types.ts` (most of which is unused by Etherfuse); experiment's Etherfuse client has one external dependency (`@stellar/stellar-sdk` for `StrKey`).

2. **The testanchor case is the smoking gun.** Main's `TestAnchorAdapter` is 888 LOC of mapping logic that exists solely to fit SEP into a non-SEP-shaped interface. Experiment's `TestAnchorRampClient` is 355 LOC and returns `Sep6Transaction` / `Sep24Transaction` / `Sep12CustomerResponse` directly. Every reviewer cites this. **For a project whose audience includes SEP integrators, the adapter is reverse pedagogy** — it hides exactly what they need to learn.

3. **The `programmatic: ProgrammaticOps = { … }` arrow-fn delegator pattern on `EtherfuseClient` and `TestAnchorAdapter` is busywork.** Three reviewers call it out independently. It exists purely to satisfy `implements Anchor`. The methods are then `private` so callers go through the facet. Two surfaces for one behavior.

4. **`AnchorCapabilities` has too many flags.** Counts vary between reviewers (13–15 depending on what's counted), but the pattern recognition is consistent: it's accreting, not designing. Pairs like `kycUrl`+`kycFlow`, `sandbox`+`sandboxFiatSimulation`, `requiresOffRampSigning`+`deferredOffRampSigning` read as drift, not intent.

5. **The shared flow components on main have become *configurators*, not flows.** `OffRampFlow.svelte` at 865 LOC with 7 capability branches is the worst-case file. Even the reviewer recommending we keep these components calls this out as a problem that needs fixing.

6. **Per-provider hub pages > the dynamic `[provider]/+page.svelte`.** Unanimous, including agent 2, who otherwise wants to keep main.

7. **`CLAUDE.md` is stale on experiment.** It still describes the unified-interface model. Three independent reviewers flagged this. Whatever happens to the code, this file needs updating.

8. **Test coverage regressed meaningfully on experiment.** `tests/anchors/etherfuse/client.test.ts` shrank 3,902 → 1,157 LOC and `tests/anchors/testanchor/anchor.test.ts` (589 LOC) was deleted with no replacement. All three reviewers flag this; agents 2 and 3 explicitly call it a regression rather than a right-sizing.

9. **`ensureAuth` / `cachedAuth` / polling boilerplate is duplicated across 4–6 pages on experiment.** This is the *single biggest* recognized weakness of the bespoke approach, called out by every reviewer. The remediation is also unanimous: extract `sep10-session.ts` and a polling helper.

10. **The 825-LOC `OffRampFlow.svelte` and the 711-LOC bespoke etherfuse onramp page are *both* uncomfortably large.** Agent 1 notes 700-line `+page.svelte` files violate Svelte conventions; agent 3 explicitly recommends extracting step components.

These ten items are the high-confidence findings. If the project does nothing else this week, **address these regardless of branch direction.**

---

## Real disagreement: what is this demo *for*?

The reviewers disagree on Goal #2, and that disagreement is the heart of everything else. They're working from different priors about what "builder inspiration" means.

**Agent 1 + Agent 3's prior:** A builder integrating Etherfuse reads `routes/anchors/etherfuse/onramp/+page.svelte` and sees the actual Etherfuse integration end-to-end — customer create, KYC iframe, quote, deposit instructions, polling, done. The page reads like Etherfuse's integration guide would, if Etherfuse wrote one. Each anchor's page tells **its own story**.

**Agent 2's prior:** A builder integrating *any* Stellar anchor reads `OnRampFlow.svelte` and sees one polling-and-state-machine pattern that works for every provider. They learn the *generalizable* shape of a fiat-on-ramp integration. Each anchor's page is a thin wrapper that shows what's *different*.

Both priors are defensible. The choice between them is the whole architectural decision.

A few things tilt the balance for me:

- **The pipeline.** Three more anchors are coming (Koywe, Coins.ph, possibly PDAX), and the auto-memory notes show two of them are hard cases (Coins.ph interactive-only, PIX/Brazil thrashing). If the next three anchors fit cleanly into the existing capability flags, agent 2's prior wins. If even one of them doesn't, the "one shared flow" lesson is misleading and the abstraction has to bend. The track record so far — capability flags that exist for since-removed providers (`requiresBlockchainWalletRegistration` for BlindPay), Etherfuse's deferred-signing being a single-provider quirk — suggests the *next* anchor will also need its own flag.

- **The composition cost is asymmetric.** Going from "shared flows" → "per-provider pages" is a copy-and-edit. Going from "per-provider pages" → "shared flows" requires finding the common shape *after* you have multiple concrete pages — which is much easier than guessing it before, because the abstraction is empirical rather than speculative. **You can always rediscover the shared flow later; you can't easily unwind a wrong shared flow now.**

- **The test anchor refactor is the dominant evidence.** When even the abstraction's biggest beneficiary (SEP) is hidden behind 888 LOC of mapping code, the abstraction is being asked to do work the underlying spec already does. That's the strongest single signal for the bespoke direction.

Agent 2 is right that the duplication is real and that drift will happen — but as agent 3 notes, the duplication can be substantially attacked with two small helpers (`sep10-session.ts`, `poll.svelte.ts`) and a `KycIframeFlow.svelte` leaf component, without re-introducing the shared-flow-with-capability-flags pattern.

---

## The dissent's most interesting move: agent 2's "third path"

Agent 2 is the only reviewer who proposes a position that's *on neither branch*. Worth taking seriously because it's the kind of recommendation a code review should generate.

**The proposal:** Keep `src/lib/anchors/types.ts` as a structural **type vocabulary** (`Customer`, `Quote`, `PaymentInstructions`, `KycRequirements`, `AnchorError`) — but drop the runtime `implements Anchor` constraint, the `programmatic: ProgrammaticOps = { … }` delegator pattern, and the facet existence test. Keep main's shared flow components (`OnRampFlow`, `OffRampFlow`, `InteractiveRampFlow`) but extract `useAnchorPolling()` and `ensureSep10Token()` as reusable hooks to shrink them. Add per-provider hub pages (experiment's pattern). Trim `AnchorCapabilities` to what's actually consumed.

**Why it's tempting:** It claims to capture most of experiment's wins (no `implements`, paste-friendlier clients, per-provider hubs) without paying the duplication tax (shared flows survive).

**Why it's not free:** The structural type vocabulary is the second-strongest source of cross-anchor leakage on `main` (the first being the capability flags). `OffRampTransaction.signableTransaction` exists for Etherfuse's deferred signing; `OnRampTransaction.requiredInfo`/`awaitingCustomerInfo` exist for SEP-6's `pending_customer_info_update`; `CreateOnRampInput.bankAccountId` is Etherfuse-only; `CreateCustomerInput.taxId`/`taxIdCountry` are for a since-removed provider. The "vocabulary" is already a union of provider-specific dialects — turning `implements` into "you should informally match this shape" doesn't make the shape less leaky.

Agents 1 and 3 don't address this proposal directly, but their evidence speaks to it: the issue isn't that the runtime constraint is too strict, it's that the *vocabulary itself* is shaped by features no single provider actually uses. The empty-string filler in main's `EtherfuseClient.createOnRamp` (returning `toAmount: ''`, `fromCurrency: ''`) is the giveaway — Etherfuse can't supply those fields because the shared shape demands them at the wrong moment in the flow.

So agent 2's third path captures real wins but doesn't fully address what the other two reviewers see as the deeper problem.

**My honest read:** Agent 2's proposal is a stronger version of `main` than what's on `main` today, but it's still answering "how do we keep this abstraction" rather than "should we keep it." The dissent is conservative in a specific sense — it weights the cost of *removing* an abstraction (duplication, drift) higher than the cost of *maintaining* one (capability accretion, shape leakage, interface bend per anchor). For a curated showcase with ≤5 anchors, the maintenance cost compounds.

---

## What everyone agrees breaks regardless of branch

Pulling out the unanimous "fix this no matter what" list:

1. **Update `CLAUDE.md`** to describe whatever model the codebase actually uses.
2. **Restore meaningful testanchor test coverage** — the 589-LOC adapter test is gone with no replacement. Either port the substance to `TestAnchorRampClient` (if staying on experiment) or keep the existing one (if reverting to main).
3. **Extract `ensureAuth` / `cachedAuth` SEP-10 helpers** — currently duplicated in 4 testanchor pages.
4. **Extract a polling helper** — `pollCount` / `MAX_POLLS` / `startPolling` / `stopPolling` is hand-rolled 6 times on experiment, hand-rolled inside flow components on main.
5. **Trim or restructure `AnchorCapabilities`** — too many flags, several with no current consumer.
6. **Drop the `programmatic: ProgrammaticOps = { (input) => this.foo(input) }` delegator pattern** — busywork regardless of whether the interface stays.
7. **Add per-provider hub pages** — even the keep-main reviewer wants the dynamic `[provider]/+page.svelte` killed.
8. **Move SEP-1 toml discovery + endpoint resolution** out of `TestAnchorRampClient` into the `sep/` library if you're keeping it — agent 2 noted future SEP-compliant anchors would otherwise duplicate this pattern.

If you do nothing else from this meta-analysis, do items 1–4 before merging anything anywhere.

---

## Real disagreement on "what does adding Koywe cost?"

The agents disagree by ~3x on this estimate.

- **Agent 1**: Main 2 days if Koywe fits, 4 days if not. Experiment 2 days regardless.
- **Agent 2**: Main ~1,000–1,500 LOC, "zero changes to flow components." Experiment ~2,500–3,000 LOC, ~60% copy-with-edits.
- **Agent 3**: Main 1 day if API maps cleanly, 2–3 days otherwise. Experiment 2 days regardless.

The number agents 1 and 3 hide and agent 2 surfaces: **experiment is more LOC**. The number agent 2 hides and agents 1 and 3 surface: **experiment is more *predictable*** — there's no shared interface to bend, no capability flag to debate, no PR review that asks "does this affect Etherfuse?"

Predictability vs LOC at the cost of duplication. That's the core trade.

If the project's risk model is "shipping the next three anchors quickly matters more than line count," experiment wins. If it's "we'll have to maintain this forever and duplication will drift," main wins. The auto-memory notes — months of "Etherfuse PIX shape unknown, blocks Brazil off-ramp"; "PDAX/Philippines integration questions awaiting response"; "Coins.ph blocked on sandbox creds"; "Koywe production rate gates curated-vs-honorable-mention decision" — sound much more like the first risk model than the second.

---

## My synthesized recommendation

**Continue on experiment, but treat the unanimous remediation list as gates before merging to main.** Specifically:

1. Restore testanchor test coverage at the new client surface (`TestAnchorRampClient`).
2. Extract `src/lib/wallet/sep10-session.ts` (the `ensureAuth`/`cachedAuth`/authStore dance) and have all 4 testanchor pages use it. ~80 LOC of extracted shared code that kills ~150 LOC of duplication.
3. Extract a tiny `src/lib/utils/poll.svelte.ts` rune. All 6 ramp pages use it.
4. Extract `KycIframeFlow.svelte` as a leaf primitive (not a flow component) — the iframe + status polling. Etherfuse's onramp/offramp pages currently re-roll this; Coins.ph will need the same thing.
5. Update `CLAUDE.md` to reflect the new model.
6. Update `src/lib/anchors/README.md` (still describes the unified interface).
7. Document the **per-provider authoring template** — make the deliberate duplication named and reviewable so contributors don't accidentally drift the flows.

After those gates, the experiment branch is strictly better than `main` on Goal #1 and at least as good on Goal #2 with reduced drift risk. **Don't merge until those gates land** — agent 3 is right that the unmerged state is a regression on testing and docs.

**On agent 2's third path:** It's a credible alternative and worth considering if the project owner finds the duplication argument more compelling than the abstraction argument. But it's a third migration, not a tweak to either existing branch. If you want to go that route, do it as its own spike rather than as a rollback of the experiment work. The current experiment branch is closer to "merge with gate fixes" than the third path is to "ready to ship."

**On the goal #2 disagreement:** I'd resolve it empirically rather than philosophically. Land the Koywe integration on the experiment branch (with the helpers from items 2–4 above). If that integration goes smoothly and the Koywe `onramp/+page.svelte` reads as cleanly as Etherfuse's, the bespoke prior is validated. If you find yourself wanting to import a shared `ProgrammaticOnRampFlow` component or noticing that ~70% of Koywe's page is byte-identical to Etherfuse's *even after the helper extractions*, that's the signal to fall back to a narrower shared flow component — built empirically from three concrete pages rather than speculatively from one.

---

## Honest disclosures

- All three reviewers explicitly noted the `CLAUDE.md` discrepancy and a memory note that pre-biased the project toward the bespoke pattern. They each said they discounted these in their judgment — but they read the same code and broadly aligned on what's wrong with `main` (capability flag accretion, 888-LOC adapter, shared-component branching). That convergence on the *problems* despite different conclusions on the *solution* is the strongest signal in this meta-analysis.

- Two of the three reviewers favored the experiment branch but **all three flagged the same set of unresolved weaknesses on it**. That means the "vote" of 2-to-1 is less about disagreement on facts than disagreement on which set of problems is more tractable. Treat the unanimous *findings* as load-bearing; treat the *votes* as advisory.

- The keep-main reviewer's third path captures real wins but doesn't fully answer the strongest case against the unified interface — the type vocabulary itself is leaky, not just the runtime constraint. If you find that argument compelling, agent 2's proposal partially closes the gap but doesn't fully bridge it.
