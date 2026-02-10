# AlfredPay Client

Server-side TypeScript client for the [Alfred Pay](https://alfredpay.io) anchor API. Handles fiat on/off ramps between MXN and USDC on the Stellar network via Mexico's SPEI payment system.

**This client must only run on the server.** It authenticates with API keys that should never be exposed to browsers.

## Files

| File        | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `client.ts` | `AlfredPayClient` class — implements the shared `Anchor` interface |
| `types.ts`  | AlfredPay-specific request/response types                          |
| `index.ts`  | Re-exports the client class and all types                          |

## Setup

```typescript
import { AlfredPayClient } from '$lib/anchors/alfredpay';

const alfred = new AlfredPayClient({
    apiKey: process.env.ALFREDPAY_API_KEY,
    apiSecret: process.env.ALFREDPAY_API_SECRET,
    baseUrl: process.env.ALFREDPAY_BASE_URL,
});
```

## Core Flows

### 1. Create a Customer

```typescript
const customer = await alfred.createCustomer({
    email: 'user@example.com',
    country: 'MX', // optional, defaults to 'MX'
});
// customer.id — use this for all subsequent calls
```

Lookup existing customers:

```typescript
const byId = await alfred.getCustomer(customerId); // returns null if not found
const byEmail = await alfred.getCustomerByEmail(email); // returns null if not found
```

### 2. KYC Verification

Get an iframe URL for the user to complete identity verification:

```typescript
const iframeUrl = await alfred.getKycIframeUrl(customerId);
```

Or submit KYC data programmatically:

```typescript
// Check what's required
const requirements = await alfred.getKycRequirements('MX');

// Submit personal info
const submission = await alfred.submitKycData(customerId, {
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-15',
    country: 'MX',
    city: 'Mexico City',
    state: 'CDMX',
    address: '123 Main St',
    zipCode: '06600',
    nationalities: ['MX'],
    email: 'jane@example.com',
    dni: 'CURP_OR_ID_NUMBER',
});

// Upload documents
await alfred.submitKycFile(
    customerId,
    submission.submissionId,
    'National ID Front',
    fileBlob,
    'id-front.jpg',
);
await alfred.submitKycFile(customerId, submission.submissionId, 'Selfie', selfieBlob, 'selfie.jpg');

// Finalize the submission for review
await alfred.finalizeKycSubmission(customerId, submission.submissionId);
```

Check KYC status at any time:

```typescript
const status = await alfred.getKycStatus(customerId);
// 'not_started' | 'pending' | 'approved' | 'rejected' | 'update_required'
```

### 3. Get a Quote

```typescript
const quote = await alfred.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    fromAmount: '1000', // specify either fromAmount or toAmount
});
// quote.id, quote.toAmount, quote.exchangeRate, quote.fee, quote.expiresAt
```

### 4. On-Ramp (MXN → USDC)

User pays MXN via SPEI and receives USDC on Stellar.

```typescript
const tx = await alfred.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    amount: '1000',
    stellarAddress: 'G...', // user's Stellar public key
});

// tx.paymentInstructions contains the SPEI details:
//   .clabe, .bankName, .beneficiary, .reference, .amount, .currency

// Poll for status updates
const updated = await alfred.getOnRampTransaction(tx.id);
// updated.status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | 'cancelled'
```

### 5. Off-Ramp (USDC → MXN)

User sends USDC on Stellar and receives MXN to their bank account.

```typescript
// Register the user's bank account first
const account = await alfred.registerFiatAccount({
    customerId: customer.id,
    bankAccount: {
        bankName: 'BANCO_CODE',
        accountNumber: '1234567890',
        clabe: '012345678901234567',
        beneficiary: 'Jane Doe',
    },
});

// Create the off-ramp transaction
const tx = await alfred.createOffRamp({
    customerId: customer.id,
    quoteId: quote.id,
    fiatAccountId: account.id,
    fromCurrency: 'USDC',
    toCurrency: 'MXN',
    amount: '50',
    stellarAddress: 'G...', // user's Stellar public key
});

// tx.stellarAddress — the Stellar address to send USDC to
// tx.memo — must be included in the Stellar transaction

// Poll for status updates
const updated = await alfred.getOffRampTransaction(tx.id);
```

List a customer's saved bank accounts:

```typescript
const accounts = await alfred.getFiatAccounts(customerId);
```

## Error Handling

All methods throw `AnchorError` on failure:

```typescript
import { AnchorError } from '$lib/anchors/types';

try {
    await alfred.createOnRamp(input);
} catch (err) {
    if (err instanceof AnchorError) {
        console.error(err.message); // human-readable message
        console.error(err.code); // e.g. 'UNKNOWN_ERROR'
        console.error(err.statusCode); // HTTP status code
    }
}
```

Methods that look up a single resource (`getCustomer`, `getOnRampTransaction`, `getOffRampTransaction`, `getKycSubmission`) return `null` instead of throwing when the resource is not found (HTTP 404).

## Sandbox Testing

Two helpers exist for sandbox/test environments only:

```typescript
// Simulate any webhook event
await alfred.sendSandboxWebhook({
    referenceId: 'some-id',
    eventType: 'ONRAMP', // 'KYC' | 'ONRAMP' | 'OFFRAMP' | 'KYB'
    status: 'COMPLETED',
    metadata: null,
});

// Shortcut: mark KYC as completed
await alfred.completeKycSandbox(submissionId);
```

## Anchor Interface

`AlfredPayClient` implements the `Anchor` interface defined in `../types.ts`. This means it can be swapped with any other anchor implementation (SEP-compliant or custom) without changing application code. See the parent `anchors/` directory for the full interface definition.
