# Round 4 Meta-analysis

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Setup:** identical to rounds 2 and 3. 60/40 goal priority (paste > demo), worktrees at `/tmp/round4-{main,experiment}` for memory isolation, required empirical paste-target test, "what would change your mind?" question, neutral CLAUDE.md/READMEs, **dx-testing/ review artifacts moved aside** so round-4 agents couldn't see prior rounds' conclusions.

## Disposition — and the round-4 surprise

| Reviewer | Goal #1 (paste) | Goal #2 (demo) | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (decisive) | main (clearly) | **Adopt experiment's library + main's UI primitives** |
| Agent 2 | experiment (decisive on Etherfuse) | main (clearly) | **Keep main** (the dissent) |
| Agent 3 | experiment (decisive) | mixed (experiment cleaner per-page, more duplicated) | **Ship experiment** |

**2-1 for experiment this round.** The unanimous 3-0 verdicts from rounds 2 and 3 did not hold. Agent 2 dissented and recommended main — even though they acknowledged experiment wins the paste test.

This is the most interesting result so far and is worth examining carefully.

## The agent-2 dissent — what it says

Agent 2's reasoning is unusually explicit about going against the stated priority weighting:

> "The two goals weight 60/40 in favor of #1, so the experiment branch is *closer* to optimal for the stated priorities, but it pays for that with substantial demo-app duplication. … as currently shipped, **I'd take main**, because main's drawbacks (a slightly fatter shared `types.ts` to copy) are smaller than experiment's (every flow page reinvents itself)."

Translated: agent 2 read the priorities, agreed experiment fits them better, and recommended against them anyway because they judged the absolute magnitude of experiment's Goal #2 cost (~2,800 LOC of duplicated flow pages) to exceed main's absolute Goal #1 cost (one extra file to copy, optional-chaining tax on the API surface).

Their "what would change my mind" lists "if the project's actual priorities flipped to 60% paste-friendly / 40% demo, I'd switch to recommending experiment" — which is internally inconsistent (those *are* the stated priorities) but reveals the disagreement: agent 2 doesn't believe the 60/40 weighting reflects the *real* trade-off, given the visible duplication cost.

**Agents 1 and 3 saw the same evidence and weighted differently.** Both also noticed the duplication; both recommended experiment with extraction work as the remediation. Agent 1: "steal main's `RampPage.svelte` + `components/ramp/*` primitives" into experiment. Agent 3: "the duplicated parts are decomposed into shared atomic components … what gets duplicated is state-machine wiring, which is provider-specific anyway."

## The combined record across four rounds

| Round | Verdict | Setup | Notes |
|---|---|---|---|
| 1 | 2-1 experiment | No paste test, no priority hint | The original dissenter (round-1 agent 2) recommended "keep main + cherry-pick" |
| 2 | 3-0 experiment | Paste test + 60/40 priority + worktrees | Unanimous; empirical evidence flipped round-1's dissenter |
| 3 | 3-0 experiment | Same as round 2 | Robustness confirmed |
| 4 | 2-1 experiment | Same as rounds 2 + 3 | New dissenter — same architectural disagreement as round 1's |

**12 reviewer instances total: 10 for experiment, 2 for main.** Both dissenters acknowledge experiment wins Goal #1 but argue Goal #2 cost is decisive in absolute terms. **No reviewer in any round has argued main wins on Goal #1.** Every dissent has been a weighting argument, not an evidence argument.

## What round 4 confirms — independent of the dissent

The unanimous *findings* across all four rounds (now 12 reviewer instances):

1. **Main's Etherfuse paste fails.** Every reviewer who ran the test independently reproduced: `cp -r etherfuse/` alone fails with `Cannot find module '../types'`. Must also copy the 825-line shared `types.ts`. **12 of 12 reviewers report this when they ran the test.**

2. **The `EtherfuseClient.programmatic` facet pattern makes the documented method names unusable.** Methods are `private`; callers must use `client.programmatic!.createCustomer(...)`. Every reviewer in rounds 2–4 caught this independently.

3. **`testanchor/anchor.ts` (888 LOC adapter) is doing pure shape-conversion that the bespoke `ramp.ts` (355–384 LOC) doesn't need.** SEP IS the unified interface; bolting another one on top is redundant.

4. **`AnchorCapabilities` flag count is in the 12–18 range** (different reviewers count slightly differently — the trend is consistent).

5. **Goal #2 cost on experiment is real**: ~2,800–3,040 LOC of provider-bespoke flow pages, with significant polling/state-machine duplication.

6. **The SEP modules under `src/lib/anchors/sep/` are correct, byte-identical, and stay** regardless of branch direction.

## What round 4 adds beyond rounds 2 + 3

1. **The 60/40 priority hint is not bulletproof.** Round 4 agent 2 explicitly read the priorities, agreed experiment matched them, and then made the call against them. The priority hint moves reviewers' default-judgments but doesn't override the duplication cost when a reviewer judges it too large. This is informative: the stated weighting changes the disposition but not unanimously, and the magnitude of the disagreement reveals where reviewers think the *true* breakpoint is.

2. **Agent 1's specific architectural proposal is clearest yet.** "Keep experiment's portable-client architecture, but lift the demo app back toward main's shape." Concrete steps: keep experiment's clients + per-provider error classes + server singletons; steal main's `RampPage.svelte` + `components/ramp/*` primitives; add one shared `+server.ts` helper. This is the actionable synthesis the three rounds have been pointing toward.

3. **Agent 3's specific proposal: "Optional `Anchor` port adapter as a *separate* file"** — not required by clients, not imported by them, just an interface developers can opt into for polymorphism. This is interesting because it captures the "shared documentation" value of the unified interface without making it a constraint on the clients.

## What everyone (across rounds) still agrees breaks

The remediation list is now confirmed across 12 reviewers:

1. **Extract `usePolling`/state-machine helper** (rounds 1–4, unanimous in every round).
2. **Port main's `ramp/` step sub-components** (`AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus`) into experiment as structural-prop primitives (rounds 2–4, every reviewer).
3. **Resolve the `TestAnchorClient` + `TestAnchorRampClient` co-existence** (rounds 2–4).
4. **Restore testanchor test coverage** for the bespoke ramp client (rounds 1 + 3 + 4).
5. **Extract `apiRequest`/`postJson` helper** for the per-provider API wrappers (round 3 + 4).
6. **Trim `AnchorCapabilities`** to flags actually consumed (rounds 1, 2, 4).
7. **Normalize `approved_chain_deploying` → `approved` inside `EtherfuseClient`** (round 3 specifically).

## Falsifiability — the convergent test

Across all four rounds, "what would change my mind" criteria converge on the same forward-looking question:

> **Can Koywe (or any third anchor in the pipeline) integrate cleanly on main without growing `AnchorCapabilities` or `CreateCustomerInput`?**

- 11 of 12 reviewers cite this. **Even the dissenters cite this.**
- Round 4 agent 2: "An anchor whose `createOnRamp` takes 3 mandatory fields that aren't on `CreateOnRampInput`, forcing either a `metadata: Record<string, unknown>` escape hatch or a new optional field. That's the moment the abstraction stops paying its tax."
- Round 1 anti-switch agent: "If Koywe genuinely slots into `OnRampFlow.svelte` and `Anchor` unchanged, the abstraction is paying for itself and my critique is wrong."

This is the empirical test the disagreement actually depends on. Architectural review can't settle it; doing the Koywe integration will.

## My synthesized recommendation

**The bottom-line recommendation hasn't changed across four rounds:** adopt experiment's per-provider portable-library architecture, port main's step primitives into the bespoke pages, and extract the polling helper.

The round-4 dissent makes one new argument worth taking seriously: **the absolute LOC cost of experiment's flow-page duplication is large enough that even at the stated 60/40 weighting, a reasonable reviewer can land on "keep main."** The remediation list (port main's `ramp/*` primitives, extract polling helper) directly addresses that. Doing those refactors *before* merging matters more now than it did after rounds 2 and 3.

**Action proposal:**

1. **Don't merge experiment as-is.** Round 4's dissent makes the duplication argument too credible to ignore. The current experiment branch is the case agent 2 looked at and judged "more cost than the win."

2. **Do the remediation list first**, on the experiment branch, before merging:
    - Port `RampPage.svelte`, `AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus` from main into experiment as structural-prop primitives.
    - Extract `lib/utils/polling.svelte.ts` (used by all flow pages).
    - Extract `lib/wallet/sep10-session.ts` (the `ensureAuth`/`cachedAuth` dance).
    - Extract `lib/api/_http.ts` (shared `apiRequest`/`postJson`).
    - These extractions should bring experiment's flow-page LOC closer to main's shared-flow LOC. **That measurement is the falsification criterion** for the dissent: if the post-extraction flow pages are not materially shorter than the pre-extraction ones, the dissent was right.

3. **Then run the Koywe integration on experiment with those extractions in place.** Compare to a hypothetical (or actual) Koywe on main. The two empirical tests — flow LOC after extraction, and Koywe integration time — are exactly what every dissenter has said would change their mind.

4. **If the Koywe integration on experiment lands with significantly less code than the pre-extraction baseline predicted, the case is closed.** If it doesn't — i.e. if the polling helper and the step primitives don't actually reduce the per-page LOC meaningfully — the dissent was right and the experiment-branch direction needs reconsideration.

## What four rounds prove

- **The architectural facts are robust**: every reviewer in every round, when running the paste test, gets the same result. Every reviewer counts roughly the same number of capability flags. Every reviewer notices the same `programmatic.` indirection problem. The empirical evidence is uncontested.

- **The architectural recommendation is robust but not universal**: 10 of 12 reviewers recommend experiment. 2 of 12 dissent — both on Goal-#2-cost grounds, both even though they agree experiment wins Goal #1. This is the actual disagreement the project has to navigate.

- **The disagreement is empirically resolvable**: the falsification criterion ("a real third anchor lands cleanly on either branch") is convergent across all 12 reviewers and would settle the question better than any further review round.

A fifth round of architectural review would not move the needle. The remaining uncertainty is about *integration effort* (Goal #2 duplication cost after refactoring; Koywe-on-main vs Koywe-on-experiment time), and that's measurable through doing the work, not through asking more reviewers.

## Cross-round summary

| | Round 1 | Round 2 | Round 3 | Round 4 |
|---|---|---|---|---|
| Verdict | 2-1 experiment | 3-0 experiment | 3-0 experiment | 2-1 experiment |
| Paste test | No | Yes | Yes | Yes |
| 60/40 priority | No | Yes | Yes | Yes |
| Memory isolated | No | Yes | Yes | Yes |
| Prior-rounds visible to agents | n/a | No (worktrees) | No (worktrees) | **No** (artifacts also moved aside) |
| Dissent shape | "Keep main + cherry-pick" | none | none | "Keep main as currently shipped" |

The setup improved across rounds. The result is robust: experiment wins, with a stable minority opinion that the Goal #2 duplication cost matters more than the stated 60/40 weighting acknowledges. **That minority opinion gets the remediation list it needs taken seriously before merging.**
