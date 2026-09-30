# Chipper Client

Server-side TypeScript client for the [Chipper Platform API](https://docs.platform.chipper.ai). It ramps Ghanaian cedis (GHS) and Kenyan shillings (KES) over mobile money and bank transfer to and from USDC on Stellar.

**This client must only run on the server.** It authenticates with a secret API key that must never reach the browser.

## Security: sandbox demo only

This app's proxy routes (`src/routes/api/anchor/chipper/*`) are unauthenticated, like every anchor proxy in the demo. Anyone who can reach them can create orders (sending a mobile money PIN prompt to any phone) and resolve account-holder names through `/validate` using the app's Chipper key. To keep that harmless:

- The server singleton refuses anything but a sandbox key (`assertSandboxKey`: `sk_test_…` only).
- Routes accept method codes only from the app's active markets and matching currency (`isMethodForMarket`: `gh_…`/GHS and `ke_…`/KES).
- Path parameters (country, currency, order id) are validated before any request, so a value like `..` can't reach a different endpoint.

**Before using a live key**, put these routes behind user authentication and rate limiting. `/validate` in particular is a PII lookup; resolve names only inside an authenticated off-ramp flow. The client itself accepts live keys; the restriction lives in this app's singleton.

## Files

| File                   | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `client.ts`            | `ChipperClient` plus the pure helpers `mapOrder` and `sandboxCollectionOutcome` |
| `types.ts`             | Wire and client types, and `ChipperError`                                       |
| `index.ts`             | Re-exports                                                                      |
| `chipper.openapi.json` | Vendored OpenAPI spec (the wire authority)                                      |

## Setup

```typescript
import { ChipperClient } from 'path/to/anchors/chipper';

const chipper = new ChipperClient({
    apiKey: process.env.CHIPPER_SECRET_KEY!, // sk_test_… or sk_live_…
    baseUrl: process.env.CHIPPER_API_URL!, // https://sandbox-api.platform.chipper.ai
    debug: false, // true logs requests, responses, and errors (never the key)
});
```

Every request sends `Authorization: Bearer <key>` and `chipper-version: 2026-02-20`. There is no key ID and no request signing. Create keys in the dashboard under **Developers → API keys**.

## How the ramps work

Chipper is partner-level: there is no end-user customer or KYC object. A single **order** collects on one rail and pays out on another.

- **On-ramp:** mobile money collection in, `usdc_stellar` payout out. The payer approves a PIN prompt on their phone; Chipper then pays USDC to the Stellar address in `to.accountNumber`.
- **Bank on-ramp (Kenya):** pass the payer's bank as the source (`ke_kcb`, `ke_equity`) and omit `phone`. Chipper opens a per-order virtual account and returns `virtual_account` instructions (bank, account number, account name, amount). Bank sources aren't listed under capabilities `collections`; they come from the bank methods under `payouts`. Ghana bank pay-ins require an organization representative on the Chipper account.
- **Off-ramp:** `usdc_stellar` in, mobile money or bank payout out (`accountNumber` is the phone or the bank account number). The order's `instructions` carry a Stellar `address`, a memo-ID `tag`, and the exact `amount` (fee included). Send that amount with the tag as a **MEMO_ID**. A payment without the memo is held for manual review.

## Methods

| Method                | Endpoint                                                                    | Purpose                                                            |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `getOrganization`     | `GET /v1/organization`                                                      | Connectivity check; which org the key belongs to                   |
| `getCapabilities`     | `GET /v1/capabilities/{country}`                                            | Mobile money collections; mobile money + bank payouts (`GH`, `KE`) |
| `getRate`             | `GET /v1/rates/{origin}/{destination}`                                      | All-in rate, destination units per origin unit                     |
| `validateDestination` | `POST /v1/validate`                                                         | Resolve a mobile money or bank account holder name                 |
| `createOnRampOrder`   | `POST /v1/orders`                                                           | Mobile money or bank transfer → `usdc_stellar`                     |
| `createOffRampOrder`  | `POST /v1/orders`                                                           | `usdc_stellar` → mobile money or bank account                      |
| `simulateBankDeposit` | `GET /v1/virtual-accounts` + `POST /v1/simulations/virtual-account-deposit` | Sandbox only: fund a bank-sourced order                            |
| `getOrder`            | `GET /v1/orders/{id}`                                                       | Poll an order; `null` when unknown                                 |

Read capabilities at runtime: method codes and limits differ between sandbox and production.

## Order lifecycle

`awaiting_funds` → (`awaiting_confirmations` for crypto) → `funds_received` → `processing_payout` → `completed`

`overpaid` and `underpaid` proceed on the amount received. `completed`, `failed`, and `expired` are terminal. `ChipperOrder.isTerminal` and `ChipperOrder.failed` (`failed` or `expired`) tell a poller when to stop.

## Idempotency

Every order takes an `externalReference`. Reuse it on retry: a replay returns the original order with `200` instead of creating a second one.

## Sandbox notes

- The sandbox settles on the real Stellar testnet with Circle's testnet USDC (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`).
- Bank on-ramps are funded with `simulateBankDeposit`, which finds the order's virtual account (its `externalReference` is the order id).
- A mobile money collection's cents choose its outcome (`.50` delayed, `.51` failed, `.52` timeout, `.99` transient error). An order collects amount + fee (0.5% in sandbox), so a 100 GHS order collects 100.50 and completes only after a delay, while 200 GHS collects 201.00 and completes normally. `.51` and `.52` are the outcomes that actually fail. `sandboxCollectionOutcome(order.expectedAmount)` reports the outcome in advance.
- PYUSD on Stellar appears in capabilities but has no sandbox provider (`no_provider_available`), so this client ramps USDC only.

## Verified in sandbox (2026-09-30)

- Kenya bank pay-ins: an order sourced from `ke_kcb` or `ke_equity` returned `virtual_account` instructions for a per-order KCB account whose `externalReference` is the order id, and completed after a simulated deposit. Ghana bank pay-ins need an organization representative on the account.
- Bank payouts completed to `gh_gcb` (Ghana) and `ke_kcb` (Kenya).

## Errors

Every non-2xx response becomes a `ChipperError` with `code` (Chipper's stable `error` value), `statusCode`, `requestId` (quote it to support), and `details`. Validation details are appended to the message.

## Tests

`tests/anchors/chipper/client.test.ts` (Vitest + MSW) covers every method, the error envelope, idempotent replays, status mapping, the sandbox outcome helper, and the debug-logging contract (silent by default, logs when `debug: true`, never logs the key).
