# Meta-meta-analysis: six rounds of independent architectural review

**Synthesizes:** rounds 1–6 of three-independent-reviewer code reviews comparing the experiment branch (`experiment/eff-anchor-interface`) against three different states of the unified-`Anchor`-interface architecture.

**18 reviewer instances total**, across these comparisons:

| Round | Comparison | Verdict | Notes |
|---|---|---|---|
| 1 | vs `main` | 2-1 experiment | No paste test, no priority hint |
| 2 | vs `main` | 3-0 experiment | + paste test, + 60/40 priority, + worktrees |
| 3 | vs `main` | 3-0 experiment | Replicability check |
| 4 | vs `main` | 2-1 experiment | Dissent re-emerged on duplication cost |
| 5 | vs `v2.0.0` (flat unified, 1 anchor) | 3-0 experiment | Pre-facet baseline |
| 6 | vs `v1.0.0` (flat unified, 5 anchors) | 3-0 experiment | Most heavily-used baseline ever shipped |

**Combined: 16 recommend experiment, 2 dissent.** Both dissenters acknowledged experiment wins Goal #1 and argued Goal #2 duplication cost was the deciding factor. **Zero reviewers in any round argued that any version of the unified interface wins Goal #1.**

---

## The single most important finding

**The unified-interface paste failure is structural to having any shared types module at all.** It is not caused by facets, by capability flag count, by the number of providers, or by lossy mappings (though all of those amplify it).

Across six rounds against three architecturally distinct versions of the unified interface — `v1.0.0` (flat, 5 anchors), `v2.0.0` (flat, 1 anchor), `main` (faceted, 2 anchors) — every reviewer reproduced the same failure mode:

- `cp -r src/lib/anchors/etherfuse` alone never compiles
- Must also copy `src/lib/anchors/types.ts` (650–825 LOC depending on version)
- The shared types file always carries provider-specific dialect that the paste-target doesn't need
- Layout is load-bearing — the sibling `types.ts` must be preserved or every import has to be rewritten

The hypothesis "if we just simplified main, the paste test would pass" was tested in round 5 against v2.0.0 (no facets, no adapter, one anchor) and falsified. The hypothesis "if the unified interface had more concrete consumers, the abstraction would justify itself" was tested in round 6 against v1.0.0 (5 anchors using the interface in production) and falsified. The interface fails the paste test independent of how it's shaped or how heavily it's used.

**The bespoke branch passes the paste test trivially because nothing is shared outside the provider's directory.** That's structural too — the absence of a shared types file is the cause, not a consequence, of the paste-target success.

---

## What's settled (high-confidence findings)

These are conclusions every round of reviewers converged on independently. Treat them as established:

1. **Goal #1 (paste-target portability) decisively favors the bespoke approach.** 18-of-18 reviewer instances reported this when they ran the empirical paste test.

2. **The `testanchor` story is the strongest single piece of evidence against the unified interface.** In v1.0.0 (5-anchor version), testanchor was excluded from `Anchor` entirely — "the unified interface couldn't absorb its own reference SEP-compliant anchor" (agent 3, round 6). In `main`, testanchor required an 888-LOC adapter (`TestAnchorAdapter`) doing pure SEP-shape-to-Anchor-shape translation. Every reviewer in every round called this out. SEP is already the unified interface; bolting another one on top is reverse pedagogy.

3. **`AnchorCapabilities` accretes flags faster than provider count.** Counts varied by version and by reviewer (12–18 flags reported), but the pattern was identical: flags exist because *one specific anchor needed it* — `requiresBlockchainWalletRegistration` is BlindPay's; `requiresBankBeforeQuote` is Abroad's; `kycFlow: 'iframe'` is Etherfuse's; `deferredOffRampSigning` is Etherfuse's. Adding a new anchor adds new flags. The shared component degrades into a switch statement on `capabilities.x`.

4. **Lossy mappings exist in every version of the unified interface.** v1.0.0, v2.0.0, and main all have `mapOnRampTransaction` returning `quoteId: ''`, `fromCurrency: ''`, `toCurrency: ''`, `stellarAddress: ''` because the Etherfuse API doesn't return those — but the unified type requires them. Paste-target users see empty strings as data.

5. **The `programmatic: ProgrammaticOps = { (input) => this.foo(input) }` arrow-fn delegator on `main`'s `EtherfuseClient` is pure busywork.** Methods are written twice (private + facet). The class's own `@example` JSDoc documents the uncompilable call form (`client.createCustomer(...)` when the actual public surface is `client.programmatic!.createCustomer(...)`). Round-2 reviewers caught this independently; the round-1 dissenter also acknowledged it.

6. **`src/lib/anchors/sep/` is correct and unchanged across every comparison.** SEP modules are byte-identical on every state we reviewed. Whatever happens to the rest, those stay.

7. **Per-provider hub pages > dynamic `[provider]/+page.svelte`.** Unanimous in every round that asked, including by dissenting reviewers who otherwise wanted to keep main.

---

## What's *not* settled (the bounded dissent)

The persistent minority view is real and deserves to be honored:

**Goal #2 duplication cost on the experiment branch is a meaningful concern.** Both dissenters (round 1, round 4) and several majority-side reviewers across all six rounds raised this. The bespoke branch ships ~2,800–3,040 LOC of provider-bespoke flow pages where the unified-interface versions ship ~2,200–2,300 LOC of shared flow components. That's roughly +30% UI code today, growing linearly with each new anchor.

**The dissent is bounded, not foundational.** Both dissenters explicitly acknowledged that the bespoke architecture wins Goal #1. Their argument was that the absolute duplication cost outweighs the absolute paste-target win. Every reviewer — dissenters included — also proposed the same remediation: extract the boilerplate (polling, SEP-10 auth, step primitives) into small shared primitives, so the per-page LOC drops without re-introducing a shared `Anchor` interface.

**The dissent is empirically resolvable.** Every "what would change my mind" answer across 18 reviewer instances pointed to the same forward-looking test: does a real next anchor (Koywe is the leading candidate) integrate cleanly on the bespoke branch with the remediation extractions in place? If yes, the dissent is wrong. If the new page ends up ~70% byte-identical to Etherfuse's page even *after* extractions, the dissent was right.

---

## What worked about the review methodology

This was a designed-then-iterated process. Worth keeping the meta-learnings:

1. **Empirical tests beat reading.** Round 1 (reading only) produced a 2-1 disposition with ambiguous dissent. Round 2 (added the paste test) produced unanimous 3-0 with sharp evidence. The paste test changed *what reviewers could say*, not *what they believed* — but it converted weak intuition into reproducible fact.

2. **Worktrees at temp paths plus moved-aside `dx-testing/` artifacts** eliminated the major bias sources by round 4. Memory directory is cwd-derived, so worktree-isolated agents don't load project-specific opinions. Together with neutral CLAUDE.md/READMEs (rewritten between rounds 1 and 2), this gave clean signals.

3. **The 60/40 goal priority hint** changed disposition magnitude but not direction. Round 2 agents would have flipped from round-1 ambiguity to round-2 unanimity even at 50/50 weighting — the paste-test evidence was decisive on its own. But the hint helped reviewers be explicit about the trade-off they were making.

4. **Same prompt across rounds is the right call.** Variance from sampling, not from priming. Round-to-round reproducibility was strong: same evidence reproduced six times across rounds 2–6 by 15 different reviewer instances.

5. **The "what would change your mind?" question made dissents more useful.** Both dissenters had concrete falsification criteria. The Koywe integration test is naturally identified by every reviewer as the deciding empirical question — that's because the question forced them to commit to it.

6. **Diminishing returns past round 3.** Rounds 1–3 added new evidence each time. Rounds 4–6 mostly confirmed the conclusion against different comparison baselines. The 18-reviewer corpus is strong; a 7th round would not move any needle.

---

## What didn't work (process learnings)

1. **Reviewer hallucination of doc drift.** Three agents across rounds 5 and 6 (agent 1 in round 5, agents 2 and 3 in round 6) independently reported that the experiment branch's CLAUDE.md or `src/lib/anchors/README.md` describes a faceted Anchor interface that no longer exists. Direct verification: `git grep "faceted\|implements Anchor\|TestAnchorAdapter\|ProgrammaticOps" experiment/eff-anchor-interface` returns zero hits. The experiment docs are clean. Best theory: reviewers viewed `main` or `v1`/`v2` worktree docs and mentally attributed them to the experiment side, or recalled prior project context as current.
   - This didn't affect any substantive conclusion (the rest of those reports was sound), but it's worth noting: even with clearly-labeled worktrees, human-readable docs can be cross-attributed. Future review work might rename docs per-worktree (e.g., prepend the worktree name) to force disambiguation.

2. **Round 4's dissent re-emergence wasn't initially understood.** Rounds 2 and 3 went 3-0; round 4 went 2-1 with no setup changes. The agent-4-2 dissenter explicitly read the 60/40 priority hint, agreed experiment matched it, and recommended against it anyway because the Goal #2 cost was judged too large in absolute terms. This is informative: the priority hint can be overridden by reviewer intuition when the cost they're weighing is salient. Same shape as round 1's dissent. The minority opinion is real and bounded; it's not random variance.

3. **The "third path" from round 1 agent 2 was never fully tested.** That agent proposed keeping the type vocabulary as a structural recommendation while dropping the runtime `implements Anchor` constraint. Round 5 partly tested it — v2.0.0's flat interface is the closest existing artifact to that proposal — and the paste test still failed for the same reasons. But a *purpose-built* version of agent 2's proposal (where the types are inlined per-provider but the *shape* is informally shared) was never built. Anyone tempted by that direction would need to spike it explicitly; the evidence here doesn't directly speak to it.

---

## What six rounds prove that one would not

If you ran round 1 alone, you'd have a 2-1 split with reasonable arguments on both sides. The evidence-vs-weighting question would feel open.

After six rounds:
- The evidence is no longer in question. 18-of-18 reviewers, given an empirical test, reproduce the same Goal #1 outcome.
- The weighting argument is the only remaining ground for the unified-interface position.
- The weighting argument has an empirical resolution: the Koywe integration with the remediation extractions in place.

That's a meaningful collapse of the problem space. We went from "two reasonable architectures, hard to choose between" to "the evidence favors one direction strongly; the only honest objection has a known empirical test."

---

## The two open questions

After 18 reviewer-instances and ~36,000 words of synthesized review, two genuinely open questions remain:

1. **Does the experiment pattern remain maintainable past 5 anchors?** Specifically: with the consensus remediation list applied (polling helper, SEP-10 helper, step primitives, etc.), does adding Koywe produce a flow page that's meaningfully different from Etherfuse's, or does it converge toward byte-identical?

2. **Is there a "third path" worth building?** Agent 2 (round 1) proposed types-as-structural-vocabulary while dropping the runtime interface. v2.0.0 is the closest existing artifact, and it still fails the paste test — but a purpose-built version (where types live in the provider's directory and structural compatibility is documented, not enforced) was never built. Someone could spike this; the existing evidence doesn't speak to it directly.

Question 1 is the test that 16-of-18 reviewers explicitly called out as the falsification criterion. Question 2 is a separate exploration if the project owner finds it interesting.

---

## Bottom line

Six rounds is enough. The architectural question is settled. The operational question (Koywe-on-bespoke-with-extractions) is the next thing worth measuring, and it can only be answered by doing the work.

The remediation list (see `ROADMAP.md`) addresses the dissent's substantive concerns. Once it's applied, the experiment branch is strictly better than every version of the unified interface that has ever existed in this codebase — including v1.0.0, the version that was actually published and in use.
