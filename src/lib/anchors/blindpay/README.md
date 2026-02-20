# BlindPay Client

Server-side TypeScript client for the [BlindPay](https://blindpay.com) anchor API. Handles fiat on/off ramps between local currencies and stablecoins on the Stellar network. BlindPay is a global payment infrastructure supporting ACH, Wire, PIX, SPEI, SWIFT, and more.

**This client must only run on the server.** It authenticates with an API key that should never be exposed to browsers.

## Files

| File        | Purpose                                                           |
| ----------- | ----------------------------------------------------------------- |
| `client.ts` | `BlindPayClient` class -- implements the shared `Anchor` interface |
| `types.ts`  | BlindPay-specific request/response types                          |
| `index.ts`  | Re-exports the client class and all types                         |

## Capabilities

`BlindPayClient` declares the following `AnchorCapabilities` flags. UI components use these flags instead of provider-name checks to determine behavior.

```typescript
readonly capabilities: AnchorCapabilities = {
    kycUrl: true,                             // Supports URL-based KYC (redirect to ToS)
    requiresTos: true,                        // Requires separate ToS acceptance step
    requiresOffRampSigning: true,             // Off-ramp requires wallet-side XDR signing
    kycFlow: 'redirect',                      // KYC is presented via redirect to external page
    requiresBankBeforeQuote: true,            // Off-ramp requires bank account before quoting
    requiresBlockchainWalletRegistration: true, // On-ramp requires wallet registration step
    requiresAnchorPayoutSubmission: true,     // Signed XDR submitted back to BlindPay, not Stellar
    compositeQuoteCustomerId: true,           // Quote API expects "customerId:resourceId" format
    sandbox: true,                            // Sandbox simulation available
    displayName: 'BlindPay',                  // Human-readable name for UI labels
};
```

| Flag | Effect |
| --- | --- |
| `kycFlow: 'redirect'` | The UI redirects the user to an external KYC/ToS page instead of rendering inline |
| `requiresTos` | A ToS acceptance step is shown before customer creation |
| `requiresBankBeforeQuote` | Off-ramp flow collects bank account details before requesting a quote |
| `requiresBlockchainWalletRegistration` | On-ramp flow registers a blockchain wallet after customer creation, before quoting |
| `compositeQuoteCustomerId` | The quote step builds a `customerId:resourceId` composite string for the API |
| `requiresAnchorPayoutSubmission` | After signing the off-ramp XDR, the signed transaction is submitted back to BlindPay (not directly to Stellar) |
| `sandbox` | Sandbox controls are shown in the UI (payins auto-complete after 30s on dev instances) |
| `displayName` | Used in UI labels like "View on BlindPay" |

## Key Differences from Other Anchors

- **Amounts are in cents** (integers). The client converts to/from decimal strings internally.
- **API paths include an instance ID**: `/v1/instances/{instance_id}/...`
- **ToS acceptance is a prerequisite**. Users must accept Terms of Service via a redirect URL before receiver (customer) creation.
- **Receiver creation IS the KYC submission**. All personal data, documents, and identity info are submitted in a single call, not incrementally.
- **Blockchain wallet registration is required** for payins (on-ramp). The wallet must be registered before creating a payin quote.
- **Stellar payouts are 2-step**: authorize (get XDR) -> sign with wallet -> submit signed XDR back to BlindPay.
- **Quotes expire after 5 minutes.**

## Integration Flow

Every BlindPay integration follows this sequence:

1. **ToS acceptance** -- Generate a ToS URL, redirect the user to accept terms. Returns a `tos_id`.
2. **Receiver creation** -- Submit full KYC data (personal info, documents, address) in a single call using the `tos_id`. On development instances, KYC is auto-approved.
3. **Resource registration** -- Register a bank account (for payouts/off-ramp) or blockchain wallet (for payins/on-ramp).
4. **Quote** -- Request a price quote. Quotes expire after **5 minutes**.
5. **Transaction creation** -- Create a payin or payout using the quote.
6. **Fulfillment** -- Depends on direction:
    - **On-ramp (payin):** BlindPay returns SPEI payment instructions (CLABE + memo). The user sends fiat. Once confirmed, stablecoins are transferred to the registered blockchain wallet.
    - **Off-ramp (payout):** BlindPay returns an XDR transaction to sign. The user signs with Freighter. The signed transaction is submitted back to BlindPay. Once confirmed on-chain, BlindPay sends fiat to the registered bank account.
7. **Status polling** -- Poll the payin or payout endpoint to track progress.

## Supported Currencies and Payment Rails

| Country | Currency | Payment Method | Speed |
| --- | --- | --- | --- |
| Mexico | MXN | SPEI | Instant |
| United States | USD | ACH / Wire / RTP | Instant to 2 days |
| Brazil | BRL | PIX | Instant |
| Argentina | ARS | Transfers 3.0 | Instant |
| Colombia | COP | ACH COP | ~1 business day |
| Global | Various | SWIFT | ~5 business days |

## Supported Networks and Tokens

| Environment | Network | Tokens |
| --- | --- | --- |
| Development | `stellar_testnet` | USDB (test token) |
| Production | `stellar` | USDC |

## Setup

```typescript
import { BlindPayClient } from 'path/to/anchors/blindpay';

const blindpay = new BlindPayClient({
    apiKey: process.env.BLINDPAY_API_KEY,
    instanceId: process.env.BLINDPAY_INSTANCE_ID,
    baseUrl: process.env.BLINDPAY_BASE_URL, // e.g. https://api.blindpay.com
});
```

Optional config fields:

- `network` -- defaults to `"stellar_testnet"`. Set to `"stellar"` for production.

## Core Flows

### 1. Accept Terms of Service

Before creating a receiver, the user must accept BlindPay's Terms of Service. Generate a URL and redirect the user.

```typescript
const tosUrl = await blindpay.generateTosUrl('https://yourapp.com/callback');
// Redirect user to tosUrl in their browser
// After acceptance, the tos_id is available for receiver creation
```

The URL must be opened in the user's browser -- server-side requests are ignored by BlindPay.

### 2. Create a Receiver (Customer + KYC)

BlindPay combines customer creation and KYC into a single step. All data is submitted at once.

> **Note:** The `createCustomer()` method on the `Anchor` interface returns a local stub. The real receiver is created via `createReceiver()` which requires the full KYC payload.

```typescript
const receiver = await blindpay.createReceiver({
    tos_id: 'to_...',
    type: 'individual',
    kyc_type: 'standard',
    email: 'user@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    date_of_birth: '1990-01-15T00:00:00Z',
    tax_id: '12345678',
    address_line_1: '123 Main St',
    city: 'Mexico City',
    state_province_region: 'CDMX',
    country: 'MX',
    postal_code: '06600',
    ip_address: '127.0.0.1',
    phone_number: '+525512345678',
    id_doc_country: 'MX',
    id_doc_type: 'ID_CARD',
    id_doc_front_file: 'https://example.com/id-front.jpg',
    id_doc_back_file: 'https://example.com/id-back.jpg',
    selfie_file: 'https://example.com/selfie.jpg',
    proof_of_address_doc_type: 'UTILITY_BILL',
    proof_of_address_doc_file: 'https://example.com/proof.jpg',
});
// receiver.id -- e.g. "re_000000000000"
// receiver.kyc_status -- "verifying", "approved", or "rejected"
```

On development instances, KYC is automatically approved. Use first name `"Fail"` to simulate rejection.

Look up an existing receiver:

```typescript
const customer = await blindpay.getCustomer(receiverId); // returns null if not found
```

Check KYC status:

```typescript
const status = await blindpay.getKycStatus(receiverId);
// 'not_started' | 'pending' | 'approved' | 'rejected'
```

> **Note:** `getCustomerByEmail()` is not implemented by BlindPay. The method is optional on the `Anchor` interface.

### 3. Register a Blockchain Wallet (for On-Ramp)

Required before creating payin quotes. This client uses the direct method (`is_account_abstraction: true`) since Stellar message signing is not natively supported by BlindPay's secure method.

```typescript
const wallet = await blindpay.registerBlockchainWallet(
    receiverId,
    'GXYZ...', // Stellar address
    'My Stellar Wallet', // optional display name
);
// wallet.id -- e.g. "bw_000000000000", needed for payin quotes
```

List registered wallets:

```typescript
const wallets = await blindpay.getBlockchainWallets(receiverId);
```

### 4. Register a Bank Account (for Off-Ramp)

Required before creating payout quotes.

```typescript
const account = await blindpay.registerFiatAccount({
    customerId: receiverId,
    account: {
        type: 'spei',
        bankName: 'BBVA',
        clabe: '012345678901234567',
        beneficiary: 'Jane Doe',
    },
});
// account.id -- e.g. "ba_000000000000", needed for payout quotes
```

List registered accounts:

```typescript
const accounts = await blindpay.getFiatAccounts(receiverId);
```

### 5. Get a Quote

The `getQuote()` method detects direction from currencies: if `fromCurrency` is fiat, it creates a payin quote (on-ramp); otherwise a payout quote (off-ramp).

The `customerId` field must be a colon-delimited string: `receiverId:resourceId` where `resourceId` is the blockchain wallet ID (for payins) or bank account ID (for payouts).

```typescript
// On-ramp quote (MXN -> USDB)
const payinQuote = await blindpay.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'USDB',
    fromAmount: '1000',
    customerId: `${receiverId}:${walletId}`, // receiverId:blockchainWalletId
});

// Off-ramp quote (USDB -> MXN)
const payoutQuote = await blindpay.getQuote({
    fromCurrency: 'USDB',
    toCurrency: 'MXN',
    fromAmount: '100',
    customerId: `${receiverId}:${bankAccountId}`, // receiverId:bankAccountId
});

// quote.id, quote.toAmount, quote.exchangeRate, quote.fee, quote.expiresAt
```

Or use the BlindPay-specific methods directly:

```typescript
const payinQuote = await blindpay.createPayinQuote(walletId, 100000, 'USDB'); // 1000.00 in cents
const payoutQuote = await blindpay.createPayoutQuote(bankAccountId, 10000, undefined, 'USDB');
```

### 6. On-Ramp (Fiat -> Stablecoin)

User sends fiat via SPEI and receives stablecoins on Stellar.

```typescript
const tx = await blindpay.createOnRamp({
    customerId: receiverId,
    quoteId: payinQuote.id,
    fromCurrency: 'MXN',
    toCurrency: 'USDB',
    amount: '1000',
    stellarAddress: 'G...',
});

// tx.paymentInstructions contains the SPEI details:
//   .clabe -- 18-digit CLABE to send fiat to
//   .reference -- memo code to include with the transfer
//   .amount -- exact amount to transfer
//   .currency -- fiat currency code

// Poll for status updates
const updated = await blindpay.getOnRampTransaction(tx.id);
// updated.status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
```

On development instances, payins are automatically completed **30 seconds after initiation**.

### 7. Off-Ramp (Stablecoin -> Fiat)

The Stellar payout flow is 2-step: authorize to get an XDR, sign it, then submit the signed transaction back to BlindPay.

```typescript
// Step 1: Authorize -- returns the XDR to sign
const tx = await blindpay.createOffRamp({
    customerId: receiverId,
    quoteId: payoutQuote.id,
    fiatAccountId: bankAccountId,
    fromCurrency: 'USDB',
    toCurrency: 'MXN',
    amount: '100',
    stellarAddress: 'G...',
});
// tx.signableTransaction -- the Stellar XDR to sign

// Step 2: Sign with Freighter (client-side)
// The UI signs tx.signableTransaction using the Freighter wallet

// Step 3: Submit the signed transaction back to BlindPay
const payout = await blindpay.submitSignedPayout(
    payoutQuote.id,
    signedXdr,
    stellarAddress,
);
// payout.status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'

// Poll for status updates
const updated = await blindpay.getOffRampTransaction(payout.id);
```

## Error Handling

All methods throw `AnchorError` on failure:

```typescript
import { AnchorError } from 'path/to/anchors/types';

try {
    await blindpay.createOnRamp(input);
} catch (err) {
    if (err instanceof AnchorError) {
        console.error(err.message); // human-readable message
        console.error(err.code); // e.g. 'TERMS_NOT_ACCEPTED', 'UNKNOWN_ERROR'
        console.error(err.statusCode); // HTTP status code
    }
}
```

Common error codes from BlindPay:

| Code | Meaning |
| --- | --- |
| `TERMS_NOT_ACCEPTED` | Receiver needs to accept updated ToS |
| `quote_expired` | Quote older than 5 minutes |
| `insufficient_balance` | Wallet doesn't have enough tokens |
| `kyc_not_approved` | Receiver KYC still pending or rejected |

Methods that look up a single resource (`getCustomer`, `getOnRampTransaction`, `getOffRampTransaction`) return `null` instead of throwing when the resource is not found (HTTP 404).

## Development vs Production

| Feature | Development | Production |
| --- | --- | --- |
| KYC | Auto-approved | Manual/automatic review |
| Payouts | Simulated (no real fiat) | Real bank transfers |
| Payins | Auto-completed after 30s | Real fiat deposits required |
| Token | USDB (test stablecoin) | USDC |
| Network | `stellar_testnet` | `stellar` |

### Testing Scenarios

| Amount | Result |
| --- | --- |
| Any amount | Success (default) |
| $666.00 | Failed |
| $777.00 | Refunded |

Use first name `"Fail"` when creating receivers to simulate KYC rejection.

## Anchor Interface

`BlindPayClient` implements the `Anchor` interface defined in `../types.ts`. This means it can be swapped with any other anchor implementation (SEP-compliant or custom) without changing application code. Its `AnchorCapabilities` flags drive the UI behavior — see the [Capabilities](#capabilities) section above. See the parent `anchors/` directory for the full interface definition.
