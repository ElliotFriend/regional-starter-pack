# Stellar Anchor Integration Library

A portable, framework-agnostic TypeScript library for integrating fiat on/off ramps on the Stellar network. Supports both **SEP-compliant anchors** and **custom anchor APIs**.

## What's in This Library

```
anchors/
├── types.ts              # Shared Anchor interface + common types
├── sep/                  # SEP protocol implementations (for compliant anchors)
│   ├── sep1.ts           # stellar.toml discovery
│   ├── sep10.ts          # Web authentication
│   ├── sep6.ts           # Programmatic deposits/withdrawals
│   ├── sep12.ts          # KYC management
│   ├── sep24.ts          # Interactive deposits/withdrawals
│   ├── sep31.ts          # Cross-border payments
│   ├── sep38.ts          # Quotes/RFQ
│   └── types.ts          # SEP-specific types
├── alfredpay/            # AlfredPay integration (Mexico, non-SEP)
│   ├── client.ts         # AlfredPayClient class
│   ├── types.ts          # AlfredPay API types
│   └── index.ts          # Exports
└── testanchor/           # Reference implementation for testanchor.stellar.org
```

## Two Ways to Integrate Anchors

### 1. SEP-Compliant Anchors (Use `/sep/`)

If the anchor follows Stellar SEP protocols (SEP-1, 6, 10, 12, 24, 31, 38), use the SEP modules directly. Most established anchors are SEP-compliant.

### 2. Custom Anchor APIs (Use the `Anchor` Interface)

If the anchor has their own API (like AlfredPay), create a client that implements the `Anchor` interface. This gives you a consistent API across all anchors.

---

## Quick Start: Custom Anchor (AlfredPay Example)

Copy `/alfredpay/` into your project for complete AlfredPay integration.

```typescript
import { AlfredPayClient } from './anchors/alfredpay';

// Initialize (server-side only - uses API keys)
const anchor = new AlfredPayClient({
    apiKey: process.env.ALFREDPAY_API_KEY!,
    apiSecret: process.env.ALFREDPAY_API_SECRET!,
    baseUrl: 'https://api-service-co.alfredpay.app/api/v1/third-party-service/penny',
});

// Create customer
const customer = await anchor.createCustomer({
    email: 'user@example.com',
    stellarAddress: 'GXYZ...',
    country: 'MX',
});

// Get KYC iframe URL
const kycUrl = await anchor.getKycIframeUrl(customer.id);

// Get quote (MXN → USDC)
const quote = await anchor.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    fromAmount: '1000',
});

// Create on-ramp transaction
const onramp = await anchor.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'USDC',
    amount: '1000',
});

// User pays via SPEI using these instructions:
console.log('Pay to CLABE:', onramp.paymentInstructions?.clabe);
console.log('Reference:', onramp.paymentInstructions?.reference);

// Poll for completion
const tx = await anchor.getOnRampTransaction(onramp.id);
console.log('Status:', tx?.status);
```

### Off-Ramp (USDC → MXN)

```typescript
// Register bank account
const fiatAccount = await anchor.registerFiatAccount({
    customerId: customer.id,
    bankAccount: {
        bankName: 'BBVA',
        accountNumber: '123456789',
        clabe: '012345678901234567',
        beneficiary: 'John Doe',
    },
});

// Get quote
const quote = await anchor.getQuote({
    fromCurrency: 'USDC',
    toCurrency: 'MXN',
    fromAmount: '100',
});

// Create off-ramp
const offramp = await anchor.createOffRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fiatAccountId: fiatAccount.id,
    fromCurrency: 'USDC',
    toCurrency: 'MXN',
    amount: '100',
});

// Send USDC to this address with this memo
console.log('Send to:', offramp.stellarAddress);
console.log('Memo:', offramp.memo);
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
    sep24Deposit,
    pollSep24Transaction,
} from './anchors/sep';

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
const response = await sep24Deposit(getSep24Endpoint(toml)!, token, {
    asset_code: 'USDC',
    amount: '100',
});

// 4. Open anchor UI
window.open(response.url, '_blank');

// 5. Poll for completion
const tx = await pollSep24Transaction(getSep24Endpoint(toml)!, token, response.id);
```

---

## The Anchor Interface

All custom anchor clients implement this interface, giving you a consistent API:

```typescript
interface Anchor {
    readonly name: string;

    // Customer management
    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getCustomerByEmail(email: string, country?: string): Promise<Customer | null>;

    // Quotes
    getQuote(input: GetQuoteInput): Promise<Quote>;

    // On-ramp (fiat → crypto)
    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;

    // Off-ramp (crypto → fiat)
    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;

    // KYC
    getKycIframeUrl(customerId: string): Promise<string>;
    getKycStatus(customerId: string): Promise<KycStatus>;
}
```

### Implementing a New Anchor

```typescript
import type { Anchor, Customer, Quote /* ... */ } from './types';
import { AnchorError } from './types';

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

    // ... implement other methods
}
```

---

## AlfredPay Reference

AlfredPay is a non-SEP anchor providing fiat on/off ramps for Mexico (MXN via SPEI).

### Configuration

```env
ALFREDPAY_API_KEY=your-api-key
ALFREDPAY_API_SECRET=your-api-secret
ALFREDPAY_BASE_URL=https://api-service-co.alfredpay.app/api/v1/third-party-service/penny
```

### AlfredPayClient Methods

| Method                               | Description                      |
| ------------------------------------ | -------------------------------- |
| `createCustomer(input)`              | Create new customer              |
| `getCustomer(id)`                    | Get customer by ID               |
| `getCustomerByEmail(email, country)` | Find customer by email           |
| `getQuote(input)`                    | Get exchange rate quote          |
| `createOnRamp(input)`                | Create fiat → crypto transaction |
| `getOnRampTransaction(id)`           | Get on-ramp status               |
| `registerFiatAccount(input)`         | Register bank account            |
| `getFiatAccounts(customerId)`        | List saved bank accounts         |
| `createOffRamp(input)`               | Create crypto → fiat transaction |
| `getOffRampTransaction(id)`          | Get off-ramp status              |
| `getKycIframeUrl(customerId)`        | Get KYC verification URL         |
| `getKycStatus(customerId)`           | Get KYC status                   |
| `getKycRequirements(country)`        | Get required KYC fields          |
| `submitKycData(customerId, data)`    | Submit KYC data programmatically |
| `submitKycFile(...)`                 | Upload KYC document              |

### KYC Flow

```typescript
// Option 1: Iframe (simpler)
const iframeUrl = await anchor.getKycIframeUrl(customer.id);
// Embed iframeUrl in your UI

// Option 2: Programmatic (more control)
const requirements = await anchor.getKycRequirements('MX');
console.log('Required fields:', requirements.requirements.personal);

const submission = await anchor.submitKycData(customer.id, {
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
    dni: 'CURP123456',
});

// Upload ID documents
await anchor.submitKycFile(
    customer.id,
    submission.submissionId,
    'National ID Front',
    frontImageBlob,
    'id-front.jpg',
);

// Finalize
await anchor.finalizeKycSubmission(customer.id, submission.submissionId);
```

---

## SEP Module Reference

### SEP-1: Stellar.toml Discovery

```typescript
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep6Endpoint,
    getSep24Endpoint,
    getSep38Endpoint,
    supportsSep,
} from './sep';

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
import { sep6Deposit, sep6Withdraw, getSep6Transaction } from './sep';

const deposit = await sep6Deposit(server, token, {
    asset_code: 'USDC',
    account: publicKey,
    amount: '100',
});
console.log('Instructions:', deposit.instructions);
```

### SEP-12: KYC Management

```typescript
import { getCustomer, putCustomer, isKycComplete, needsMoreInfo } from './sep';

const customer = await getCustomer(kycServer, token, { type: 'sep6-deposit' });

if (needsMoreInfo(customer.status)) {
    await putCustomer(kycServer, token, {
        first_name: 'Jane',
        last_name: 'Doe',
        email_address: 'jane@example.com',
    });
}
```

### SEP-24: Interactive Deposits/Withdrawals

```typescript
import { sep24Deposit, openPopup, pollSep24Transaction } from './sep';

const response = await sep24Deposit(server, token, { asset_code: 'USDC' });
openPopup(response.url);

const tx = await pollSep24Transaction(server, token, response.id, {
    onStatusChange: (tx) => console.log(tx.status),
});
```

### SEP-31: Cross-Border Payments

```typescript
import { postTransaction, pollSep31Transaction } from './sep';

const tx = await postTransaction(server, token, {
    amount: '100',
    asset_code: 'USDC',
    sender_id: senderId,
    receiver_id: receiverId,
});

// Send USDC to tx.stellar_account_id with memo tx.stellar_memo
```

### SEP-38: Quotes

```typescript
import { getPrice, postQuote, stellarAssetId, fiatAssetId } from './sep';

// Indicative price (no auth)
const price = await getPrice(quoteServer, {
  sell_asset: fiatAssetId('MXN'),
  buy_asset: stellarAssetId('USDC', issuer),
  sell_amount: '1000',
  context: 'sep6'
});

// Firm quote (requires auth)
const quote = await postQuote(quoteServer, token, { ... });
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
    | 'cancelled';
```

### Quote

```typescript
interface Quote {
    id: string;
    fromCurrency: string;
    toCurrency: string;
    fromAmount: string;
    toAmount: string;
    exchangeRate: string;
    fee: string;
    expiresAt: string;
    createdAt: string;
}
```

### Error Handling

```typescript
import { AnchorError } from './types';

try {
  await anchor.createOnRamp({ ... });
} catch (error) {
  if (error instanceof AnchorError) {
    console.error('Code:', error.code);
    console.error('Status:', error.statusCode);
    console.error('Message:', error.message);
  }
}
```

---

## Installation / Copying

1. Copy the directories you need:
    - `/sep/` for SEP-compliant anchors
    - `/alfredpay/` for AlfredPay integration
    - `/types.ts` for the shared Anchor interface

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
