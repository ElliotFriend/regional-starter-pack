# Stellar Regional Starter Pack

A SvelteKit application and portable library for building fiat on/off ramps on the Stellar network. Includes integrations for three anchor providers -- Etherfuse, AlfredPay, and BlindPay -- as well as a composable SEP protocol library for building against any SEP-compliant anchor.

## TL;DR: The Most Important Thing

This demo is a fully functional application that you can test out and interact with and (usually) even get some Testnet tokens from the onramp simulations! But, it's also a tool and a resource.

**The [`/src/lib/anchors/`](./src/lib/anchors/) directory contains a portable, drop-in anchor integration that should work out-of-the-box!** Copy that directory (or just parts of it) into any TypeScript project you're building, and your project can interact with any of the anchors. Super easy. Barely an inconvenience!

## What's Inside

```text
src/lib/anchors/          <- PORTABLE: Copy into any TypeScript project
  types.ts                <- Shared Anchor interface + common types
  etherfuse/              <- Etherfuse integration (Latin America)
  alfredpay/              <- AlfredPay integration (Mexico)
  blindpay/               <- BlindPay integration (global)
  sep/                    <- SEP protocol implementations
  testanchor/             <- Reference client for testanchor.stellar.org

src/lib/server/           <- SvelteKit-specific server code
  anchorFactory.ts        <- Anchor factory (reads env vars, instantiates clients)

src/lib/wallet/           <- Freighter wallet + Stellar helpers
src/lib/stores/           <- Svelte 5 reactive state (runes)
src/lib/components/       <- On/off ramp UI components
src/lib/config/           <- Anchors, regions, tokens, and payment rail configuration
src/routes/               <- SvelteKit pages and API routes
```

## Quick Start

```bash
cp .env.example .env      # Configure API keys
pnpm install              # Install dependencies
pnpm dev                  # Run development server
pnpm check                # Type check
pnpm build                # Build for production
```

---

## Using the Anchor Library

The `/src/lib/anchors/` directory is **framework-agnostic** and designed to be copied into any TypeScript project. Each anchor client implements a shared `Anchor` interface, so swapping providers requires no changes to your application logic.

### The Anchor Interface

All custom clients implement this interface from `types.ts`:

```typescript
interface Anchor {
    readonly name: string;
    readonly capabilities: AnchorCapabilities;
    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(customerId: string): Promise<Customer | null>;
    getCustomerByEmail?(email: string, country?: string): Promise<Customer | null>;
    getQuote(input: GetQuoteInput): Promise<Quote>;
    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;
    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;
    getKycUrl?(customerId: string, publicKey?: string, bankAccountId?: string): Promise<string>;
    getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus>;
}
```

### Anchor Providers

| Provider      | Region               | Fiat Currency | Token | Payment Rail | KYC Flow |
| ------------- | -------------------- | ------------- | ----- | ------------ | -------- |
| **Etherfuse** | Mexico               | MXN           | CETES | SPEI         | iframe   |
| **AlfredPay** | Mexico               | MXN           | USDC  | SPEI         | form     |
| **BlindPay**  | Global (Mexico demo) | MXN           | USDB  | SPEI         | redirect |

Each provider has its own directory under `/src/lib/anchors/` with a `README.md` containing detailed setup, usage examples, and flow documentation.

### Example: Etherfuse

```typescript
import { EtherfuseClient } from './anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: 'your-api-key',
    baseUrl: 'https://api.sand.etherfuse.com', // sandbox
});

// 1. Create customer (returns KYC onboarding URL)
const customer = await anchor.createCustomer({
    email: 'user@example.com',
    publicKey: 'GXYZ...',
    country: 'MX',
});

// 2. Get quote (MXN -> CETES)
const quote = await anchor.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

// 3. Create on-ramp order
const onramp = await anchor.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    amount: '1000',
    bankAccountId: customer.bankAccountId!,
});
```

### Example: SEP-Compliant Anchors

For anchors that implement Stellar SEP protocols, use the `/sep/` modules directly:

```typescript
import { fetchStellarToml, authenticate, sep24 } from './anchors/sep';

// 1. Discover anchor endpoints
const toml = await fetchStellarToml('testanchor.stellar.org');

// 2. Authenticate
const token = await authenticate(
    {
        authEndpoint: toml.WEB_AUTH_ENDPOINT!,
        serverSigningKey: toml.SIGNING_KEY!,
        networkPassphrase: 'Test SDF Network ; September 2015',
    },
    userPublicKey,
    signerFunction,
);

// 3. Start interactive deposit
const response = await sep24.deposit(toml.TRANSFER_SERVER_SEP0024!, token, {
    asset_code: 'USDC',
    amount: '100',
});

window.open(response.url, '_blank');
```

---

## Architecture

### Server-Side Anchor Factory

Anchor clients require API keys and should only be instantiated server-side. The factory at `src/lib/server/anchorFactory.ts` reads environment variables and returns configured client instances:

```typescript
// In a +server.ts route handler:
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';

const anchor = getAnchor('etherfuse'); // Returns configured EtherfuseClient
```

This separation keeps the anchor library (`src/lib/anchors/`) portable and free of SvelteKit imports.

### API Routes

All anchor operations are proxied through SvelteKit API routes at `/api/anchor/[provider]/`:

```text
/api/anchor/[provider]/customers      - Customer creation and lookup
/api/anchor/[provider]/kyc            - KYC status and iframe URLs
/api/anchor/[provider]/quotes         - Quote generation
/api/anchor/[provider]/onramp         - On-ramp order creation and status
/api/anchor/[provider]/offramp        - Off-ramp order creation and status
/api/anchor/[provider]/fiat-accounts  - Bank account registration
/api/anchor/[provider]/sandbox        - Sandbox-only operations (KYC completion, fiat simulation)
/api/anchor/[provider]/payout-submit  - Payout submission (BlindPay)
/api/anchor/[provider]/blockchain-wallets - Blockchain wallet registration (BlindPay)
/api/anchor/webhooks                  - Webhook handler (AlfredPay)
```

For the test anchor (SEP flows), separate proxy endpoints handle CORS:

```text
/api/testanchor/sep6   - SEP-6 proxy
/api/testanchor/sep24  - SEP-24 proxy
```

### UI Components

The on-ramp and off-ramp flows are implemented as Svelte components:

- `OnRampFlow.svelte` - Fiat to crypto flow (customer -> quote -> payment instructions -> status polling)
- `OffRampFlow.svelte` - Crypto to fiat flow (customer -> quote -> bank selection -> signing -> status polling)
- `KycForm.svelte` / `KycIframe.svelte` - KYC collection (form-based or iframe-based depending on provider)
- `QuoteDisplay.svelte` - Quote summary with countdown timer
- `WalletConnect.svelte` - Freighter wallet connection

### Pages

```text
/                       - Home page
/anchors                - Anchor provider listing
/anchors/[provider]     - Provider detail page
/anchors/[provider]/onramp   - On-ramp page
/anchors/[provider]/offramp  - Off-ramp page
/regions                - Region listing
/regions/[region]       - Region detail with available anchors
/testanchor             - SEP flow demo with testanchor.stellar.org
```

---

## SEP Module Reference

| Module  | Protocol                                      | Description                       |
| ------- | --------------------------------------------- | --------------------------------- |
| `sep1`  | [SEP-1](https://stellar.org/protocol/sep-1)   | Stellar.toml discovery            |
| `sep10` | [SEP-10](https://stellar.org/protocol/sep-10) | Web authentication                |
| `sep6`  | [SEP-6](https://stellar.org/protocol/sep-6)   | Programmatic deposits/withdrawals |
| `sep12` | [SEP-12](https://stellar.org/protocol/sep-12) | KYC/customer management           |
| `sep24` | [SEP-24](https://stellar.org/protocol/sep-24) | Interactive deposits/withdrawals  |
| `sep31` | [SEP-31](https://stellar.org/protocol/sep-31) | Cross-border payments             |
| `sep38` | [SEP-38](https://stellar.org/protocol/sep-38) | Anchor quotes (RFQ)               |

SEP modules are framework-agnostic. They accept an optional `fetchFn` parameter for SSR and depend only on `@stellar/stellar-sdk`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```env
# Etherfuse
ETHERFUSE_API_KEY=""
ETHERFUSE_BASE_URL="https://api.sand.etherfuse.com"

# AlfredPay
ALFREDPAY_API_KEY=""
ALFREDPAY_API_SECRET=""
ALFREDPAY_BASE_URL="https://penny-api-restricted-dev.alfredpay.io/api/v1/third-party-service/penny"

# BlindPay
BLINDPAY_API_KEY=""
BLINDPAY_INSTANCE_ID=""
BLINDPAY_BASE_URL="https://api.blindpay.com"

# Webhooks
ALFREDPAY_WEBHOOK_SECRET=""

# Stellar Network
PUBLIC_STELLAR_NETWORK="testnet"
PUBLIC_USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
```

## Tech Stack

- **SvelteKit** - Full-stack framework
- **Svelte 5** - UI with runes (`$state`, `$derived`, `$effect`)
- **TypeScript** - Type safety throughout
- **Tailwind CSS** - Styling
- **@stellar/stellar-sdk** - Stellar blockchain interaction
- **@stellar/freighter-api** - Wallet connection (Freighter browser extension)

## Adding a New Anchor

1. Create `/src/lib/anchors/[anchor-name]/` with `client.ts`, `types.ts`, and `index.ts`
2. Implement the `Anchor` interface from `../types.ts` — set all relevant `AnchorCapabilities` flags
3. Add the provider to `src/lib/server/anchorFactory.ts` (env vars, factory switch case)
4. Add the provider to `src/lib/constants.ts` (`PROVIDER` object)
5. Add the provider to `src/lib/config/anchors.ts` (`ANCHORS` record with matching capabilities)
6. Add the provider to `src/lib/config/regions.ts` (region `anchors` arrays)
7. Add API route proxies if needed for CORS
8. Document in `/src/lib/anchors/[anchor-name]/README.md`

## License

Apache-2.0
