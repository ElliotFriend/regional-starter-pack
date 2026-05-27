# Etherfuse Client

Server-side TypeScript client for the [Etherfuse](https://etherfuse.com) anchor API. Handles fiat on/off ramps in two regions:

- **Mexico** — MXN ↔ CETES on Stellar via the SPEI payment rail.
- **Brazil** — BRL ↔ TESOURO on Stellar via the PIX payment rail.

Both regions use the same `EtherfuseClient` and the same Stellar issuer for the stablebond assets; the client dispatches between SPEI- and PIX-shaped request/response bodies based on the input rail.

**This client must only run on the server.** It authenticates with an API key that should never be exposed to browsers.

## Files

| File        | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `client.ts` | `EtherfuseClient` class - implements the shared `Anchor` interface |
| `types.ts`  | Etherfuse-specific request/response types                          |
| `index.ts`  | Re-exports the client class and all types                          |

## Integration Flow

Every Etherfuse integration follows the same sequence of steps. Both on-ramp and off-ramp transactions share the first three steps; they diverge at order creation.

1. **Customer onboarding** - Register the user and complete KYC verification (redirect-based or programmatic).
2. **Asset discovery** - Query available rampable assets on Stellar (`GET /ramp/assets`).
3. **Quote** - Request a price quote for the conversion. Quotes expire after **2 minutes**.
4. **Order creation** - Create an on-ramp or off-ramp order using the quote.
5. **Fulfillment** - Depends on the direction:
    - **On-ramp:** The user sends fiat to the deposit instructions returned in the order — a CLABE via SPEI in Mexico, or a PIX key / BR-Code (EMV copy-paste string) in Brazil. Once Etherfuse confirms receipt, the crypto asset is minted/transferred to the user's Stellar wallet.
    - **Off-ramp:** Etherfuse prepares a burn transaction (base64 XDR). The user signs it with their wallet (e.g. Freighter) and submits it to the Stellar network. Once confirmed on-chain, Etherfuse transfers fiat to the user's linked bank account via the appropriate rail.
6. **Status polling** - Poll `GET /ramp/order/{id}` to track the order through `created -> funded -> completed`.

## Supported Assets and Currencies

- **Fiat:** MXN (Mexican Peso) via SPEI; BRL (Brazilian Real) via PIX.
- **Crypto:** CETES (Mexico) and TESOURO (Brazil) on the Stellar network — both issued by the same Etherfuse issuer account, plus USDC. Asset codes are resolved to `CODE:ISSUER` automatically.
- **Ramp types:** on-ramp (fiat → crypto) and off-ramp (crypto → fiat). Swaps are not currently implemented.

## Fee Structure

Fees are calculated in basis points (bps) on the output amount and are included in quote responses. Rates scale by rolling 30-day volume:

| 30-day Volume (USD) | Fee    |
| ------------------- | ------ |
| 0 – 5M              | 20 bps |
| 5 – 10M             | 15 bps |
| 10 – 50M            | 10 bps |
| 50 – 100M           | 8 bps  |
| 100M+               | 5 bps  |

## Setup

```typescript
import { EtherfuseClient } from 'path/to/anchors/etherfuse';

const etherfuse = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY,
    baseUrl: process.env.ETHERFUSE_BASE_URL, // e.g. https://api.sand.etherfuse.com
});
```

Optional config fields:

- `defaultBlockchain` - defaults to `"stellar"`.

## Capabilities

`EtherfuseClient` declares the following `AnchorCapabilities` flags. UI components use these flags instead of provider-name checks to determine behavior.

```typescript
readonly capabilities: AnchorCapabilities = {
    kycUrl: true,                       // Supports URL-based KYC (iframe/redirect)
    requiresOffRampSigning: true,       // Off-ramp requires wallet-side XDR signing
    kycFlow: 'iframe',                  // KYC is presented in an iframe
    deferredOffRampSigning: true,       // Signable XDR arrives via polling, not at creation time
    sandbox: true,                      // Sandbox simulation endpoints available
    sandboxFiatSimulation: true,        // Exposes the "fiat received" on-ramp simulation
    fiatAccountRegistration: 'hosted',  // Bank accounts are registered in the hosted onboarding UI
    flowStyles: ['programmatic'],       // Implements the programmatic (SEP-6-style) facet only
};
```

| Flag                                | Effect                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `kycFlow: 'iframe'`                 | The UI renders an iframe with the KYC URL from `getKycUrl()`                                      |
| `deferredOffRampSigning`            | Off-ramp enters a polling state after order creation, waiting for `signableTransaction` to appear |
| `sandbox`                           | Sandbox controls (e.g. "Simulate Fiat Received") are shown in the UI                              |
| `sandboxFiatSimulation`             | Enables the `simulateFiatReceived` action on the sandbox route                                    |
| `fiatAccountRegistration: 'hosted'` | Bank accounts are registered in the hosted onboarding UI, not via `registerFiatAccount`           |
| `flowStyles: ['programmatic']`      | App-orchestrated flow; the UI presents the programmatic ramp, not an anchor-hosted one            |

`displayName` (`"Etherfuse"`) is a top-level `Anchor` field, not a capability — it drives UI labels like "View on Etherfuse".

## Core Flows

The portable `Anchor` surface lives on the **`programmatic` facet** — call these via `etherfuse.programmatic.*` (e.g. `etherfuse.programmatic.createCustomer(...)`). The server factory exposes `requireProgrammatic(provider)` to get this facet directly. Etherfuse-specific extras that aren't part of the `Anchor` interface (`submitKycIdentity`, `submitKycDocuments`, `acceptAgreements`, `getAssets`, `simulateFiatReceived`) are public methods called directly on the client.

### 1. Create a Customer

Customer creation doubles as onboarding - it registers the user with Etherfuse and generates a presigned onboarding URL behind the scenes. A `publicKey` (the user's Stellar wallet address) is required because Etherfuse ties each customer to a unique key.

```typescript
const customer = await etherfuse.programmatic.createCustomer({
    email: 'user@example.com',
    publicKey: 'G...', // user's Stellar public key
});
// customer.id - use this for all subsequent calls
// customer.bankAccountId - auto-generated, needed for orders
```

If the public key is already registered (HTTP 409), the client automatically recovers the existing customer ID and bank accounts instead of throwing.

Lookup an existing customer:

```typescript
const customer = await etherfuse.programmatic.getCustomer({ customerId }); // returns null if not found
```

> **Note:** Etherfuse only supports ID-based lookup. Calling `getCustomer({ email })` without a `customerId` will throw an `AnchorError`.

### 2. KYC Verification

Etherfuse supports two KYC approaches:

**Redirect-based (recommended):** Generate a presigned URL and redirect the user. They complete identity verification and link a bank account within the Etherfuse UI.

```typescript
const url = await etherfuse.programmatic.getKycUrl(customerId, publicKey, bankAccountId);
// Redirect or embed the URL for the user to complete KYC and accept agreements
```

**Programmatic:** Collect identity data in your own UI and submit it via API. This pre-populates the KYC process on the user's behalf. Both methods take `(customerId, body)`, where the body carries the wallet `pubkey`.

```typescript
// Submit personal information
await etherfuse.submitKycIdentity(customerId, {
    pubkey: 'G...',
    identity: {
        id: 'G...', // typically the pubkey
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

// Upload identity documents — call once for ID images, once for the selfie
await etherfuse.submitKycDocuments(customerId, {
    pubkey: 'G...',
    documentType: 'document',
    images: [
        { label: 'id_front', image: 'data:image/jpeg;base64,...' },
        { label: 'id_back', image: 'data:image/jpeg;base64,...' },
    ],
});
await etherfuse.submitKycDocuments(customerId, {
    pubkey: 'G...',
    documentType: 'selfie',
    images: [{ label: 'selfie', image: 'data:image/jpeg;base64,...' }],
});
```

Accept legal agreements via the presigned onboarding URL:

```typescript
await etherfuse.acceptAgreements(presignedUrl);
```

Check KYC status at any time:

```typescript
const status = await etherfuse.programmatic.getKycStatus(customerId, publicKey);
// 'not_started' | 'pending' | 'approved' | 'rejected'
```

### 3. Get a Quote

Quotes expire after **2 minutes**. Request a new one if the user takes longer to confirm.

```typescript
const quote = await etherfuse.programmatic.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES', // resolved to CODE:ISSUER automatically
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'G...', // used to resolve asset identifiers
});
// quote.id, quote.toAmount, quote.exchangeRate, quote.fee, quote.expiresAt
```

Short currency codes like `CETES` are automatically resolved to their full `CODE:ISSUER` identifiers via `GET /ramp/assets`. Codes that already contain `:` pass through unchanged.

### 4. On-Ramp (Fiat → Crypto)

User pays fiat via SPEI (Mexico) or PIX (Brazil) and receives stablebond tokens on Stellar.

```typescript
// Mexico: MXN → CETES via SPEI
const tx = await etherfuse.programmatic.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fromCurrency: 'MXN',
    toCurrency: 'CETES:GCRYUGD5...',
    amount: '1000',
    stellarAddress: 'G...', // user's Stellar public key
});

// Brazil: BRL → TESOURO via PIX
const tx = await etherfuse.programmatic.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fromCurrency: 'BRL',
    toCurrency: 'TESOURO:GC3CW7ED...',
    amount: '100',
    stellarAddress: 'G...',
});
```

`tx.paymentInstructions` is a discriminated union — `type: 'spei'` carries `clabe`/`bankName`/`beneficiary`, while `type: 'pix'` carries `pixKey`/`pixCode` (the BR-Code/EMV copy-paste string)/`pixKeyType`. Both also include `amount` and `currency`.

The user completes the fiat transfer using the rail-appropriate details. Once Etherfuse confirms receipt, the order moves to `funded` and the crypto asset is minted/transferred to the user's Stellar wallet. Poll for status updates:

```typescript
const updated = await etherfuse.programmatic.getOnRampTransaction(tx.id);
// updated.status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded'
```

### 5. Off-Ramp (Crypto → Fiat)

User burns crypto tokens on Stellar and receives fiat to their bank account via SPEI (Mexico) or PIX (Brazil). The off-ramp flow has a **deferred signing** step — the burn transaction XDR is not included in the creation response and must be polled for.

Bank-account registration is **hosted** (`fiatAccountRegistration: 'hosted'`) — Etherfuse does not implement `registerFiatAccount`. The user links their bank account inside the same hosted onboarding UI used for KYC. Request a presigned URL with `getKycUrl()` (see [KYC Verification](#2-kyc-verification)) and let the user add their SPEI or PIX account there, then list the saved account to get its ID:

```typescript
// The user links a bank account in the hosted onboarding UI (getKycUrl above).
// Afterwards, read it back:
const accounts = await etherfuse.programmatic.getFiatAccounts(customer.id);
const account = accounts[0];

// Create the off-ramp order
const tx = await etherfuse.programmatic.createOffRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fiatAccountId: account.id,
    fromCurrency: 'CETES:GCRYUGD5...',
    toCurrency: 'MXN',
    amount: '50',
    stellarAddress: 'G...',
});
// tx.signableTransaction is undefined at this point

// Poll until the burn transaction is ready
let order = await etherfuse.programmatic.getOffRampTransaction(tx.id);
while (!order?.signableTransaction) {
    await new Promise((r) => setTimeout(r, 5000));
    order = await etherfuse.programmatic.getOffRampTransaction(tx.id);
}

// order.signableTransaction - base64-encoded Stellar XDR envelope
// Have the user sign this with Freighter, then submit to the Stellar network

// Once the burn is confirmed on-chain, Etherfuse transfers MXN to the user's
// linked bank account via SPEI.

// order.statusPage - URL to view the order on Etherfuse's UI
```

List a customer's saved bank accounts:

```typescript
const accounts = await etherfuse.programmatic.getFiatAccounts(customerId);
```

### 6. List Rampable Assets

Query which assets are available for on/off ramping:

```typescript
const { assets } = await etherfuse.getAssets('stellar', 'mxn', walletPublicKey);
// assets[].symbol - e.g. "CETES"
// assets[].identifier - e.g. "CETES:GCRYUGD5..."
// assets[].balance - wallet balance if a public key was provided
```

## Error Handling

All methods throw `AnchorError` on failure:

```typescript
import { AnchorError } from 'path/to/anchors/types';

try {
    await etherfuse.programmatic.createOnRamp(input);
} catch (err) {
    if (err instanceof AnchorError) {
        console.error(err.message); // human-readable message
        console.error(err.code); // e.g. 'UNKNOWN_ERROR'
        console.error(err.statusCode); // HTTP status code
    }
}
```

Methods that look up a single resource (`getCustomer`, `getOnRampTransaction`, `getOffRampTransaction`) return `null` instead of throwing when the resource is not found (HTTP 404).

## Sandbox Testing

A helper exists for sandbox/test environments only:

```typescript
// Simulate a fiat payment received event for an on-ramp order
const statusCode = await etherfuse.simulateFiatReceived(orderId);
// Returns 200 on success, 400 or 404 on failure
```

This is useful for testing the on-ramp flow end-to-end without sending real SPEI transfers.

## Anchor Interface

`EtherfuseClient` implements the `Anchor` interface defined in `../types.ts`. This means it can be swapped with any other anchor implementation (SEP-compliant or custom) without changing application code. Its `AnchorCapabilities` flags drive the UI behavior — see the [Capabilities](#capabilities) section above. See the parent `anchors/` directory for the full interface definition.

The `Anchor` interface is **faceted**: shared identity/metadata plus optional `auth` (SEP-10 wallet auth), `programmatic` (SEP-6-style, app-orchestrated), and `interactive` (SEP-24-style, anchor-hosted) facets. Etherfuse exposes the **`programmatic` facet only** — it authenticates server-side with an API key (no `auth` facet) and orchestrates the flow from the app rather than handing off to an anchor-hosted UI (no `interactive` facet). All the core flows above are reached through `anchor.programmatic.*`; the methods documented here are the private implementations the facet delegates to.

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

This is useful when modifying the Etherfuse client or debugging API interactions — Claude Code can look up endpoint details, request/response formats, and error codes directly from the Etherfuse docs.
