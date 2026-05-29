# Round 3 Meta-analysis

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Setup:** identical to round 2 — explicit 60/40 goal priority, worktrees at `/tmp/round3-{main,experiment}` for memory isolation, required empirical paste-target test, "what would change your mind?" question, neutral CLAUDE.md/READMEs.

## Disposition

| Reviewer | Goal #1 (paste) | Goal #2 (demo) | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (decisive) | mixed (main cleaner today but carries dead code) | **Adopt experiment** |
| Agent 2 | experiment (decisive) | main (decisively cleaner) | **Adopt experiment** (60/40 weight dominates) |
| Agent 3 | experiment (decisive) | mixed (denser vs more linear) | **Ship experiment** |

**3-0 for experiment this round, same as round 2, with the same paste-test evidence and the same goal-weighting reasoning.**

The combined record across all three rounds — nine independent reviewer instances — is **8-1 for experiment** (round 1's lone dissenter is the only data point on the other side, and round 1 didn't have the empirical paste test).

## What round 3 confirms (the replicability finding)

This is the key result of running round 3. The setup that produced the round 2 verdict (worktrees + paste test + neutral docs + 60/40 weighting) is **reproducible**: three fresh agents, never having seen rounds 1 or 2, reach the same conclusion through the same evidence chain.

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Disposition | 2-1 experiment | 3-0 experiment | 3-0 experiment |
| Empirical paste test | No (reading only) | Required | Required |
| Paste-test result on experiment | — | 3 files, clean compile, first try | 3 files, clean compile, first try |
| Paste-test result on main | — | 4 files + 826-LOC types.ts + `programmatic.` indirection | 4 files + 826-LOC types.ts + `programmatic.` indirection |
| Capability-flag count reported | "~15, a smell" | "12-14, scaling badly" | "16-17, ratchet upward" |
| Recommendation | Continue on experiment, with caveats | Adopt experiment, with the same caveats | Adopt experiment, with the same caveats |

Round 3 sampling variance shows up in surface details (which exact files cited, which exact flag count, which exact LOC totals) but the architectural verdict is identical. The conclusion is **robust** to reviewer-instance variation under this setup.

## New evidence specific to round 3

Even with the same setup, fresh reviewers found small new observations that rounds 1 and 2 didn't surface:

1. **`OffRampFlow.svelte` has dead-on-arrival code.** Agent 1 noticed: the off-ramp flow has a three-way branch — `if (signableTransaction)` happy path → `else if (capabilities?.deferredOffRampSigning)` Etherfuse polling path → `else` "build a payment locally" fallback. The fallback branch isn't exercised by *any current provider* (Etherfuse defers, testanchor hosts via SEP-24). It exists because the abstraction posits providers who don't exist. This is the cleanest possible "abstraction without a customer" example.

2. **`approved_chain_deploying` KYC status leakage.** Agent 3 caught a subtle drift surface: main's `TestAnchorAdapter` maps Etherfuse's `approved_chain_deploying` → `'approved'` inside the adapter, but experiment returns the raw native value, which means the page component has to know to treat both as "approved" (and the etherfuse onramp page does, at line 138). Experiment pushes more KYC-status normalization onto consumers. Manageable — a `mapToCanonicalKycStatus()` helper would centralize it — but worth naming.

3. **Agent 2's framing**: *"Main is the better library if you're building a hosted multi-anchor SaaS. It's the worse library if you're publishing reference code for other builders to copy."* This is the cleanest one-sentence statement of the trade-off the three rounds have converged on. The project is the latter.

## What's consistent across all three rounds

Unanimous findings now confirmed across 9 reviewer instances:

1. **`TestAnchorAdapter` (888 LOC) is hard to defend.** Every reviewer in every round.
2. **The `programmatic: ProgrammaticOps = { (input) => this.foo(input) }` arrow-fn delegator on main is busywork.** And: every reviewer in rounds 2 and 3 independently noticed the `@example` JSDoc on `EtherfuseClient` documents the wrong (uncompilable) call site.
3. **Per-provider hub pages > dynamic `[provider]/+page.svelte`.** Unanimous in every round.
4. **Polling + SEP-10 auth boilerplate on experiment needs extraction.** Round 1 + round 2 + round 3, every reviewer.
5. **`AnchorCapabilities` flag count is empirically scaling badly.** Reviewer estimates ranged 12–17; the direction is consistent.
6. **`src/lib/anchors/sep/` modules are correct, byte-identical on both branches, and stay.**

## Falsifiability — what every round's reviewers said would change their mind

This is convergent across nine reviewers:

**Would flip toward main:**
- A real third programmatic anchor (Koywe, PDAX, or similar) lands cleanly on main with no new capability flags and no new optional fields on shared types. **9 of 9 reviewers cite this.**
- A real downstream user successfully pastes Etherfuse from main into their own Next.js/Express project. **6 of 9 reviewers cite this.**

**Would lock in experiment:**
- A polling-logic bug ships because flow pages drifted. **3 of 9 cite this.**
- An external developer pastes experiment in <10 minutes successfully. **3 of 9 cite this.**

The "would flip to main" criteria are unusually specific and empirically testable. The Koywe integration would be the most direct test of either side's claims — round 3 makes this the natural next step regardless of what happens with the merge decision.

## Consensus remediation list (carried forward from rounds 1 + 2, reaffirmed in round 3)

Before merging:

1. **Extract `usePolling` / state-machine helper.** Every round, every reviewer.
2. **Port main's `ramp/` step sub-components** (`QuoteStep`, `FiatAccountStep`, `CompletionStep`) into experiment as structural-prop primitives. Rounds 2 + 3.
3. **Resolve the `TestAnchorClient` + `TestAnchorRampClient` co-existence wart.** Rounds 2 + 3.
4. **Restore testanchor test coverage.** Round 1, reaffirmed round 3 (agent 3 explicitly: "TestAnchorRampClient does not have a dedicated test file").
5. **Extract a tiny `apiRequest`/`postJson` helper** that `api/etherfuse.ts` and `api/testanchor.ts` can share. Round 3 agent 3 added this. ~30 LOC in `$lib/api/_http.ts`.
6. **Normalize `approved_chain_deploying` → `approved` inside `EtherfuseClient`** so consumers don't memorize the edge case. Round 3 agent 3.

Items 1, 2, 4, 5 are the highest-priority "do this before merging" picks.

## Bottom line

**Adopt the experiment branch.** Three independent runs of three independent reviewers have now produced the same verdict. The deciding evidence is empirical (paste test) and has been reproduced six times across rounds 2 and 3. The "would flip our minds" criteria are all forward-looking: a third anchor lands cleanly on main, or a downstream user reports the paste experience is fine. Neither has happened yet, and the round-3 setup gave reviewers every chance to surface evidence in main's favor.

This is now the most thoroughly tested architectural decision the project has made. Three rounds × three reviewers × empirical paste test × falsifiability check × isolated worktrees = if there's a reason to doubt the conclusion, it isn't visible in any of the available evidence.

## What three rounds prove that one round didn't

The robustness check matters. A single 3-0 result could plausibly be agent-sampling variance or a quirk of one prompt. Two independent 3-0 results with the same setup, reached through the same evidence chain, is much stronger — the conclusion is replicable.

The right next step is **action** (either merge experiment and proceed to Koywe, or run the Koywe integration as a head-to-head and let the result decide). Another round of architectural review would not move the needle: nine reviewers have weighed in, eight of nine recommend experiment, and the empirical test that swung agreement is the same one that would run identically a fourth time.

The single piece of evidence that would still meaningfully shift this — a real third anchor's integration experience on each branch — is exactly what doing the work next would produce.
