# API Client Functions

Per-provider browser wrappers around the SvelteKit proxy routes for **API-key anchors**. Svelte components call these functions to reach an anchor without importing server-side code or the API key.

```text
src/lib/api/
├── http.ts          <- shared fetch/JSON/error helpers (createApiRequester)
├── etherfuse.ts     <- wraps /api/anchor/etherfuse/*
├── koywe.ts         <- wraps /api/anchor/koywe/*
├── manteca.ts       <- wraps /api/anchor/manteca/*
└── chipper.ts       <- wraps /api/anchor/chipper/*
```

**SEP anchors don't have a wrapper here.** SeevCash, the test anchor, and the TR mock anchor hold no secrets, so their pages instantiate the anchor client (`SeevcashRampClient`, `TestAnchorRampClient`, `TrMockRampClient`) directly in the browser. See [`src/lib/anchors/README.md`](../anchors/README.md#where-clients-run).

## Why This Exists

API-key anchor clients (`$lib/anchors/<provider>/`) need a secret, so they run server-side only, behind route handlers at `/api/anchor/<provider>/`. The files in this directory provide typed functions that call those routes, so components don't need to hand-build `fetch` calls with the right URLs, methods, and error handling.

```text
Component (.svelte)
    │
    │  calls functions from $lib/api/<provider>
    ▼
API wrapper (this directory)
    │
    │  fetch('/api/anchor/<provider>/...')
    ▼
Route handler (src/routes/api/anchor/<provider>/.../+server.ts)
    │
    │  calls get<Provider>() from $lib/server/<provider>Instance
    ▼
Anchor client ($lib/anchors/<provider>/)
    │
    │  fetch to the external anchor API, with the key
    ▼
Anchor API (Etherfuse, Koywe, Manteca, Chipper)
```

Each provider gets its own wrapper module, mirroring the per-provider isolation in `$lib/anchors/`.

## Usage

Every function takes SvelteKit's `fetch` as its first argument, for proper cookie forwarding and SSR support.

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

| Function               | Route                             | Description                        |
| ---------------------- | --------------------------------- | ---------------------------------- |
| `createCustomer`       | `POST /customers`                 | Create a new customer + onboarding |
| `getCustomer`          | `GET /customers?customerId=`      | Fetch by ID                        |
| `getQuote`             | `POST /quotes`                    | Get a price quote                  |
| `createOnRampOrder`    | `POST /onramp`                    | Start a fiat-to-token order        |
| `getOnRampOrder`       | `GET /onramp?orderId=`            | Poll on-ramp order                 |
| `createOffRampOrder`   | `POST /offramp`                   | Start a token-to-fiat order        |
| `getOffRampOrder`      | `GET /offramp?orderId=`           | Poll off-ramp order (for burn XDR) |
| `listBankAccounts`     | `GET /bank-accounts?customerId=`  | List a customer's bank accounts    |
| `getKycUrl`            | `POST /kyc`                       | Get presigned KYC iframe URL       |
| `getKycStatus`         | `GET /kyc?customerId=&publicKey=` | Poll KYC status                    |
| `getAssets`            | `GET /assets?currency=&wallet=`   | List rampable assets               |
| `simulateFiatReceived` | `POST /sandbox`                   | Sandbox simulation                 |

All routes are under `/api/anchor/etherfuse/`. Errors throw `EtherfuseApiError`. Single-resource lookups return `null` on 404.

### Koywe, Manteca, Chipper

These follow the same pattern; read each module for its functions:

- **`koywe.ts`** (`KoyweApiError`): payment providers and token currencies, quotes, on/off-ramp orders, `submitTxHash`, order polling (`getOrder`, `getOrderByExternalId`), delegated KYC accounts, and payout bank accounts.
- **`manteca.ts`** (`MantecaApiError`): user onboarding (`createUser`, `submitOnboarding`, `definePersonalData`, `uploadIdentityImage`), quotes, ramp-on/ramp-off synthetics, `getSynthetic` polling, withdraw-destination validation, and the sandbox deposit.
- **`chipper.ts`** (`ChipperApiError`): capabilities, rate, destination validation, on/off-ramp orders, `getOrder` polling, and the sandbox bank deposit.

## Error Handling

Each wrapper has its own error class (`EtherfuseApiError`, `KoyweApiError`, `MantecaApiError`, `ChipperApiError`) with a numeric `statusCode` and a string message. Catch the specific class per provider:

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

Only API-key anchors need one. Add `src/lib/api/<name>.ts` with its own error class, build `apiRequest`/`postJson` from `createApiRequester` in `./http`, and write one function per route. Keep it to `fetch` + JSON marshaling; error mapping, validation, and business logic live server-side in the route handlers and the underlying client.
