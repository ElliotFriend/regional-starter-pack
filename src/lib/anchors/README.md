# Stellar Anchor Integration Library

A portable, framework-agnostic TypeScript library for integrating fiat on/off ramps on the Stellar network. Includes three anchor provider clients and a composable SEP protocol library.

## What's in This Library

```
anchors/
├── types.ts              # Shared Anchor interface + common types
├── index.ts              # Re-exports (no framework imports)
├── etherfuse/            # Etherfuse integration (Latin America)
│   ├── client.ts         # EtherfuseClient implements Anchor
│   ├── types.ts          # Etherfuse API types
│   └── README.md         # Detailed integration docs
├── alfredpay/            # AlfredPay integration (Mexico)
│   ├── client.ts         # AlfredPayClient implements Anchor
│   ├── types.ts          # AlfredPay API types
│   └── README.md         # Detailed integration docs
├── blindpay/             # BlindPay integration (global)
│   ├── client.ts         # BlindPayClient implements Anchor
│   └── types.ts          # BlindPay API types
├── sep/                  # SEP protocol implementations
│   ├── sep1.ts           # stellar.toml discovery
│   ├── sep10.ts          # Web authentication
│   ├── sep6.ts           # Programmatic deposits/withdrawals
│   ├── sep12.ts          # KYC management
│   ├── sep24.ts          # Interactive deposits/withdrawals
│   ├── sep31.ts          # Cross-border payments
│   ├── sep38.ts          # Quotes/RFQ
│   └── types.ts          # SEP-specific types
└── testanchor/           # Reference client for testanchor.stellar.org
```

## Two Ways to Integrate Anchors

### 1. Custom Anchor APIs (Use the `Anchor` Interface)

For anchors with their own APIs (Etherfuse, AlfredPay, BlindPay), each client implements the shared `Anchor` interface. This gives you a consistent API across all providers.

### 2. SEP-Compliant Anchors (Use `/sep/`)

For anchors that follow Stellar SEP protocols (SEP-1, 6, 10, 12, 24, 31, 38), use the SEP modules directly. The `testanchor/` client composes these modules as a reference.

---

## The Anchor Interface

All three provider clients implement this interface from `types.ts`:

```typescript
interface Anchor {
    readonly name: string;

    // Customer management
    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getCustomerByEmail(email: string, country?: string): Promise<Customer | null>;

    // Quotes
    getQuote(input: GetQuoteInput): Promise<Quote>;

    // On-ramp (fiat -> crypto)
    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;

    // Off-ramp (crypto -> fiat)
    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;

    // KYC
    getKycIframeUrl(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string>;
    getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus>;
}
```

---

## Anchor Providers

### Etherfuse

Latin America focus. Iframe-based KYC. On-ramp and off-ramp via SPEI (Mexico) and other regional rails. Uses CETES token.

```typescript
import { EtherfuseClient } from './anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: 'https://api.sand.etherfuse.com',
});

// Create customer
const customer = await anchor.createCustomer({
    email: 'user@example.com',
    publicKey: 'GXYZ...',
    country: 'MX',
});

// KYC via iframe
const kycUrl = await anchor.getKycIframeUrl(customer.id, 'GXYZ...', customer.bankAccountId);

// Get quote (MXN -> CETES)
const quote = await anchor.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

// Create on-ramp order
const onramp = await anchor.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    amount: '1000',
    bankAccountId: customer.bankAccountId!,
});
```

**Off-ramp note:** Etherfuse off-ramp uses deferred signing. The `createOffRamp()` response does **not** include the burn transaction XDR. You must poll `getOffRampTransaction()` until `signableTransaction` appears, then sign it with the user's wallet and submit to Stellar.

See [`etherfuse/README.md`](etherfuse/README.md) for complete documentation.

### AlfredPay

Mexico focus. Form-based KYC. On-ramp and off-ramp via SPEI. Uses USDC. Supports email-based customer lookup.

```typescript
import { AlfredPayClient } from './anchors/alfredpay';

const anchor = new AlfredPayClient({
    apiKey: process.env.ALFREDPAY_API_KEY!,
    apiSecret: process.env.ALFREDPAY_API_SECRET!,
    baseUrl: 'https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny',
});

// Create customer
const customer = await anchor.createCustomer({
    email: 'user@example.com',
    country: 'MX',
});

// Get quote (MXN -> USDC)
const quote = await anchor.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    fromAmount: '1000',
});

// Create on-ramp
const onramp = await anchor.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    amount: '1000',
});

// User pays via SPEI
console.log('Pay to CLABE:', onramp.paymentInstructions?.clabe);
console.log('Reference:', onramp.paymentInstructions?.reference);
```

See [`alfredpay/README.md`](alfredpay/README.md) for complete documentation including programmatic KYC submission.

### BlindPay

Global coverage. Redirect-based KYC. Uses USDB token. Requires separate blockchain wallet registration. Off-ramp uses a payout submission step rather than direct Stellar transaction signing.

```typescript
import { BlindPayClient } from './anchors/blindpay';

const anchor = new BlindPayClient({
    apiKey: process.env.BLINDPAY_API_KEY!,
    instanceId: process.env.BLINDPAY_INSTANCE_ID!,
    baseUrl: 'https://api.blindpay.com',
});
```

---

## Quick Start: SEP-Compliant Anchor

Copy `/sep/` into your project for SEP protocol support.

```typescript
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep24Endpoint,
    authenticate,
} from './anchors/sep';
import { sep24 } from './anchors/sep';

// 1. Discover anchor endpoints
const toml = await fetchStellarToml('testanchor.stellar.org');

// 2. Authenticate
const token = await authenticate(
    {
        authEndpoint: getSep10Endpoint(toml)!,
        serverSigningKey: toml.SIGNING_KEY!,
        networkPassphrase: 'Test SDF Network ; September 2015',
        homeDomain: 'testanchor.stellar.org',
    },
    userPublicKey,
    async (xdr, passphrase) => signWithWallet(xdr, passphrase),
);

// 3. Start interactive deposit
const response = await sep24.deposit(getSep24Endpoint(toml)!, token, {
    asset_code: 'USDC',
    amount: '100',
});

// 4. Open anchor UI
window.open(response.url, '_blank');

// 5. Poll for completion
const tx = await sep24.pollTransaction(getSep24Endpoint(toml)!, token, response.id);
```

---

## Implementing a New Anchor

Create a new directory and implement the `Anchor` interface:

```typescript
import type { Anchor, Customer, Quote, CreateCustomerInput /* ... */ } from '../types';
import { AnchorError } from '../types';

export class MyAnchorClient implements Anchor {
    readonly name = 'myanchor';

    constructor(private config: { apiKey: string; baseUrl: string }) {}

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const response = await fetch(`${this.config.baseUrl}/customers`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: input.email }),
        });

        if (!response.ok) {
            throw new AnchorError('Failed to create customer', 'CREATE_FAILED', response.status);
        }

        const data = await response.json();
        return this.mapToCustomer(data);
    }

    // ... implement all Anchor methods
}
```

---

## SEP Module Reference

### SEP-1: Stellar.toml Discovery

```typescript
import { fetchStellarToml, getSep10Endpoint, getSep24Endpoint, supportsSep } from './sep';

const toml = await fetchStellarToml('anchor.example.com');

if (supportsSep(toml, 24)) {
    console.log('SEP-24:', getSep24Endpoint(toml));
}
```

### SEP-10: Web Authentication

```typescript
import { authenticate, isTokenExpired, createAuthHeaders } from './sep';

const token = await authenticate(config, publicKey, signerFn);

if (isTokenExpired(token)) {
    // Re-authenticate
}

const headers = createAuthHeaders(token);
```

### SEP-6: Programmatic Deposits/Withdrawals

```typescript
import { sep6 } from './sep';

const deposit = await sep6.deposit(server, token, {
    asset_code: 'USDC',
    account: publicKey,
    amount: '100',
});
console.log('Instructions:', deposit.instructions);
```

### SEP-12: KYC Management

```typescript
import { sep12 } from './sep';

const customer = await sep12.getCustomer(kycServer, token, { type: 'sep6-deposit' });

if (customer.status === 'NEEDS_INFO') {
    await sep12.putCustomer(kycServer, token, {
        first_name: 'Jane',
        last_name: 'Doe',
        email_address: 'jane@example.com',
    });
}
```

### SEP-24: Interactive Deposits/Withdrawals

```typescript
import { sep24 } from './sep';

const response = await sep24.deposit(server, token, { asset_code: 'USDC' });
window.open(response.url, '_blank');

const tx = await sep24.pollTransaction(server, token, response.id, {
    onStatusChange: (tx) => console.log(tx.status),
});
```

### SEP-31: Cross-Border Payments

```typescript
import { sep31 } from './sep';

const tx = await sep31.postTransaction(server, token, {
    amount: '100',
    asset_code: 'USDC',
    sender_id: senderId,
    receiver_id: receiverId,
});

// Send USDC to tx.stellar_account_id with memo tx.stellar_memo
```

### SEP-38: Quotes

```typescript
import { sep38 } from './sep';

// Indicative price (no auth)
const price = await sep38.getPrice(quoteServer, {
    sell_asset: 'iso4217:MXN',
    buy_asset: `stellar:USDC:${issuer}`,
    sell_amount: '1000',
    context: 'sep6',
});

// Firm quote (requires auth)
const quote = await sep38.postQuote(quoteServer, token, {
    sell_asset: 'iso4217:MXN',
    buy_asset: `stellar:USDC:${issuer}`,
    sell_amount: '1000',
    context: 'sep6',
});
```

---

## Common Types

### KycStatus

```typescript
type KycStatus = 'pending' | 'approved' | 'rejected' | 'not_started' | 'update_required';
```

### TransactionStatus

```typescript
type TransactionStatus =
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'
    | 'refunded';
```

### OffRampTransaction

Includes optional provider-specific fields:

```typescript
interface OffRampTransaction {
    id: string;
    status: TransactionStatus;
    // ... standard fields ...
    signableTransaction?: string;  // Pre-built XDR for signing (Etherfuse)
    statusPage?: string;           // Anchor-hosted status page URL (Etherfuse)
    feeBps?: number;               // Fee in basis points
    feeAmount?: string;            // Fee as a string amount
}
```

### Error Handling

```typescript
import { AnchorError } from './types';

try {
    await anchor.createOnRamp({ ... });
} catch (error) {
    if (error instanceof AnchorError) {
        console.error('Code:', error.code);       // e.g. 'CREATE_FAILED'
        console.error('Status:', error.statusCode); // e.g. 400
        console.error('Message:', error.message);
    }
}
```

---

## Installation / Copying

1. Copy the directories you need:
    - `/etherfuse/`, `/alfredpay/`, or `/blindpay/` for specific providers
    - `/sep/` for SEP-compliant anchors
    - `/types.ts` for the shared Anchor interface (required by all provider clients)

2. Install the dependency:

    ```bash
    npm install @stellar/stellar-sdk
    ```

3. The library works in any TypeScript environment (Node.js, browser, SvelteKit, Next.js, etc.)

## CORS Note

Browser requests to anchor APIs typically fail due to CORS. Solutions:

1. **Server proxy** (recommended): Create API routes that proxy to the anchor
2. **Server-side only**: Use the library only in server code (API routes, SSR)

---

## License

Apache-2.0
