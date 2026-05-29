# Koywe Client

Self-contained TypeScript client for the [Koywe](https://koywe.com) crypto fiat on/off ramp API (`https://api-sandbox.koywe.com`, docs at [docs-crypto.koywe.com](https://docs-crypto.koywe.com/en)). Copy these three files into any TypeScript project — the only runtime dependency outside this directory is `@stellar/stellar-sdk` (for Stellar public-key validation).

Handles fiat on/off ramps in Argentina:

- **Argentina** — ARS ↔ USDC on Stellar via WIREAR (CVU bank transfer), QRI-AR (QR), or Khipu.

**Server-side only.** It authenticates with a `clientId`/`secret` pair (exchanged for a 24h JWT) that must never reach the browser.

## Files

| File        | Purpose                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `client.ts` | `KoyweClient` class — public surface for the Koywe crypto REST API         |
| `types.ts`  | Client output/input types + raw API request/response shapes + `KoyweError` |
| `index.ts`  | Re-exports `KoyweClient`, `KoyweError`, and all types                      |

## Setup

```typescript
import { KoyweClient } from 'path/to/anchors/koywe';

const koywe = new KoyweClient({
    clientId: process.env.KOYWE_CLIENT_ID!,
    secret: process.env.KOYWE_SECRET!,
    baseUrl: process.env.KOYWE_BASE_URL!, // https://api-sandbox.koywe.com
    email: 'stellar-ar@koywe-test.com', // Argentina sandbox test user
    usdcIssuer: process.env.PUBLIC_USDC_ISSUER!, // network-correct USDC issuer
});
```

`clientId` doubles as the `metaAccount`; there are no org/merchant path params. The auth token is scoped to `email` and cached for the client's lifetime.

## Why `usdcIssuer` is injected

Koywe's API does not return a Stellar issuer for USDC — the asset is identified only by the symbol `"USDC Stellar"`, and the issuer differs by network (Circle's testnet vs mainnet account). The host app supplies the network-appropriate `PUBLIC_USDC_ISSUER`, which the client exposes on `supportedTokens` for trustline/asset resolution.

## Integration Flow

On-ramp and off-ramp share authentication and diverge at order creation.

**On-ramp (ARS → USDC):**

1. **Payment method** — `getPaymentProviders('ARS')` lists rails (WIREAR / QRI-AR / Khipu).
2. **Quote** — `getQuote({ ramp: 'onramp', fiatCurrency: 'ARS', amount, paymentMethodId })` returns an executable quote (~2-5 min).
3. **Order** — `createOnRampOrder({ quoteId, stellarAddress })`. WIREAR returns inline CVU/alias/bank instructions; QRI/Khipu return an `interactiveUrl` hosted redirect.
4. **Fulfillment** — the user pays ARS via the chosen rail; Koywe delivers USDC to the Stellar address.
5. **Polling** — `getOrder(orderId)` until `DELIVERED`.

**Off-ramp (USDC → ARS):**

1. **Quote** — `getQuote({ ramp: 'offramp', fiatCurrency: 'ARS', amount })`.
2. **Order** — `createOffRampOrder({ quoteId, bankAccountId })` returns a Koywe Stellar `depositAddress`.
3. **Send** — the user signs and submits a USDC payment to `depositAddress`.
4. **Reconcile** — `submitTxHash(orderId, txHash)` attaches the Stellar tx hash.
5. **Polling** — `getOrder(orderId)` until `DELIVERED`.

## Order states

`WAITING → PENDING → EXECUTING → IN_PROGRESS → DELIVERED` (plus `REJECTED`, `INVALID_WITHDRAWALS_DETAILS`). Statuses are passed through verbatim; flow pages map them to UI states.

## KYC

KYC is Koywe-hosted. `getKycStatus()` reads `GET /rest/accounts/{email}` and infers `approved` from the presence of `document.documentNumber` (404 → `not_started`).

## Flagged unknowns (see inline `TODO(koywe)`)

- **Hosted KYC widget URL** — endpoint unconfirmed. `getKycUrl()` throws a `KoyweError` with code `NOT_IMPLEMENTED` / status `501` rather than guessing. Complete KYC for the test user via the Koywe dashboard.
- **Off-ramp order field name** — `createOffRampOrder` sends the bank-account id as `destinationAddress` (matches the documented OpenAPI `orders_body`), but this was not verified against a live off-ramp order.
- **Submit-tx-hash path** — `submitTxHash` POSTs to `/rest/orders/{orderId}/txHash` per the documented spec; unverified live.

## Sandbox quirks

There is no fiat-received simulation API. In the live sandbox only **Khipu** reaches `DELIVERED` (pay `1234` / `123456` on the Khipu test page); WIREAR and QRI orders stay in `WAITING`. The unit tests still exercise the full `WAITING → DELIVERED` progression via mocks.
