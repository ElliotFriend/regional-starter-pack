# Etherfuse Client

Self-contained TypeScript client for the [Etherfuse](https://etherfuse.com) anchor API. Copy these three files into any TypeScript project — the only runtime dependency outside this directory is `@stellar/stellar-sdk` (for Stellar public-key validation).

Handles fiat on/off ramps in two regions:

- **Mexico** — MXN ↔ CETES on Stellar via the SPEI payment rail.
- **Brazil** — BRL ↔ TESOURO on Stellar via the PIX payment rail.

Both regions use the same `EtherfuseClient`; the client maps SPEI- and PIX-shaped request/response bodies based on the bank account's rail.

**Server-side only.** It authenticates with an API key that must never reach the browser.

## Files

| File        | Purpose                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `client.ts` | `EtherfuseClient` class — public surface for the Etherfuse REST API            |
| `types.ts`  | Client output/input types + raw API request/response shapes + `EtherfuseError` |
| `index.ts`  | Re-exports `EtherfuseClient`, `EtherfuseError`, and all types                  |

## Setup

```typescript
import { EtherfuseClient } from 'path/to/anchors/etherfuse';

const etherfuse = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: process.env.ETHERFUSE_BASE_URL!, // e.g. https://api.sand.etherfuse.com
});
```

Optional config:

- `defaultBlockchain` — defaults to `"stellar"`.

## Integration Flow

Every Etherfuse integration follows the same sequence. On-ramp and off-ramp share the first three steps and diverge at order creation.

1. **Customer onboarding** — register the user and complete KYC (hosted iframe or programmatic submission).
2. **Asset discovery** — query rampable assets on the blockchain via `getAssets()`.
3. **Quote** — request a price quote. Quotes expire after **2 minutes**.
4. **Order creation** — create an on-ramp or off-ramp order using the quote.
5. **Fulfillment**:
    - **On-ramp:** user transfers fiat to the deposit instructions on the order (CLABE via SPEI in Mexico, PIX BR-Code in Brazil). Etherfuse confirms receipt and delivers tokens to the user's Stellar wallet.
    - **Off-ramp:** Etherfuse prepares a burn transaction XDR. The user signs it with their wallet (e.g. Freighter) and submits it to Stellar. Once the burn is confirmed on-chain, Etherfuse transfers fiat to the user's linked bank account.
6. **Status polling** — `getOnRampOrder()` / `getOffRampOrder()` to track `created → funded → completed`.

## Supported Assets and Currencies

- **Fiat:** MXN (Mexican Peso) via SPEI; BRL (Brazilian Real) via PIX.
- **Crypto:** CETES (Mexico) and TESOURO (Brazil) on the Stellar network — both issued by the same Etherfuse issuer account.
- **Ramp types:** on-ramp (fiat → token) and off-ramp (token → fiat). Swaps are not currently implemented.

Asset codes are resolved to `CODE:ISSUER` automatically by `getQuote()` when the symbol is passed as `fromAsset` or `toAsset` (e.g. `"CETES"` → `"CETES:G..."`). Pass a `stellarAddress` on the call to enable resolution.

## Fee Structure

Fees are basis points (bps) on the output amount and are included in quote responses. Rates scale by rolling 30-day volume:

| 30-day Volume (USD) | Fee    |
| ------------------- | ------ |
| 0 – 5M              | 20 bps |
| 5 – 10M             | 15 bps |
| 10 – 50M            | 10 bps |
| 50 – 100M           | 8 bps  |
| 100M+               | 5 bps  |

## Core Flows

### 1. Create a customer

Customer creation doubles as onboarding: it registers the user with Etherfuse and presigns an onboarding URL (fetch it later with `getKycUrl()`). A Stellar `publicKey` is required.

```typescript
const customer = await etherfuse.createCustomer({
    publicKey: 'G...',
    email: 'user@example.com',
    country: 'MX',
});
// customer.id           — use this for subsequent calls
// customer.bankAccountId — auto-generated UUID, needed for orders
```

If the public key is already registered (HTTP 409), the client recovers the existing customer and bank account IDs instead of throwing.

```typescript
// ID-based lookup; returns null on 404.
const customer = await etherfuse.getCustomer(customerId);
```

Etherfuse does **not** support email-based customer lookup.

### 2. KYC verification

Two paths:

**Hosted (recommended).** Get a presigned URL and embed it in an iframe (or open in a popup). The user completes identity verification, agreement acceptance, and bank-account registration inside Etherfuse's UI.

```typescript
const url = await etherfuse.getKycUrl({
    customerId,
    publicKey: 'G...',
    bankAccountId, // optional — auto-generated UUID if omitted
});
```

**Programmatic.** Submit identity data and documents via the API. ⚠️ Currently blocked by an upstream 406 on the agreements endpoints — use the hosted path for now.

```typescript
await etherfuse.submitKycIdentity(customerId, {
    pubkey: 'G...',
    identity: {
        id: 'G...',
        name: { givenName: 'Jane', familyName: 'Doe' },
        dateOfBirth: '1990-01-15',
        address: {
            street: '123 Main St',
            city: 'Mexico City',
            region: 'CDMX',
            postalCode: '06600',
            country: 'MX',
        },
        idNumbers: [{ value: 'CURP_NUMBER', type: 'CURP' }],
    },
});

await etherfuse.submitKycDocuments(customerId, {
    pubkey: 'G...',
    documentType: 'document',
    images: [
        { label: 'id_front', image: 'data:image/jpeg;base64,...' },
        { label: 'id_back', image: 'data:image/jpeg;base64,...' },
    ],
});
```

Accept all three agreements with a single helper:

```typescript
await etherfuse.acceptAgreements(presignedUrl);
```

Check status at any time:

```typescript
const status = await etherfuse.getKycStatus({ customerId, publicKey: 'G...' });
// 'not_started' | 'proposed' | 'approved' | 'approved_chain_deploying' | 'rejected'
```

### 3. Get a quote

Quotes expire after **2 minutes**.

```typescript
const quote = await etherfuse.getQuote({
    fromAsset: 'MXN',
    toAsset: 'CETES', // resolved to CODE:ISSUER via /ramp/assets
    sourceAmount: '1000',
    customerId,
    stellarAddress: 'G...',
});
// quote.id            — pass to createOnRampOrder / createOffRampOrder
// quote.ramp          — 'onramp' | 'offramp' (inferred from asset shape)
// quote.destinationAmount  — amount the user will receive (after fee)
// quote.fee           — fee amount in fiat
// quote.expiresAt
```

Symbols like `CETES` are resolved via `GET /ramp/assets`. Pre-formatted `CODE:ISSUER` strings pass through unchanged.

### 4. On-ramp (fiat → tokens)

User pays fiat via SPEI or PIX; receives tokens on Stellar.

```typescript
const order = await etherfuse.createOnRampOrder({
    customerId,
    quoteId: quote.id,
    publicKey: 'G...', // user's Stellar wallet
    // bankAccountId omitted → falls back to customer's first registered account
});
// order.deposit — discriminated union (see below)
```

`order.deposit` is a discriminated union by `rail`:

- `{ rail: 'spei', clabe, bankName?, beneficiary?, amount, currency }` — SPEI (Mexico).
- `{ rail: 'pix', pixCode, pixKey?, pixKeyType?, beneficiary?, amount, currency }` — PIX (Brazil); `pixCode` is the EMV BR-Code copy-paste string.

The user completes the transfer using the rail-appropriate details. Poll for status updates:

```typescript
const updated = await etherfuse.getOnRampOrder(order.id);
// updated.status: 'created' | 'funded' | 'completed' | 'failed' | 'refunded' | 'canceled'
// updated.confirmedTxSignature — Stellar tx hash once delivered
```

### 5. Off-ramp (tokens → fiat) — deferred signing

User burns tokens on Stellar; receives fiat to their linked bank account. Bank-account registration happens inside the hosted onboarding flow (see KYC); list the saved account afterwards:

```typescript
const accounts = await etherfuse.listBankAccounts(customerId);
const account = accounts[0]; // { id, rail, accountIdentifier, ... }

const order = await etherfuse.createOffRampOrder({
    customerId,
    quoteId: quote.id,
    publicKey: 'G...',
    bankAccountId: account.id,
});
// order.burnTransaction is undefined immediately
```

**Deferred signing.** The signable XDR is not included in the creation response — poll until it appears:

```typescript
let polled = order;
while (!polled?.burnTransaction) {
    await new Promise((r) => setTimeout(r, 5000));
    polled = (await etherfuse.getOffRampOrder(order.id)) ?? polled;
}

// polled.burnTransaction — base64 XDR envelope
// Sign with the user's wallet (e.g. Freighter) and submit to Stellar.
// Once the burn is confirmed on-chain, Etherfuse pays out via SPEI/PIX.
```

`order.statusPage` is a URL to Etherfuse's hosted order-status page.

### 6. Bank accounts and assets

```typescript
// List all bank accounts for a customer (rail is inferred from the response shape).
const accounts = await etherfuse.listBankAccounts(customerId);

// List rampable assets (e.g. to populate token pickers or show wallet balances).
const { assets } = await etherfuse.getAssets({
    currency: 'mxn',
    wallet: 'G...',
});
// assets[].symbol      — e.g. "CETES"
// assets[].identifier  — full CODE:ISSUER string
// assets[].balance     — user balance if a wallet was provided
```

## Error Handling

All methods throw `EtherfuseError` on failure:

```typescript
import { EtherfuseError } from 'path/to/anchors/etherfuse';

try {
    await etherfuse.createOnRampOrder({ ... });
} catch (err) {
    if (err instanceof EtherfuseError) {
        console.error(err.code);       // e.g. 'MISSING_PUBLIC_KEY', 'UNKNOWN_ERROR'
        console.error(err.statusCode); // HTTP status from upstream
        console.error(err.message);    // human-readable message
    }
}
```

Single-resource lookups (`getCustomer`, `getOnRampOrder`, `getOffRampOrder`, `listBankAccounts`) return `null` (or `[]` for lists) on 404 instead of throwing.

## Sandbox Testing

```typescript
// Simulate a fiat payment received event for an on-ramp order (sandbox only).
const statusCode = await etherfuse.simulateFiatReceived(orderId);
// 200 on success, 400 or 404 on failure
```

Lets you test the on-ramp end-to-end without sending real SPEI / PIX transfers.

## MCP Server

An Etherfuse MCP server is configured in the repository's `.mcp.json` and loaded automatically when using [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It exposes a `SearchEtherfuseFxApi` tool that searches the Etherfuse FX API documentation for API references, code examples, and integration guides.

```json
{
    "mcpServers": {
        "etherfuse": {
            "type": "http",
            "url": "https://docs.etherfuse.com/mcp"
        }
    }
}
```

Useful when modifying this client or debugging API interactions — Claude Code can look up endpoint details, request/response formats, and error codes directly.
