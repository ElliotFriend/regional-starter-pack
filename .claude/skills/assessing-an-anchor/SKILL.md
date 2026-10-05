---
name: assessing-an-anchor
description: Use when evaluating a potential anchor or BD pipeline partner that isn't integrated yet — researching it against the scorecard signals and adding it as an in-vetting honorable mention, without writing client code.
---

# Assessing a potential anchor (vetting)

For a candidate not yet integrated — typically a BD pipeline partner — assess it without writing client code.

1. **Research against the 9 scorecard criteria** (`QUALITY_CRITERIA` in `src/lib/config/anchors.ts`). Establish the gating fact first: _does it support Stellar at all_ (anchor / SEP / USDC-on-Stellar / via a partner)? Then score each signal `met` / `partial` / `failed` / `unverified` with evidence. A USD-denominated token (USDC) does **not** satisfy `local-asset` — only a local-currency token on Stellar does. Parallel research subagents (one per anchor) work well. Demand sources, and prefer `unverified` over guessing.
2. **Add it as an in-vetting honorable mention** in `HONORABLE_MENTIONS` with `vetting: true` and a `scorecard` built via `makeCriteria()` from the research. It then flows automatically into `/api/scorecard` and the scorecard page, with the "Under evaluation" badge, for BD tracking.
3. **New markets** not in `regions.ts` are fine: they render in the scorecard only, with no region page, following the Philippines precedent. But any region or rail id missing from `regions.ts` / `rails.ts` must be baselined in `KNOWN_DANGLING` in `tests/config/config-integrity.test.ts`, or that test fails.
4. **Cover with config tests** — `tests/config/anchors.test.ts` for counts and membership, `tests/config/scorecard.test.ts` for verdict and vetting. Update the entry's scorecard as the partner makes progress.

Promotion out of vetting is an editorial call, not a computed one; see `.claude/rules/curation-and-scorecard.md`. When a candidate graduates, follow the `adding-an-anchor` skill.
