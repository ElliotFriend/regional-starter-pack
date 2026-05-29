# Test Anchor

This directory contains **two** standalone clients for [testanchor.stellar.org](https://testanchor.stellar.org), serving different purposes:

| File            | Class                        | Used by                                                           | Purpose                                                            |
| --------------- | ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `ramp.ts`       | `TestAnchorRampClient`       | `/anchors/testanchor/{interactive,programmatic}/{onramp,offramp}` | Curated ramp client. Returns SEP types directly.                   |
| `playground.ts` | `TestAnchorPlaygroundClient` | `/testanchor`                                                     | Stateful SEP-namespaced playground used by the protocol demo page. |

Both are framework-agnostic and copy-pasteable. They compose the [SEP modules](../sep/) under different ergonomics.

---

## `TestAnchorRampClient` (curated ramp client)

A focused wrapper around the SEP modules for talking to the test anchor. Returns SEP-shaped responses directly — there's no adaptation layer because testanchor IS SEP. SEP-10 tokens are passed explicitly to each method that needs them, so a single instance is safe to share across requests.

### Usage

```typescript
import { TestAnchorRampClient } from 'path/to/anchors/testanchor';

const anchor = new TestAnchorRampClient();
// Optional config: { domain, networkPassphrase, horizonUrl, fetchFn }
```

### SEP-1 discovery

The client caches the anchor's `stellar.toml` on first use:

```typescript
const toml = await anchor.toml();
```

### SEP-10 wallet auth

```typescript
const challenge = await anchor.getChallenge(publicKey);
// challenge.transaction is a base64 XDR — sign it with the user's wallet
const signedXdr = await signWithWallet(challenge.transaction);
const { token } = await anchor.submitChallenge(signedXdr);
```

The token is a SEP-10 JWT; thread it into the subsequent methods that require auth. Decode it without verification via `anchor.decodeToken(token)` if you need the payload.

### SEP-12 KYC

```typescript
const customer = await anchor.getCustomer(token);
// customer.status is 'ACCEPTED' | 'PROCESSING' | 'NEEDS_INFO' | 'REJECTED'

if (customer.status === 'NEEDS_INFO') {
    await anchor.putCustomer(token, {
        first_name: 'Jane',
        last_name: 'Doe',
        email_address: 'jane@example.com',
    });
}
```

`getCustomer` accepts an optional `Sep12CustomerRequest` for narrowing by `id`, `transaction_id`, `type`, etc.

### SEP-38 quotes

```typescript
const price = await anchor.getPrice({
    sell_asset: 'iso4217:USD',
    buy_asset: anchor.toSep38Asset('SRT'),
    sell_amount: '100',
    context: 'sep6',
});
```

`anchor.toSep38Asset(symbol)` resolves a symbol to a `stellar:CODE:ISSUER` (for supported tokens) or `iso4217:CODE` (for fiat).

### SEP-6 programmatic

```typescript
// Deposit — returns the anchor's generic deposit instructions
const deposit = await anchor.sep6Deposit(token, {
    asset_code: 'SRT',
    funding_method: 'bank_account',
    account: publicKey,
    amount: '100',
});
// deposit.instructions is a Record<string, { value, description }>

// Withdraw — returns the anchor's account/memo PLUS a pre-built signable XDR
const withdrawal = await anchor.sep6Withdraw(
    token,
    { asset_code: 'SRT', funding_method: 'bank_account', amount: '50' },
    sourceAccount,
);
// withdrawal.signableXdr — sign with Freighter and submit to Stellar

// Poll a transaction
const tx = await anchor.getSep6Transaction(token, withdrawal.id);
// tx is Sep6Transaction or null on 404
```

### SEP-24 interactive

```typescript
// Deposit
const deposit = await anchor.sep24Deposit(token, {
    asset_code: 'SRT',
    asset_issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    account: publicKey,
});
window.open(deposit.url, '_blank');
// deposit.id is the transaction ID to poll

// Withdraw — same shape
const withdrawal = await anchor.sep24Withdraw(token, {
    /* ... */
});

// Poll
const tx = await anchor.getSep24Transaction(token, deposit.id);
```

### Errors

The client throws `TestAnchorSepUnsupportedError` if the anchor's `stellar.toml` doesn't advertise a required SEP. Other errors propagate from the underlying SEP modules.

```typescript
import { TestAnchorSepUnsupportedError } from 'path/to/anchors/testanchor';

try {
    await anchor.sep6Deposit(token, request);
} catch (err) {
    if (err instanceof TestAnchorSepUnsupportedError) {
        console.error('Anchor does not support SEP-6');
    }
    throw err;
}
```

404 responses on single-resource lookups (`getSep6Transaction`, `getSep24Transaction`) return `null` instead of throwing.

### Full flow example

```typescript
import { TestAnchorRampClient } from 'path/to/anchors/testanchor';

const anchor = new TestAnchorRampClient();

// 1. Authenticate
const challenge = await anchor.getChallenge(publicKey);
const signedXdr = await signWithWallet(challenge.transaction);
const { token } = await anchor.submitChallenge(signedXdr);

// 2. KYC if needed
const customer = await anchor.getCustomer(token);
if (customer.status === 'NEEDS_INFO') {
    await anchor.putCustomer(token, { first_name: 'Jane', last_name: 'Doe', email_address: '...' });
}

// 3. Start interactive deposit
const session = await anchor.sep24Deposit(token, {
    asset_code: 'SRT',
    asset_issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    account: publicKey,
});
window.open(session.url, '_blank');

// 4. Poll until complete
let tx = await anchor.getSep24Transaction(token, session.id);
while (tx && tx.status !== 'completed' && tx.status !== 'error') {
    await new Promise((r) => setTimeout(r, 5000));
    tx = await anchor.getSep24Transaction(token, session.id);
}
```

---

## `TestAnchorPlaygroundClient` (SEP playground)

A stateful, SEP-namespaced "playground" client. Methods are grouped under `client.sep6`, `client.sep24`, `client.sep10`, `client.sep12`, `client.sep31`, `client.sep38`. The JWT is stored on the client after authentication and injected into subsequent requests. Good for learning the raw SEP protocols and powering the `/testanchor` demo page.

### Quick start

```typescript
import { createTestAnchorPlaygroundClient } from 'path/to/anchors/testanchor';

const client = createTestAnchorPlaygroundClient();
// Or: createTestAnchorPlaygroundClient({ domain: 'anchor.example.com', ... }, fetch);

// 1. Initialize (fetches stellar.toml, discovers endpoints)
const toml = await client.initialize();

// 2. Authenticate (SEP-10 challenge-response)
const token = await client.authenticate(publicKey, async (xdr, passphrase) => {
    return await freighter.signTransaction(xdr, { networkPassphrase: passphrase });
});

// 3. Use any SEP operation
const info = await client.sep24.getInfo();
const deposit = await client.sep24.deposit({ asset_code: 'USDC', amount: '100' });
```

### API

#### Discovery

```typescript
await client.initialize(); // fetch + cache toml
await client.getToml(); // cached if present
await client.supportsSep(24); // true/false
```

#### Authentication (SEP-10)

```typescript
const token = await client.authenticate(publicKey, signerFn);
client.isAuthenticated();
client.getToken();
client.getAccount();
client.getTokenPayload();
client.logout();
```

#### SEP-6

```typescript
const info = await client.sep6.getInfo();

const deposit = await client.sep6.deposit({
    asset_code: 'USDC',
    funding_method: 'bank_account',
    account: publicKey,
    amount: '100',
});

const withdrawal = await client.sep6.withdraw({
    asset_code: 'USDC',
    funding_method: 'bank_account',
    dest: '123456789',
});

const tx = await client.sep6.getTransaction(deposit.id!);
const history = await client.sep6.getTransactions('USDC', 10);
```

#### SEP-12

```typescript
const customer = await client.sep12.getCustomer('sep6-deposit');

const result = await client.sep12.putCustomer({
    first_name: 'Jane',
    last_name: 'Doe',
    email_address: 'jane@example.com',
});

await client.sep12.deleteCustomer();
```

#### SEP-24

```typescript
const info = await client.sep24.getInfo();
const deposit = await client.sep24.deposit({ asset_code: 'USDC', amount: '100' });
window.open(deposit.url, '_blank');
const tx = await client.sep24.getTransaction(deposit.id);

const completed = await client.sep24.poll(deposit.id, (tx) => {
    console.log('Status:', tx.status);
});
```

#### SEP-31

```typescript
const info = await client.sep31.getInfo();
const tx = await client.sep31.createTransaction({
    amount: '500',
    asset_code: 'USDC',
    sender_id: senderId,
    receiver_id: receiverId,
});
const completed = await client.sep31.poll(tx.id, (tx) => console.log(tx.status));
```

#### SEP-38

```typescript
const info = await client.sep38.getInfo();
const price = await client.sep38.getPrice({
    sell_asset: 'iso4217:USD',
    buy_asset: 'stellar:USDC:GA5ZS...',
    sell_amount: '100',
    context: 'sep6',
});
const quote = await client.sep38.createQuote({
    /* ... */
});
const existing = await client.sep38.getQuote(quote.id);
```

### Using in SvelteKit

Pass SvelteKit's `fetch` to the client for proper SSR request context:

```typescript
// +page.ts
import { createTestAnchorPlaygroundClient } from '$lib/anchors/testanchor';
import { error } from '@sveltejs/kit';

export async function load({ fetch }) {
    const client = createTestAnchorPlaygroundClient(undefined, fetch);

    try {
        await client.initialize();
        return {
            client,
            sep24Info: client.sep24.getInfo(),
            sep6Info: client.sep6.getInfo(),
        };
    } catch (e) {
        error(500, { message: e instanceof Error ? e.message : 'Failed to initialize' });
    }
}
```

---

## Choosing between the two

- **`TestAnchorRampClient`** — use this if you're building production ramp UI. Methods return SEP types directly; explicit token passing makes it safe to share across requests.
- **`TestAnchorPlaygroundClient`** — use this if you're learning the SEP protocols or building a playground UI. The namespaced API (`client.sep24.deposit()`) reads like the SEP spec; the cached token is convenient for an interactive shell.

Both are independent and you can use either, neither, or both. The curated ramp pages (`/anchors/testanchor/...`) use `TestAnchorRampClient`; the standalone demo (`/testanchor`) uses `TestAnchorPlaygroundClient`.

## Implementing a similar client for another SEP-compliant anchor

`TestAnchorRampClient` is a small (~350 LOC) reference for how to wrap the SEP modules into a per-anchor client. Copy it, rename the class, change the default domain, and adjust `supportedTokens` to match the anchor's issuers. The discovery caching + endpoint resolution helpers (`toml()`, `endpoint()`) are the reusable bits — drop them in as-is.
