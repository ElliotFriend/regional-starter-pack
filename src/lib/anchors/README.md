# Stellar Anchor Integration Library

A portable, framework-agnostic TypeScript library for integrating fiat on/off ramps on the Stellar network. Includes a curated anchor client, a reference SEP-composed client, and a composable SEP protocol library.

## What's in This Library

1. A shared, **faceted** "Anchor Interface" in `anchors/types.ts`. Every anchor client adheres to this predictable shape.
2. A pre-written client for the curated provider, **Etherfuse**, in `anchors/etherfuse/`.
3. A **SEP library** in `anchors/sep/` for interacting with any SEP-compatible anchor (the preferred method when an anchor speaks SEP).
4. A **Test Anchor** client in `anchors/testanchor/` that composes the SEP library into a dual-archetype `Anchor` for the [testnet anchor](https://testanchor.stellar.org).

## Two Ways to Integrate Anchors

### 1. Custom Anchor APIs (use the `Anchor` interface)

For anchors with their own APIs (Etherfuse), the client implements the shared `Anchor` interface. This gives you a consistent surface regardless of the underlying API.

### 2. SEP-Compliant Anchors (use `/sep/`)

For anchors that follow Stellar SEP protocols (SEP-1, 6, 10, 12, 24, 31, 38), use the SEP modules directly. The `testanchor/` client composes these modules into the `Anchor` interface as a reference.

---

## The Anchor Interface

The `Anchor` interface (from `types.ts`) is **faceted**: shared identity/metadata plus up to three optional capability facets. At least one of `programmatic`/`interactive` must be present, and a single provider may expose both (the test anchor does).

```typescript
interface Anchor {
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: AnchorCapabilities;
    readonly supportedTokens: readonly TokenInfo[];
    readonly supportedCurrencies: readonly string[];
    readonly supportedRails: readonly string[];

    // Wallet-signature auth (SEP-10), if the anchor authenticates the end user via their wallet
    readonly auth?: WalletAuthOps;
    // SEP-6 archetype: app-orchestrated
    readonly programmatic?: ProgrammaticOps;
    // SEP-24 archetype: anchor-hosted
    readonly interactive?: InteractiveOps;
}
```

Consumers narrow on facet presence, e.g. `if (anchor.interactive) { ... }`.

### `WalletAuthOps` (SEP-10)

```typescript
interface WalletAuthOps {
    getChallenge(account: string): Promise<AuthChallenge>; // returns XDR to sign
    submitChallenge(signedTransactionXdr: string): Promise<AuthSession>; // returns { token }
}
```

The handshake is split so signing can happen client-side (e.g. Freighter). The resulting token is threaded into facet methods via their optional trailing `auth?` argument. Anchors that authenticate server-side (e.g. Etherfuse's API key) omit this facet and ignore the `auth?` argument.

### `ProgrammaticOps` (SEP-6 archetype)

The partner app collects customer/KYC/fiat details and renders payment instructions in its own UI.

```typescript
interface ProgrammaticOps {
    createCustomer(input: CreateCustomerInput, auth?: string): Promise<Customer>;
    getCustomer(input: GetCustomerInput, auth?: string): Promise<Customer | null>;
    getQuote(input: GetQuoteInput, auth?: string): Promise<Quote>;
    createOnRamp(input: CreateOnRampInput, auth?: string): Promise<OnRampTransaction>;
    getOnRampTransaction(id: string, auth?: string): Promise<OnRampTransaction | null>;
    getFiatAccounts(customerId: string, auth?: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput, auth?: string): Promise<OffRampTransaction>;
    getOffRampTransaction(id: string, auth?: string): Promise<OffRampTransaction | null>;
    getKycStatus(customerId: string, publicKey?: string, auth?: string): Promise<KycStatus>;

    // Optional, depending on the anchor:
    registerFiatAccount?(
        input: RegisterFiatAccountInput,
        auth?: string,
    ): Promise<RegisteredFiatAccount>;
    getKycUrl?(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string>;
    getKycRequirements?(query?: KycRequirementsQuery): Promise<KycRequirements>;
    submitKyc?(
        customerId: string,
        data: KycSubmissionData,
        auth?: string,
    ): Promise<KycSubmissionResult>;
}
```

### `InteractiveOps` (SEP-24 archetype)

The anchor hosts the whole customer-facing flow. The app starts a session, opens the hosted URL, and polls.

```typescript
interface InteractiveOps {
    startOnRamp(input: StartInteractiveInput): Promise<InteractiveSession>; // { interactiveUrl, transactionId }
    startOffRamp(input: StartInteractiveInput): Promise<InteractiveSession>;
    getOnRampTransaction(id: string, auth?: string): Promise<OnRampTransaction | null>;
    getOffRampTransaction(id: string, auth?: string): Promise<OffRampTransaction | null>;
    getQuote?(input: GetQuoteInput, auth?: string): Promise<Quote>; // optional pre-flight quote
}
```

Each client also declares its own `displayName`, `supportedTokens` (with Stellar issuers), `supportedCurrencies` (ISO codes), and `supportedRails` (rail identifiers) — so the portable library is fully self-contained, with no external token or config registry required.

---

## Anchor Providers

### Etherfuse

Latin America. **`programmatic` facet only** — authenticates server-side with an API key (no `auth` facet) and orchestrates the flow from the app (no `interactive` facet). Iframe-based KYC. Mexico (MXN ↔ CETES via SPEI) and Brazil (BRL ↔ TESOURO via PIX). Off-ramp uses deferred signing.

**Capabilities:** `kycFlow: 'iframe'`, `kycUrl`, `requiresOffRampSigning`, `deferredOffRampSigning`, `fiatAccountRegistration: 'hosted'`, `sandbox`, `sandboxFiatSimulation`, `flowStyles: ['programmatic']`

```typescript
import { EtherfuseClient } from 'path/to/anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: 'https://api.sand.etherfuse.com',
});

// Operations live on the programmatic facet:
const customer = await anchor.programmatic.createCustomer({
    email: 'user@example.com',
    publicKey: 'GXYZ...',
    country: 'MX',
});

const kycUrl = await anchor.programmatic.getKycUrl!(customer.id, 'GXYZ...');

const quote = await anchor.programmatic.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

const onramp = await anchor.programmatic.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    amount: '1000',
});
```

**Off-ramp note:** Etherfuse off-ramp uses deferred signing (`deferredOffRampSigning: true`). The `createOffRamp()` response does **not** include the burn transaction XDR. Poll `getOffRampTransaction()` until `signableTransaction` appears, then sign it with the user's wallet and submit to Stellar.

See [`etherfuse/README.md`](etherfuse/README.md) for complete documentation.

### Test Anchor

Testnet reference client for [testanchor.stellar.org](https://testanchor.stellar.org). Implements **all three facets** — `auth` (SEP-10), `programmatic` (SEP-6/12/38), and `interactive` (SEP-24) — by composing the `/sep/` modules. Stateless across calls (SEP-10 tokens are passed per-call), so a single instance is safe to share server-side.

```typescript
import { createTestAnchorAdapter } from 'path/to/anchors/testanchor';

const anchor = createTestAnchorAdapter();

const { transactionXdr } = await anchor.auth!.getChallenge(publicKey);
// ...sign client-side...
const { token } = await anchor.auth!.submitChallenge(signedXdr);

const session = await anchor.interactive!.startOnRamp({
    assetCode: 'SRT',
    account: publicKey,
    auth: token,
});
```

See [`testanchor/README.md`](testanchor/README.md) for both the faceted adapter and the standalone SEP "playground" client.

> Anchors that exist in a region but don't meet the project's five quality criteria are tracked as **honorable mentions** in `src/lib/config/anchors.ts` (no client code).

---

## Quick Start: SEP-Compliant Anchor

Copy `/sep/` into your project for SEP protocol support.

```typescript
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep24Endpoint,
    authenticate,
    sep24,
} from 'path/to/anchors/sep';

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

Create a new directory and implement the faceted `Anchor` interface. Provide at least one of `programmatic`/`interactive` (plus `auth` if the anchor uses wallet-based auth):

```typescript
import type {
    Anchor,
    AnchorCapabilities,
    ProgrammaticOps,
    TokenInfo,
    Customer,
    CreateCustomerInput /* ... */,
} from 'path/to/anchors/types';
import { AnchorError } from 'path/to/anchors/types';

export class MyAnchorClient implements Anchor {
    readonly name = 'myanchor';
    readonly displayName = 'My Anchor';
    readonly capabilities: AnchorCapabilities = {
        kycUrl: true,
        kycFlow: 'iframe', // 'form' | 'iframe' | 'redirect'
        sandbox: true,
        flowStyles: ['programmatic'], // which archetype(s) this anchor presents
        // deferredOffRampSigning, requiresBankBeforeQuote, fiatAccountRegistration, ...
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDC',
            name: 'USD Coin',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['MXN'];
    readonly supportedRails: readonly string[] = ['spei'];

    constructor(private config: { apiKey: string; baseUrl: string }) {}

    // Group the facet's operations behind the facet key:
    readonly programmatic: ProgrammaticOps = {
        createCustomer: async (input: CreateCustomerInput): Promise<Customer> => {
            const response = await fetch(`${this.config.baseUrl}/customers`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: input.email }),
            });

            if (!response.ok) {
                throw new AnchorError(
                    'Failed to create customer',
                    'CREATE_FAILED',
                    response.status,
                );
            }

            return this.mapToCustomer(await response.json());
        },
        // ... implement the rest of ProgrammaticOps
    };
}
```

Use arrow functions inside the facet object so `this` binds to the client instance. See `etherfuse/client.ts` (programmatic only) and `testanchor/anchor.ts` (all three facets) for complete patterns.

---

## SEP Module Reference

### SEP-1: Stellar.toml Discovery

```typescript
import {
    fetchStellarToml,
    getSep10Endpoint,
    getSep24Endpoint,
    supportsSep,
} from 'path/to/anchors/sep';

const toml = await fetchStellarToml('anchor.example.com');

if (supportsSep(toml, 24)) {
    console.log('SEP-24:', getSep24Endpoint(toml));
}
```

### SEP-10: Web Authentication

```typescript
import { authenticate, isTokenExpired, createAuthHeaders } from 'path/to/anchors/sep';

const token = await authenticate(config, publicKey, signerFn);

if (isTokenExpired(token)) {
    // Re-authenticate
}

const headers = createAuthHeaders(token);
```

### SEP-6: Programmatic Deposits/Withdrawals

```typescript
import { sep6 } from 'path/to/anchors/sep';

const deposit = await sep6.deposit(server, token, {
    asset_code: 'USDC',
    account: publicKey,
    funding_method: 'bank_account', // current SEP-6 param (replaces the deprecated `type`)
    amount: '100',
});
console.log('Instructions:', deposit.instructions);
```

### SEP-12: KYC Management

```typescript
import { sep12 } from 'path/to/anchors/sep';

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
import { sep24 } from 'path/to/anchors/sep';

const response = await sep24.deposit(server, token, { asset_code: 'USDC' });
window.open(response.url, '_blank');

const tx = await sep24.pollTransaction(server, token, response.id, {
    onStatusChange: (tx) => console.log(tx.status),
});
```

### SEP-31: Cross-Border Payments

```typescript
import { sep31 } from 'path/to/anchors/sep';

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
import { sep38 } from 'path/to/anchors/sep';

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
    signableTransaction?: string; // Pre-built XDR for signing (Etherfuse deferred signing)
    interactiveUrl?: string; // Anchor-hosted interactive flow (SEP-24)
    statusPage?: string; // Anchor-hosted status page URL (Etherfuse)
    feeBps?: number; // Fee in basis points
    feeAmount?: string; // Fee as a string amount
}
```

### Error Handling

```typescript
import { AnchorError } from 'path/to/anchors/types';

try {
    await anchor.programmatic!.createOnRamp({ ... });
} catch (error) {
    if (error instanceof AnchorError) {
        console.error('Code:', error.code); // e.g. 'CREATE_FAILED'
        console.error('Status:', error.statusCode); // e.g. 400
        console.error('Message:', error.message);
    }
}
```

---

## Installation / Copying

1. Copy the directories you need:
    - `/etherfuse/` for the Etherfuse provider
    - `/testanchor/` for the SEP-composed reference client
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
