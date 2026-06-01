# Koywe Integration — DX Notes (bespoke per-provider architecture)

Adding the **Koywe** anchor (Argentina, ARS ↔ USDC on Stellar) to this branch's
bespoke per-provider model — no shared `Anchor` interface, no factory, each
anchor owns its client / instance / API wrapper / routes / flow pages and is
free to duplicate.

## Files created

| File                                                     | ~LOC | Notes                                            |
| -------------------------------------------------------- | ---: | ------------------------------------------------ |
| `src/lib/anchors/koywe/client.ts`                        |  522 | `KoyweClient`, own `request`/auth-cache, mappers |
| `src/lib/anchors/koywe/types.ts`                         |  379 | client surface + raw API shapes + `KoyweError`   |
| `src/lib/anchors/koywe/index.ts`                         |    3 | barrel re-export                                 |
| `src/lib/anchors/koywe/README.md`                        |   75 | setup, flow, flagged unknowns, sandbox quirks    |
| `src/lib/server/koyweInstance.ts`                        |   33 | `getKoywe()` singleton (reads env + USDC issuer) |
| `src/lib/api/koywe.ts`                                   |  126 | client-side fetch wrappers + `KoyweApiError`     |
| `src/routes/api/anchor/koywe/payment-methods/+server.ts` |   26 | GET rails for a fiat symbol                      |
| `src/routes/api/anchor/koywe/quotes/+server.ts`          |   31 | POST executable quote                            |
| `src/routes/api/anchor/koywe/onramp/+server.ts`          |   30 | POST create on-ramp order                        |
| `src/routes/api/anchor/koywe/offramp/+server.ts`         |   44 | POST create off-ramp order + submit txHash       |
| `src/routes/api/anchor/koywe/order/+server.ts`           |   28 | GET poll order                                   |
| `src/routes/api/anchor/koywe/kyc/+server.ts`             |   37 | GET status / POST hosted-KYC url (501)           |
| `src/routes/anchors/koywe/+page.svelte`                  |  135 | landing page (single Argentina region)           |
| `src/routes/anchors/koywe/onramp/+page.svelte`           |  503 | bespoke state machine (method→amount→quote→pay)  |
| `src/routes/anchors/koywe/offramp/+page.svelte`          |  470 | bespoke state machine (sign+submit USDC→payout)  |
| `tests/anchors/koywe/client.test.ts`                     |  503 | 23 MSW-backed client tests                       |
| `static/anchor-logos/koywe.png`                          |    — | copied from `ar/koywe` branch                    |

## Files modified

| File                                                     | Change                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/constants.ts`                                   | `PROVIDER.KOYWE`, Argentina in `SUPPORTED_COUNTRIES`                |
| `src/lib/config/rails.ts`                                | added `wirear` + `qri` rails                                        |
| `src/lib/config/regions.ts`                              | added `argentina` region (Koywe anchor, WIREAR/QRI rails)           |
| `src/lib/config/anchors.ts`                              | added curated `koywe` `AnchorProfile` (regions, flow, known issues) |
| `tests/config/{anchors,constants,rails,regions}.test.ts` | new assertions + bumped counts (2→3 anchors, 2→3 providers)         |

## Verification

- `pnpm test:run`: **477 passed** (23 new Koywe client tests + new config assertions).
- `pnpm lint` (prettier + eslint): **clean**.
- `pnpm check` (svelte-check): **0 errors, 0 warnings**.

### Iteration count

- **Client tests**: green on the **first** implementation pass (1 iteration) — the
  RED tests matched the GREEN client immediately.
- **Config tests**: 1 iteration — the only "failures" were the deliberate count
  bumps (`getAllAnchors` 2→3, `PROVIDER` keys 2→3) which I updated alongside the config.
- **Svelte pages**: clean through `svelte-autofixer` on the **first** pass for all
  three pages (0 issues, 0 suggestions); `pnpm check` clean first try.
- **Lint**: clean after a single `pnpm format`.

Net: essentially zero rework. The bespoke model meant nothing else could break.

## Flagged unknowns I hit

All three flagged unknowns were handled as instructed (stub + `TODO(koywe)`,
no invented live behavior):

1. **Hosted KYC widget URL** — `getKycUrl()` throws `KoyweError('NOT_IMPLEMENTED', 501)`.
   Both flow pages catch it and surface "complete KYC in the Koywe dashboard".
   The KYC POST route proxies the same 501.
2. **Off-ramp order field name** — `createOffRampOrder` sends the bank-account id
   as `destinationAddress` (matches the documented OpenAPI `orders_body`, where
   the description explicitly says off-ramp uses the bank-account id there).
   TODO-flagged as unverified-live.
3. **Submit-tx-hash path** — `submitTxHash` POSTs `/rest/orders/{orderId}/txHash`
   with `{txHash}` (documented spec). TODO-flagged as unverified-live.

Plus the raw-symbol mapping: polled orders return `"USDC Stellar"`; `displayAsset()`
maps it to the display symbol `"USDC"`. The off-ramp page also has a TODO for
bank-account **registration** (the `POST /rest/bank-accounts` body shape is out of
scope here), so the page takes an already-registered bank-account id as input.

## Where the bespoke architecture HELPED

1. **Zero blast radius / no interface gymnastics.** I shaped `KoyweClient` exactly
   to Koywe's wire format — auth-token caching baked into the client, `getQuote`
   taking a `ramp` discriminator, statuses passed through verbatim (`WAITING`…
   `DELIVERED`), `KoyweError` as its own class. There was no shared `Anchor`
   interface to satisfy, so Koywe's quirks (no issuer returned → inject
   `usdcIssuer`; CVU multi-line `providedAddress` parsing; ARS-per-USDC rate) live
   entirely inside the Koywe directory and touch nothing else. Contrast: the
   `ar/koywe` reference targeted the shared-interface model and had to bend Koywe
   into `client.programmatic.*` + generic `AnchorError` + `GenericPaymentInstructions`.

2. **Copy-the-sibling cadence is fast and predictable.** Etherfuse is the closest
   sibling (API-key, server-side, programmatic). Every layer had an obvious
   template: `etherfuseInstance.ts` → `koyweInstance.ts`, `api/etherfuse.ts` →
   `api/koywe.ts` (sharing the `createApiRequester` helper for the error-class +
   plumbing split), the per-operation CORS-proxy routes, and the on/off-ramp page
   state machines. The CLAUDE.md checklist mapped 1:1 to actual files.

3. **Dumb structural UI primitives composed without friction.** `QuoteDisplay`,
   `AmountInput`, `TrustlineStatus`, `CompletionStep`, `CopyableField`, `DevBox`
   all took structural props — I adapted `KoyweQuote` to the `QuoteDisplay` shape
   with one inline `$derived` and never had to touch a shared component or add a
   `provider === 'koywe'` branch anywhere.

## Where the bespoke architecture FOUGHT (mildly)

1. **Genuine duplication across the two flow pages.** The on-ramp and off-ramp
   pages repeat ~80% of their scaffolding (KYC discovery, quote get/refresh,
   `createPoller` wiring, the `displayQuote` adapter, error/working flags). That's
   ~950 LOC of page code that is mostly the same shape as the Etherfuse pages too.
   This is the model's deliberate trade (readability over DRY), but it is the one
   place adding an anchor feels like typing the same thing again. The shared
   `createPoller` + structural components blunt it; the page shells do not.

2. **Config touch-points are spread across four files + four test files.** A new
   curated anchor isn't "one client" — it's edits to `constants.ts`, `rails.ts`,
   `regions.ts`, `anchors.ts`, and a matching assertion + count bump in each
   config test. None hard, but it's the part most likely to be forgotten, and the
   hard-coded counts (`toHaveLength(2)`) mean every new anchor forces a test edit.
   A tiny friction tax, not a wall.

3. **No registry means "did I wire it everywhere?" is on me.** Because there's no
   factory/registry, nothing fails loudly if you forget a route or a config entry.
   The `+layout.ts` `getAllAnchors()` and the config-driven region pages picked up
   Koywe automatically (a plus), but the API routes and flow pages are pure
   convention — discoverability relies on the CLAUDE.md checklist rather than the
   type system.

## Top 3 DX observations

1. **The model optimizes for "shape to the API, not to an abstraction."** Koywe's
   auth-token caching, rate inversion, verbatim statuses, and injected USDC issuer
   all stayed local — the single biggest DX win versus a shared interface.
2. **Sibling-copy is the real workflow.** Etherfuse was a near-perfect template at
   every layer; the cost of a new anchor is dominated by typing the two ~480-LOC
   flow-page state machines, not by design decisions.
3. **The cost is duplication + config sprawl, paid up front and visibly.** No
   hidden coupling broke; the friction is the ~950 LOC of near-duplicate page
   shell and the five-file config/test fan-out (with hard-coded counts) for one
   anchor.
