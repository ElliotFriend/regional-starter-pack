# Stellar Anchor Integration Library

A portable, framework-agnostic TypeScript library for integrating fiat on/off ramps on the Stellar network. The library is **per-provider**: each anchor lives in its own directory with its own client class, its own types, and its own error class. Pick the provider(s) you need and copy its directory.

## Directory Layout

```text
anchors/
├── etherfuse/       Etherfuse: API key; Mexico (SPEI/CETES) + Brazil (PIX/TESOURO)
├── koywe/           Koywe: clientId/secret; Argentina, Mexico, Colombia (USDC)
├── manteca/         Manteca: API key; Brazil, Argentina, Colombia (USDC)
├── chipper/         Chipper: API key; Ghana, Kenya mobile money (USDC)
├── seevcash/        SeevCash: SEP anchor; Ghana mobile money (USDC)
├── testanchor/      Reference clients for testanchor.stellar.org (SEP-6 + SEP-24, and a playground)
├── trmock/          TR Mock Anchor: SEP sandbox stand-in for Türkiye (FAST, USDC)
├── sep/             Composable SEP protocol modules (sep1, sep6, sep10, sep12, sep24, sep31, sep38)
└── README.md        ← you are here
```

Every subdirectory is **self-contained**: copying it into another project pulls in nothing else from this directory besides `sep/` (for SEP-compliant clients). The only external dependency is `@stellar/stellar-sdk`.

## Provider Index

| Provider        | Directory     | Client                 | Error class                     | Auth            | Runs in           |
| --------------- | ------------- | ---------------------- | ------------------------------- | --------------- | ----------------- |
| **Etherfuse**   | `etherfuse/`  | `EtherfuseClient`      | `EtherfuseError`                | API key         | Server only       |
| **Koywe**       | `koywe/`      | `KoyweClient`          | `KoyweError`                    | clientId/secret | Server only       |
| **Manteca**     | `manteca/`    | `MantecaClient`        | `MantecaError`                  | API key         | Server only       |
| **Chipper**     | `chipper/`    | `ChipperClient`        | `ChipperError`                  | API key         | Server only       |
| **SeevCash**    | `seevcash/`   | `SeevcashRampClient`   | `SeevcashError`                 | SEP-10          | Browser or server |
| **Test Anchor** | `testanchor/` | `TestAnchorRampClient` | `TestAnchorSepUnsupportedError` | SEP-10          | Browser or server |
| **TR Mock**     | `trmock/`     | `TrMockRampClient`     | `TrMockError`                   | SEP-10          | Browser or server |

Each provider directory ships a client class, its types and error class, an `index.ts` that re-exports the public surface, and a `README.md` with paste-target documentation. Proprietary APIs use `client.ts` + `types.ts`; SEP wrappers use `ramp.ts` and take their types from `sep/types.ts`.

Anchors that don't clear the project's two-lens bar (**commercial**: local value for end users; **developer**: buildability) are tracked as **honorable mentions** in `src/lib/config/anchors.ts`, with no client code.

---

## Where clients run

**API-key anchors must run server-side.** Never import `EtherfuseClient`, `KoyweClient`, `MantecaClient`, or `ChipperClient` into browser code. The demo app proxies them through `/api/anchor/<name>/*` routes so the key never reaches the client.

**SEP anchors can run in the browser.** They hold no secrets: the user's wallet signs the SEP-10 challenge, and the token stays with the user. The demo pages instantiate `SeevcashRampClient`, `TestAnchorRampClient`, and `TrMockRampClient` directly. This only works when the anchor serves CORS on its SEP endpoints, so check before relying on it:

- `stellar.toml` and `GET /auth` return `Access-Control-Allow-Origin`.
- Preflights for `POST /auth`, `PUT /customer`, and authenticated `GET`s allow `Authorization` and `Content-Type`.
- Error responses (400/401/403/404) carry the header too, or the browser hides the anchor's error message.

All three SEP anchors above pass, with one known gap: the test anchor's 403 for a missing or invalid token has no CORS header, so a browser sees a generic network error instead. If an anchor's CORS is broken, proxy it through your backend instead.

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

See [`etherfuse/README.md`](etherfuse/README.md) for the complete reference. Koywe, Manteca, and Chipper follow the same server-side pattern; see their READMEs.

---

## SEP anchors

`SeevcashRampClient`, `TestAnchorRampClient`, and `TrMockRampClient` are thin wrappers over the `sep/` modules. Each one discovers endpoints from the anchor's `stellar.toml` (cached), takes the SEP-10 token explicitly on every call, and returns SEP-defined types directly (`Sep6Transaction`, `Sep12CustomerResponse`, `Sep24InteractiveResponse`, ...).

```typescript
import { TestAnchorRampClient } from 'path/to/anchors/testanchor';

const anchor = new TestAnchorRampClient();

const challenge = await anchor.getChallenge(publicKey);
// sign with the user's wallet...
const { token } = await anchor.submitChallenge(signedXdr);

// SEP-24 interactive: open session.url for the anchor's hosted flow
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
```

### Withdrawals: the wallet sends the payment

For an off-ramp, the user's wallet pays the anchor on Stellar. Where the payment details come from depends on the flow:

- **SEP-6**, when the `/withdraw` response includes `account_id`: `sep6Withdraw()` returns a ready `signableXdr`.
- **SEP-6 without `account_id`** (allowed by the spec, and what the test anchor does): `signableXdr` is `null`. Poll the transaction until `pending_user_transfer_start`, when it carries `withdraw_anchor_account` and `withdraw_memo`.
- **SEP-24**: always deferred. The hosted flow sets the amount, and the transaction carries the details once it reaches `pending_user_transfer_start`.

For the deferred cases, build the payment with `buildWithdrawalPaymentXdr(transaction, sourceAccount, assetCode, amount?)` **when the user confirms**: the XDR has a 180-second timebound and a sequence number, so building it early risks `tx_too_late` or `tx_bad_seq`.

```typescript
const tx = await anchor.getSep24Transaction(token, session.id);
if (tx?.status === 'pending_user_transfer_start' && tx.withdraw_anchor_account) {
    const xdr = await anchor.buildWithdrawalPaymentXdr(tx, publicKey, 'SRT'); // amount defaults to amount_in
    // sign xdr with the user's wallet and submit to Horizon
}
```

`testanchor/` also ships `TestAnchorPlaygroundClient`, a stateful, SEP-namespaced client (`client.sep24.deposit()`, `client.sep12.getCustomer()`) used by the `/testanchor` protocol demo page. See [`testanchor/README.md`](testanchor/README.md), [`seevcash/README.md`](seevcash/README.md), and [`trmock/README.md`](trmock/README.md).

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

All modules are framework-agnostic. Network calls accept an optional `fetchFn` (except `sep1.fetchStellarToml`, which uses the SDK's resolver). Combine them to build a client against any SEP-compliant anchor.

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

Each anchor stands on its own. There is no shared interface to satisfy; shape your client to match the anchor's actual API. Define your own error class so consumers can `instanceof` it cleanly.

**For a SEP-compliant anchor**, start from `seevcash/ramp.ts` (the smallest SEP wrapper): read endpoints from the toml, take the token explicitly, and wrap SEP errors in your own error class.

**For a proprietary API**, the shape looks like this:

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
    /** Log requests and responses (never credentials). Off by default. */
    debug?: boolean;
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

---

## Common Patterns

### Typed errors

Each client defines its own `*Error` class with a `statusCode` (and usually a `code`). Callers narrow with `instanceof`:

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

Single-resource lookups (`getCustomer`, `getOrder`, `getTransaction`, ...) return `null` on 404 rather than throwing. List operations return `[]` on 404. This lets callers `await` without `try`/`catch` for "not found" expectations.

### Debug logging

Every client takes `debug?: boolean`, off by default. When set, it logs requests, responses, and errors; when not, it logs nothing. It never logs credentials or SEP-10 tokens, even in debug.

### Browser safety

Clients that may run in the browser avoid Node-only APIs (decode base64 with `atob`, not `Buffer`) and never call the global `fetch` as a method of the client object, which browsers reject with "Illegal invocation".

---

## License

Apache-2.0
