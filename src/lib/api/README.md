# API Client Functions

Client-side wrappers around the `/api/anchor/[provider]/` route handlers. These functions are called by Svelte components to interact with anchor services without importing server-side code directly.

## Why This Exists

The anchor client libraries (`$lib/anchors/`) require credentials (an API key, or a per-request SEP-10 token) and run server-side only. The SvelteKit route handlers at `/api/anchor/[provider]/` expose them to the browser. This file provides typed functions that call those routes, so components don't need to manually construct `fetch` calls with the right URLs, methods, and error handling.

```text
Component (.svelte)
    │
    │  calls functions from $lib/api/anchor
    ▼
API client (this file)
    │
    │  fetch('/api/anchor/[provider]/...')
    ▼
Route handler ('/api/anchor/[provider]/.../+server.ts')
    │
    │  calls getAnchor(provider) / requireProgrammatic / requireInteractive / requireAuth
    ▼
Anchor client ($lib/anchors/*)
    │
    │  fetch to external anchor API
    ▼
Anchor API (Etherfuse, Test Anchor)
```

## Usage

Every function takes SvelteKit's `fetch` as its first argument and a provider name as its second. This ensures proper cookie forwarding and SSR support. Facet methods that need a SEP-10 session token accept a trailing `auth` argument, which is forwarded as a bearer token (API-key anchors like Etherfuse ignore it).

```svelte
<script lang="ts">
    import { getOrCreateCustomer, getQuote, createOnRamp } from '$lib/api/anchor';

    // SvelteKit provides fetch in load functions; in components, use the global fetch
    const customer = await getOrCreateCustomer(fetch, 'etherfuse', email, 'MX', {
        supportsEmailLookup: false,
        publicKey: walletAddress,
    });

    const quote = await getQuote(fetch, 'etherfuse', {
        fromCurrency: 'MXN',
        toCurrency: 'CETES',
        fromAmount: '1000',
        customerId: customer.id,
        stellarAddress: walletAddress,
    });

    const tx = await createOnRamp(fetch, 'etherfuse', {
        customerId: customer.id,
        quoteId: quote.id,
        stellarAddress: walletAddress,
        fromCurrency: 'MXN',
        toCurrency: 'CETES',
        amount: '1000',
    });
</script>
```

For wallet-authenticated anchors (e.g. the test anchor), run the SEP-10 handshake first and thread the token into subsequent calls:

```ts
import { getAuthChallenge, submitAuthChallenge, startInteractive } from '$lib/api/anchor';

const { transactionXdr } = await getAuthChallenge(fetch, 'testanchor', walletAddress);
const signedXdr = await signWithWallet(transactionXdr);
const { token } = await submitAuthChallenge(fetch, 'testanchor', signedXdr);

const session = await startInteractive(fetch, 'testanchor', {
    direction: 'onramp',
    assetCode: 'SRT',
    account: walletAddress,
    auth: token,
});
window.open(session.interactiveUrl, '_blank');
```

## Functions

### Programmatic facet (SEP-6 archetype)

| Function                  | Route                        | Description                                                                        |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `getCustomerByEmail`      | `GET /customers`             | Look up customer by email                                                          |
| `createCustomer`          | `POST /customers`            | Create a new customer                                                              |
| `getOrCreateCustomer`     | GET then POST `/customers`   | Find or create, respects `supportsEmailLookup`                                     |
| `getQuote`                | `POST /quotes`               | Get a price quote                                                                  |
| `createOnRamp`            | `POST /onramp`               | Start a fiat-to-crypto transaction                                                 |
| `getOnRampTransaction`    | `GET /onramp`                | Poll on-ramp status                                                                |
| `createOffRamp`           | `POST /offramp`              | Start a crypto-to-fiat transaction                                                 |
| `getOffRampTransaction`   | `GET /offramp`               | Poll off-ramp status                                                               |
| `getFiatAccounts`         | `GET /fiat-accounts`         | List saved bank accounts                                                           |
| `registerFiatAccount`     | `POST /fiat-accounts`        | Register a bank account                                                            |
| `getKycFieldRequirements` | `GET /kyc?type=requirements` | Get required KYC fields (discovers per-customer when `auth`/`transactionId` given) |
| `submitKyc`               | `POST /kyc?type=submit-kyc`  | Submit KYC fields + documents                                                      |
| `getKycStatus`            | `GET /kyc?type=status`       | Check KYC status                                                                   |
| `getKycUrl`               | `GET /kyc?type=iframe`       | Get KYC/onboarding URL                                                             |

### Auth facet (SEP-10 handshake)

| Function              | Route                         | Description                                     |
| --------------------- | ----------------------------- | ----------------------------------------------- |
| `getAuthChallenge`    | `POST /auth?action=challenge` | Request a challenge XDR to sign (leg 1)         |
| `submitAuthChallenge` | `POST /auth?action=token`     | Exchange a signed challenge for a token (leg 2) |

### Interactive facet (SEP-24 archetype)

| Function                    | Route               | Description                                      |
| --------------------------- | ------------------- | ------------------------------------------------ |
| `startInteractive`          | `POST /interactive` | Start a hosted on/off-ramp session (`direction`) |
| `getInteractiveTransaction` | `GET /interactive`  | Poll a hosted session's transaction status       |

### Sandbox (testing only)

| Function               | Route           | Description                            |
| ---------------------- | --------------- | -------------------------------------- |
| `simulateFiatReceived` | `POST /sandbox` | Simulate a fiat payment received event |

All routes are prefixed with `/api/anchor/[provider]`.

## Error Handling

All functions throw `ApiError` on non-2xx responses. Functions that look up a single resource (`getCustomerByEmail`, `getOnRampTransaction`, `getOffRampTransaction`, `getInteractiveTransaction`) return `null` on 404 instead of throwing.

```typescript
import { ApiError } from '$lib/api/anchor';

try {
    await createOnRamp(fetch, provider, options);
} catch (err) {
    if (err instanceof ApiError) {
        console.error(err.statusCode, err.message);
    }
}
```
