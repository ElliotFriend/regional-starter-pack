# Roadmap

Concrete actions derived from six rounds of independent architectural review. See [`meta-meta-analysis.md`](./meta-meta-analysis.md) for the reasoning. Items are prioritized as **P0** (gates the merge), **P1** (should do soon after merge), or **P2** (nice-to-have).

Current state: `experiment/eff-anchor-interface` is the recommended direction (16-of-18 reviewer instances across 6 rounds). **All P0 merge gates have landed** (P0.1, P0.2, P0.4, P0.5, P0.6 complete; P0.3 partial-by-design with recorded rationale). The full test suite passes (480 tests). The branch is merge-ready pending a Koywe merge-readiness check (Koywe — originally a post-merge P2.1 validation — was built early on this branch, so it ships with the merge).

---

## P0 — Pre-merge gates

These were named in **every round** by **every reviewer** (or with one round's worth of exceptions noted). Block the merge to `main` on these landing on the experiment branch:

### P0.1 — Extract `usePolling.svelte.ts`

**Problem:** Polling state machines (`pollCount`/`MAX_POLLS`/`startPolling`/`stopPolling`/`pollingTimedOut`) are duplicated across 6 flow pages on the experiment branch (Etherfuse onramp/offramp + 4 testanchor pages).

**Fix:** Extract `src/lib/utils/poll.svelte.ts` (or `src/lib/utils/usePolling.svelte.ts`) as a small reactive helper:

```ts
export function createPoller(opts: {
  intervalMs: number;
  maxAttempts: number;
  fn: () => Promise<void>;
}): { start: () => void; stop: () => void; count: number; timedOut: boolean };
```

Replace the inline `setInterval` boilerplate in all 6 flow pages with a call to this helper. **Cited in every round, every reviewer.** Estimated impact: −250–400 LOC across the flow pages.

**Status:** ✅ Landed (`7f4f07d`). `src/lib/utils/poll.svelte.ts` (`createPoller`) adopted across all flow pages (etherfuse + testanchor + koywe).

### P0.2 — Extract `sep10-session.ts`

**Problem:** The `ensureAuth` / `cachedAuth` / `signWithFreighter` / `authStore.get`+`set` dance is duplicated in 4 testanchor pages (programmatic on/off-ramp + interactive on/off-ramp).

**Fix:** Extract `src/lib/wallet/sep10-session.ts` that wraps the handshake. Each testanchor page imports it and gets a `Promise<string | undefined>` back.

```ts
export async function ensureSep10Token(
  provider: string,
  publicKey: string,
  network: StellarNetwork
): Promise<string | undefined>;
```

Cited rounds 1, 2, 3, 4, 5, 6.

**Status:** ✅ Landed (`285ea9d`). `src/lib/wallet/sep10-session.ts` (`createSep10Session`) adopted in all 4 testanchor pages (programmatic + interactive on/off-ramp). Etherfuse uses its own API-key flow and does not need it.

### P0.3 — Port `ramp/*` step primitives from `main` into experiment

**Problem:** Etherfuse onramp/offramp pages duplicate amount-entry, quote-display-with-confirm, fiat-account-selection, and completion-screen UI structures. Main has these factored out as `AmountInput.svelte`, `QuoteStep.svelte`, `FiatAccountStep.svelte`, `CompletionStep.svelte`, `TrustlineStatus.svelte`.

**Fix:** Bring these components into the experiment branch (some already exist — `AmountInput`, `TrustlineStatus` — others need porting: `QuoteStep`, `FiatAccountStep`, `CompletionStep`). **They must be structural-prop components** (take generic shape, not anchor-shaped types). Etherfuse and testanchor pages adapt their native data inline via `$derived` (the pattern already used for `QuoteDisplay`).

**Do not** port `OnRampFlow.svelte` / `OffRampFlow.svelte` / `RampPage.svelte` / `InteractiveRampFlow.svelte` — those are the abstractions the bespoke approach explicitly rejects.

Cited rounds 2, 3, 4, 5, 6. Estimated impact: −400–700 LOC across flow pages.

**Status:** Partially landed.

- ✅ **CompletionStep** shipped — adopted in all 6 flow pages (etherfuse on/offramp, testanchor programmatic/interactive on/offramp). Net **−99 LOC** project-wide (+72 primitive, −168 across flow pages).
- ❌ **QuoteStep** deferred — only 2 adopters (etherfuse on/offramp) and they overlap so much with the existing structural `QuoteDisplay.svelte` that a new wrapper just adds an indirection. A spike adoption was tried and produced **+374 LOC net** (primitive + duplicated `QuoteDisplay`-like markup minus removed inline UI). If etherfuse on/offramp ever diverge enough that `QuoteDisplay` doesn't fit, revisit.
- ❌ **FiatAccountStep** deferred — only 1 adopter (etherfuse offramp). One-page abstractions can't deliver a duplication win by definition. Reopen when a second SPEI/PIX-style provider (Koywe? curated Coins.ph fiat onramp?) lands.

The reviewers' "−400–700 LOC" estimate assumed all three components would land. With only CompletionStep landing the −99 LOC is real but smaller. The estimate was load-bearing on multi-adopter assumptions that don't hold today.

### P0.4 — Restore testanchor test coverage

**Problem:** The 589-LOC `tests/anchors/testanchor/anchor.test.ts` (testing main's `TestAnchorAdapter`) was deleted on the experiment branch without replacement. `TestAnchorRampClient` has no dedicated tests today.

**Fix:** Write `tests/anchors/testanchor/ramp.test.ts` covering, at minimum:
- SEP-1 discovery + endpoint resolution
- SEP-10 challenge + submit
- SEP-12 get/put customer
- SEP-6 deposit + withdraw (including the `signableXdr` construction)
- SEP-24 deposit + withdraw
- SEP-38 indicative pricing
- 404 → null behavior

Cited rounds 1, 3, 4, 6.

**Status:** ✅ Landed (`f5f7097`). `tests/anchors/testanchor/ramp.test.ts` covers `TestAnchorRampClient`. Full suite green (480 tests).

### P0.5 — Resolve `TestAnchorClient` + `TestAnchorRampClient` co-existence

**Problem:** The experiment branch exports both `TestAnchorClient` (the original SEP playground used by `/testanchor`) and `TestAnchorRampClient` (the curated ramp client used by `/anchors/testanchor`). Two clients in one directory is confusing.

**Fix options** (pick one):
- (a) Collapse `TestAnchorRampClient` into a `.ramp` namespace on `TestAnchorClient` and re-export
- (b) Rename the playground to `TestAnchorPlaygroundClient` and keep both, document why
- (c) Keep both but add a clear discriminating README section ("Use ramp client if X, use playground if Y")

Cited rounds 2, 3, 4, 5.

**Status:** ✅ Landed (`32b3a0a`) via option (b)+(c). `TestAnchorClient` renamed to `TestAnchorPlaygroundClient` (now in `playground.ts`); `TestAnchorRampClient` in `ramp.ts`. README has a discriminating "which client to use" section.

### P0.6 — Extract `http.ts` shared `apiRequest` / `postJson`

**Problem:** `src/lib/api/etherfuse.ts` (~215 LOC) and `src/lib/api/testanchor.ts` (~226 LOC) duplicate `apiRequest` / `postJson` / `authHeader` helpers.

**Fix:** Extract `src/lib/api/http.ts` with the shared `apiRequest<T>(fetch, url, init)` and `postJson<T>(fetch, url, body, token?)`. Both provider wrappers import them. Provider-specific error classes (`EtherfuseApiError`, `TestAnchorApiError`) stay.

Cited rounds 3, 4, 6.

**Status:** ✅ Landed (`8ec0262`). `src/lib/api/http.ts` imported by all three provider wrappers (`etherfuse.ts`, `testanchor.ts`, `koywe.ts`).

---

## P1 — Soon after merge

These are real improvements that don't block the merge but should land within a release or two:

### P1.1 — Document the per-provider authoring template

**Problem:** With the bespoke pattern, duplication is intentional. Without a written template, the next contributor might either over-share (regress toward a shared flow component) or under-share (re-roll primitives that already exist).

**Fix:** Add `docs/AUTHORING_NEW_ANCHOR.md` (or expand the existing `src/lib/anchors/README.md`) with:
- The per-provider directory shape (client + types + index + README)
- Where each layer lives (`anchors/`, `server/`, `api/`, `routes/api/anchor/`, `routes/anchors/`)
- Which primitives to compose from `components/`
- The structural-prop adapter pattern (`displayQuote = $derived({...})`)
- When duplication is OK and when to extract

Cited rounds 3, 4, 6.

### P1.2 — Normalize `approved_chain_deploying` → `approved` inside `EtherfuseClient`

**Problem:** Etherfuse exposes a `approved_chain_deploying` KYC status. The experiment's `EtherfuseClient.getKycStatus` returns it raw; each consumer has to know to treat it as `approved`. The Etherfuse onramp page does, at line 138 — but a paste-target user might not.

**Fix:** Either (a) collapse it to `approved` inside the client (lossless from the caller's perspective; preserves Etherfuse's native value as `approved`), or (b) document the edge case in `EtherfuseKycStatus`'s JSDoc with a helper `isApproved(status: EtherfuseKycStatus): boolean`.

Cited round 3.

### P1.3 — Optional `KycIframeFlow.svelte` leaf component

**Problem:** Etherfuse's onramp and offramp pages each re-implement the "embed iframe + poll status until terminal" pattern. When Coins.ph (or any future iframe-using anchor) lands, this will be the third implementation.

**Fix:** Extract `src/lib/components/KycIframeFlow.svelte` that takes `{ url: string; onApproved: () => void; onRejected?: () => void; pollFn?: () => Promise<'pending' | 'approved' | 'rejected'> }`. The Etherfuse pages use it. This is **not** the same as main's `KycForm.svelte` — it's a leaf primitive, not a flow.

Cited rounds 1, 3, 6.

### P1.4 — Audit for and remove dead code

**Problem:** Agent 3 in round 6 flagged `src/lib/anchors/sandbox.ts` as potentially dead code on experiment (referenced in some docs but I'm not certain it's wired in anymore). Worth a quick audit.

**Fix:** `git grep "sandbox\b"` and trim what's unused.

---

## P2 — Validation: the Koywe integration

This is **the empirical test every reviewer in every round called out as the falsification criterion** for the dissent.

### P2.1 — Implement Koywe on the post-extraction experiment branch

**Setup:** With P0.1–P0.6 done.

**Action:** Build the Koywe integration:
- `src/lib/anchors/koywe/{client,types,index,README}.ts`
- `src/lib/server/koyweInstance.ts`
- `src/lib/api/koywe.ts`
- `src/routes/api/anchor/koywe/*/+server.ts`
- `src/routes/anchors/koywe/{,onramp,offramp}/+page.svelte`
- Tests under `tests/anchors/koywe/`
- Config wiring (`constants.ts`, `config/anchors.ts`, `config/regions.ts`)

**Measure:**
- Total time-to-working-integration
- Per-page LOC of the Koywe onramp/offramp vs Etherfuse's equivalents
- % byte-similarity of Koywe vs Etherfuse pages
- Whether you reached for any "I wish there was a shared X" that didn't exist

**Falsification check:**
- If Koywe's flow pages end up ~70%+ byte-identical to Etherfuse's *even after the P0 extractions* → the dissent was right. Build a narrow shared flow component empirically from the three concrete pages (Etherfuse + Koywe + testanchor variants). Don't reach for a unified `Anchor` interface.
- If Koywe's pages share <50% with Etherfuse's and the integration goes smoothly → the bespoke pattern is validated for production use; lock it in as the authoring template.

This is the only remaining question architectural review can't answer.

---

## P3 — Optional / future explorations

### P3.1 — The "third path" spike (only if interested)

**Concept:** Round-1 agent 2's idea — keep types as a structural recommendation, drop the runtime `implements Anchor` constraint. Not directly tested in any round (v2.0.0 is the closest existing artifact and it still fails the paste test, but a purpose-built version was never built).

**If you want to try it:** Spike branch, copy `src/lib/anchors/etherfuse/` from experiment as-is, then add a separate optional `src/lib/anchors/shape.ts` that *documents* a recommended shape for client classes without enforcing it. The paste-target user can ignore it. Cross-anchor code can opt in.

This is a low-priority experiment; six rounds of review don't say much about whether it'd work. Only worth doing if the project owner finds it interesting.

### P3.2 — `EtherfuseClient` `simulateFiatReceived` (sandbox helper) wiring audit

Round 2 noted the Etherfuse sandbox simulation could be smoother. Low priority.

### P3.3 — Token metadata in config vs on the client

v2.0.0 had `supportedTokens` only on the runtime client. Experiment puts `supportedTokens` on the client too, but the region pages need it from config. There's some duplication. Not urgent — config and client are both small.

---

## Sequencing recommendation

1. **Now → 1 week**: P0.1–P0.6 on the experiment branch. These are mostly mechanical extractions. The aggregate change is meaningfully smaller than it sounds — most of the work is "lift the inline state machine into a helper module."

2. **After P0 lands**: Merge experiment to `main`. Tag a `v3.0.0` release reflecting the architectural shift.

3. **First post-merge sprint**: P2.1 (Koywe integration) as the empirical falsification of the dissent's concern. Track measurements as you go.

4. **Based on P2.1 results**: Either lock in the per-provider authoring template (P1.1), or — if Koywe converges with Etherfuse — design a narrow shared flow component from three concrete examples and apply it.

5. **Later**: P1.2, P1.3, P1.4 as polish.

---

## What this roadmap explicitly does *not* do

- Re-introduce a unified `Anchor` interface. Six rounds of review against three architectural variants of that interface all reach the same Goal #1 verdict. The structural failure (paste-target friction caused by the shared types module) doesn't have an architectural fix that retains the interface.

- Promote shared flow components (`OnRampFlow.svelte` / `OffRampFlow.svelte` style). These were the source of the capability-flag accretion that every reviewer criticized. If a shared flow ends up justified after Koywe, build it empirically from three concrete pages, not speculatively from one.

- Treat the Goal #2 duplication concern as resolved. It isn't. The P0 extractions are a partial answer; the Koywe integration is the complete answer. If Koywe shows the duplication compounds, the dissent was right and the response needs to be different.

---

## Open questions tracked elsewhere

- `project_etherfuse_pix_shape.md` (memory) — Etherfuse PIX bank-account registration body shape is unknown. Blocks Brazil off-ramp. Not architectural — separate work.

- `project_pdax_open_questions.md` (memory) — PDAX integration questions awaiting PDAX team response. Independent of the architectural decision.

- `project_coins_integration.md` (memory) — Coins.ph integration blocked on sandbox credentials. Interactive-only anchor; will be a clean test of the bespoke pattern's dual-archetype handling once it can be built.

These three are operational unblockers, not architectural questions.
