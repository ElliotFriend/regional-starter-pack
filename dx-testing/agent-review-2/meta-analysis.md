# Round 2 Meta-analysis

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Setup changes vs round 1:** explicit 60/40 goal priority (paste-target > demo inspiration), worktrees at known temp paths for both branches (memory isolation), required empirical paste-target test, "what would change your mind?" question, neutral CLAUDE.md/READMEs.

## Disposition

| Reviewer | Goal #1 (paste) | Goal #2 (demo) | Bottom-line |
|---|---|---|---|
| Agent 1 | experiment (decisive) | experiment (smaller margin) | **Adopt experiment** |
| Agent 2 | experiment (decisive) | main (cleaner shared flow) | **Ship experiment, extract step components** |
| Agent 3 | experiment (decisive) | mixed | **Adopt experiment's library shape** |

**3-0 for the experiment branch this round**, compared to 2-1 in round 1. The dissenter from round 1 (who recommended keeping main with surgical edits) is gone — but more importantly, *all three reviewers* on Goal #1 are unanimous and *decisive* this time. The empirical test removed the ambiguity that allowed the round-1 dissent.

## The empirical paste-target test was the decisive change

Round 1 evaluated paste-friendliness from reading. Round 2 made every reviewer actually do the paste. The results converged hard:

**On the experiment branch, all three agents:**
- Copied `src/lib/anchors/etherfuse/` (3 files + README) to a scratch directory
- Installed `@stellar/stellar-sdk` + `typescript`
- `npx tsc --noEmit` passed on the first try
- `client.createCustomer({...})` worked as documented

**On the main branch, all three agents:**
- Copied `src/lib/anchors/etherfuse/` → 22 TypeScript errors (`Cannot find module '../types'`)
- Had to also copy `src/lib/anchors/types.ts` (826 LOC of cross-anchor abstractions — `WalletAuthOps`, `InteractiveOps`, `RampIdentity`, `KycRequirements*`, the full SEP-12 family, etc. — most of which Etherfuse will never use)
- After fixing the import, the script still failed: `Property 'createCustomer' is private and only accessible within class 'EtherfuseClient'`. The public API turns out to be `client.programmatic.createCustomer(...)`.
- **The class's own `@example` JSDoc shows the uncompilable form** — every reviewer noticed this independently. A new developer following the documented example gets compile errors.

That's not a matter of interpretation. Round 1's debate about which approach better serves Goal #1 was effectively resolved by giving reviewers a way to test it directly.

## New evidence surfaced in round 2 (not in round 1)

Three things every reviewer flagged that round 1 didn't catch with the same force:

1. **The `@example` JSDoc on `EtherfuseClient` is broken on main.** It shows `etherfuse.createCustomer(...)` which doesn't compile (the method is `private`; the public surface is `etherfuse.programmatic.createCustomer(...)`). This is an empirical defect, not a design preference. The class is self-contradicting.

2. **The lossy-translation tax in `TestAnchorAdapter` is already visible in source comments.** Agent 1 caught a comment in `anchor.ts` near the SEP-12 logic: *"the form re-appears forever after a successful submission"*. The 888-line adapter is the only file that translates SEP shapes into the unified Anchor interface, and it's already accumulating known bugs that exist *because* of the translation.

3. **The capability-flag count is empirically scaling worse than round 1 suggested.** Round 1 said "15 flags is a smell." Round 2 reviewers counted the actual flags and noted: at N=2 providers, `AnchorCapabilities` has 12–14 boolean/enum fields, several of them documenting since-removed providers (BlindPay's `blockchainWalletId`, Transfero's `RampIdentity`). The growth rate isn't 1 flag per provider — it's significantly more, and they accumulate.

## What round 2 confirmed from round 1

These conclusions held across both rounds, which is the strongest signal in this whole exercise:

1. **`TestAnchorAdapter` (888 LOC on main, 355 LOC on experiment) is hard to defend.** Every reviewer in both rounds called this out. The adapter exists to bridge SEP into a non-SEP shape; SEP is already the unified interface.

2. **The `programmatic: ProgrammaticOps = { (input) => this.foo(input) }` arrow-fn delegator on main is busywork.** Round 1 called it "two surfaces for one behavior." Round 2 took it further: the *public* methods are inaccessible (`private`), and the docstring documents the wrong call form.

3. **Per-provider hub pages > dynamic `[provider]/+page.svelte`.** Unanimous in both rounds.

4. **Polling / SEP-10 auth boilerplate on experiment needs extraction.** Both rounds, every reviewer. Round 2's specific names: `usePolling.svelte.ts` (agent 1), step sub-components from main's `ramp/` directory (agents 2 + 3).

5. **Capability flag count is a smell.** Both rounds, every reviewer.

6. **The SEP modules under `src/lib/anchors/sep/` are the right shape on both branches** (byte-identical, in fact). Whatever happens to the rest, those stay.

## What the goal-priority hint changed

Round 1 didn't say which goal mattered more. Round 1's dissenter weighted Goal #2 (the demo's shared flow components) heavily enough to recommend keeping main. Round 2's 60/40 hint made every reviewer surface the trade-off explicitly:

- Agent 1: "Most of main's flow-sharing is paying interest on a loan that hasn't been taken out yet" (only 1 programmatic provider today).
- Agent 2: "For a curated showcase of 2-5 providers where each one is being held up as a paste-target reference, per-provider pages are a *feature*, not a bug."
- Agent 3: "Main is paying the abstraction tax for two providers that don't really fit one mold."

But the goal priority isn't doing all the work. Even at 50/50, the empirical paste test results would have flipped any reasonable reviewer — Goal #1 isn't just "slightly better" on experiment, it's *empirically broken* on main (the documented example doesn't compile).

## Agreement on Goal #2 trade-offs

Where reviewers diverged slightly: how much main's shared flow components are worth.

- Agent 2 explicitly: main's `OnRampFlow.svelte` "is engineered for this app's specific provider set, not as a template" — and recommends porting main's `ramp/` step sub-components into experiment without re-introducing the interface.
- Agent 1: "Reuse happens at the primitive layer, not at flow orchestration. Healthier place for it."
- Agent 3: "Main's shared flows are nicer when you have N near-identical providers; they're a tax when each provider is genuinely different."

All three reach the same recommendation by different paths: **shared UI primitives are correct, shared flow components are not, given the provider set this project actually has.**

## What everyone agrees breaks regardless

Pulling out the unanimous "fix this no matter what" list from both rounds combined:

1. **Polling helper extraction** (`usePolling` rune-module or equivalent). Both rounds, every reviewer.
2. **SEP-10 auth helper extraction** for the testanchor pages. Round 1.
3. **`KycIframeFlow.svelte` leaf component**. Round 1.
4. **Step sub-components like main's `ramp/QuoteStep.svelte`, `FiatAccountStep.svelte`, `CompletionStep.svelte`** ported into the bespoke pages. Round 2 explicitly.
5. **Resolve the `TestAnchorClient` + `TestAnchorRampClient` co-existence wart.** Agent 1 round 2 — collapse the ramp client into a namespace on the original, or pick one and deprecate the other.
6. **Restore testanchor test coverage.** Round 1 ranked this highest; round 2 didn't re-raise it but it remains true.
7. **Add a "list anchors with their capabilities" surface** if there's a future cross-anchor UI (agent 2 round 2 flagged this as a gap — no shared type to iterate).

Items 1, 4, and 5 are the highest-priority "do this before merging" picks.

## Falsifiability — round 2's new question

I asked each reviewer to list what evidence would flip their conclusion. The answers converged remarkably:

**To validate main (would flip experiment → main):**
- A real third programmatic provider (Koywe, PDAX, or similar) lands cleanly on main with no new capability flags and no new optional fields on shared input/output types. *All three reviewers list this.*
- A downstream user successfully pastes Etherfuse from main into their own Next.js/Express project in <30 minutes with no help. *Agents 1 + 3.*

**To lock in experiment (would harden the recommendation):**
- A polling-logic bug ships in production on experiment because the polling code drifted between providers. *Agent 1.*
- An external developer pastes an experiment anchor into their own project in <10 minutes. *Agent 3.*
- A clean extracted-step-component refactor on experiment brings flow-page LOC under main's. *Agent 2.*

The framing of these criteria is itself a signal: every reviewer's "what would change my mind" for main is "evidence the abstraction can hold under more providers." That suggests the reviewers see the abstraction as currently unproven, not as currently wrong-in-principle.

## Bottom line

**Adopt the experiment branch.** The 3-0 result is decisive, and the deciding evidence is empirical (paste test) and reproducible across three independent reviewers. The Goal #1 claim on the experiment branch is *literally true* — `cp -r etherfuse/ ~/project/src/lib/`, install one dep, it works. The same claim on main is *empirically false* in two distinct ways (missing types, broken public surface).

Before merging, do these things (consensus list):

1. **Extract `usePolling` / state-machine helper** to halt the 4–6× duplication of polling logic across flow pages.
2. **Port the `ramp/` step sub-components from main** (`QuoteStep`, `FiatAccountStep`, `CompletionStep`) into experiment. Don't re-introduce the `Anchor` interface — these are structural-prop primitives.
3. **Resolve the `TestAnchorClient` + `TestAnchorRampClient` co-existence** — pick a single shape or namespace one inside the other.
4. **Restore testanchor test coverage** (carried over from round 1).
5. **Either fix or remove the `@example` JSDoc** on main's `EtherfuseClient` before merging, since the class's documentation is currently self-contradicting on the public API. (Irrelevant if experiment ships — the experiment-branch JSDoc is correct.)

The Koywe integration is the natural next test. If it lands on the experiment pattern with the polling helper extracted, the case for experiment is closed. If three+ subsequent anchors *don't* fit the bespoke pattern and the project starts reinventing a unified interface inside the page components, the round-2 reviewers have a clear falsification criterion ready.

## Comparison to round 1

| Metric | Round 1 | Round 2 |
|---|---|---|
| Disposition | 2-1 experiment | 3-0 experiment |
| Empirical test | None — reading only | Required paste-target test |
| Goal weighting | Equal/unstated | 60/40 paste > demo |
| Memory bias | Project memory loaded (CLAUDE.md was stale) | Memory not loaded (worktrees at temp paths); docs were neutral |
| Disagreement axis | "Is the unified abstraction worth the paste cost?" | None — paste cost was empirically catastrophic |
| Recommended next step | Continue on experiment, with caveats | Adopt experiment, with the same caveats |

The round 2 setup changes worked as intended: the empirical test is the load-bearing addition. The goal-weighting and bias controls helped, but the paste test would have been decisive even without them.

This is now the strongest signal the project has on this decision. Three independent reviewers, isolated from each other, isolated from biased memory and docs, given an empirical test, reached the same conclusion through the same reasoning. There's no good reason to ask for a fourth opinion.
