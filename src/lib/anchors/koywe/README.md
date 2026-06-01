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
    usdcIssuer: process.env.PUBLIC_USDC_ISSUER!, // network-correct USDC issuer
});
```

`clientId` doubles as the `metaAccount`; there are no org/merchant path params. Email is **optional** on `POST /rest/auth`, so the client carries no baked-in identity: per-user operations (`createAccount`, `checkAccount`, order creation) take an `email` argument, and the client caches one JWT per email (plus an email-less "app" token for catalogue/quote calls). A single client instance therefore serves many users. The optional `email` config field is only a fallback for those per-user calls.

## Why `usdcIssuer` is injected

Koywe's API does not return a Stellar issuer for USDC — the asset is identified only by the symbol `"USDC Stellar"`, and the issuer differs by network (Circle's testnet vs mainnet account). The host app supplies the network-appropriate `PUBLIC_USDC_ISSUER`, which the client exposes on `supportedTokens` for trustline/asset resolution.

## Integration Flow

On-ramp and off-ramp share authentication and diverge at order creation.

**On-ramp (ARS → USDC):**

1. **Account / KYC** — `checkAccount(email)`; if no account exists, `createAccount({ email, document, address, personalInfo })` submits delegated KYC (there is no hosted KYC widget). `checkAccount` reports `canOperate` + any missing requirements.
2. **Payment method** — `getPaymentProviders('ARS')` lists rails (WIREAR / QRI-AR / Khipu).
3. **Quote** — `getQuote({ ramp: 'onramp', fiatCurrency: 'ARS', amount, paymentMethodId })` returns an executable quote (~2-5 min).
4. **Order** — `createOnRampOrder({ quoteId, stellarAddress, email })`. WIREAR returns inline CVU/alias/bank instructions; QRI/Khipu return an `interactiveUrl` hosted redirect.
5. **Fulfillment** — the user pays ARS via the chosen rail; Koywe delivers USDC to the Stellar address.
6. **Polling** — `getOrder(orderId, email)` until `DELIVERED`.

**Off-ramp (USDC → ARS):**

1. **Account / KYC** — same as on-ramp: `checkAccount(email)` / `createAccount(...)`.
2. **Payout account** — `createBankAccount({ email, accountNumber, countryCode: 'ARG', currencySymbol: 'ARS', documentNumber? })` registers the CVU and returns a `KoyweBankAccount` whose `id` the order references. Re-registering the same account 400s, so look it up with `getBankAccounts({ email, countryCode, currencySymbol })` first to stay idempotent.
3. **Quote** — `getQuote({ ramp: 'offramp', fiatCurrency: 'ARS', amount })`.
4. **Order** — `createOffRampOrder({ quoteId, bankAccountId, email })` (the `bankAccountId` is the registered account's `id`) returns a Koywe Stellar `depositAddress`.
5. **Send** — the user signs and submits a USDC payment to `depositAddress`.
6. **Reconcile** — `submitTxHash(orderId, txHash, email)` attaches the Stellar tx hash.
7. **Polling** — `getOrder(orderId, email)` until `DELIVERED`.

## Order states

`WAITING → PENDING → EXECUTING → IN_PROGRESS → DELIVERED` (plus `REJECTED`, `INVALID_WITHDRAWALS_DETAILS`). Statuses are passed through verbatim; flow pages map them to UI states.

## KYC (delegated)

Koywe uses **delegated KYC**: the integrator collects the user's identity and submits it, rather than redirecting to a hosted widget. There are two halves:

1. **Identity data** — `createAccount({ email, document, address, personalInfo })` (`POST /rest/accounts`). ✅ implemented.
2. **Supporting documents** — `POST /upload-delegated-kyc-files` (multipart `pdf`/`video`/`image`). ❌ **not yet implemented** — likely required before an account becomes fully verified / `canOperate`.

**Status:** `checkAccount(email)` reads `GET /rest/accounts/{email}/check` (the `CheckAccount` schema) and returns Koywe's real verdict — `{ canOperate, accountStatus, missing[], nextVerificationDate }` — not an inference from whether a document was submitted. A 404 (no account) maps to `{ canOperate: false, accountStatus: 'not_started', missing: [] }`. The flow pages gate on this: `accountStatus === 'not_started'` → collect KYC; otherwise proceed but surface `canOperate` and the `missing` requirements (Koywe only delivers/pays out once truly verified). Use `checkAccount` rather than assuming "document present ⇒ approved" — that only ever meant "submitted," and a delegated-KYC account can have a document on file yet remain unverified pending document uploads.

## API reference

Request/response shapes are confirmed against `koywe.openapi.yaml` (in this directory) — the authoritative source. The server base path is `/rest` (`https://api-sandbox.koywe.com/rest`). For both ramps, `orders_body.destinationAddress` carries the Stellar address (on-ramp) or the bank-account id (off-ramp).

## Sandbox quirks

There is no on-ramp fiat-received simulation API (the spec only simulates the off-ramp bank leg once the testnet crypto payment is confirmed). In the live sandbox only **Khipu** reaches `DELIVERED` for on-ramp (pay `1234` / `123456` on the Khipu test page); WIREAR and QRI orders stay in `WAITING`. The unit tests still exercise the full `WAITING → DELIVERED` progression via mocks.

**Off-ramp bank-account registration is blocked in sandbox (Koywe-side).** `POST /rest/bank-accounts` runs an ownership check ("the bank account holder matches the user who is operating the account"). The docs publish whitelisted DNI↔CVU test pairs:

| Document (DNI) | Account number (CVU)   |
| -------------- | ---------------------- |
| 34770518       | 0000242600000000009120 |
| 14013056       | 0000362700000000000116 |
| 25715125       | 0000389400000000000055 |
| 11270545       | 4310001322000000000846 |
| 30890437       | 4310001342400000011259 |

But registering even a documented pair exactly (`documentNumber: 34770518` + CVU `0000242600000000009120`, on a fresh account KYC'd under that DNI) returns `400 KoyweBadRequest`: _"Failed to validate if bank account &lt;id&gt; - number &lt;cvu&gt; belongs to 34770518"_. The wording ("failed to validate **if**") and the fact that the documented happy-path values are rejected point to the sandbox's ownership-verification backend not being functional, rather than a request-shape problem on our side — our body matches the documented example (the only omitted field is the optional `bankCode`). The client/route code is implemented to spec and unit-tested against mocks.

A second, compounding wrinkle: a DNI is **single-use** — once any account has been KYC'd under a document number, `POST /rest/accounts` for that DNI on a new email returns _"account already exists with that document number"_. With only five whitelisted test DNIs, the pool gets consumed quickly during testing, and an account can't have its DNI changed after creation.

## TODO — remaining Koywe work (integration paused 2026-06-01)

The integration is **paused** here. On-ramp works end-to-end via Khipu; the off-ramp is blocked at bank-account registration. Remaining work, none of which is a code-shape bug on our side:

1. **[Koywe team] Off-ramp bank-account ownership validation** — `POST /rest/bank-accounts` rejects Koywe's own documented DNI↔CVU test pairs (see above). Blocks the entire off-ramp. Needs Koywe to fix the sandbox validation backend (or tell us what the request is missing).
2. **[Koywe team] Single-use whitelisted DNIs** — the five test DNIs are consumed after first use; ask Koywe for either a larger pool or a sandbox reset so the off-ramp can be re-tested.
3. **[us, once #1/#2 unblock] Document upload** — `POST /upload-delegated-kyc-files` (multipart `pdf`/`video`/`image`) is **not implemented**; it is likely required before an account reaches `canOperate: true`. Wire it only after `checkAccount`'s `missing[]` confirms documents are the gap (read the amber banner in the flow pages).
4. **[us] Confirm off-ramp to `DELIVERED`** — never verified end-to-end; do this once #1–#3 are resolved.

These are tracked as `knownIssues` on `ANCHORS.koywe` (rendered on the anchor page) and as a `TODO(koywe)` in `routes/anchors/koywe/offramp/+page.svelte`.
