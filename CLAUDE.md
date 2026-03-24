# Stellar Regional Starter Pack - LLM Guide

This is a SvelteKit application for building fiat on/off ramps on the Stellar network. It includes a portable anchor integration library supporting three anchor providers (Etherfuse, AlfredPay, BlindPay) and a composable SEP protocol library for building against any SEP-compliant anchor.

## Project Structure

- `src/lib/anchors/` — **Portable**, framework-agnostic anchor integrations. No SvelteKit imports. Each provider (`etherfuse/`, `alfredpay/`, `blindpay/`) has `client.ts` (implements `Anchor`), `types.ts`, and `README.md`. Also contains `sep/` (SEP protocol modules) and `testanchor/` (reference client).
- `src/lib/api/anchor.ts` — Client-side API functions that call `/api/anchor/[provider]/` routes. Used by Svelte components to interact with anchors without importing server code.
- `src/lib/server/anchorFactory.ts` — Server-only. Reads `$env/static/private`, instantiates anchor clients.
- `src/lib/wallet/` — Freighter wallet extension API + Stellar helpers (Horizon, transactions, trustlines).
- `src/lib/components/` — Svelte 5 UI components. Top-level: flow components (`OnRampFlow`, `OffRampFlow`, `RampPage`), KYC (`KycForm`, `KycIframe`, `KycStatusDisplay`), `QuoteDisplay`, `WalletConnect`. Subdirectories: `ramp/` (step sub-components: `AmountInput`, `QuoteStep`, `FiatAccountStep`, `CompletionStep`, `TrustlineStatus`), `ui/` (layout + utility: `Header`, `Footer`, `Sidebar`, `DevBox`, `ErrorAlert`, `CopyableField`).
- `src/lib/stores/` — Svelte 5 reactive state (runes): `wallet.svelte.ts`, `customer.svelte.ts`.
- `src/lib/config/` — Three files (no barrel): `anchors.ts` (UI metadata), `regions.ts` (region definitions + cross-lookups), `rails.ts` (payment rail definitions). Token data lives on `Anchor` client classes, not in config.
- `src/lib/utils/` — `status.ts` (transaction status helpers), `currency.ts` (formatting), `quote.ts` (expiration), `stellar-asset.ts` (asset resolution).
- `src/lib/constants.ts` — App constants (providers, statuses).
- `src/routes/` — `anchors/` (listing + `[provider]/` with `onramp/`, `offramp/`), `regions/` (listing + `[region]/`), `testanchor/` (SEP demo), `api/anchor/[provider]/` (CORS proxy endpoints per operation), `api/testanchor/` (SEP proxy).

## Key Concepts

### Portability

The `/src/lib/anchors/` directory is **framework-agnostic**. It has no SvelteKit imports, no `$env` references, and depends only on `@stellar/stellar-sdk`. You can copy it into any TypeScript project.

The SvelteKit-specific anchor factory lives at `/src/lib/server/anchorFactory.ts`. It reads `$env/static/private` for API keys and instantiates anchor clients. Only `+server.ts` route handlers import from this module.

### The Anchor Interface (`/anchors/types.ts`)

All three anchor clients implement the shared `Anchor` interface:

```typescript
interface Anchor {
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: AnchorCapabilities;
    readonly supportedTokens: readonly TokenInfo[];
    readonly supportedCurrencies: readonly string[];
    readonly supportedRails: readonly string[];
    createCustomer(input: CreateCustomerInput): Promise<Customer>;
    getCustomer(input: GetCustomerInput): Promise<Customer | null>;
    getQuote(input: GetQuoteInput): Promise<Quote>;
    createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction>;
    getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null>;
    registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount>;
    getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]>;
    createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction>;
    getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null>;
    getKycUrl?(customerId, publicKey?, bankAccountId?): Promise<string>;
    getKycStatus(customerId: string, publicKey?: string): Promise<KycStatus>;
    getKycRequirements?(country?: string): Promise<KycRequirements>;
    submitKyc?(customerId: string, data: KycSubmissionData): Promise<KycSubmissionResult>;
}
```

Each client also declares `displayName`, `supportedTokens` (with Stellar issuers from `TokenInfo`), `supportedCurrencies` (ISO codes), and `supportedRails` (rail identifiers). This makes the portable library self-contained — no external token or config registry required.

### AnchorCapabilities

The `AnchorCapabilities` interface (in `anchors/types.ts`) carries both runtime and UI capability flags. Flow components use these flags instead of provider-name checks:

- `kycFlow`: `'form'` | `'iframe'` | `'redirect'` — determines KYC presentation
- `kycUrl`: anchor provides a URL-based KYC/onboarding flow
- `emailLookup`: anchor supports looking up customers by email
- `requiresTos`: anchor requires ToS acceptance before customer creation
- `deferredOffRampSigning`: anchor provides signable XDR via polling (not at creation time)
- `requiresBankBeforeQuote`: off-ramp requires bank account selection before quoting
- `requiresBlockchainWalletRegistration`: on-ramp requires wallet registration step
- `requiresAnchorPayoutSubmission`: off-ramp uses anchor payout endpoint instead of direct Stellar submission
- `requiresOffRampSigning`: off-ramp requires wallet-side XDR signing
- `sandbox`: anchor supports sandbox simulation
- `sep6`, `sep24`: anchor supports SEP-6/SEP-24 flows

### Anchor Providers

**Etherfuse** (`/anchors/etherfuse/`) - Default provider. Latin America focus. Iframe-based KYC (`kycFlow: 'iframe'`). On-ramp and off-ramp via SPEI (Mexico) and other regional payment rails. Uses CETES token. Off-ramp has deferred signing (`deferredOffRampSigning: true`): the burn transaction XDR is not in the order creation response; it appears when polling `getOffRampTransaction()`.

**AlfredPay** (`/anchors/alfredpay/`) - Mexico focus. Form-based KYC (`kycFlow: 'form'`). On-ramp and off-ramp via SPEI. Uses USDC. Supports email-based customer lookup (`emailLookup: true`).

**BlindPay** (`/anchors/blindpay/`) - Global. Redirect-based KYC (`kycFlow: 'redirect'`). Uses USDB token. Requires separate blockchain wallet registration (`requiresBlockchainWalletRegistration: true`). Off-ramp uses a payout submission step (`requiresAnchorPayoutSubmission: true`) instead of Stellar transaction signing. Requires bank account before quoting (`requiresBankBeforeQuote: true`).

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

### Configuration (`/config/`)

Config is split across three files with no barrel `index.ts`. Token data (issuers, names) lives on the `Anchor` client classes, not in config.

- **`rails.ts`** — `PaymentRail` type, `PAYMENT_RAILS` data, `getPaymentRail()` helper
- **`anchors.ts`** — `AnchorProfile` type (config-side UI metadata: descriptions, integration flows, dev onboarding — distinct from the runtime `Anchor` interface), `ANCHORS` data, `getAnchor()`, `getAllAnchors()`
- **`regions.ts`** — `Region` type, `REGIONS` data, `getRegion()`, `getAllRegions()`, `getAnchorsForRegion()`, `getRegionsForAnchor()`

The anchor order in all lists is: Etherfuse, AlfredPay, BlindPay. Fiat currency is derived from region config (`region.currency`) and passed as a prop to flow components — not hardcoded.

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
2. Create `client.ts` implementing the `Anchor` interface from `../types.ts` — set `displayName`, `supportedTokens` (with issuers), `supportedCurrencies`, `supportedRails`, and all relevant `AnchorCapabilities` flags
3. Create `types.ts` for anchor-specific API types
4. Create `index.ts` exporting the client class and types
5. Add the provider to `src/lib/server/anchorFactory.ts` (import client, add env vars, add to switch case, add to `AnchorProvider` type)
6. Add to `src/lib/constants.ts` (`PROVIDER` object)
7. Add to `src/lib/config/anchors.ts` (`ANCHORS` record — UI metadata only: description, links, integration flow)
8. Add to `src/lib/config/regions.ts` (region `anchors` arrays)
9. Add CORS proxy API routes in `/routes/api/` if needed
10. Document in `/src/lib/anchors/[anchor-name]/README.md`

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

## Linting Conventions

- Internal `<a href>` links must use `resolve()` from `$app/paths`: `<a href={resolve('/path')}>`
- `{#each}` blocks must have a key: `{#each items as item (item.id)}`
- Unused interface implementation params use `_` prefix (ESLint config has `argsIgnorePattern: '^_'`)
- Run `pnpm lint` (prettier + eslint) to check

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

## Development Approach

### Test-Driven Development (TDD)

This project follows a test-driven development approach. When adding new features or integrations:

1. **RED**: Write comprehensive failing tests first — cover config, client methods, status mappings, error paths, and edge cases
2. **GREEN**: Implement the code to make all tests pass
3. **VERIFY**: Run `pnpm test:run` to confirm all tests pass before any other verification step

Tests use **Vitest** + **MSW** (Mock Service Worker) and live in `tests/`. Follow existing patterns in `tests/anchors/` for anchor client tests and `tests/config/` for config tests.

Use `pnpm format` for code formatting (not `npx prettier`).
