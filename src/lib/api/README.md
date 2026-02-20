# API Client Functions

Client-side wrappers around the `/api/anchor/[provider]/` route handlers. These functions are called by Svelte components to interact with anchor services without importing server-side code directly.

## Why This Exists

The anchor client libraries (`$lib/anchors/`) require API keys and run server-side only. The SvelteKit route handlers at `/api/anchor/[provider]/` expose them to the browser. This file provides typed functions that call those routes, so components don't need to manually construct `fetch` calls with the right URLs, methods, and error handling.

```
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
    │  calls getAnchor(provider) from anchorFactory
    ▼
Anchor client ($lib/anchors/*)
    │
    │  fetch to external anchor API
    ▼
Anchor API (Etherfuse, AlfredPay, BlindPay)
```

## Usage

Every function takes SvelteKit's `fetch` as its first argument and a provider name as its second. This ensures proper cookie forwarding and SSR support.

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

## Functions

| Function                   | Route                        | Description                                    |
| -------------------------- | ---------------------------- | ---------------------------------------------- |
| `getCustomerByEmail`       | `GET /customers`             | Look up customer by email                      |
| `createCustomer`           | `POST /customers`            | Create a new customer                          |
| `getOrCreateCustomer`      | GET then POST `/customers`   | Find or create, respects `supportsEmailLookup` |
| `getQuote`                 | `POST /quotes`               | Get a price quote                              |
| `createOnRamp`             | `POST /onramp`               | Start a fiat-to-crypto transaction             |
| `getOnRampTransaction`     | `GET /onramp`                | Poll on-ramp status                            |
| `createOffRamp`            | `POST /offramp`              | Start a crypto-to-fiat transaction             |
| `getOffRampTransaction`    | `GET /offramp`               | Poll off-ramp status                           |
| `getFiatAccounts`          | `GET /fiat-accounts`         | List saved bank accounts                       |
| `registerFiatAccount`      | `POST /fiat-accounts`        | Register a bank account                        |
| `getKycStatus`             | `GET /kyc?type=status`       | Check KYC status                               |
| `getKycUrl`                | `GET /kyc?type=iframe`       | Get KYC/onboarding URL                         |
| `getKycRequirements`       | `GET /kyc?type=requirements` | Get required KYC fields (AlfredPay)            |
| `submitKycData`            | `POST /kyc?type=data`        | Submit KYC data (AlfredPay)                    |
| `submitKycFile`            | `POST /kyc?type=file`        | Upload KYC document (AlfredPay)                |
| `finalizeKycSubmission`    | `POST /kyc?type=submit`      | Finalize KYC for review (AlfredPay)            |
| `getBlindPayTosUrl`        | `GET /kyc?type=tos`          | Get ToS acceptance URL (BlindPay)              |
| `createBlindPayReceiver`   | `POST /kyc?type=receiver`    | Create receiver with KYC (BlindPay)            |
| `registerBlockchainWallet` | `POST /blockchain-wallets`   | Register a wallet (BlindPay)                   |
| `submitSignedPayout`       | `POST /payout-submit`        | Submit signed XDR (BlindPay)                   |
| `completeKycSandbox`       | `POST /sandbox`              | Auto-approve KYC (sandbox only)                |
| `simulateFiatReceived`     | `POST /sandbox`              | Simulate SPEI payment (sandbox only)           |

All routes are prefixed with `/api/anchor/[provider]`.

## Error Handling

All functions throw `ApiError` on non-2xx responses. Functions that look up a single resource (`getCustomerByEmail`, `getOnRampTransaction`, `getOffRampTransaction`) return `null` on 404 instead of throwing.

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
