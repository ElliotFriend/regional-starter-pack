# Chipper Client

Server-side TypeScript client for the [Chipper Platform API](https://docs.platform.chipper.ai). It ramps Ghanaian cedis (GHS) and Kenyan shillings (KES) over mobile money to and from USDC on Stellar.

**This client must only run on the server.** It authenticates with a secret API key that must never reach the browser.

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
- **Off-ramp:** `usdc_stellar` in, mobile money payout out. The order's `instructions` carry a Stellar `address`, a memo-ID `tag`, and the exact `amount` (fee included). Send that amount with the tag as a **MEMO_ID**. A payment without the memo is held for manual review.

## Methods

| Method                | Endpoint                               | Purpose                                                 |
| --------------------- | -------------------------------------- | ------------------------------------------------------- |
| `getOrganization`     | `GET /v1/organization`                 | Connectivity check; which org the key belongs to        |
| `getCapabilities`     | `GET /v1/capabilities/{country}`       | Mobile money collection and payout methods (`GH`, `KE`) |
| `getRate`             | `GET /v1/rates/{origin}/{destination}` | All-in rate, destination units per origin unit          |
| `validateDestination` | `POST /v1/validate`                    | Resolve a mobile money holder name                      |
| `createOnRampOrder`   | `POST /v1/orders`                      | Mobile money → `usdc_stellar`                           |
| `createOffRampOrder`  | `POST /v1/orders`                      | `usdc_stellar` → mobile money                           |
| `getOrder`            | `GET /v1/orders/{id}`                  | Poll an order; `null` when unknown                      |

Read capabilities at runtime: method codes and limits differ between sandbox and production.

## Order lifecycle

`awaiting_funds` → (`awaiting_confirmations` for crypto) → `funds_received` → `processing_payout` → `completed`

`overpaid` and `underpaid` proceed on the amount received. `completed`, `failed`, and `expired` are terminal. `ChipperOrder.isTerminal` and `ChipperOrder.failed` (`failed` or `expired`) tell a poller when to stop.

## Idempotency

Every order takes an `externalReference`. Reuse it on retry: a replay returns the original order with `200` instead of creating a second one.

## Sandbox notes

- The sandbox settles on the real Stellar testnet with Circle's testnet USDC (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`).
- A mobile money collection's cents choose its outcome (`.50` delayed, `.51` failed, `.52` timeout, `.99` transient error). An order collects amount + fee (0.5% in sandbox), so a 100 GHS order collects 100.50 and stalls, while 200 GHS collects 201.00 and completes. `sandboxCollectionOutcome(order.expectedAmount)` reports the outcome in advance.
- PYUSD on Stellar appears in capabilities but has no sandbox provider (`no_provider_available`), so this client ramps USDC only.

## Errors

Every non-2xx response becomes a `ChipperError` with `code` (Chipper's stable `error` value), `statusCode`, `requestId` (quote it to support), and `details`. Validation details are appended to the message.

## Tests

`tests/anchors/chipper/client.test.ts` (Vitest + MSW) covers every method, the error envelope, idempotent replays, status mapping, the sandbox outcome helper, and the debug-logging contract (silent by default, logs when `debug: true`, never logs the key).
