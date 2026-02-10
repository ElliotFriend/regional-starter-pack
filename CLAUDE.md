# Stellar Regional Starter Pack - LLM Guide

This is a SvelteKit application for building fiat on/off ramps on the Stellar network. It includes a portable anchor integration library supporting both **SEP-compliant anchors** and **custom anchor APIs** (like AlfredPay).

## Project Structure

```
src/
├── lib/
│   ├── anchors/              # PORTABLE: Framework-agnostic anchor integrations
│   │   ├── types.ts          # Shared Anchor interface + common types
│   │   ├── sep/              # SEP protocol implementations (for compliant anchors)
│   │   │   ├── sep1.ts       # stellar.toml discovery
│   │   │   ├── sep10.ts      # Web authentication (JWT)
│   │   │   ├── sep6.ts       # Programmatic deposits/withdrawals
│   │   │   ├── sep12.ts      # KYC/customer management
│   │   │   ├── sep24.ts      # Interactive deposits/withdrawals
│   │   │   ├── sep31.ts      # Cross-border payments
│   │   │   ├── sep38.ts      # Anchor quotes (RFQ)
│   │   │   └── types.ts      # SEP-specific types
│   │   ├── alfredpay/        # AlfredPay integration (Mexico, non-SEP)
│   │   │   ├── client.ts     # AlfredPayClient implements Anchor interface
│   │   │   └── types.ts      # AlfredPay API types
│   │   ├── testanchor/       # Reference for testanchor.stellar.org
│   │   └── README.md         # Detailed library documentation
│   │
│   ├── wallet/               # Freighter wallet integration
│   └── stores/               # Svelte 5 reactive state (runes)
│
├── routes/
│   ├── testanchor/           # Test anchor demo page
│   └── api/
│       └── testanchor/       # CORS proxy endpoints for SEP-6/SEP-24
```

## Key Concepts

### Two Types of Anchor Integrations

1. **SEP-Compliant Anchors** (`/sep/`): Use the SEP modules directly. These implement Stellar protocols (SEP-1, 6, 10, 12, 24, 31, 38).

2. **Custom Anchor APIs** (`/alfredpay/`): For anchors with their own APIs (not SEP-compliant), implement the `Anchor` interface from `types.ts`. AlfredPay is the reference implementation.

### The Anchor Interface (`/types.ts`)

All custom anchor clients implement this interface:

```typescript
interface Anchor {
    createCustomer(input): Promise<Customer>;
    getQuote(input): Promise<Quote>;
    createOnRamp(input): Promise<OnRampTransaction>;
    createOffRamp(input): Promise<OffRampTransaction>;
    getKycIframeUrl(customerId): Promise<string>;
    // ... etc
}
```

This allows swapping anchor implementations without changing application code.

### AlfredPay Client (`/alfredpay/client.ts`)

Complete implementation for AlfredPay (Mexico, MXN via SPEI). Key features:

- Customer management with KYC
- Quotes for MXN ↔ USDC
- On-ramp: User pays MXN, receives USDC on Stellar
- Off-ramp: User sends USDC, receives MXN to bank
- Server-side only (uses API keys)

### SEP Library (`/sep/`)

SEP protocol implementations:

- Framework-agnostic (just `@stellar/stellar-sdk`)
- Optional `fetchFn` parameter for SSR
- Can be copied into any TypeScript project

**When modifying SEP modules:**

- Keep them framework-agnostic
- Maintain the `fetchFn` parameter pattern
- Update sep/types.ts for SEP-specific types
- Update sep/index.ts exports

### CORS Proxy Pattern

Browser requests to anchor endpoints fail due to CORS. The solution:

1. Create SvelteKit server endpoints (`/api/testanchor/sep6`, `/api/testanchor/sep24`)
2. Frontend calls local endpoint
3. Server proxies to anchor
4. Server returns response to frontend

See `/src/routes/api/testanchor/sep24/+server.ts` for the pattern.

### SEP Flow Sequence

Typical on/off ramp flow:

1. **SEP-1**: Discover anchor endpoints from stellar.toml
2. **SEP-10**: Authenticate user, get JWT token
3. **SEP-12**: Check/submit KYC (if required)
4. **SEP-38**: Get quote (optional)
5. **SEP-6/24**: Initiate deposit or withdrawal
6. Poll transaction status until complete

### Test Anchor

The `/testanchor` page demonstrates all SEP flows using Stellar's test anchor at `testanchor.stellar.org`. This operates on Stellar testnet with test assets (SRT, USDC).

## Common Tasks

### Adding a New Anchor Integration

1. Create directory: `/src/lib/anchors/[anchor-name]/`
2. Create `client.ts` with anchor-specific logic
3. Create `types.ts` for anchor-specific types
4. Create `index.ts` for exports
5. Add CORS proxy endpoints if needed

### Adding SEP Support

1. Create `/src/lib/anchors/sep/sep[N].ts`
2. Add types to `sep/types.ts`
3. Export from `sep/index.ts`
4. Document in `/src/lib/anchors/README.md`

### Adding a New Custom Anchor (like AlfredPay)

1. Create directory: `/src/lib/anchors/[anchor-name]/`
2. Create `client.ts` implementing the `Anchor` interface from `../types.ts`
3. Create `types.ts` for anchor-specific API types
4. Create `index.ts` exporting the client and types
5. Add CORS proxy endpoints in `/routes/api/` if needed
6. Document in `/src/lib/anchors/README.md`

Example structure:

```typescript
// client.ts
import type { Anchor, Customer, Quote } from '../types';
import { AnchorError } from '../types';

export class MyAnchorClient implements Anchor {
    readonly name = 'myanchor';

    constructor(private config: { apiKey: string }) {}

    async createCustomer(input) {
        /* ... */
    }
    async getQuote(input) {
        /* ... */
    }
    // ... implement all Anchor methods
}
```

### Working with Transactions

All SEP modules use common transaction statuses from `types.ts`:

- `pending_*` statuses indicate in-progress
- `completed`, `error`, `expired`, `refunded` are terminal
- Use `pollTransaction` helpers for status updates

## Tech Stack

- **SvelteKit** with Svelte 5 (uses runes: `$state`, `$derived`, `$effect`)
- **TypeScript** throughout
- **Tailwind CSS** for styling
- **@stellar/stellar-sdk** for Stellar blockchain
- **@stellar/freighter-api** for wallet connection

## Environment Variables

```env
ALFREDPAY_API_KEY=your-api-key
ALFREDPAY_API_SECRET=your-api-secret
ALFREDPAY_BASE_URL=https://api-service-co.alfredpay.app/api/v1/third-party-service/penny
```

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
