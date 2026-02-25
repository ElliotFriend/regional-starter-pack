# Test Anchor Client

A unified client for [testanchor.stellar.org](https://testanchor.stellar.org) that composes all supported SEP modules from the [SEP protocol library](../sep/) into a single, ergonomic interface. This serves as a reference implementation for building SEP-compatible anchor integrations.

## How It Relates to the SEP Library

The [SEP library](../sep/) provides standalone, stateless functions for each protocol (`sep1.fetchStellarToml()`, `sep10.authenticate()`, `sep24.deposit()`, etc.). Each function requires you to pass in endpoints, tokens, and fetch functions explicitly.

This client wraps those modules into a stateful object that handles:

- **Endpoint resolution** — fetches the `stellar.toml` once, then resolves the correct endpoint for each SEP call automatically
- **Token management** — stores the JWT after authentication and injects it into subsequent requests
- **Namespaced access** — SEP operations are grouped under `client.sep6`, `client.sep24`, `client.sep31`, `client.sep38`, and `client.sep12`, while initialization and auth stay at the top level

If you need to build a client for a different anchor, this file is a good starting point. The pattern is the same: compose the [SEP modules](../sep/) with your anchor's specific configuration and any provider-specific logic.

## Quick Start

```typescript
import { createTestAnchorClient } from './anchors/testanchor';

const client = createTestAnchorClient();

// 1. Initialize (fetches stellar.toml, discovers endpoints)
const toml = await client.initialize();

// 2. Authenticate (SEP-10 challenge-response)
const token = await client.authenticate(userPublicKey, async (xdr, passphrase) => {
    return await freighter.signTransaction(xdr, { networkPassphrase: passphrase });
});

// 3. Use any SEP operation
const info = await client.sep24.getInfo();
const deposit = await client.sep24.deposit({ asset_code: 'USDC', amount: '100' });
```

## Configuration

```typescript
import { createTestAnchorClient } from './anchors/testanchor';

// Defaults: testanchor.stellar.org on Testnet
const client = createTestAnchorClient();

// (Optional) Custom configuration
const client = createTestAnchorClient({
    domain: 'anchor.example.com',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
});

// (Optional) Pass a custom fetch (e.g., SvelteKit's fetch for SSR)
const client = createTestAnchorClient(undefined, fetch);
```

## API

### Initialization and Discovery

```typescript
// Fetch and cache the stellar.toml
const toml = await client.initialize();

// Get the cached toml (fetches if not already initialized)
const toml = await client.getToml();

// Check if a specific SEP is supported
await client.supportsSep(24); // true
await client.supportsSep(31); // true
```

### Authentication (SEP-10)

```typescript
// Full authentication flow
const token = await client.authenticate(publicKey, signerFn);

// Check auth state
client.isAuthenticated(); // true
client.getToken(); // 'eyJ...'
client.getAccount(); // 'GABCD...'
client.getTokenPayload(); // { iss, sub, iat, exp, jti }

// Clear auth state
client.logout();
```

### SEP-6: Programmatic Deposit/Withdrawal

```typescript
// Check supported assets and limits
const info = await client.sep6.getInfo();

// Deposit (fiat -> crypto) — returns payment instructions
const deposit = await client.sep6.deposit({
    asset_code: 'USDC',
    account: publicKey,
    amount: '100',
});

// Withdraw (crypto -> fiat) — returns the Stellar account to send to
const withdrawal = await client.sep6.withdraw({
    asset_code: 'USDC',
    type: 'bank_account',
    dest: '123456789',
});

// Track a transaction
const tx = await client.sep6.getTransaction(deposit.id!);

// List recent transactions
const history = await client.sep6.getTransactions('USDC', 10);
```

### SEP-12: KYC / Customer Management

```typescript
// Get current KYC status and required fields
const customer = await client.sep12.getCustomer('sep6-deposit');

// Submit KYC information
const result = await client.sep12.putCustomer({
    first_name: 'Jane',
    last_name: 'Doe',
    email_address: 'jane@example.com',
});

// Delete customer data
await client.sep12.deleteCustomer();
```

### SEP-24: Interactive Deposit/Withdrawal

```typescript
// Check supported assets and limits
const info = await client.sep24.getInfo();

// Deposit — returns a URL to the anchor's hosted UI
const deposit = await client.sep24.deposit({
    asset_code: 'USDC',
    amount: '100',
});
window.open(deposit.url, '_blank');

// Withdraw
const withdrawal = await client.sep24.withdraw({
    asset_code: 'USDC',
    amount: '50',
});

// Track a transaction
const tx = await client.sep24.getTransaction(deposit.id);

// Poll until complete (with status change callbacks)
const completed = await client.sep24.poll(deposit.id, (tx) => {
    console.log('Status changed:', tx.status);
});
```

### SEP-31: Cross-Border Payments

```typescript
// Check supported receiving assets
const info = await client.sep31.getInfo();

// Create a payment
const tx = await client.sep31.createTransaction({
    amount: '500',
    asset_code: 'USDC',
    sender_id: senderId,
    receiver_id: receiverId,
});
// tx.stellar_account_id — send the Stellar payment here
// tx.stellar_memo — include this memo

// Update a transaction if more info is needed
await client.sep31.updateTransaction(tx.id, {
    receiver_routing_number: '654321',
});

// Track or poll
const status = await client.sep31.getTransaction(tx.id);
const completed = await client.sep31.poll(tx.id, (tx) => {
    console.log('Status:', tx.status);
});
```

### SEP-38: Quotes / RFQ

```typescript
// List supported assets and delivery methods
const info = await client.sep38.getInfo();

// Get an indicative price (no auth required)
const price = await client.sep38.getPrice({
    sell_asset: 'iso4217:USD',
    buy_asset: 'stellar:USDC:GA5ZS...',
    sell_amount: '100',
    context: 'sep6',
});

// Request a firm quote (auth required, guaranteed rate)
const quote = await client.sep38.createQuote({
    sell_asset: 'iso4217:USD',
    buy_asset: 'stellar:USDC:GA5ZS...',
    sell_amount: '100',
    context: 'sep6',
});
// quote.id, quote.expires_at

// Retrieve an existing quote
const existing = await client.sep38.getQuote(quote.id);
```

## Full Flow Example

Putting it together — an interactive deposit from start to finish:

```typescript
import { createTestAnchorClient } from './anchors/testanchor';

const client = createTestAnchorClient();

// 1. Initialize
await client.initialize();

// 2. Authenticate
await client.authenticate(publicKey, signerFn);

// 3. Check what's available
const info = await client.sep24.getInfo();
const usdcDeposit = info.deposit['USDC'];
console.log(`USDC deposits: min ${usdcDeposit.min_amount}, max ${usdcDeposit.max_amount}`);

// 4. (Optional) Get a quote
const quote = await client.sep38.createQuote({
    sell_asset: 'iso4217:USD',
    buy_asset: 'stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    sell_amount: '100',
    context: 'sep6',
});

// 5. Start interactive deposit
const deposit = await client.sep24.deposit({
    asset_code: 'USDC',
    amount: '100',
});

// 6. Open the anchor's UI
window.open(deposit.url, '_blank');

// 7. Poll until the user completes the flow
const completed = await client.sep24.poll(deposit.id, (tx) => {
    console.log(`Status: ${tx.status}`);
});

console.log('Deposit complete:', completed.stellar_transaction_id);
```

## Using in SvelteKit

Pass SvelteKit's `fetch` to the client for proper SSR request context:

```typescript
// +page.ts
import { createTestAnchorClient } from '$lib/anchors/testanchor';
import { error } from '@sveltejs/kit';

export async function load({ fetch }) {
    const client = createTestAnchorClient(undefined, fetch);

    try {
        const toml = await client.initialize();

        return {
            client,
            sep24Info: client.sep24.getInfo(), // streamed as a promise
            sep6Info: client.sep6.getInfo(),
        };
    } catch (e) {
        error(500, { message: e instanceof Error ? e.message : 'Failed to initialize' });
    }
}
```

## Building Your Own Client

To build a client for a different anchor using the same pattern:

1. Import the SEP modules you need from the [SEP library](../sep/)
2. Create a class that caches the `stellar.toml` and JWT token
3. Expose SEP operations as namespaced `readonly` properties
4. Use arrow functions in the property objects so `this` binds correctly

```typescript
import { sep1, sep10, sep24 } from '../sep';

export class MyAnchorClient {
    private toml: sep1.StellarTomlRecord | null = null;
    private token: string | null = null;

    constructor(
        private domain: string,
        private fetchFn: typeof fetch = fetch,
    ) {}

    async initialize() {
        this.toml = await sep1.fetchStellarToml(this.domain);
        return this.toml;
    }

    // ... authenticate(), getToml(), etc.

    readonly sep24 = {
        getInfo: async () => {
            const toml = await this.getToml();
            const ep = sep1.getSep24Endpoint(toml)!;
            return sep24.getInfo(ep, this.fetchFn);
        },
        deposit: async (request) => {
            const toml = await this.getToml();
            const ep = sep1.getSep24Endpoint(toml)!;
            return sep24.deposit(ep, this.token!, request, this.fetchFn);
        },
    };
}
```

See the full implementation in [client.ts](./client.ts) for the complete pattern with error handling, token validation, and all supported SEPs.
