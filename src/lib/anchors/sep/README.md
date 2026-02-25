# SEP Protocol Library

Composable, framework-agnostic implementations of the [Stellar Ecosystem Proposals](https://github.com/stellar/stellar-protocol/tree/master/ecosystem) (SEPs) used for anchor interoperability. Each SEP is a standalone module that can be used independently or combined to build full anchor integrations.

This library depends only on `@stellar/stellar-sdk` and has no framework-specific imports. Copy it into any TypeScript project.

For a complete example of these modules composed into an anchor client, see the [Test Anchor Client](../testanchor/).

## Modules

| Module  | Protocol                                      | Description                                                                                                               |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sep1`  | [SEP-1](https://stellar.org/protocol/sep-1)   | Stellar.toml discovery — fetch and parse an anchor's `stellar.toml` to find endpoints, signing keys, and supported assets |
| `sep10` | [SEP-10](https://stellar.org/protocol/sep-10) | Web authentication — obtain a JWT token by signing a challenge transaction                                                |
| `sep6`  | [SEP-6](https://stellar.org/protocol/sep-6)   | Programmatic deposit/withdrawal — initiate transfers without a hosted UI                                                  |
| `sep12` | [SEP-12](https://stellar.org/protocol/sep-12) | KYC/customer management — submit and query customer verification data                                                     |
| `sep24` | [SEP-24](https://stellar.org/protocol/sep-24) | Interactive deposit/withdrawal — get a URL to the anchor's hosted transfer UI                                             |
| `sep31` | [SEP-31](https://stellar.org/protocol/sep-31) | Cross-border payments — send payments to a recipient via an anchor                                                        |
| `sep38` | [SEP-38](https://stellar.org/protocol/sep-38) | Anchor RFQ (quotes) — get indicative prices and request firm quotes                                                       |

## Usage

Import the namespaced modules you need:

```typescript
import { sep1, sep10, sep24, sep38 } from './anchors/sep';
```

All async functions accept an optional `fetchFn` parameter as their last argument. This lets you pass in SvelteKit's `fetch`, Next.js `fetch`, or any other implementation for SSR compatibility. If omitted, the global `fetch` is used.

### Discover Anchor Endpoints (SEP-1)

Every SEP flow starts with discovering what the anchor supports:

```typescript
import { sep1 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');

// Check which SEPs are supported
sep1.supportsSep(toml, 24); // true
sep1.supportsSep(toml, 31); // true

// Get specific endpoints
const authEndpoint = sep1.getSep10Endpoint(toml); // WEB_AUTH_ENDPOINT
const sep24Server = sep1.getSep24Endpoint(toml); // TRANSFER_SERVER_SEP0024
const quoteServer = sep1.getSep38Endpoint(toml); // ANCHOR_QUOTE_SERVER
const signingKey = sep1.getSigningKey(toml); // SIGNING_KEY

// Browse supported assets
const currencies = sep1.getCurrencies(toml);
const usdc = sep1.getCurrencyByCode(toml, 'USDC');
```

### Authenticate (SEP-10)

Most SEP operations require a JWT token obtained through SEP-10. The `authenticate()` function handles the full challenge-response flow (get challenge, validate, sign, submit):

```typescript
import { sep1, sep10 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');

const token = await sep10.authenticate(
    {
        authEndpoint: sep1.getSep10Endpoint(toml)!,
        serverSigningKey: sep1.getSigningKey(toml)!,
        networkPassphrase: 'Test SDF Network ; September 2015',
        homeDomain: 'testanchor.stellar.org',
    },
    userPublicKey,
    // signer function — e.g., from Freighter, Albedo, or a Keypair
    async (xdr, networkPassphrase) => {
        return await freighter.signTransaction(xdr, { networkPassphrase });
    },
    { validateChallenge: true },
);

// Check token status later
sep10.isTokenExpired(token); // false
sep10.decodeToken(token); // { iss, sub, iat, exp, jti, ... }
sep10.createAuthHeaders(token); // { Authorization: 'Bearer ...' }
```

If you need more control, use the individual steps instead of `authenticate()`:

```typescript
const challenge = await sep10.getChallenge(config, account);
const validation = sep10.validateChallenge(
    challenge.transaction,
    serverKey,
    passphrase,
    domain,
    account,
);
const signedXdr = await sep10.signChallenge(challenge.transaction, passphrase, signer);
const { token } = await sep10.submitChallenge(authEndpoint, signedXdr);
```

### Interactive Deposit/Withdrawal (SEP-24)

SEP-24 returns a URL to the anchor's hosted UI where the user completes the transfer:

```typescript
import { sep1, sep24 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
const sep24Server = sep1.getSep24Endpoint(toml)!;

// Check what assets are available
const info = await sep24.getInfo(sep24Server);
// info.deposit['USDC'].enabled, info.deposit['USDC'].min_amount, etc.

// Start a deposit (fiat -> crypto)
const response = await sep24.deposit(sep24Server, token, {
    asset_code: 'USDC',
    amount: '100',
});

// Open the anchor's interactive UI
window.open(response.url, '_blank');
// or use the built-in helpers:
sep24.openPopup(response.url);
sep24.createIframe(response.url, document.getElementById('container')!);

// Poll for completion
const tx = await sep24.pollTransaction(sep24Server, token, response.id, {
    onStatusChange: (tx) => console.log('Status:', tx.status),
});
```

Withdrawals work the same way — the anchor's UI collects bank details:

```typescript
const response = await sep24.withdraw(sep24Server, token, {
    asset_code: 'USDC',
    amount: '50',
});
window.open(response.url, '_blank');
```

### Programmatic Deposit/Withdrawal (SEP-6)

SEP-6 is the non-interactive counterpart to SEP-24. The anchor returns transfer instructions directly (no hosted UI):

```typescript
import { sep1, sep6 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
const sep6Server = sep1.getSep6Endpoint(toml)!;

// Check supported assets and fields
const info = await sep6.getInfo(sep6Server);

// Initiate a deposit — returns payment instructions (e.g., bank wire details)
const deposit = await sep6.deposit(sep6Server, token, {
    asset_code: 'USDC',
    account: userPublicKey,
    amount: '100',
});
// deposit.how, deposit.instructions, deposit.eta, etc.

// Initiate a withdrawal — returns the Stellar account to send funds to
const withdrawal = await sep6.withdraw(sep6Server, token, {
    asset_code: 'USDC',
    type: 'bank_account',
    dest: '123456789',
});
// withdrawal.account_id, withdrawal.memo, withdrawal.memo_type

// Check transaction status
const tx = await sep6.getTransaction(sep6Server, token, deposit.id!);
sep6.isComplete(tx.status); // false
sep6.isPendingUser(tx.status); // true — user needs to send fiat
sep6.getStatusDescription(tx.status); // 'Waiting for you to initiate the transfer'

// List recent transactions
const history = await sep6.getTransactions(sep6Server, token, {
    asset_code: 'USDC',
    limit: 10,
});
```

### KYC / Customer Management (SEP-12)

Anchors that require KYC verification use SEP-12 to collect and check customer information. Fields follow the [SEP-9](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0009.md) standard:

```typescript
import { sep1, sep12 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
const kycServer = sep1.getSep12Endpoint(toml)!;

// Check current KYC status
const customer = await sep12.getCustomer(kycServer, token);
// customer.status: 'NEEDS_INFO' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED'
// customer.fields: which fields are still needed

// Submit KYC information (SEP-9 field names)
const result = await sep12.putCustomer(kycServer, token, {
    first_name: 'Jane',
    last_name: 'Doe',
    email_address: 'jane@example.com',
    birth_date: '1990-01-15',
    address_country_code: 'US',
});
// result.id — the customer ID

// File uploads (binary fields) are also supported via multipart/form-data
await sep12.putCustomer(kycServer, token, {
    photo_id_front: photoBlob,
});

// Status helpers
sep12.isKycComplete(customer.status); // true if ACCEPTED
sep12.needsMoreInfo(customer.status); // true if NEEDS_INFO
sep12.isProcessing(customer.status); // true if PROCESSING
sep12.isRejected(customer.status); // true if REJECTED
```

### Cross-Border Payments (SEP-31)

SEP-31 handles direct payments where the sending institution sends Stellar assets to the anchor, and the anchor delivers fiat to the receiver:

```typescript
import { sep1, sep31 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
const sep31Server = sep1.getSep31Endpoint(toml)!;

// Check supported receiving assets
const info = await sep31.getInfo(sep31Server);

// Create a cross-border payment
const tx = await sep31.postTransaction(sep31Server, token, {
    amount: '500',
    asset_code: 'USDC',
    sender_id: senderId, // SEP-12 customer ID for the sender
    receiver_id: receiverId, // SEP-12 customer ID for the receiver
    fields: {
        transaction: { receiver_routing_number: '123456', receiver_account_number: '789' },
    },
});
// tx.stellar_account_id — send the Stellar payment here
// tx.stellar_memo, tx.stellar_memo_type — include this memo

// If the anchor needs more info, update the transaction
if (sep31.needsTransactionInfo(tx.status)) {
    await sep31.patchTransaction(sep31Server, token, tx.id, {
        receiver_routing_number: '654321',
    });
}

// Poll for completion
const completed = await sep31.pollTransaction(sep31Server, token, tx.id, {
    onStatusChange: (tx) => console.log('Status:', sep31.getStatusDescription(tx.status)),
});
```

### Quotes / RFQ (SEP-38)

SEP-38 lets you get exchange rates and request firm quotes before initiating a transfer:

```typescript
import { sep1, sep38 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
const quoteServer = sep1.getSep38Endpoint(toml)!;

// List supported assets
const info = await sep38.getInfo(quoteServer);
// info.assets: [{ asset: 'stellar:USDC:GA5ZS...', sell_delivery_methods: [...] }, ...]

// Get an indicative price (no auth required)
const price = await sep38.getPrice(quoteServer, {
    sell_asset: sep38.fiatAssetId('USD'), // 'iso4217:USD'
    buy_asset: sep38.stellarAssetId('USDC', issuer), // 'stellar:USDC:GA5ZS...'
    sell_amount: '100',
    context: 'sep6',
});
// price.price, price.sell_amount, price.buy_amount, price.fee

// Request a firm quote (auth required, guaranteed rate)
const quote = await sep38.postQuote(quoteServer, token, {
    sell_asset: sep38.fiatAssetId('USD'),
    buy_asset: sep38.stellarAssetId('USDC', issuer),
    sell_amount: '100',
    context: 'sep6',
});
// quote.id — use this in a SEP-6 or SEP-31 transaction
// quote.expires_at — the rate is guaranteed until this time

// Retrieve an existing quote
const existing = await sep38.getQuote(quoteServer, token, quote.id);
```

Asset identifier helpers:

```typescript
sep38.stellarAssetId('USDC', 'GA5ZS...'); // 'stellar:USDC:GA5ZS...'
sep38.stellarAssetId('XLM'); // 'stellar:native'
sep38.fiatAssetId('USD'); // 'iso4217:USD'
sep38.parseAssetId('stellar:USDC:GA5ZS...'); // { type: 'stellar', code: 'USDC', issuer: 'GA5ZS...' }
```

## SSR Compatibility

Every async function accepts an optional `fetchFn` as its last parameter. In server-side contexts (SvelteKit load functions, Next.js server components, Express handlers), pass the framework's fetch to ensure proper cookie forwarding and request context:

```typescript
// SvelteKit +page.ts
export async function load({ fetch }) {
    const toml = await sep1.fetchStellarToml('testanchor.stellar.org');
    const info = await sep24.getInfo(sep1.getSep24Endpoint(toml)!, fetch);
    return { info };
}
```

## Error Handling

All API calls throw `SepApiError` on non-2xx responses. This includes the HTTP status code and the anchor's error response body:

```typescript
import { SepApiError } from './anchors/sep';

try {
    await sep24.deposit(server, token, { asset_code: 'FAKE' });
} catch (err) {
    if (err instanceof SepApiError) {
        console.error(err.message); // 'asset not supported'
        console.error(err.status); // 400
        console.error(err.response?.error); // 'asset not supported'
    }
}
```

## Types

All request/response types are exported from `types.ts`:

```typescript
import type {
    Sep6Info,
    Sep6DepositRequest,
    Sep6DepositResponse,
    Sep24Info,
    Sep24InteractiveResponse,
    Sep24Transaction,
    Sep31PostTransactionRequest,
    Sep31Transaction,
    Sep38PriceRequest,
    Sep38QuoteResponse,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    TransactionStatus,
    SepError,
} from './anchors/sep/types';
```

SEP-1 types (`StellarTomlRecord`, `TomlCurrency`, etc.) are re-exported from `@stellar/stellar-sdk` via the `sep1` namespace:

```typescript
import type { sep1 } from './anchors/sep';

function processToml(toml: sep1.StellarTomlRecord) {
    /* ... */
}
```
