# Round 5 Meta-analysis

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Setup:** identical to rounds 2–4 (worktrees, 60/40 priority, empirical paste test, falsifiability question, dx-testing artifacts moved aside) — but **comparing against `v2.0.0`** instead of `main`. v2.0.0 predates the faceted `Anchor` interface that everyone in rounds 1–4 criticized. The interface in v2.0.0 is flat (methods directly on `Anchor`), there's no `TestAnchorAdapter`, and the capability-flag count is ~13 instead of main's 16–18.

This round answers a different question: **was the criticism of main really about facets, or about the shared `types.ts` itself?**

## Disposition

| Reviewer | Goal #1 (paste) | Goal #2 (demo) | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (decisive) | v2.0.0 (moderately) | **Adopt experiment**; if forced, ship as-is |
| Agent 2 | experiment (decisive) | v2.0.0 (clearly) | **Ship experiment** + add a shared `RampStateMachine` module |
| Agent 3 | experiment (decisive) | v2.0.0 (cleaner one-component but capability-flag soup) | **Experiment's anchor architecture**, follow-up dedup at the route layer |

**3-0 for experiment.** The pre-facet baseline doesn't change the verdict.

## The key finding

**Even without the faceted complexity, v2.0.0 fails the paste-target test for the same fundamental reason main did.**

All three reviewers independently reproduced the same failure mode on v2.0.0:

- `cp -r src/lib/anchors/etherfuse` alone → fails to compile (`Cannot find module '../types'`)
- Must also copy `src/lib/anchors/types.ts` (~667 LOC in v2.0.0; 825 in main — smaller, but same problem)
- `AnchorError` lives in shared `types.ts`, not in the `etherfuse/` barrel — paste-target users need a second import path
- Layout-sensitive: `etherfuse/` must sit one level below `types.ts` for the `'../types'` import to resolve

The diagnosis from rounds 2–4 was that the facets were the worst part of main's design. **Round 5 falsifies that hypothesis.** v2.0.0 has none of the things people criticized — no `programmatic`/`interactive`/`auth` facet wrapper, no 888-LOC `TestAnchorAdapter`, no `client.programmatic!.createCustomer(...)` indirection, fewer capability flags, smaller shared types file. And it still loses Goal #1 to experiment by essentially the same margin.

What every reviewer noticed: **the underlying problem is that the unified `Anchor` interface lives in a shared types file at all.** Any provider client that implements `Anchor` will need to import that file. Any paste-target user will need to copy it. That single architectural choice — putting the shared interface in a sibling/parent module — is what makes the paste test fail. The facet model was a *symptom* of that choice, not the cause of the problem.

## What v2.0.0 gets right vs main

Compared to main, v2.0.0 is materially simpler in ways the reviewers acknowledge:

- **No facet wrapper.** `EtherfuseClient` methods are directly on the class (not `client.programmatic!.createCustomer(...)`). Goal #1 cost is lower than main's, just not zero.
- **No `TestAnchorAdapter`.** testanchor exists only as the `TestAnchorClient` SEP playground. The 888-LOC adapter that everyone criticized in main doesn't exist here — testanchor isn't forced through the `Anchor` interface at all.
- **Fewer capability flags** (~13 in v2.0.0 vs 16–18 in main).
- **The shared `OnRampFlow.svelte`/`OffRampFlow.svelte` components actually have a single concrete consumer** (Etherfuse), which is more honest than main's "shared component branching on capability flags for two providers."
- **No `InteractiveRampFlow.svelte`** — the interactive archetype hadn't been added yet.

These are real improvements. **And they aren't enough to win the paste test.**

## What's *still* a problem in v2.0.0 (same as main)

- `EtherfuseClient implements Anchor` forces the import from `'../types'`. Paste-target user must copy the whole shared types file or rewrite the import.
- `Customer.bankAccountId` is a leaky Etherfuse-specific field in the shared type (because BlindPay's `blockchainWalletId` was originally also there for a since-removed provider).
- The unified `OnRampTransaction` / `OffRampTransaction` shapes carry Etherfuse-specific fields (`signableTransaction`) that exist in the shared type regardless of which providers use them.
- Capability-flag-driven branching in `OffRampFlow.svelte` (lines on `kycFlow`, `deferredOffRampSigning`, `requiresBankBeforeQuote`, etc.) — fewer branches than main, same shape of problem.

The reviewers reach the same conclusion: **moving the shared types into a sibling file solves the facet problem but not the paste problem. To solve the paste problem, you have to either inline the shared types into each provider's directory or eliminate the shared types entirely.** Experiment does the latter.

## Goal #2 on v2.0.0 vs experiment

Worth noting: **v2.0.0's demo app is genuinely nicer than main's** for Goal #2. Without `InteractiveRampFlow` or the facet machinery, the shared `OnRampFlow.svelte` / `OffRampFlow.svelte` are doing one concrete thing — driving Etherfuse — and the capability flags are doing real work for the one-anchor case. Two of three reviewers explicitly say v2.0.0 wins Goal #2 against experiment.

But the 60/40 weighting and the paste-test failure on v2.0.0 still tip the recommendation to experiment, 3-0.

## Cross-round summary — five rounds now

| Round | Comparison | Verdict | Setup notes |
|---|---|---|---|
| 1 | vs main | 2-1 experiment | No paste test, no priority hint |
| 2 | vs main | 3-0 experiment | Paste test + 60/40 + worktrees |
| 3 | vs main | 3-0 experiment | Replicability check |
| 4 | vs main | 2-1 experiment | Dissent re-emerged on duplication cost |
| 5 | **vs v2.0.0** | **3-0 experiment** | Pre-facet baseline; same paste failure |

**13 of 15 reviewer instances recommend experiment.** Both dissenters (round 1, round 4) cited Goal #2 duplication cost as the deciding factor against experiment — and both acknowledged experiment wins Goal #1. Round 5 against the *simpler* pre-facet baseline still went 3-0 for experiment because the paste failure is structural to the shared-interface choice, not specific to the facet complexity.

## Implication: the round-4 dissent's framing was incomplete

Round 4's dissenter argued main's drawbacks (the paste-target friction) were smaller than experiment's (the duplication). Round 5 tests this against the simpler v2.0.0 — the version of the unified interface that's closest to "minimum viable shared interface." Result: paste friction is **just as present** in v2.0.0 as in main. The simplification doesn't help. The structural choice to have any shared types module is what makes the paste test fail.

This doesn't refute the round-4 dissent's concern about duplication cost — that concern stands. But it does refute the implicit "if we just had a simpler shared interface it would paste fine" hypothesis. Even v2.0.0's flat interface, with only Etherfuse implementing it, isn't paste-friendly.

## One correction to flag

Agent 1's report includes a claim that "CLAUDE.md in the experiment branch describes a faceted `Anchor` interface that does not exist anywhere in the experiment tree." This is incorrect — I verified directly: `grep -c "faceted\|facet\|implements Anchor\|ProgrammaticOps\|InteractiveOps" /tmp/round5-experiment/CLAUDE.md` returns **zero matches**. The experiment branch's CLAUDE.md was rewritten between round 1 and round 2 to accurately describe the bespoke architecture. Agent 1 may have been looking at a different file or misread their tooling output; the rest of agent 1's analysis is sound.

Agent 2 separately reported the prompt's labels were "swapped" — they weren't. v2.0.0 IS the unified-interface state at `/tmp/round5-v2`, and experiment IS the bespoke state at `/tmp/round5-experiment`. Agent 2 verified this correctly themselves and flagged it as a swap in error; their substantive analysis is correct.

## The consensus remediation list — now 5-round-confirmed

The pre-merge remediation list is now unanimous across 15 reviewer instances:

1. **Extract `usePolling.svelte.ts`** for the polling state machine (every round, every reviewer)
2. **Extract `sep10-session.ts`** for the SEP-10 auth dance (rounds 1–4)
3. **Port shared step primitives** (`AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus`) from v2.0.0/main into experiment (round 4 + 5)
4. **Resolve `TestAnchorClient` + `TestAnchorRampClient` co-existence** (rounds 2–5)
5. **Restore testanchor test coverage** for the bespoke client (rounds 1, 3, 4)
6. **Extract `_http.ts`** shared `apiRequest`/`postJson` (round 3 + 4)

Round 5 also adds one clarification: agent 2's suggestion of a single `RampStateMachine` rune-module that bespoke pages consume, without re-introducing the `Anchor` interface. This is the same idea as "extract the polling helper" but slightly broader.

## What this round added beyond rounds 2–4

The novel result is empirical evidence that **the unified-interface paste-target problem is structural, not specific to facets**. Rounds 1–4 collected a lot of evidence that facets specifically were problematic. Round 5 shows that removing the facets — and shipping the simplest possible unified `Anchor` interface that ever existed in this codebase — does not fix the paste test.

This matters because every reviewer in every round has cited "a real third anchor lands cleanly on the unified interface" as the falsification criterion. Round 5 implies that even if that happens, the paste test will still fail for the same reason: the shared `types.ts` file is the gravitational center of the problem, not the facet split. A third anchor that fits cleanly doesn't address paste-target portability; it only addresses the interface-evolution risk.

## Bottom line

**The conclusion across 5 rounds and 15 reviewer instances is robust: adopt the experiment branch.**

The minority view (Goal #2 duplication cost) remains worth honoring through the remediation list — port step primitives, extract polling helper, extract shared HTTP helper. Round 5 specifically confirms that **the unified-interface approach has the same paste failure regardless of how clean/simple the interface is**, which closes off the "just simplify main" alternative as a viable middle ground.

The empirical Koywe integration remains the right next test. If the experiment pattern (with the remediation list applied) lands Koywe cleanly and the per-page LOC after extractions is meaningfully reduced, the case is closed. If it doesn't, then the round-4 dissent's concern about duplication-as-architecture was right and a different middle path is needed — but that middle path is NOT v2.0.0's flat unified interface, which has been falsified as a paste-friendly alternative.

## Cross-round summary table

| | Round 1 | Round 2 | Round 3 | Round 4 | Round 5 |
|---|---|---|---|---|---|
| Compared against | main | main | main | main | **v2.0.0** |
| Verdict | 2-1 exp | 3-0 exp | 3-0 exp | 2-1 exp | **3-0 exp** |
| Paste test | No | Yes | Yes | Yes | Yes |
| 60/40 priority | No | Yes | Yes | Yes | Yes |
| Memory isolated | No | Yes | Yes | Yes | Yes |
| Reviews biased by prior rounds? | n/a | No | No | No | No |
| Dissent shape | Goal #2 cost | none | none | Goal #2 cost | none |

The minority view is real but specific: it only emerges when experiment's flow-page duplication is the most visible artifact to a reviewer. Round 5's reviewers saw v2.0.0 — which has its own duplication-via-capability-flags problem — and didn't dissent.

Five rounds is enough. The remaining work is the remediation list and the Koywe integration.
