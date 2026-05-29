# Meta-analysis: three independent reviews of the Koywe integration across both architectures

**Synthesized from:** [`agent-1-review.md`](./agent-1-review.md), [`agent-2-review.md`](./agent-2-review.md), [`agent-3-review.md`](./agent-3-review.md)

**Question under test:** With a fresh Koywe (Argentina, ARS↔USDC) anchor integrated into each worktree, how does the *whole project* sit under each architecture — Worktree A (unified `Anchor` interface + capability facets + shared flow components + generic `[provider]` routes) vs Worktree B (bespoke per-provider: standalone client, own routes, own flow pages)?

Three reviewers worked independently and blind (no access to `dx-testing/`, the build notes, or each other). Both worktrees typecheck clean and pass their suites (A: 578 tests / B: 477).

---

## Disposition

| Reviewer | Verdict | Margin |
|---|---|---|
| Agent 1 | **Worktree B (bespoke)** | "clear — not a coin-flip" |
| Agent 2 | **Worktree B (bespoke)** | "decisively / clear-strong" |
| Agent 3 | **Worktree B (bespoke)** | "moderate-to-strong" |

**Unanimous for bespoke (B).** No dissent on the verdict — only on how wide the margin is, and that variance comes entirely from how much weight each reviewer gives the maintainability-at-scale counter-argument (Agent 3 weights it most, hence the softer margin).

---

## Strong agreements (each reviewer reached these independently)

1. **The decisive finding — A's Koywe off-ramp is functionally broken — was found independently by all three, with identical mechanics.** In the interface worktree:
   - `createOffRamp` sets `OffRampTransaction.stellarAddress` to the **user's own wallet** (`koywe/client.ts:688`) and puts the real Koywe deposit address in `paymentInstructions`.
   - The shared `OffRampFlow.svelte`, finding no `signableTransaction` and `deferredOffRampSigning:false`, falls into its terminal `else` and builds a payment **to `transaction.stellarAddress`** (`OffRampFlow.svelte:413-422`) — i.e. the user pays themselves; funds never reach Koywe.
   - `submitOffRampTxHash` (`koywe/client.ts:782`) exists but is **dead code** — declared outside the `Anchor` interface, referenced by no route, no `api/anchor.ts` wrapper, no component (grep-confirmed by all three).
   - **Unit tests stay green in A** because the break lives in shared-flow *wiring*, not the client — "the contract is green, the integration is red" (Agent 2). The bespoke worktree wires it correctly end-to-end (`koywe/offramp/+page.svelte:155-181` → send to `order.depositAddress` → `koywe.submitTxHash(...)`).
   - All three read this as the crux: the unified model didn't fail to *compile* on a divergent anchor — it silently produced a **plausible-but-wrong** integration, because the path of least resistance is "make it fit the existing archetypes."

2. **Goal #1 (portable, copy-paste clients) favors B decisively.** B's `KoyweClient` depends only on `@stellar/stellar-sdk`; lifting it is ~904 self-contained LOC. A's client imports ~20 types + `AnchorError` from the **897–898-line** shared `types.ts`, ~70% of which is foreign to Koywe (BlindPay `blockchainWalletId`, Transfero `RampIdentity`, the full SEP-24 `InteractiveOps` facet, SPEI/PIX instructions). Effective copy-paste surface ≈ **1,986 LOC vs 904** for the same anchor. The project's CLAUDE.md leads with "portable / copy-pasteable"; B is built for it, A works against it.

3. **Goal #2 (demo as builder inspiration) favors B.** Bespoke flow pages are linear, top-to-bottom state machines (~470–503 LOC, "one mental model deep"); the interface model pushes flow logic into large shared switchboards gated by a capability-flag matrix — `OffRampFlow.svelte` (865), `OnRampFlow.svelte` (669), `RampPage.svelte` (545). To A's credit there is **zero `provider ===` sniffing** (clean flag-driven design), but understanding "how Koywe works" means tracing page → RampPage → OnRampFlow → flag branches → generic route → factory → client.

4. **Goal #3 (low-friction anchor addition) is where A is *designed* to win, and Koywe shows the win is conditional.** On paper A is cheap (one factory case + config; Koywe added **zero** new flow files — `RampPage` already understood `kycFlow:'redirect'` + `selectablePaymentMethods`). But blast radius is the catch: in A, Koywe edited the shared `types.ts` (+74, imported by **27 files**), `OnRampFlow.svelte` (+90), the factory, and generic routes. In B, Koywe added **new files only**; the sole pre-existing files touched are the 4 config files **both** models edit identically. When an anchor doesn't fit the contract (Koywe's off-ramp), the friction reappears as shared-component surgery *or* a silent bug.

5. **"Fictional conformance" code in A.** To satisfy the interface, `KoyweClient.createCustomer` fabricates a `Customer` record (`client.ts:417-438`; Koywe has no partner-created-customer concept) and `getKycUrl` exists only to `throw` 501. These mislead a reader about what Koywe actually does.

6. **B shares mechanics without sharing flows — "bespoke" ≠ "blindly duplicated."** All three note B extracted the genuinely-common plumbing into `utils/poll.svelte.ts` (`createPoller`) and `api/http.ts` (`createApiRequester`), keeping the *flow* per-anchor. This is the right seam; A's reuse is "at the wrong altitude" — it shares the flow itself, the part that diverges per anchor.

7. **Neither worktree tests the flow components/pages** — and in A that means its single most complex, most-shared file (`OffRampFlow`, 865 LOC) is untested, which is exactly where the off-ramp regression slipped through. Flagged as the highest-value fix for either foundation.

8. **Shared hygiene issue in BOTH:** the client `request()` methods `console.log` full request/response bodies (PII/credential risk for "copy into your project" code).

---

## The one real disagreement: how much the scale counter-argument matters

Every reviewer raised — and then rejected — the same strongest counter-argument for A. The reviewers agree on the *substance*; they differ only on weight (which is why margins range from "moderate-to-strong" to "decisive").

**The case for A (all three articulate it):**
- The off-ramp break is a **fixable bug, not a paradigm verdict** — add one capability flag (e.g. `offRampViaDepositAddress`) + one `OffRampFlow` branch + a tx-hash route, ~few dozen lines.
- At N anchors, **B's duplication compounds**: a UX or security fix to the ramp flow is 1 edit in A, N edits in B. The on/off-ramp pages already share ~60% of their `<script>`.
- A has the **richer Koywe test suite** (624 vs 503 LOC) and a genuinely **multi-tenant client** (per-email token cache, JWT `exp` parsing, 401-retry) — the more production-shaped artifact. B bakes in a single fixed sandbox email (`koyweInstance.ts:17`).
- `RampPage` absorbing redirect-KYC + selectable-payment-methods "for free" is real evidence the abstraction *pays off*.

**Why all three reject it anyway:**
- The silent-wrong-settlement **failure mode is itself the indictment**: a generic flow that mis-settles instead of failing loudly invites "make-it-fit" integrations, and unit tests don't catch it. The recurring shape (3 hard-coded off-ramp archetypes, SPEI/PIX/generic on-ramp branches, capability-flag soup) shows it's not a one-off — the model absorbs per-anchor divergence into shared code until it can't, and Koywe (anchor #3) is where it couldn't.
- The project is explicitly a **curated copy-paste starter pack / builder reference**, not a 30-anchor aggregator optimizing internal DRY. Copy-paste isolation and read-one-file clarity *are* the product.
- B's "compounding duplication" is **real but bounded** — already mitigated by the shared `poll.svelte.ts`/`http.ts` helpers, and addressable with more *mechanism* primitives (a `<RampShell>`, a shared `signAndSubmit`/SEP-10 helper) without unifying the flow state machines.

---

## Recommendation (consensus)

**Ship on Worktree B (bespoke).** Then incrementally lift A's best ideas into it rather than retrofitting the programmatic anchors onto a universal contract:

1. **Port A's richer Koywe test suite** into B.
2. **Port A's per-email token cache** to B before any real multi-user deployment (B's fixed sandbox email is fine for the demo, wrong for production).
3. **Add flow/page-level tests** in B (the gap that hid A's off-ramp bug exists structurally in both).
4. **Only when a true SEP-24 hosted anchor lands (e.g. Coins.ph),** introduce a *single* shared interactive flow component — don't generalize the programmatic flows.
5. **Hygiene:** remove/guard the `console.log` of full bodies; trim B's `supportedCurrencies` (lists 6, only ARS wired); factor the ~60%-shared on/off-ramp `<script>` into a composable before a 3rd Koywe-style anchor.

**If Worktree A were kept instead,** the blocking item is the off-ramp (wire deposit-address settlement + a tx-hash route + an *integration-level* test, since unit tests pass over the break), followed by garbage-collecting dead capability flags for removed anchors (BlindPay/Transfero) from the 27-importer `types.ts`.

**Bottom line:** the exercise did exactly what it was designed to. Asked to absorb a real new anchor, the unified interface produced a broken, partly-fictional, hard-to-lift Koywe integration; the bespoke model produced a correct, self-contained, legible one. For this project's stated mission, that settles it — with the honest caveat that at much larger anchor counts the trade-off would tilt back toward A.
