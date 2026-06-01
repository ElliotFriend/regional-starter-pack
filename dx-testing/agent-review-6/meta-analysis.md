# Round 6 Meta-analysis

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Setup:** identical to rounds 2–5 (worktrees, 60/40 priority, empirical paste test, falsifiability question, isolated environment) — but comparing against **`v1.0.0`** instead of main or v2.0.0. v1.0.0 was a published, in-use release of the project with **five anchors actually implementing the unified `Anchor` interface**: Etherfuse, AlfredPay, BlindPay, Abroad Finance, and Transfero. testanchor was separate (SEP playground only). This is the case where the abstraction was supposedly proving itself.

This round answers another different question: **does the unified interface look better when it's actually been carrying real weight across multiple providers?**

## Disposition

| Reviewer | Goal #1 (paste) | Goal #2 (demo) | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (decisive) | v1.0.0 (real but bounded; capability-flag growth coming) | **Ship experiment** |
| Agent 2 | experiment (decisive) | v1.0.0 looks good at N=2 but "starts collapsing around N=4" | **Ship experiment**, port some component reuse |
| Agent 3 | experiment (decisive) | v1.0.0 has compression but flow components are capability-flag switch statements | **Experiment direction wins**, trim some overbuild |

**3-0 for experiment.** Even the most heavily-used version of the unified interface — five anchors, published release — still loses.

## The headline finding

**v1.0.0 had five concrete consumers of `Anchor` and the interface still failed the paste test in exactly the same way as main and v2.0.0.** Every round-6 reviewer reproduced the same failure mode:

- `cp -r etherfuse/` → `Cannot find module '../types'`
- Must also copy `src/lib/anchors/types.ts` (~654 LOC at v1)
- Layout-sensitive (etherfuse/ must sit beneath types.ts)
- Lossy mappings: Etherfuse's `mapOnRampTransaction` returns `quoteId: ''`, `fromCurrency: ''`, `toCurrency: ''`, `stellarAddress: ''` because the Etherfuse API doesn't return those — but the unified `OnRampTransaction` shape requires them as strings. Paste-target users see empty strings as data.

The hypothesis going into round 6 was that more providers = more proof the abstraction works = potentially a better Goal #1 outcome. The hypothesis is **falsified**: the paste failure is independent of how many providers the interface carries. More providers don't fix the structural problem; they amplify the type-vocabulary cost.

## Agent 3's smoking gun

Agent 3 found the cleanest single piece of evidence in any round:

> **"v1 doesn't wire `testanchor` through the Anchor interface at all. The original `TestAnchorClient` is a separate SEP playground at `/testanchor`. So the 'unified interface' already excluded the only SEP-compliant anchor in the project. That's the strongest single piece of evidence that the interface didn't generalize: even the test/reference anchor couldn't conform."**

This is striking. v1's `Anchor` interface had five concrete consumers — all of them custom-API anchors with similar shapes. The one anchor that should have been the *easiest* to fit (SEP-compliant, well-specified, the explicit testbed for SEP integrations) was excluded from the interface entirely. The abstraction worked only for anchors that already looked like Etherfuse. When the real diversity arrived (SEP-24's interactive flow), the abstraction grew the facet model — which is what main has, which everyone hated.

The pattern across versions: each generation of the unified interface added new capability machinery to accommodate the next anchor's quirks, and the quirks kept arriving.

## Capability-flag math across versions

| Version | Anchors using `Anchor` | Capability flags | Flags-per-anchor |
|---|---|---|---|
| v1.0.0 | 5 (etherfuse, alfredpay, blindpay, abroad, transfero) | ~14 | 2.8 |
| v2.0.0 | 1 (etherfuse) | ~13 | 13 |
| main | 2 (etherfuse, testanchor) | ~16-18 | 8-9 |

v1 looks best on a per-anchor basis (2.8 flags per anchor) — but that's misleading. Agent 2 surfaces the actual mechanism:

> "Each capability flag exists because **one specific anchor needed it**: `requiresBlockchainWalletRegistration` is BlindPay's; `requiresBankBeforeQuote` is Abroad's; `kycFlow: 'iframe'` is Etherfuse's. This is the classic 'shared abstraction that drifts into a switch statement' pattern."

Agent 3 ran the count and found 9+ capability-flag branches in `OffRampFlow.svelte` alone at v1. The shared component had become a switch statement on `capabilities.x` — i.e., the abstraction had degraded into the same thing it was trying to prevent (per-provider branching), just dispatched on flags instead of names.

## A reviewer-error finding worth flagging

**Three independent agents across rounds 5 and 6 (agent 1 in round 5, agents 2 and 3 in round 6) reported that the experiment branch's CLAUDE.md or `src/lib/anchors/README.md` describes a faceted Anchor interface that no longer exists in the code.** I verified this claim directly with `git grep` against the experiment branch:

```
git grep -i "faceted\|implements anchor\|TestAnchorAdapter\|ProgrammaticOps" \
  experiment/eff-anchor-interface -- 'src/**/*.md' 'src/**/*.ts' '*.md'
# returns: nothing
```

The experiment branch docs were rewritten between round 1 and round 2 to accurately describe the bespoke architecture. There are no facet references anywhere in the experiment branch. **Three different reviewers hallucinated the same drift — possibly because they were looking at the *v1*/*v2*/*main* worktree docs (which DO describe a faceted/unified-interface architecture) and mentally attributing them to the experiment side.**

This doesn't affect the substantive conclusions of any round — the rest of those agents' analyses are sound — but it's a useful signal for future review work: even with worktrees clearly labeled, reviewers can confuse which side a given doc belongs to. A future round prep step could rename the doc files in each worktree to make confusion harder.

## Cross-round summary — six rounds

| Round | Comparison | Verdict | Notes |
|---|---|---|---|
| 1 | vs main | 2-1 experiment | No paste test, no priority hint |
| 2 | vs main | 3-0 experiment | First round with paste test + 60/40 |
| 3 | vs main | 3-0 experiment | Replicability check |
| 4 | vs main | 2-1 experiment | Dissent on duplication cost |
| 5 | vs **v2.0.0** | 3-0 experiment | Pre-facet, 1-anchor unified interface still loses |
| 6 | vs **v1.0.0** | **3-0 experiment** | Pre-facet, **5-anchor** unified interface still loses |

**Total: 16 of 18 reviewer instances recommend experiment.** Across every architectural variant of the unified interface — faceted (main), flat with 1 anchor (v2.0.0), flat with 5 anchors (v1.0.0) — the verdict is the same.

The two dissenters (round 1, round 4) both:
- Acknowledged experiment wins Goal #1
- Argued the Goal #2 duplication cost was the deciding factor
- Cited the same falsification criterion (a real third anchor lands cleanly on the unified interface)

**No reviewer in any of the 18 instances has argued that any version of the unified interface wins Goal #1.** The disagreement has always been about whether Goal #2 cost overrides Goal #1 win — never about the Goal #1 evidence itself.

## What round 6 specifically adds to the evidence

1. **The "shared interface" approach was tried with 5 anchors, in production, and failed to absorb testanchor.** The published version of the unified interface didn't generalize even within its lifetime. Adding SEP support meant either accepting a parallel client (v1's path) or growing the facet model (main's path). Neither is what the abstraction promised.

2. **Capability flags scale super-linearly with provider quirks, not with provider count.** v1's 14 flags for 5 anchors is misleading; the actual count of provider-specific quirks the shared component branches on is closer to one flag per quirk.

3. **The shared `PaymentInstructions` discriminated union is a closed set.** Adding a new rail (ACH, SWIFT, Koywe's CBU) requires editing the shared types file. Per agent 2: "if you paste this into a project that needs ACH or SWIFT, you have to edit the shared file." This is a Goal #1 failure mode the prior rounds didn't focus on.

4. **The lossy-mapping pattern is visible at every version.** v1's `mapOnRampTransaction` returns `''` for fields Etherfuse doesn't have. v2.0.0 has the same pattern. main has the same pattern (plus the `programmatic.` facet wrapper on top). Paste-target users see fake data without realizing it.

## The remediation list — unchanged across 6 rounds

The pre-merge work for experiment is the same as after every prior round:

1. Extract `usePolling.svelte.ts` for polling state machines
2. Extract `sep10-session.ts` for the SEP-10 auth dance
3. Port `ramp/*` step primitives (`AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus`) into experiment as structural-prop primitives
4. Resolve `TestAnchorClient` + `TestAnchorRampClient` co-existence
5. Restore testanchor test coverage
6. Extract `_http.ts` shared `apiRequest`/`postJson`

Round 6 agents proposed two additions:

- Agent 2: extract a `<PollingTransaction>` and a `<QuoteWithRefresh>` as mid-level component primitives (slightly larger than agent 3's previous "atomic primitives" framing).
- Agent 1: keep the v1-era `RampPage`/`OnRampFlow` factoring as a *template* that bespoke pages can borrow from, not as a shared component that branches on capabilities.

## Bottom line

**Six rounds of architectural review across 18 reviewer instances:**
- 16 recommend experiment
- 2 dissent on Goal #2 duplication cost grounds
- 0 argue any version of the unified interface wins Goal #1

The unified interface has now been tested in every form it ever took in this codebase — with 1 anchor, with 5 anchors, with facets, without facets. Every form loses the paste test for the same fundamental reason: putting the shared types in a file outside the provider's directory means paste-target users have to copy that file too.

**The remaining open question is the Koywe integration.** Both dissenters and every "what would change my mind" answer across all 6 rounds points to the same test: does Koywe land cleanly on the experiment pattern (with the remediation list applied) without the per-page LOC dominating? If yes, the case is closed. If no, the duplication concern was real and a different middle path is needed — but that middle path is not the unified interface, which has been falsified in six rounds against three different versions of itself.

## What six rounds prove that fewer rounds didn't

- **The unified-interface failure is structural.** It's not about facets, it's not about how many providers, it's about the architectural choice to have a shared types file at all. Six rounds against three versions of the unified interface all reach the same Goal #1 verdict.

- **The minority view is consistent and specific.** Both dissenters cited Goal #2 cost — never Goal #1. The dissent is real, bounded, and addressable through the remediation list.

- **The setup mechanics work.** Worktrees, isolated memory, neutral docs, empirical paste test, 60/40 priority — all transferred cleanly across rounds 2–6, all produced consistent results. The methodology has been validated.

- **Reviewer-instance variance produces small surface differences (which line counts, which flag enumerations) but the same architectural verdict every time.** This is the strongest signal that the conclusion is sampling-robust.

Further rounds of architectural review would not be informative. The remaining uncertainty is empirical — measurable only by doing the Koywe integration on the experiment branch with the remediation list applied.
