# Stellar Regional Starter Pack

A SvelteKit application and portable library for building fiat on/off ramps on the Stellar network. Includes integrations for both **SEP-compliant anchors** and **custom anchor APIs** (like AlfredPay).

## What's Inside

```text
src/lib/anchors/          <- PORTABLE: Copy into any project
├── types.ts              <- Shared Anchor interface
├── sep/                  <- SEP protocol implementations
│   ├── sep1.ts           <- Stellar.toml discovery
│   ├── sep10.ts          <- Web authentication (JWT)
│   ├── sep6.ts           <- Programmatic deposits/withdrawals
│   ├── sep12.ts          <- KYC/customer management
│   ├── sep24.ts          <- Interactive deposits/withdrawals
│   ├── sep31.ts          <- Cross-border payments
│   └── sep38.ts          <- Anchor quotes (RFQ)
├── alfredpay/            <- AlfredPay integration (Mexico, non-SEP)
│   ├── client.ts         <- Complete API client
│   └── types.ts          <- AlfredPay-specific types
└── testanchor/           <- Reference for testanchor.stellar.org

src/lib/wallet/           <- Freighter wallet integration
src/lib/stores/           <- Svelte 5 reactive state
src/routes/               <- SvelteKit pages and API routes
```

## Quick Start

```bash
pnpm install    # Install dependencies
pnpm dev        # Run development server
pnpm check      # Type check
pnpm build      # Build for production
```

---

## Using the Anchor Library

The `/src/lib/anchors/` directory is designed to be **copy/paste portable**. Pick what you need:

### Option 1: SEP-Compliant Anchors

For anchors that implement Stellar SEP protocols, copy `/sep/` into your project.

```typescript
import { fetchStellarToml, authenticate, sep24Deposit } from './anchors/sep';

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
  signerFunction
);

// 3. Start interactive deposit
const response = await sep24Deposit(toml.TRANSFER_SERVER_SEP0024!, token, {
  asset_code: 'USDC',
  amount: '100',
});

window.open(response.url, '_blank');
```

### Option 2: Custom Anchor APIs (AlfredPay)

For anchors with their own API (not SEP-compliant), copy `/alfredpay/` and `/types.ts`.

```typescript
import { AlfredPayClient } from './anchors/alfredpay';

// Initialize (server-side only)
const anchor = new AlfredPayClient({
  apiKey: process.env.ALFREDPAY_API_KEY!,
  apiSecret: process.env.ALFREDPAY_API_SECRET!,
  baseUrl: 'https://api-service-co.alfredpay.app/api/v1/third-party-service/penny'
});

// Create customer
const customer = await anchor.createCustomer({
  email: 'user@example.com',
  stellarAddress: 'GXYZ...',
  country: 'MX'
});

// Get quote (MXN → USDC)
const quote = await anchor.getQuote({
  fromCurrency: 'MXN',
  toCurrency: 'USDC',
  fromAmount: '1000'
});

// Create on-ramp
const onramp = await anchor.createOnRamp({
  customerId: customer.id,
  quoteId: quote.id,
  stellarAddress: 'GXYZ...',
  fromCurrency: 'MXN',
  toCurrency: 'USDC',
  amount: '1000'
});

// User pays via SPEI
console.log('CLABE:', onramp.paymentInstructions?.clabe);
console.log('Reference:', onramp.paymentInstructions?.reference);
```

### The Anchor Interface

All custom clients implement a shared `Anchor` interface for consistency:

```typescript
interface Anchor {
  createCustomer(input): Promise<Customer>;
  getCustomer(id): Promise<Customer | null>;
  getQuote(input): Promise<Quote>;
  createOnRamp(input): Promise<OnRampTransaction>;
  createOffRamp(input): Promise<OffRampTransaction>;
  getKycIframeUrl(customerId): Promise<string>;
  // ... and more
}
```

This means you can swap anchor implementations without changing your application logic.

---

## SEP Module Reference

| Module | Protocol | Description |
| ------- | ---------- | ------------- |
| `sep1` | [SEP-1](https://stellar.org/protocol/sep-1) | Stellar.toml discovery |
| `sep10` | [SEP-10](https://stellar.org/protocol/sep-10) | Web authentication |
| `sep6` | [SEP-6](https://stellar.org/protocol/sep-6) | Programmatic deposits/withdrawals |
| `sep12` | [SEP-12](https://stellar.org/protocol/sep-12) | KYC/customer management |
| `sep24` | [SEP-24](https://stellar.org/protocol/sep-24) | Interactive deposits/withdrawals |
| `sep31` | [SEP-31](https://stellar.org/protocol/sep-31) | Cross-border payments |
| `sep38` | [SEP-38](https://stellar.org/protocol/sep-38) | Anchor quotes (RFQ) |

## AlfredPay Reference

AlfredPay provides MXN on/off ramps for Mexico via SPEI bank transfers.

| Method | Description |
| -------- | ------------- |
| `createCustomer()` | Create new customer |
| `getQuote()` | Get exchange rate |
| `createOnRamp()` | Fiat → Crypto (MXN → USDC) |
| `createOffRamp()` | Crypto → Fiat (USDC → MXN) |
| `registerFiatAccount()` | Register bank account |
| `getKycIframeUrl()` | Get KYC verification URL |
| `submitKycData()` | Programmatic KYC submission |

See [`/src/lib/anchors/README.md`](src/lib/anchors/README.md) for complete documentation.

---

## Demo Pages

### `/testanchor`

Interactive demo using Stellar's test anchor. Test SEP flows without real money on testnet.

### Architecture

```text
Browser                          Server                         Anchor
   │                                │                              │
   │  1. Connect Freighter          │                              │
   │──────────────────────>│        │                              │
   │                                │                              │
   │  2. SEP-10 Auth                │                              │
   │──────────────────────────────────────────────────────────────>│
   │<──────────────────────────────────────────────────────────────│
   │                                │                              │
   │  3. Deposit (via proxy)        │                              │
   │───────────────────────>│───────────────────────────────────>│
   │<───────────────────────│<───────────────────────────────────│
```

**Note:** Browser requests to anchors typically fail due to CORS. Use server-side proxy endpoints (see `/api/testanchor/`).

---

## Environment Variables

```env
# AlfredPay (Mexico)
ALFREDPAY_API_KEY=your-api-key
ALFREDPAY_API_SECRET=your-api-secret
ALFREDPAY_BASE_URL=https://api-service-co.alfredpay.app/api/v1/third-party-service/penny
```

## Tech Stack

- **SvelteKit** - Full-stack framework
- **Svelte 5** - UI with runes (`$state`, `$derived`, `$effect`)
- **TypeScript** - Type safety throughout
- **Tailwind CSS** - Styling
- **@stellar/stellar-sdk** - Stellar blockchain
- **@stellar/freighter-api** - Wallet integration

## Adding a New Anchor

1. Create `/src/lib/anchors/[anchor-name]/`
2. Implement the `Anchor` interface from `types.ts`
3. Add API route proxies if needed for CORS
4. Document in `/src/lib/anchors/README.md`

## License

Apache-2.0
