# Stellar Regional Starter Pack

A SvelteKit application and portable library for building fiat on/off ramps on the Stellar network using locally denominated assets. It includes one curated anchor provider (Etherfuse), a reference client for the Stellar test anchor, and a composable SEP protocol library for building against any SEP-compliant anchor.

The project curates anchor integrations that meet five quality criteria: locally denominated assets on Stellar, local payment-rail support, competitive rates (<25 bps), well-documented developer access, and deep liquidity. Anchors that exist in a region but don't clear the bar appear as **honorable mentions** on the region pages rather than as integrations.

## TL;DR: The Most Important Thing

This demo is a fully functional application you can test out and interact with — and (usually) even pull some Testnet tokens from the on-ramp simulations! But it's also a tool and a resource.

**The [`/src/lib/anchors/`](./src/lib/anchors/) and [`/src/lib/wallet/`](./src/lib/wallet/) directories are portable, framework-agnostic TypeScript libraries that should work out-of-the-box!** Copy them (or just the parts you need) into any TypeScript project, and your project can interact with the anchors and the Stellar network. Super easy. Barely an inconvenience!

## What's Inside

```text
src/lib/anchors/          <- PORTABLE: Copy into any TypeScript project
  types.ts                <- Shared (faceted) Anchor interface + common types
  sandbox.ts              <- Shared sandbox helpers
  etherfuse/              <- Etherfuse integration (Latin America) — programmatic facet
  sep/                    <- SEP protocol implementations (SEP-1/6/10/12/24/31/38)
  testanchor/             <- Reference client for testanchor.stellar.org (all three facets)

src/lib/wallet/           <- PORTABLE: Freighter wallet + Stellar helpers

src/lib/server/           <- SvelteKit-specific server code
  anchorFactory.ts        <- Anchor factory (reads $env, instantiates clients)

src/lib/stores/           <- Svelte 5 reactive state (runes)
src/lib/components/       <- On/off ramp UI components
src/lib/config/           <- Anchors, regions, and payment-rail configuration
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

The `Anchor` interface (from `types.ts`) is **faceted**: shared identity/metadata plus up to three optional capability facets. At least one of `programmatic`/`interactive` must be present, and a single provider may expose both.

```typescript
interface Anchor {
    readonly name: string;
    readonly displayName: string;
    readonly capabilities: AnchorCapabilities; // includes flowStyles: ('programmatic'|'interactive')[]
    readonly supportedTokens: readonly TokenInfo[];
    readonly supportedCurrencies: readonly string[];
    readonly supportedRails: readonly string[];

    readonly auth?: WalletAuthOps; // SEP-10 wallet auth (getChallenge/submitChallenge), if used
    readonly programmatic?: ProgrammaticOps; // SEP-6 archetype: app-orchestrated
    readonly interactive?: InteractiveOps; // SEP-24 archetype: anchor-hosted
}
```

- **`programmatic`** (SEP-6 style) — the app collects customer/KYC/fiat details and renders payment instructions itself: `createCustomer`, `getCustomer`, `getQuote`, `createOnRamp`/`createOffRamp`, `get*Transaction`, `getFiatAccounts`, plus optional `registerFiatAccount`/`getKycUrl`/`getKycRequirements`/`submitKyc`/`getKycStatus`.
- **`interactive`** (SEP-24 style) — the anchor hosts the whole flow: `startOnRamp`/`startOffRamp` return `{ interactiveUrl, transactionId }`; the app opens the URL and polls `get*Transaction`. Optional `getQuote`.
- **`auth`** (SEP-10) — wallet-signature handshake split into `getChallenge`/`submitChallenge` for client-side signing. The resulting token is threaded into facet methods via an optional trailing `auth?` argument (API-key anchors like Etherfuse ignore it).

Each client declares `displayName`, `supportedTokens` (with Stellar issuers), `supportedCurrencies`, and `supportedRails` — making the portable library fully self-contained.

### Anchor Providers

| Provider        | Region         | Fiat     | Token          | Rail      | Facets                                |
| --------------- | -------------- | -------- | -------------- | --------- | ------------------------------------- |
| **Etherfuse**   | Mexico, Brazil | MXN, BRL | CETES, TESOURO | SPEI, PIX | `programmatic`                        |
| **Test Anchor** | Testnet        | (test)   | SRT, USDC      | —         | `auth`, `programmatic`, `interactive` |

Etherfuse is the curated provider. The test anchor is a reference client against [testanchor.stellar.org](https://testanchor.stellar.org) and the only member that implements all three facets. Each provider has its own directory under `/src/lib/anchors/` with a `README.md` containing detailed setup, usage examples, and flow documentation.

> **Honorable mentions** — anchors that exist in a region but don't meet all five quality criteria (e.g. AlfredPay, BlindPay, Abroad Finance, Transfero) are surfaced on the region pages with a per-criterion assessment. They have no client code; they live in `HONORABLE_MENTIONS` in `src/lib/config/anchors.ts`.

### Example: Etherfuse (programmatic facet)

```typescript
import { EtherfuseClient } from './anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: 'your-api-key',
    baseUrl: 'https://api.sand.etherfuse.com', // sandbox
});

// Etherfuse exposes the `programmatic` facet only. Call operations via anchor.programmatic.*

// 1. Create customer (registers the user and generates a KYC onboarding URL)
const customer = await anchor.programmatic.createCustomer({
    email: 'user@example.com',
    publicKey: 'GXYZ...',
    country: 'MX',
});

// 2. Get quote (MXN -> CETES)
const quote = await anchor.programmatic.getQuote({
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    fromAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

// 3. Create on-ramp order
const onramp = await anchor.programmatic.createOnRamp({
    customerId: customer.id,
    quoteId: quote.id,
    stellarAddress: 'GXYZ...',
    fromCurrency: 'MXN',
    toCurrency: 'CETES',
    amount: '1000',
});
```

### Example: Test Anchor (all three facets)

The test anchor composes the `/sep/` modules into a dual-archetype `Anchor` with wallet auth. Authenticate once, then drive either facet:

```typescript
import { createTestAnchorAdapter } from './anchors/testanchor';

const anchor = createTestAnchorAdapter();

// 1. SEP-10 wallet auth (sign client-side, e.g. Freighter)
const { transactionXdr } = await anchor.auth!.getChallenge(publicKey);
const signedXdr = await signWithWallet(transactionXdr);
const { token } = await anchor.auth!.submitChallenge(signedXdr);

// 2a. Interactive (SEP-24): anchor hosts the flow
const session = await anchor.interactive!.startOnRamp({
    assetCode: 'SRT',
    account: publicKey,
    auth: token,
});
window.open(session.interactiveUrl, '_blank');
const tx = await anchor.interactive!.getOnRampTransaction(session.transactionId, token);

// 2b. Programmatic (SEP-6): app orchestrates the flow
const onramp = await anchor.programmatic!.createOnRamp(
    {
        customerId: '',
        quoteId: '',
        stellarAddress: publicKey,
        fromCurrency: 'USD',
        toCurrency: 'SRT',
        amount: '100',
    },
    token,
);
```

### Example: Any SEP-Compliant Anchor

For anchors that implement Stellar SEP protocols, use the `/sep/` modules directly:

```typescript
import { sep1, sep10, sep24 } from './anchors/sep';

// 1. Discover anchor endpoints
const toml = await sep1.fetchStellarToml('testanchor.stellar.org');

// 2. Authenticate
const token = await sep10.authenticate(
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

### Usage Outside SvelteKit

The `anchors/` and `wallet/` directories have no framework dependencies — they rely only on `@stellar/stellar-sdk` (and `@stellar/freighter-api` for the wallet). Copy the provider directories you need and instantiate clients directly with `process.env` or your framework's env mechanism:

```typescript
// Express / Node.js example
import express from 'express';
import { EtherfuseClient } from './lib/anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: process.env.ETHERFUSE_BASE_URL!,
});

const app = express();
app.use(express.json());

app.post('/api/quotes', async (req, res) => {
    const quote = await anchor.programmatic!.getQuote(req.body);
    res.json(quote);
});
```

You only need to copy the provider(s) you use plus `types.ts`. For example, to use just Etherfuse, copy `anchors/types.ts` and `anchors/etherfuse/`. The providers don't reference each other.

If your app runs in the browser, anchor API calls will hit CORS restrictions. Proxy them through your backend the same way this SvelteKit app does with its `/api/anchor/[provider]/` routes.

---

## Architecture

### Server-Side Anchor Factory

Anchor clients are instantiated server-side by the factory at `src/lib/server/anchorFactory.ts`, which reads environment variables and returns configured client instances. It also exposes facet accessors that throw if a provider doesn't support the requested facet:

```typescript
// In a +server.ts route handler:
import {
    getAnchor,
    isValidProvider,
    requireProgrammatic,
    requireInteractive,
    requireAuth,
    bearerToken,
} from '$lib/server/anchorFactory';

const anchor = getAnchor('etherfuse'); // Returns configured EtherfuseClient
const programmatic = requireProgrammatic('etherfuse'); // throws if no programmatic facet
const interactive = requireInteractive('testanchor'); // throws if no interactive facet
const token = bearerToken(request); // pull the SEP-10 token off an incoming request
```

This separation keeps the anchor library (`src/lib/anchors/`) portable and free of SvelteKit imports.

### API Routes

All anchor operations are proxied through SvelteKit API routes at `/api/anchor/[provider]/`:

```text
/api/anchor/[provider]/customers      - Customer creation and lookup       (programmatic)
/api/anchor/[provider]/kyc            - KYC status, requirements, URLs      (programmatic)
/api/anchor/[provider]/quotes         - Quote generation                   (programmatic)
/api/anchor/[provider]/onramp         - On-ramp order creation and status  (programmatic)
/api/anchor/[provider]/offramp        - Off-ramp order creation and status (programmatic)
/api/anchor/[provider]/fiat-accounts  - Bank account registration/listing  (programmatic)
/api/anchor/[provider]/sandbox        - Sandbox-only operations (KYC completion, fiat simulation)
/api/anchor/[provider]/auth           - SEP-10 challenge/response           (auth facet)
/api/anchor/[provider]/interactive    - Start + poll hosted sessions        (interactive)
```

For the standalone test anchor SEP demo (`/testanchor`), separate proxy endpoints handle CORS:

```text
/api/testanchor/sep6   - SEP-6 proxy
/api/testanchor/sep24  - SEP-24 proxy
```

### UI Components

The ramp flows are implemented as Svelte 5 components:

- `OnRampFlow.svelte` / `OffRampFlow.svelte` — the **programmatic** archetype (customer → quote → instructions/signing → status polling)
- `InteractiveRampFlow.svelte` — the **interactive** archetype (auth → start hosted session → open URL → poll)
- `RampPage.svelte` — picks the flow based on the anchor's `flowStyles`
- `KycForm.svelte` / `KycIframe.svelte` / `KycStatusDisplay.svelte` — KYC collection (form- or iframe-based) and status
- `QuoteDisplay.svelte` — quote summary with countdown timer
- `WalletConnect.svelte` — Freighter wallet connection
- `HonorableMentionAnchors.svelte` — region-page listing of non-curated anchors

### Pages

```text
/                       - Home page
/anchors                - Anchor provider listing (curated)
/anchors/[provider]     - Provider detail page
/anchors/[provider]/onramp   - On-ramp page
/anchors/[provider]/offramp  - Off-ramp page
/regions                - Region listing
/regions/[region]       - Region detail with curated anchors + honorable mentions
/testanchor             - SEP protocol demo against testanchor.stellar.org
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

# Stellar Network (public, accessible client-side)
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

New anchors must meet the five quality criteria in `QUALITY_CRITERIA` (`src/lib/config/anchors.ts`). If they don't, add them to `HONORABLE_MENTIONS` instead (no client code needed).

1. Create `/src/lib/anchors/[anchor-name]/` with `client.ts`, `types.ts`, and `index.ts`
2. Implement the faceted `Anchor` interface from `../types.ts` — provide at least one of `programmatic`/`interactive` (plus `auth` if the anchor authenticates via wallet), and set the relevant `AnchorCapabilities` flags (including `flowStyles`)
3. Add the provider to `src/lib/server/anchorFactory.ts` (env vars, factory switch case)
4. Add the provider to `src/lib/constants.ts` (`PROVIDER` object)
5. Add the provider to `src/lib/config/anchors.ts` (`ANCHORS` record) and `src/lib/config/regions.ts` (region `anchors` arrays)
6. Add API route proxies if needed for CORS
7. Document in `/src/lib/anchors/[anchor-name]/README.md`

## Claude Code

This repository includes configuration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to assist with development. Contributors using Claude Code automatically pick up the MCP servers described below.

### MCP Servers

Configured in `.mcp.json` and loaded automatically when Claude Code starts a session in this repo.

| Server        | URL                              | Description                                                                                                                     |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Svelte**    | `https://mcp.svelte.dev/mcp`     | Official Svelte MCP server. Provides Svelte 5 and SvelteKit documentation, code autofixing, and playground links.               |
| **Etherfuse** | `https://docs.etherfuse.com/mcp` | Etherfuse FX API documentation search. Provides API references, code examples, and integration guides for the Etherfuse anchor. |

To enable a new MCP server, add it to `.mcp.json`:

```json
{
    "mcpServers": {
        "your-server": {
            "type": "http",
            "url": "https://example.com/mcp"
        }
    }
}
```

### Skills

Skills are project-scoped prompt extensions under `.claude/skills/` that give Claude Code domain knowledge for a specific integration. They activate automatically when Claude Code detects relevant context (e.g. working on a particular anchor's files). Add one per integration that benefits from bundled API docs.

## License

Apache-2.0
