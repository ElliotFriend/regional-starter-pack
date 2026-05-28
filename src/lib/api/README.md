# API Client Functions

Per-provider client-side wrappers around the SvelteKit API routes. These functions are called by Svelte components to interact with anchor services without importing server-side code directly.

```text
src/lib/api/
├── etherfuse.ts     <- wraps /api/anchor/etherfuse/*
└── testanchor.ts    <- wraps /api/anchor/testanchor/*
```

## Why This Exists

The anchor client libraries (`$lib/anchors/`) require credentials (an API key, or a per-request SEP-10 token) and run server-side only. The SvelteKit route handlers at `/api/anchor/<provider>/` expose them to the browser. The files in this directory provide typed functions that call those routes, so components don't need to manually construct `fetch` calls with the right URLs, methods, and error handling.

```text
Component (.svelte)
    │
    │  calls functions from $lib/api/etherfuse or $lib/api/testanchor
    ▼
API client (this directory)
    │
    │  fetch('/api/anchor/<provider>/...')
    ▼
Route handler ('/api/anchor/<provider>/.../+server.ts')
    │
    │  calls getEtherfuse() / getTestAnchor() / requireBearer(request)
    ▼
Anchor client ($lib/anchors/<provider>/)
    │
    │  fetch to external anchor API
    ▼
Anchor API (Etherfuse, testanchor.stellar.org)
```

Each provider gets its own wrapper module, mirroring the per-provider isolation in `$lib/anchors/`.

## Usage

Every function takes SvelteKit's `fetch` as its first argument. This ensures proper cookie forwarding and SSR support. Functions that need a SEP-10 session token (testanchor) accept the token as an explicit argument, which is forwarded as `Authorization: Bearer ...`.

### Etherfuse

```svelte
<script lang="ts">
    import * as ef from '$lib/api/etherfuse';

    const customer = await ef.createCustomer(fetch, {
        publicKey: walletAddress,
        email,
        country: 'MX',
    });

    const kycUrl = await ef.getKycUrl(fetch, {
        customerId: customer.id,
        publicKey: walletAddress,
    });

    const quote = await ef.getQuote(fetch, {
        fromAsset: 'MXN',
        toAsset: 'CETES',
        sourceAmount: '1000',
        customerId: customer.id,
        stellarAddress: walletAddress,
    });

    const order = await ef.createOnRampOrder(fetch, {
        customerId: customer.id,
        quoteId: quote.id,
        publicKey: walletAddress,
    });

    // Poll
    const updated = await ef.getOnRampOrder(fetch, order.id);
</script>
```

| Function              | Route                                  | Description                          |
| --------------------- | -------------------------------------- | ------------------------------------ |
| `createCustomer`      | `POST /customers`                      | Create a new customer + onboarding   |
| `getCustomer`         | `GET /customers?customerId=`           | Fetch by ID                          |
| `getQuote`            | `POST /quotes`                         | Get a price quote                    |
| `createOnRampOrder`   | `POST /onramp`                         | Start a fiat-to-token order          |
| `getOnRampOrder`      | `GET /onramp?orderId=`                 | Poll on-ramp order                   |
| `createOffRampOrder`  | `POST /offramp`                        | Start a token-to-fiat order          |
| `getOffRampOrder`     | `GET /offramp?orderId=`                | Poll off-ramp order (for burn XDR)   |
| `listBankAccounts`    | `GET /bank-accounts?customerId=`       | List a customer's bank accounts      |
| `getKycUrl`           | `POST /kyc`                            | Get presigned KYC iframe URL         |
| `getKycStatus`        | `GET /kyc?customerId=&publicKey=`      | Poll KYC status                      |
| `getAssets`           | `GET /assets?currency=&wallet=`        | List rampable assets                 |
| `simulateFiatReceived` | `POST /sandbox`                       | Sandbox simulation                   |

All routes are under `/api/anchor/etherfuse/`. Errors throw `EtherfuseApiError`. Single-resource lookups return `null` on 404.

### Testanchor

The testanchor wrapper expects an explicit SEP-10 token argument on methods that require auth (`getCustomer`, `putCustomer`, `sep6Deposit`, `sep6Withdraw`, `getSep6Transaction`, `sep24Deposit`, `sep24Withdraw`, `getSep24Transaction`). Use `getChallenge` + `submitChallenge` to obtain one; the demo app caches it in `authStore` (`$lib/stores/auth`).

```svelte
<script lang="ts">
    import * as ta from '$lib/api/testanchor';
    import { authStore } from '$lib/stores/auth';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { walletStore } from '$lib/stores/wallet.svelte';

    async function ensureToken(): Promise<string> {
        const cached = authStore.get('testanchor', walletStore.publicKey!);
        if (cached) return cached;
        const challenge = await ta.getChallenge(fetch, walletStore.publicKey!);
        const { signedXdr } = await signWithFreighter(challenge.transaction, walletStore.network);
        const { token } = await ta.submitChallenge(fetch, signedXdr);
        authStore.set('testanchor', walletStore.publicKey!, token);
        return token;
    }

    const token = await ensureToken();

    const customer = await ta.getCustomer(fetch, token);
    if (customer.status === 'NEEDS_INFO') {
        await ta.putCustomer(fetch, token, {
            first_name: 'Test',
            last_name: 'User',
            email_address: 'test@example.com',
        });
    }

    const session = await ta.sep24Deposit(fetch, token, {
        asset_code: 'SRT',
        asset_issuer: 'GCDNJUBQSX...',
        account: walletStore.publicKey!,
    });
    window.open(session.url, '_blank');

    const tx = await ta.getSep24Transaction(fetch, token, session.id);
</script>
```

| Function              | Route                                       | Description                          |
| --------------------- | ------------------------------------------- | ------------------------------------ |
| `getChallenge`        | `POST /auth?action=challenge`               | Request SEP-10 challenge XDR         |
| `submitChallenge`     | `POST /auth?action=token`                   | Exchange signed XDR for JWT          |
| `getCustomer`         | `GET /customer` (Bearer)                    | SEP-12 customer fields + status      |
| `putCustomer`         | `PUT /customer` (Bearer)                    | Submit SEP-12 fields                 |
| `getPrice`            | `POST /price`                               | SEP-38 indicative price              |
| `sep6Deposit`         | `POST /sep6?action=deposit` (Bearer)        | SEP-6 deposit                        |
| `sep6Withdraw`        | `POST /sep6?action=withdraw` (Bearer)       | SEP-6 withdraw + signable XDR        |
| `getSep6Transaction`  | `GET /sep6?transactionId=` (Bearer)         | Poll SEP-6 transaction               |
| `sep24Deposit`        | `POST /sep24?action=deposit` (Bearer)       | SEP-24 deposit (hosted URL)          |
| `sep24Withdraw`       | `POST /sep24?action=withdraw` (Bearer)      | SEP-24 withdraw (hosted URL)         |
| `getSep24Transaction` | `GET /sep24?transactionId=` (Bearer)        | Poll SEP-24 transaction              |

All routes are under `/api/anchor/testanchor/`. Errors throw `TestAnchorApiError`. Single-resource lookups return `null` on 404.

## Error Handling

Each wrapper has its own error class (`EtherfuseApiError`, `TestAnchorApiError`) with a numeric `statusCode` and a string message. Catch the specific class per provider:

```typescript
import { EtherfuseApiError } from '$lib/api/etherfuse';

try {
    await ef.createOnRampOrder(fetch, args);
} catch (err) {
    if (err instanceof EtherfuseApiError) {
        console.error(err.statusCode, err.message);
    }
    throw err;
}
```

## Adding a wrapper for a new anchor

When you add a new curated anchor (`src/lib/anchors/<name>/`), add a matching `src/lib/api/<name>.ts` here that mirrors the same per-route function pattern. Keep it focused on `fetch` + JSON marshaling — the error mapping, validation, and business logic all live server-side in the route handlers and the underlying client.
