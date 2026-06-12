# Manteca anchor

Portable, framework-agnostic client for the [Manteca](https://manteca.dev) v2
crypto fiat on/off-ramp API. Copy `client.ts`, `types.ts`, and `index.ts`
together into any TypeScript project — the only external dependency is
`@stellar/stellar-sdk` (used to validate Stellar public keys).

> **Status: built from docs, not yet sandbox-verified.** Every shape here is
> modeled from Manteca's published API reference
> ([developers.manteca.dev](https://developers.manteca.dev), markdown mirror +
> `llms.txt` index) — **not** from a live environment. Sandbox API keys are not
> self-serve; you must contact Manteca to get them. Treat request/response
> shapes, the onboarding action sequence, and fee/liquidity assumptions as
> provisional until confirmed against the sandbox. Unverified specifics are
> flagged with `TODO` in `client.ts` and as `knownIssues` in
> `src/lib/config/anchors.ts`.

## What it does

Targets **Brazil first**: BRL ⇆ USDC on Stellar via **PIX**.

- **On-ramp** (BRL → USDC): onboard user → create a ramp-on _synthetic_ →
  Manteca returns PIX deposit instructions → user pays PIX → Manteca converts
  and settles USDC to the user's Stellar address.
- **Off-ramp** (USDC → BRL): onboard user → validate the payout PIX key →
  create a ramp-off _synthetic_ → user sends USDC to Manteca's Stellar deposit
  address → Manteca sells and pays out BRL via PIX.

Manteca also serves 11 other markets (Argentina CVU/CVU/alias, Mexico SPEI,
Colombia BRE-B, etc.); this client's `against` currency and destination shape
generalize, but only Brazil is wired into the demo app.

## Auth model

A single **static API key** sent in the `md-api-key` header on every request —
no OAuth, no token refresh. **Server-side only**: the key must never reach the
browser. In this repo the key lives in `$env/static/private` and is read by
`src/lib/server/mantecaInstance.ts`; the browser talks to
`/api/anchor/manteca/*` proxy routes.

```ts
import { MantecaClient } from '$lib/anchors/manteca';

const manteca = new MantecaClient({
    apiKey: process.env.MANTECA_API_KEY!,
    baseUrl: process.env.MANTECA_BASE_URL!, // https://sandbox.manteca.dev
    usdcIssuer: process.env.PUBLIC_USDC_ISSUER!,
    defaultExchange: 'BRAZIL',
});
```

## Client surface

| Method                       | Endpoint                                                        | Purpose                                                       |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `createUser`                 | `POST /crypto/v2/users`                                         | Create an end-user (returns per-user Stellar deposit address) |
| `getUser`                    | `GET /crypto/v2/users/{anyId}`                                  | Read onboarding status / `canOperate`                         |
| `submitOnboarding`           | `POST /crypto/v2/onboarding-actions/initial`                    | Create user + submit CPF and `personalData`                   |
| `getMissingPersonalData`     | `GET /crypto/v2/stats/onboarding/missing-personal-data/{anyId}` | Which KYC fields are still pending                            |
| `getPrice`                   | `GET /crypto/v2/prices/direct/{ticker}`                         | Nominal + effective buy/sell for e.g. `USDC_BRL`              |
| `getQuote`                   | _(composed)_                                                    | Quote from the price's effective buy/sell + spread            |
| `createRampOn`               | `POST /crypto/v2/synthetics/ramp-on`                            | Fiat → USDC-on-Stellar synthetic                              |
| `createRampOff`              | `POST /crypto/v2/synthetics/ramp-off`                           | USDC-on-Stellar → fiat synthetic                              |
| `getSynthetic`               | `GET /crypto/v2/synthetics/{anyId}`                             | Poll ramp progress (`isTerminal`)                             |
| `getWithdrawDestinationInfo` | `GET /crypto/v2/info/withdraw-destination/{dest}`               | Validate a PIX key / CBU / CVU                                |
| `simulateTestDeposit`        | `POST /broker/v1/api/banking/deposit`                           | **Sandbox only** — simulate the fiat deposit                  |

### Synthetics

A _synthetic_ is Manteca's orchestration entity: one API call chains
`DEPOSIT → ORDER → WITHDRAW` and reports overall progress via status
(`STARTING → ACTIVE → WAITING → COMPLETED`/`CANCELLED`). This client uses
**automatic mode** so the demo app can poll `getSynthetic` to completion rather
than running a webhook receiver. `MantecaSynthetic.isTerminal` is `true` once a
terminal status is reached — stop polling then.

### Onboarding (per the create-user recipe)

`submitOnboarding` calls `POST /crypto/v2/onboarding-actions/initial`, which is
the canonical create-user call (returns `id` + `numberId`; use `numberId` as
`userAnyId`). **Brazil needs more than a CPF**: only some fields (name,
birthDate, work) auto-populate from national databases — the integrator must
still supply `personalData` with `surname`, `phoneNumber`, `nationality`,
`address.street`, `sex`, and `maritalStatus`. Call `getMissingPersonalData` to
see what's still pending, and poll `getUser` until `status === 'ACTIVE'`.

### Pricing — no separate fee endpoint

Crypto ramp economics live in the price itself: `getPrice` returns nominal
`buy`/`sell` **and** `effectiveBuy`/`effectiveSell` (spread/fee-inclusive). The
`/broker/v1/.../fee/{ticker}` endpoint belongs to Manteca's separate
**Broker-as-a-Service** (Argentine securities: MEP dollar, CEDEARs, bonds) and
does **not** apply to crypto ramps — we do not call it. `getQuote` transacts at
the effective price (buy for on-ramp, sell for off-ramp) and reports the implied
`spreadFraction`.

### Errors

API errors use Manteca's envelope `{ status, internalStatus, message, errors? }`.
The client maps these to `MantecaError` with `code` = `internalStatus` and
`statusCode` = HTTP status. Handle on `code`, not `message`.

## Quality-criteria assessment (curated bar)

| Criterion                            | Status                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Locally denominated asset on Stellar | **USDC on Stellar** confirmed in docs (no BRL-denominated Stellar token) |
| Local payment rails                  | **PIX** (Brazil) confirmed; CVU/SPEI/BRE-B for other markets             |
| Competitive rates (<25 bps)          | **Unverified** — no public fee/spread; needs sandbox                     |
| Well-documented developer access     | **Strong** docs; sandbox keys sales-gated                                |
| Deep liquidity                       | **Unverified** — no public volume figures                                |

Provisionally curated, pending sandbox confirmation of rates and liquidity (see
`knownIssues`). If those don't clear the bar, move to `HONORABLE_MENTIONS`.

## Tests

`tests/anchors/manteca/client.test.ts` (Vitest + MSW) covers every client
method, the error-envelope mapping, Stellar-address validation, and the
debug-logging contract (silent by default, logs request/response when
`debug: true`, never logs the API key).

## Docs note

The legacy portal `docs.manteca.dev` bot-blocks scrapers (403/429). Use
`developers.manteca.dev` instead — every page is available as raw markdown
(append `.md`), and `developers.manteca.dev/llms.txt` indexes them all.
