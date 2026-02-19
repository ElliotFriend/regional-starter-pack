# Etherfuse Client

Server-side TypeScript client for the [Etherfuse](https://etherfuse.com) anchor API. Handles fiat on/off ramps between MXN and Stellar-based assets (USDC, CETES) via Mexico's SPEI payment system.

**This client must only run on the server.** It authenticates with an API key that should never be exposed to browsers.

## Files

| File        | Purpose                                                             |
| ----------- | ------------------------------------------------------------------- |
| `client.ts` | `EtherfuseClient` class - implements the shared `Anchor` interface  |
| `types.ts`  | Etherfuse-specific request/response types                           |
| `index.ts`  | Re-exports the client class and all types                           |

## Integration Flow

Every Etherfuse integration follows the same sequence of steps. Both on-ramp and off-ramp transactions share the first three steps; they diverge at order creation.

1. **Customer onboarding** - Register the user and complete KYC verification (redirect-based or programmatic).
2. **Asset discovery** - Query available rampable assets on Stellar (`GET /ramp/assets`).
3. **Quote** - Request a price quote for the conversion. Quotes expire after **2 minutes**.
4. **Order creation** - Create an on-ramp or off-ramp order using the quote.
5. **Fulfillment** - Depends on the direction:
   - **On-ramp:** The user sends MXN to a CLABE via SPEI. Once Etherfuse confirms receipt, the crypto asset is minted/transferred to the user's Stellar wallet.
   - **Off-ramp:** Etherfuse prepares a burn transaction (base64 XDR). The user signs it with their wallet (e.g. Freighter) and submits it to the Stellar network. Once confirmed on-chain, Etherfuse transfers MXN to the user's linked bank account.
6. **Status polling** - Poll `GET /ramp/order/{id}` to track the order through `created -> funded -> completed`.

## Supported Assets and Currencies

- **Fiat:** MXN (Mexican Peso), transferred via SPEI
- **Crypto:** USDC and CETES on the Stellar network (in `CODE:ISSUER` format)
- **Ramp types:** on-ramp (fiat -> crypto), off-ramp (crypto -> fiat), swap (crypto -> crypto)

This client supports on-ramp and off-ramp. Swaps are not currently implemented.

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
import { EtherfuseClient } from '$lib/anchors/etherfuse';

const etherfuse = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY,
    baseUrl: process.env.ETHERFUSE_BASE_URL, // e.g. https://api.sand.etherfuse.com
});
```

Optional config fields:

- `defaultBlockchain` - defaults to `"stellar"`.

## Core Flows

### 1. Create a Customer

Customer creation doubles as onboarding - it registers the user with Etherfuse and generates a presigned onboarding URL behind the scenes. A `publicKey` (the user's Stellar wallet address) is required because Etherfuse ties each customer to a unique key.

```typescript
const customer = await etherfuse.createCustomer({
    email: 'user@example.com',
    publicKey: 'G...', // user's Stellar public key
});
// customer.id - use this for all subsequent calls
// customer.bankAccountId - auto-generated, needed for orders
```

If the public key is already registered (HTTP 409), the client automatically recovers the existing customer ID and bank accounts instead of throwing.

Lookup an existing customer:

```typescript
const customer = await etherfuse.getCustomer(customerId); // returns null if not found
```

> **Note:** `getCustomerByEmail()` is not supported by Etherfuse and will throw an `AnchorError` with status 501.

### 2. KYC Verification

Etherfuse supports two KYC approaches:

**Redirect-based (recommended):** Generate a presigned URL and redirect the user. They complete identity verification and link a bank account within the Etherfuse UI.

```typescript
const url = await etherfuse.getKycIframeUrl(customerId, publicKey, bankAccountId);
// Redirect or embed the URL for the user to complete KYC and accept agreements
```

**Programmatic:** Collect identity data in your own UI and submit it via API. This pre-populates the KYC process on the user's behalf.

```typescript
// Submit personal information
await etherfuse.submitKycIdentity(customerId, publicKey, {
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    country: 'MX',
    city: 'Mexico City',
    state: 'CDMX',
    address: '123 Main St',
    zipCode: '06600',
    phoneNumber: '+525512345678',
    nationalId: 'CURP_NUMBER',
});

// Upload identity documents
await etherfuse.submitKycDocuments(customerId, publicKey, [
    { documentType: 'national_id_front', documentData: base64Front, contentType: 'image/jpeg' },
    { documentType: 'national_id_back', documentData: base64Back, contentType: 'image/jpeg' },
    { documentType: 'selfie', documentData: base64Selfie, contentType: 'image/jpeg' },
]);
```

Accept legal agreements via the presigned onboarding URL:

```typescript
await etherfuse.acceptAgreements(presignedUrl);
```

Check KYC status at any time:

```typescript
const status = await etherfuse.getKycStatus(customerId, publicKey);
// 'not_started' | 'pending' | 'approved' | 'rejected'
```

### 3. Get a Quote

Quotes expire after **2 minutes**. Request a new one if the user takes longer to confirm.

```typescript
const quote = await etherfuse.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES', // resolved to CODE:ISSUER automatically
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'G...', // used to resolve asset identifiers
});
// quote.id, quote.toAmount, quote.exchangeRate, quote.fee, quote.expiresAt
```

Short currency codes like `CETES` are automatically resolved to their full `CODE:ISSUER` identifiers via `GET /ramp/assets`. Codes that already contain `:` pass through unchanged.

### 4. On-Ramp (MXN -> Crypto)

User pays MXN via SPEI and receives crypto tokens on Stellar.

```typescript
const tx = await etherfuse.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fromCurrency: 'MXN',
    toCurrency: 'CETES:GCRYUGD5...',
    amount: '1000',
    stellarAddress: 'G...', // user's Stellar public key
});

// tx.paymentInstructions contains the SPEI deposit details:
//   .clabe - 18-digit CLABE to send the transfer to
//   .amount - exact amount to transfer
//   .currency - fiat currency code
```

The user sends MXN to the provided CLABE via SPEI. Once Etherfuse confirms receipt, the order moves to `funded` and the crypto asset is minted/transferred to the user's Stellar wallet. Poll for status updates:

```typescript
const updated = await etherfuse.getOnRampTransaction(tx.id);
// updated.status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded'
```

### 5. Off-Ramp (Crypto -> MXN)

User burns crypto tokens on Stellar and receives MXN to their bank account. The off-ramp flow has a **deferred signing** step - the burn transaction XDR is not included in the creation response and must be polled for.

```typescript
// Register the user's bank account (if not already registered)
const account = await etherfuse.registerFiatAccount({
    customerId: customer.id,
    bankAccount: {
        bankName: 'BBVA',
        clabe: '012345678901234567',
        beneficiary: 'Jane Doe',
        accountNumber: '', // not required by Etherfuse
    },
});

// Create the off-ramp order
const tx = await etherfuse.createOffRamp({
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
let order = await etherfuse.getOffRampTransaction(tx.id);
while (!order?.signableTransaction) {
    await new Promise((r) => setTimeout(r, 5000));
    order = await etherfuse.getOffRampTransaction(tx.id);
}

// order.signableTransaction - base64-encoded Stellar XDR envelope
// Have the user sign this with Freighter, then submit to the Stellar network

// Once the burn is confirmed on-chain, Etherfuse transfers MXN to the user's
// linked bank account via SPEI.

// order.statusPage - URL to view the order on Etherfuse's UI
```

List a customer's saved bank accounts:

```typescript
const accounts = await etherfuse.getFiatAccounts(customerId);
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
import { AnchorError } from '$lib/anchors/types';

try {
    await etherfuse.createOnRamp(input);
} catch (err) {
    if (err instanceof AnchorError) {
        console.error(err.message);    // human-readable message
        console.error(err.code);       // e.g. 'UNKNOWN_ERROR'
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

`EtherfuseClient` implements the `Anchor` interface defined in `../types.ts`. This means it can be swapped with any other anchor implementation (SEP-compliant or custom) without changing application code. See the parent `anchors/` directory for the full interface definition.
