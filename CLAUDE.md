# Stellar Regional Starter Pack - LLM Guide

This is a SvelteKit application for building fiat on/off ramps on the Stellar network. It includes a portable anchor integration library supporting three anchor providers (Etherfuse, AlfredPay, BlindPay) and a composable SEP protocol library for building against any SEP-compliant anchor.

## Project Structure

```text
src/
├── lib/
│   ├── anchors/              # PORTABLE: Framework-agnostic anchor integrations
│   │   ├── types.ts          # Shared Anchor interface + common types
│   │   ├── index.ts          # Re-exports (no SvelteKit imports)
│   │   ├── etherfuse/        # Etherfuse integration (Mexico)
│   │   │   ├── client.ts     # EtherfuseClient implements Anchor
│   │   │   ├── types.ts      # Etherfuse API types
│   │   │   └── README.md     # Integration documentation
│   │   ├── alfredpay/        # AlfredPay integration (Mexico)
│   │   │   ├── client.ts     # AlfredPayClient implements Anchor
│   │   │   ├── types.ts      # AlfredPay API types
│   │   │   └── README.md     # Integration documentation
│   │   ├── blindpay/         # BlindPay integration (global)
│   │   │   ├── client.ts     # BlindPayClient implements Anchor
│   │   │   ├── types.ts      # BlindPay API types
│   │   │   └── README.md     # Integration documentation
│   │   ├── sep/              # SEP protocol implementations
│   │   │   ├── sep1.ts       # stellar.toml discovery
│   │   │   ├── sep10.ts      # Web authentication (JWT)
│   │   │   ├── sep6.ts       # Programmatic deposits/withdrawals
│   │   │   ├── sep12.ts      # KYC/customer management
│   │   │   ├── sep24.ts      # Interactive deposits/withdrawals
│   │   │   ├── sep31.ts      # Cross-border payments
│   │   │   ├── sep38.ts      # Anchor quotes (RFQ)
│   │   │   └── types.ts      # SEP-specific types
│   │   └── testanchor/       # Reference client for testanchor.stellar.org
│   │
│   ├── server/               # SvelteKit-specific server code
│   │   └── anchorFactory.ts  # Anchor factory (reads $env, instantiates clients)
│   │
│   ├── wallet/               # Freighter wallet + Stellar helpers
│   │   ├── freighter.ts      # Freighter browser extension API
│   │   ├── stellar.ts        # Horizon, transaction building, trustlines
│   │   ├── types.ts          # Wallet types
│   │   └── index.ts          # Re-exports
│   │
│   ├── components/           # Svelte 5 UI components
│   │   ├── OnRampFlow.svelte      # Fiat -> crypto flow
│   │   ├── OffRampFlow.svelte     # Crypto -> fiat flow
│   │   ├── KycForm.svelte         # Form-based KYC (AlfredPay)
│   │   ├── KycIframe.svelte       # Iframe-based KYC (Etherfuse)
│   │   ├── QuoteDisplay.svelte    # Quote summary with countdown
│   │   ├── WalletConnect.svelte   # Freighter connection
│   │   └── ui/                    # Layout components (Header, Footer, etc.)
│   │
│   ├── stores/               # Svelte 5 reactive state (runes)
│   │   ├── wallet.svelte.ts  # Wallet connection state
│   │   └── customer.svelte.ts # Customer/KYC state
│   │
│   ├── config/
│   │   └── regions.ts        # Region, anchor, token, and payment rail config
│   │
│   ├── constants.ts          # App constants (currencies, providers, statuses)
│   │
│   └── utils/
│       └── status.ts         # Transaction status helpers
│
├── routes/
│   ├── anchors/              # Anchor listing and per-provider pages
│   │   ├── +page.svelte      # All anchors listing
│   │   └── [provider]/       # Dynamic provider routes
│   │       ├── +page.svelte  # Provider detail
│   │       ├── onramp/       # On-ramp page
│   │       └── offramp/      # Off-ramp page
│   ├── regions/              # Region listing and per-region pages
│   ├── testanchor/           # Test anchor SEP flow demo
│   └── api/
│       ├── anchor/           # Anchor API proxies
│       │   ├── [provider]/   # Per-provider endpoints
│       │   │   ├── customers/
│       │   │   ├── kyc/
│       │   │   ├── quotes/
│       │   │   ├── onramp/
│       │   │   ├── offramp/
│       │   │   ├── fiat-accounts/
│       │   │   ├── sandbox/
│       │   │   ├── payout-submit/
│       │   │   └── blockchain-wallets/
│       │   └── webhooks/
│       └── testanchor/       # SEP CORS proxy endpoints
│           ├── sep6/
│           └── sep24/
```

## Key Concepts

### Portability

The `/src/lib/anchors/` directory is **framework-agnostic**. It has no SvelteKit imports, no `$env` references, and depends only on `@stellar/stellar-sdk`. You can copy it into any TypeScript project.

The SvelteKit-specific anchor factory lives at `/src/lib/server/anchorFactory.ts`. It reads `$env/static/private` for API keys and instantiates anchor clients. Only `+server.ts` route handlers import from this module.

### The Anchor Interface (`/anchors/types.ts`)

All three anchor clients implement the shared `Anchor` interface:

```typescript
interface Anchor {
    readonly name: string;
    readonly capabilities: AnchorCapabilities;
    createCustomer(input): Promise<Customer>;
    getCustomer(id): Promise<Customer | null>;
    getCustomerByEmail?(email, country?): Promise<Customer | null>;
    getQuote(input): Promise<Quote>;
    createOnRamp(input): Promise<OnRampTransaction>;
    getOnRampTransaction(id): Promise<OnRampTransaction | null>;
    registerFiatAccount(input): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId): Promise<SavedFiatAccount[]>;
    createOffRamp(input): Promise<OffRampTransaction>;
    getOffRampTransaction(id): Promise<OffRampTransaction | null>;
    getKycUrl?(customerId, publicKey?, bankAccountId?): Promise<string>;
    getKycStatus(customerId, publicKey?): Promise<KycStatus>;
}
```

### Anchor Providers

**Etherfuse** (`/anchors/etherfuse/`) - Default provider. Latin America focus. Iframe-based KYC. On-ramp and off-ramp via SPEI (Mexico) and other regional payment rails. Uses CETES token. Off-ramp has deferred signing: the burn transaction XDR is not in the order creation response; it appears when polling `getOffRampTransaction()`.

**AlfredPay** (`/anchors/alfredpay/`) - Mexico focus. Form-based KYC. On-ramp and off-ramp via SPEI. Uses USDC. Supports email-based customer lookup.

**BlindPay** (`/anchors/blindpay/`) - Global. Redirect-based KYC. Uses USDB token. Requires separate blockchain wallet registration. Off-ramp uses a payout submission step instead of Stellar transaction signing.

### Anchor Factory (`/server/anchorFactory.ts`)

Server-side only. Maps provider names to configured client instances:

```typescript
import { getAnchor, isValidProvider } from '$lib/server/anchorFactory';
// type AnchorProvider = 'etherfuse' | 'alfredpay' | 'blindpay'
const anchor = getAnchor('etherfuse');
```

### SEP Library (`/anchors/sep/`)

SEP protocol implementations for building against any SEP-compliant anchor. Framework-agnostic.

- Optional `fetchFn` parameter for SSR
- Can be copied into any TypeScript project
- Depends only on `@stellar/stellar-sdk`

**When modifying SEP modules:**

- Keep them framework-agnostic (no SvelteKit imports)
- Maintain the `fetchFn` parameter pattern
- Update `sep/types.ts` for SEP-specific types
- Update `sep/index.ts` exports

### CORS Proxy Pattern

Browser requests to anchor APIs fail due to CORS. All anchor operations go through SvelteKit API routes:

1. Frontend calls `/api/anchor/[provider]/[operation]`
2. Server-side route handler calls `getAnchor(provider)` from `anchorFactory.ts`
3. Server proxies the request to the anchor API
4. Server returns the response to the frontend

For SEP flows (test anchor), separate proxy endpoints exist at `/api/testanchor/sep6` and `/api/testanchor/sep24`.

### Off-Ramp Signing Flow

The off-ramp flow differs by provider:

- **Etherfuse**: Order creation returns no signable transaction. The UI enters an `awaiting_signable` state and polls `getOffRampTransaction()` until the `signableTransaction` (burn XDR) appears. Then Freighter signs it and the transaction is submitted to Stellar.
- **AlfredPay**: The UI builds a USDC payment transaction to the anchor's Stellar address. Freighter signs and submits it.
- **BlindPay**: Uses a separate payout submission endpoint. No direct Stellar signing by the user.

### Region Configuration (`/config/regions.ts`)

Defines regions, anchors, payment rails, and tokens. The anchor order in all lists is: Etherfuse, AlfredPay, BlindPay.

### SEP Flow Sequence

For SEP-compliant anchors (test anchor demo):

1. **SEP-1**: Discover anchor endpoints from stellar.toml
2. **SEP-10**: Authenticate user, get JWT token
3. **SEP-12**: Check/submit KYC (if required)
4. **SEP-38**: Get quote (optional)
5. **SEP-6/24**: Initiate deposit or withdrawal
6. Poll transaction status until complete

## Common Tasks

### Adding a New Anchor Integration

1. Create directory: `/src/lib/anchors/[anchor-name]/`
2. Create `client.ts` implementing the `Anchor` interface from `../types.ts`
3. Create `types.ts` for anchor-specific API types
4. Create `index.ts` exporting the client and types
5. Add the provider to `src/lib/server/anchorFactory.ts` (import client, add env vars, add to switch case, add to `AnchorProvider` type)
6. Add to `src/lib/constants.ts` (`PROVIDER` object)
7. Add to `src/lib/config/regions.ts` (`ANCHORS` record, region `anchors` arrays)
8. Add CORS proxy API routes in `/routes/api/` if needed
9. Document in `/src/lib/anchors/[anchor-name]/README.md`

### Adding SEP Support

1. Create `/src/lib/anchors/sep/sep[N].ts`
2. Add types to `sep/types.ts`
3. Export from `sep/index.ts`

### Working with Transactions

All anchor clients return transactions with common statuses from `types.ts`:

- `pending`, `processing` - in-progress
- `completed`, `failed`, `expired`, `cancelled`, `refunded` - terminal

The `OffRampTransaction` type includes optional fields for provider-specific data:

- `signableTransaction` - Pre-built XDR for signing (Etherfuse)
- `statusPage` - URL to anchor-hosted status page (Etherfuse)
- `feeBps` / `feeAmount` - Fee info

## Environment Variables

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

# Stellar (public, accessible client-side)
PUBLIC_STELLAR_NETWORK="testnet"
PUBLIC_USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
```

## Tech Stack

- **SvelteKit** with Svelte 5 (uses runes: `$state`, `$derived`, `$effect`)
- **TypeScript** throughout
- **Tailwind CSS** for styling
- **@stellar/stellar-sdk** for Stellar blockchain
- **@stellar/freighter-api** for wallet connection

---

## Svelte MCP Tools

You have access to the Svelte MCP server for comprehensive Svelte 5 and SvelteKit documentation.

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
