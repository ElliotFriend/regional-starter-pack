# Manteca anchor

Portable, framework-agnostic client for the [Manteca](https://manteca.dev) v2
crypto fiat on/off-ramp API. Copy `client.ts`, `types.ts`, and `index.ts`
together into any TypeScript project — the only external dependency is
`@stellar/stellar-sdk` (used to validate Stellar public keys).

> **Status: Brazil sandbox-verified (on-ramp path); Argentina + Colombia built,
> unverified — June 2026.** Built from Manteca's published API reference
> ([developers.manteca.dev](https://developers.manteca.dev), markdown mirror +
> `llms.txt` index), then verified against the live sandbox (Brazil). The notes
> below are Brazil-specific unless stated; see **What it does** for the
> multi-region status.
> Confirmed working: price/quote, onboarding (`{user, person}` envelope; sandbox
> test CPF `40360893821`, name-mocked KYC), user fetch (per-user muxed Stellar
> address, no memo), ramp-on synthetic + PIX QR deposit instructions. The sandbox
> **auto-detects the PIX deposit (~15s) and auto-converts BRL→USDC** — no deposit
> simulation call is needed (the broker test-deposit endpoint is a separate
> product and is not used). **But the ramp does not complete:** the Stellar
> WITHDRAW leg fails (`stages[3].errors: ["Withdraw FAILED"]`) with no on-chain
> broadcast, even to a funded, USDC-trustlined testnet account. Issuer mismatch is
> ruled out — Manteca's pooled sandbox Stellar account trustlines the same Circle
> testnet USDC (`GBBD47IF…`) and holds ~30k; the sandbox just doesn't execute
> Stellar withdrawals. The **off-ramp** was also tested end-to-end: a real on-chain
> USDC payment (10 USDC to the user's muxed deposit address, tx confirmed on
> testnet) was **never detected** — the synthetic stayed at DEPOSIT. So neither
> crypto leg bridges to real testnet in sandbox (outbound withdraw fails; inbound
> deposit ignored); only the fiat legs auto-mock. The failure is **Stellar-specific**:
> a full EVM (Base Sepolia) round trip on the same user COMPLETED — on-ramp
> delivered real testnet USDC on-chain (Transfer of the exact
> `effectiveWithdrawAmount`) AND a subsequent off-ramp detected a real on-chain
> USDC deposit and settled (both `COMPLETED`). So the entire pipeline, including
> inbound deposit detection, is real — only Manteca's sandbox Stellar leg is
> broken. Several wire shapes were
> corrected against the sandbox (nested `effectivePrice`, the onboarding envelope,
> the PIX deposit object, `sex` F/M/X). Off-ramp wire: ramp-off → per-network
> `details.depositAddresses.{NETWORK}.address` — for Stellar use the `STELLAR`
> entry (muxed `M…`), NOT the `depositAddress` scalar (Manteca fills it with the
> EVM address). See `knownIssues` in `src/lib/config/anchors.ts`.

## What it does

Local fiat ⇆ USDC on Stellar across **three wired markets**, selected by the
`?region=` query param on the flow pages (default Brazil):

| Region       | `exchange`  | Fiat  | Rail          | Legal ID    |
| ------------ | ----------- | ----- | ------------- | ----------- |
| 🇧🇷 Brazil    | `BRAZIL`    | `BRL` | PIX           | CPF         |
| 🇦🇷 Argentina | `ARGENTINA` | `ARS` | CVU/CBU/alias | CUIT / DNI  |
| 🇨🇴 Colombia  | `COLOMBIA`  | `COP` | BRE-B         | Cédula (CC) |

- **On-ramp** (fiat → USDC): onboard user → create a ramp-on _synthetic_ →
  Manteca returns local deposit instructions (a PIX QR in Brazil; account/alias
  for AR/CO) → user pays → Manteca converts and settles USDC to the user's
  Stellar address.
- **Off-ramp** (USDC → fiat): onboard user → validate the payout destination
  (PIX key / CVU / Bre-B key) → create a ramp-off _synthetic_ → user sends USDC
  to Manteca's Stellar deposit address → Manteca sells and pays out fiat.

The per-region presentation + onboarding metadata lives in one table,
`src/lib/config/manteca-regions.ts` (consumed by both flow pages). Manteca also
serves ~9 other markets (Mexico SPEI, Chile, Peru, Philippines InstaPay, etc.)
that the client's `against`-currency + destination shape generalize to but the
demo app does not yet wire.

> **Verification status:** Brazil is sandbox-verified end-to-end (modulo the
> Stellar-leg gap above). **Argentina + Colombia are built but NOT
> sandbox-verified** — the CVU/BRE-B deposit-instruction and destination wire
> shapes are unconfirmed (the on-ramp deposit renderer falls back to generic
> fields), and we lack AR (CUIT) / CO (CC) sandbox test identities. See
> `docs/manteca-multiregion-plan.md`, Phase 4.

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

| Criterion                            | Status                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Locally denominated asset on Stellar | **USDC on Stellar** (no BRL-denominated Stellar token)                                                   |
| Local payment rails                  | **PIX** (BR) confirmed; **CVU/CBU/alias** (AR) + **BRE-B** (CO) wired, unverified                        |
| Competitive rates (<25 bps)          | **Unverified** — sandbox spread ~0 (not representative); per-quote cost is on the synthetic              |
| Well-documented developer access     | **Strong** docs; sandbox keys sales-gated (not self-serve)                                               |
| High-fidelity sandbox                | **Partial** — full ramp pipeline proven on EVM; Manteca's sandbox Stellar leg broken, vendor fix pending |
| Deep liquidity                       | **Unverified** — no public volume figures                                                                |

High-fidelity-sandbox is scored **partial**: the ramp pipeline is proven
end-to-end (an EVM/Base Sepolia round trip completes both directions with real
on-chain settlement and deposit detection), and only Manteca's sandbox Stellar
leg is currently broken — a vendor-side fix is pending (reported June 2026), so
this is not treated as a confirmed failure. Manteca stays **curated**. (Note: the
developer-readiness scorecard still computes a `blocked` verdict, but on
`open-access` — sandbox keys are sales-gated, not self-serve — which is
independent of the Stellar issue.)

## Tests

`tests/anchors/manteca/client.test.ts` (Vitest + MSW) covers every client
method, the error-envelope mapping, Stellar-address validation, and the
debug-logging contract (silent by default, logs request/response when
`debug: true`, never logs the API key).

## Docs note

The legacy portal `docs.manteca.dev` bot-blocks scrapers (403/429). Use
`developers.manteca.dev` instead — every page is available as raw markdown
(append `.md`), and `developers.manteca.dev/llms.txt` indexes them all.
