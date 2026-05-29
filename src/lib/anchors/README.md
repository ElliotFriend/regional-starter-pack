# Stellar Anchor Integration Library

A portable, framework-agnostic TypeScript library for integrating fiat on/off ramps on the Stellar network. The library is **per-provider**: each anchor lives in its own directory with its own client class, its own types, and its own error class. Pick the provider(s) you need and copy its directory.

## Directory Layout

```text
anchors/
├── etherfuse/       Etherfuse — API-key auth, Mexico (SPEI/CETES) + Brazil (PIX/TESOURO)
├── testanchor/      Reference clients for testanchor.stellar.org
├── sep/             Composable SEP protocol modules (sep1, sep6, sep10, sep12, sep24, sep31, sep38)
├── sandbox.ts       Shared sandbox helpers (test bank/PIX data)
└── README.md        ← you are here
```

Every subdirectory is **self-contained**: copying it into another project pulls in nothing else from this directory besides `sep/` (for SEP-compliant clients). The only external dependency is `@stellar/stellar-sdk`.

## Provider Index

| Provider        | Directory     | Region         | Auth    | Token shapes   |
| --------------- | ------------- | -------------- | ------- | -------------- |
| **Etherfuse**   | `etherfuse/`  | Mexico, Brazil | API key | CETES, TESOURO |
| **Test Anchor** | `testanchor/` | Testnet (SEP)  | SEP-10  | SRT, USDC      |

Each provider directory ships:

- A standalone client class (`EtherfuseClient`, `TestAnchorRampClient`).
- Its own `types.ts` defining the inputs, outputs, and error class used by that client.
- An `index.ts` that re-exports the public surface.
- A `README.md` with paste-target documentation.

Anchors that exist in a curated region but don't meet the project's quality criteria are tracked as **honorable mentions** in `src/lib/config/anchors.ts` (no client code).

---

## Etherfuse

API-key authenticated. Iframe-based hosted KYC + bank-account registration. Deferred signing on off-ramp.

```typescript
import { EtherfuseClient } from 'path/to/anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: 'https://api.sand.etherfuse.com',
});

const customer = await anchor.createCustomer({
    publicKey: 'GXYZ...',
    email: 'user@example.com',
    country: 'MX',
});

const kycUrl = await anchor.getKycUrl({
    customerId: customer.id,
    publicKey: 'GXYZ...',
});
// embed kycUrl in an iframe

const quote = await anchor.getQuote({
    fromAsset: 'MXN',
    toAsset: 'CETES',
    sourceAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

const order = await anchor.createOnRampOrder({
    customerId: customer.id,
    quoteId: quote.id,
    publicKey: 'GXYZ...',
});
// order.deposit is a discriminated union: { rail: 'spei', clabe, ... } | { rail: 'pix', pixCode, ... }
```

Off-ramp uses **deferred signing**: `createOffRampOrder()` returns immediately with no XDR. Poll `getOffRampOrder()` until `burnTransaction` is populated, then sign with the user's wallet and submit to Stellar. The anchor pays out fiat once the burn is confirmed.

See [`etherfuse/README.md`](etherfuse/README.md) for the complete reference.

---

## Test Anchor

The `testanchor/` directory ships **two** clients side-by-side:

### `TestAnchorRampClient` (curated)

A SEP-shaped wrapper used by the `/anchors/testanchor` ramp flows. Returns SEP types directly (`Sep6Transaction`, `Sep24InteractiveResponse`, `Sep12CustomerResponse`, `Sep10ChallengeResponse`, etc.). SEP-10 tokens are passed explicitly to each method.

```typescript
import { TestAnchorRampClient } from 'path/to/anchors/testanchor';

const anchor = new TestAnchorRampClient();

const challenge = await anchor.getChallenge(publicKey);
// sign client-side...
const { token } = await anchor.submitChallenge(signedXdr);

// SEP-24 interactive
const session = await anchor.sep24Deposit(token, {
    asset_code: 'SRT',
    asset_issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    account: publicKey,
});

// SEP-6 programmatic
const deposit = await anchor.sep6Deposit(token, {
    asset_code: 'SRT',
    funding_method: 'bank_account',
    account: publicKey,
    amount: '100',
});

// SEP-6 withdraw also returns a pre-built signable XDR for the user to sign with their wallet
const withdrawal = await anchor.sep6Withdraw(
    token,
    { asset_code: 'SRT', funding_method: 'bank_account', amount: '100' },
    publicKey,
);
// withdrawal.signableXdr — sign this with Freighter and submit
```

### `TestAnchorPlaygroundClient` (SEP playground)

A stateful, SEP-namespaced "playground" client used by the `/testanchor` protocol demo page. Methods like `client.sep24.deposit()`, `client.sep12.getCustomer()`. Good for learning the raw SEP protocols.

```typescript
import { createTestAnchorPlaygroundClient } from 'path/to/anchors/testanchor';

const client = createTestAnchorPlaygroundClient();
await client.initialize();
await client.authenticate(publicKey, signerFn);
const info = await client.sep24.getInfo();
```

See [`testanchor/README.md`](testanchor/README.md) for both clients' complete references.

---

## SEP Library

`sep/` contains pure-function implementations of:

| Module  | Protocol                                      | Description                       |
| ------- | --------------------------------------------- | --------------------------------- |
| `sep1`  | [SEP-1](https://stellar.org/protocol/sep-1)   | Stellar.toml discovery            |
| `sep10` | [SEP-10](https://stellar.org/protocol/sep-10) | Web authentication                |
| `sep6`  | [SEP-6](https://stellar.org/protocol/sep-6)   | Programmatic deposits/withdrawals |
| `sep12` | [SEP-12](https://stellar.org/protocol/sep-12) | KYC/customer management           |
| `sep24` | [SEP-24](https://stellar.org/protocol/sep-24) | Interactive deposits/withdrawals  |
| `sep31` | [SEP-31](https://stellar.org/protocol/sep-31) | Cross-border payments             |
| `sep38` | [SEP-38](https://stellar.org/protocol/sep-38) | Anchor RFQ (quotes)               |

All functions are framework-agnostic and accept an optional `fetchFn` parameter for SSR. Combine them to build a client against any SEP-compliant anchor.

```typescript
import { sep1, sep10, sep24 } from 'path/to/anchors/sep';

const toml = await sep1.fetchStellarToml('anchor.example.com');

const { token } = await sep10.authenticate(
    {
        authEndpoint: sep1.getSep10Endpoint(toml)!,
        serverSigningKey: sep1.getSigningKey(toml)!,
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        homeDomain: 'anchor.example.com',
    },
    publicKey,
    signerFunction,
);

const response = await sep24.deposit(sep1.getSep24Endpoint(toml)!, token, {
    asset_code: 'USDC',
    amount: '100',
});
```

See [`sep/README.md`](sep/README.md) for the full module reference.

---

## Implementing a New Anchor

Each anchor stands on its own. There is no shared interface to satisfy — your client should be shaped to match the anchor's actual API. Define your own error class so consumers can `instanceof` it cleanly.

```typescript
// anchors/myanchor/types.ts
export class MyAnchorError extends Error {
    code: string;
    statusCode: number;

    constructor(message: string, code: string, statusCode: number = 500) {
        super(message);
        this.name = 'MyAnchorError';
        this.code = code;
        this.statusCode = statusCode;
    }
}

export interface MyAnchorConfig {
    apiKey: string;
    baseUrl: string;
}

export interface CreateCustomerArgs {
    publicKey: string;
    email?: string;
}

export interface MyAnchorCustomer {
    id: string;
    publicKey: string;
    /* ... */
}
```

```typescript
// anchors/myanchor/client.ts
import { MyAnchorError, type MyAnchorConfig /*, ... */ } from './types';

export class MyAnchorClient {
    readonly name = 'myanchor';
    readonly displayName = 'My Anchor';
    readonly supportedTokens = [
        /* ... */
    ] as const;
    readonly supportedCurrencies = ['USD'] as const;
    readonly supportedRails = ['bank'] as const;

    private readonly config: MyAnchorConfig;

    constructor(config: MyAnchorConfig) {
        this.config = config;
    }

    async createCustomer(args: CreateCustomerArgs): Promise<MyAnchorCustomer> {
        const response = await fetch(`${this.config.baseUrl}/customers`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: args.email, publicKey: args.publicKey }),
        });

        if (!response.ok) {
            throw new MyAnchorError('Failed to create customer', 'CREATE_FAILED', response.status);
        }

        return response.json();
    }

    // ...
}
```

```typescript
// anchors/myanchor/index.ts
export { MyAnchorClient } from './client';
export { MyAnchorError } from './types';
export type * from './types';
```

For SEP-compliant anchors, follow the `TestAnchorRampClient` pattern: import the `sep/` modules and wrap them with discovery caching + an explicit token parameter.

---

## Common Patterns

### Returning typed errors

Each client defines its own `*Error` class with `code: string` and `statusCode: number`. Callers can narrow with `instanceof`:

```typescript
import { MyAnchorClient, MyAnchorError } from './anchors/myanchor';

try {
    await client.createCustomer({ publicKey, email });
} catch (err) {
    if (err instanceof MyAnchorError) {
        console.error(err.statusCode, err.code, err.message);
    }
    throw err;
}
```

### 404 returns null

Single-resource lookups (`getCustomer`, `getOrder`, etc.) should return `null` on 404 rather than throwing. List operations return `[]` on 404. This lets callers `await` without `try`/`catch` for "not found" expectations.

### Server-only

Clients that use API keys (e.g. Etherfuse) **must only run server-side**. Don't import them into browser code. The SvelteKit demo app routes Etherfuse calls through `/api/anchor/etherfuse/*` proxy routes so the key never reaches the client.

For SEP-10–authenticated clients, the token can travel to the browser via an `Authorization: Bearer ...` header on each request. The test anchor route handlers use `requireBearer(request)` for this pattern.

---

## CORS Note

Browser requests to anchor APIs typically fail due to CORS. Solutions:

1. **Server proxy** (recommended): create API routes that proxy to the anchor. The SvelteKit app does this at `/api/anchor/etherfuse/*` and `/api/anchor/testanchor/*`.
2. **Server-side only**: use the library only in server code (API routes, SSR).

---

## License

Apache-2.0
