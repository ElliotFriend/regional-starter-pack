# Stellar Regional Starter Pack

A SvelteKit application and portable library for building fiat on/off ramps on the Stellar network using locally denominated assets. It includes one curated anchor provider (Etherfuse), a reference client for the Stellar test anchor, and a composable SEP protocol library for building against any SEP-compliant anchor.

The project curates anchor integrations that meet five quality criteria: locally denominated assets on Stellar, local payment-rail support, competitive rates (<25 bps), well-documented developer access, and deep liquidity. Anchors that exist in a region but don't clear the bar appear as **honorable mentions** on the region pages rather than as integrations.

## TL;DR: The Most Important Thing

This demo is a fully functional application you can test out and interact with — and (usually) even pull some Testnet tokens from the on-ramp simulations! But it's also a tool and a resource.

**The [`/src/lib/anchors/`](./src/lib/anchors/) and [`/src/lib/wallet/`](./src/lib/wallet/) directories are portable, framework-agnostic TypeScript libraries that should work out-of-the-box!** Copy them (or just the parts you need) into any TypeScript project, and your project can interact with the anchors and the Stellar network. Super easy. Barely an inconvenience!

Each anchor is **self-contained**: a single directory holds the client class, its types, an index file, and a README. Copying `anchors/etherfuse/` (or `anchors/testanchor/`, or `anchors/sep/`) into another project pulls in nothing else from this repo — only the `@stellar/stellar-sdk` peer dependency.

## What's Inside

```text
src/lib/anchors/          <- PORTABLE: Copy what you need into any TypeScript project
  etherfuse/              <- Etherfuse integration (Latin America)
    client.ts             <- EtherfuseClient class
    types.ts              <- Etherfuse-native types + EtherfuseError
    index.ts
    README.md             <- Paste-target documentation
  testanchor/             <- Reference clients for testanchor.stellar.org
    ramp.ts               <- TestAnchorRampClient (curated SEP wrapper)
    client.ts             <- TestAnchorClient (SEP playground, used by /testanchor)
    types.ts
    index.ts
    README.md
  sep/                    <- SEP protocol modules (SEP-1/6/10/12/24/31/38)
    sep1.ts, sep10.ts, ... <- One file per SEP, each independently usable
    types.ts
    index.ts
    README.md

src/lib/wallet/           <- PORTABLE: Freighter wallet + Stellar helpers

src/lib/server/           <- SvelteKit-specific (reads $env)
  etherfuseInstance.ts    <- Lazily-instantiated EtherfuseClient singleton
  testanchorInstance.ts   <- Lazily-instantiated TestAnchorRampClient singleton + requireBearer helper

src/lib/api/              <- Browser-side fetch wrappers per provider
  etherfuse.ts            <- Wraps /api/anchor/etherfuse/*
  testanchor.ts           <- Wraps /api/anchor/testanchor/*

src/lib/components/       <- Shared UI primitives (provider-agnostic)
src/lib/stores/           <- wallet.svelte.ts (Freighter), auth.ts (SEP-10 token cache)
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

The `/src/lib/anchors/` directory is **framework-agnostic** and designed to be copied — directory-by-directory — into any TypeScript project. Each anchor is its own self-contained module.

### Anchor Providers

| Provider        | Region         | Fiat     | Token          | Rail      | Authentication |
| --------------- | -------------- | -------- | -------------- | --------- | -------------- |
| **Etherfuse**   | Mexico, Brazil | MXN, BRL | CETES, TESOURO | SPEI, PIX | API key        |
| **Test Anchor** | Testnet        | (test)   | SRT, USDC      | bank      | SEP-10         |

Etherfuse is the curated provider for production-shaped fiat ramps. The test anchor (`testanchor.stellar.org`) is a reference for SEP-compliant integrations.

> **Honorable mentions** — anchors that exist in a region but don't meet all five quality criteria (e.g. AlfredPay, BlindPay, Abroad Finance, Transfero) are surfaced on the region pages with a per-criterion assessment. They have no client code; they live in `HONORABLE_MENTIONS` in `src/lib/config/anchors.ts`.

### Example: Etherfuse

```typescript
import { EtherfuseClient } from './anchors/etherfuse';

const anchor = new EtherfuseClient({
    apiKey: process.env.ETHERFUSE_API_KEY!,
    baseUrl: 'https://api.sand.etherfuse.com',
});

// 1. Create customer (registers the user and generates a KYC onboarding URL)
const customer = await anchor.createCustomer({
    publicKey: 'GXYZ...',
    email: 'user@example.com',
    country: 'MX',
});

// 2. Get a hosted KYC URL and embed it in an iframe
const kycUrl = await anchor.getKycUrl({
    customerId: customer.id,
    publicKey: 'GXYZ...',
});

// 3. Get quote (MXN -> CETES)
const quote = await anchor.getQuote({
    fromAsset: 'MXN',
    toAsset: 'CETES',
    sourceAmount: '1000',
    customerId: customer.id,
    stellarAddress: 'GXYZ...',
});

// 4. Create on-ramp order
const order = await anchor.createOnRampOrder({
    customerId: customer.id,
    quoteId: quote.id,
    publicKey: 'GXYZ...',
});
// order.deposit — SPEI or PIX deposit instructions (discriminated by `rail`)

// 5. Poll until completed
let polled = await anchor.getOnRampOrder(order.id);
while (polled && polled.status !== 'completed' && polled.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 5000));
    polled = await anchor.getOnRampOrder(order.id);
}
```

See [`src/lib/anchors/etherfuse/README.md`](./src/lib/anchors/etherfuse/README.md) for the complete reference.

### Example: Test Anchor (SEP-compliant)

The test anchor exposes both archetypes through `TestAnchorRampClient`:

```typescript
import { TestAnchorRampClient } from './anchors/testanchor';

const anchor = new TestAnchorRampClient();

// 1. SEP-10 wallet auth (sign client-side, e.g. Freighter)
const challenge = await anchor.getChallenge(publicKey);
const signedXdr = await signWithWallet(challenge.transaction);
const { token } = await anchor.submitChallenge(signedXdr);

// 2a. Interactive (SEP-24): anchor hosts the flow
const session = await anchor.sep24Deposit(token, {
    asset_code: 'SRT',
    asset_issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
    account: publicKey,
});
window.open(session.url, '_blank');
const tx = await anchor.getSep24Transaction(token, session.id);

// 2b. Programmatic (SEP-6): app orchestrates the flow
const deposit = await anchor.sep6Deposit(token, {
    asset_code: 'SRT',
    funding_method: 'bank_account',
    account: publicKey,
    amount: '100',
});
// deposit.instructions — generic SEP-6 key/value deposit fields
```

The returned types are **directly the SEP-defined shapes** (`Sep10ChallengeResponse`, `Sep24InteractiveResponse`, `Sep6DepositResponse`, `Sep12CustomerResponse`, etc.) — no adaptation layer.

See [`src/lib/anchors/testanchor/README.md`](./src/lib/anchors/testanchor/README.md) for the complete reference, including the separate `TestAnchorClient` SEP playground.

### Example: Any SEP-Compliant Anchor

For anchors that implement Stellar SEP protocols, use the `/sep/` modules directly:

```typescript
import { sep1, sep10, sep24 } from './anchors/sep';

const toml = await sep1.fetchStellarToml('testanchor.stellar.org');

const { token } = await sep10.authenticate(
    {
        authEndpoint: sep1.getSep10Endpoint(toml)!,
        serverSigningKey: sep1.getSigningKey(toml)!,
        networkPassphrase: 'Test SDF Network ; September 2015',
        homeDomain: 'testanchor.stellar.org',
    },
    userPublicKey,
    signerFunction,
);

const response = await sep24.deposit(sep1.getSep24Endpoint(toml)!, token, {
    asset_code: 'USDC',
    amount: '100',
});

window.open(response.url, '_blank');
```

### Usage Outside SvelteKit

The `anchors/` and `wallet/` directories have no framework dependencies — they rely only on `@stellar/stellar-sdk` (and `@stellar/freighter-api` for the wallet). Copy only what you need:

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
    const quote = await anchor.getQuote(req.body);
    res.json(quote);
});
```

You only need to copy the provider(s) you use. The providers don't reference each other — `anchors/etherfuse/` and `anchors/testanchor/` are independent.

If your app runs in the browser, anchor API calls will hit CORS restrictions. Proxy them through your backend the same way this SvelteKit app does with its `/api/anchor/etherfuse/*` and `/api/anchor/testanchor/*` routes.

---

## Architecture

### Server-Side Instances

Each anchor has a server-side instance singleton that reads its env vars and lazily instantiates the client:

```typescript
// In a +server.ts route handler:
import { getEtherfuse } from '$lib/server/etherfuseInstance';
import { getTestAnchor, requireBearer } from '$lib/server/testanchorInstance';

const etherfuse = getEtherfuse();
const customer = await etherfuse.createCustomer({ publicKey, email });

const testanchor = getTestAnchor();
const token = requireBearer(request); // throws 401 if no Bearer header
const sep24 = await testanchor.sep24Deposit(token, request);
```

This separation keeps the anchor library (`src/lib/anchors/`) portable and free of SvelteKit imports.

### API Routes

All anchor operations are proxied through SvelteKit API routes. There is no dynamic `[provider]` segment — each anchor's routes live at a static path:

```text
/api/anchor/etherfuse/customers      - POST create, GET by ?customerId=
/api/anchor/etherfuse/quotes         - POST get quote
/api/anchor/etherfuse/onramp         - POST create, GET by ?orderId=
/api/anchor/etherfuse/offramp        - POST create, GET by ?orderId=
/api/anchor/etherfuse/bank-accounts  - GET by ?customerId=
/api/anchor/etherfuse/kyc            - POST presigned URL, GET status
/api/anchor/etherfuse/sandbox        - POST { action: 'simulateFiatReceived', orderId }
/api/anchor/etherfuse/assets         - GET by ?currency=&wallet=

/api/anchor/testanchor/auth          - POST ?action=challenge|token
/api/anchor/testanchor/customer      - GET / PUT (SEP-12, Bearer required)
/api/anchor/testanchor/price         - POST (SEP-38)
/api/anchor/testanchor/sep6          - POST ?action=deposit|withdraw, GET by ?transactionId=
/api/anchor/testanchor/sep24         - POST ?action=deposit|withdraw, GET by ?transactionId=

/api/scorecard                       - GET developer-readiness data (JSON default; ?format=md or Accept: text/markdown for Markdown)
```

For the standalone test anchor SEP demo (`/testanchor`), separate proxy endpoints handle CORS:

```text
/api/testanchor/sep6   - SEP-6 proxy
/api/testanchor/sep24  - SEP-24 proxy
```

### UI Components

`src/lib/components/` contains **provider-agnostic primitives**. The flow pages compose them; there are no shared flow components per-archetype.

- `WalletConnect.svelte` — Freighter connect/disconnect.
- `QuoteDisplay.svelte` — takes a structural quote shape, renders an exchange-rate summary with countdown.
- `KycIframe.svelte` — embeds a hosted KYC URL, listens for completion messages.
- `ramp/AmountInput.svelte` — amount entry with trustline + wallet-connected guards.
- `ramp/TrustlineStatus.svelte` — self-contained trustline check + "Add trustline" CTA.
- `ui/`: `Header`, `Footer`, `Sidebar`, `DevBox`, `ErrorAlert`, `CopyableField`.

### Pages

```text
/                                                       - Home page
/anchors                                                - Anchor provider listing (curated)
/anchors/etherfuse                                      - Etherfuse landing page
/anchors/etherfuse/onramp                               - Etherfuse on-ramp
/anchors/etherfuse/offramp                              - Etherfuse off-ramp
/anchors/testanchor                                     - Test anchor landing page (links to both archetypes)
/anchors/testanchor/interactive/onramp                  - SEP-24 deposit
/anchors/testanchor/interactive/offramp                 - SEP-24 withdraw
/anchors/testanchor/programmatic/onramp                 - SEP-6 deposit
/anchors/testanchor/programmatic/offramp                - SEP-6 withdraw
/anchors/scorecard                                      - Developer-readiness scorecard (human view)
/regions                                                - Region listing
/regions/[region]                                       - Region detail with curated anchors + honorable mentions
/testanchor                                             - Standalone SEP protocol demo (uses TestAnchorClient playground)
```

---

## Anchor Readiness Scorecard

A self-updating, machine-readable view of how build-ready each anchor is for developers. It is derived live from the anchor config (`src/lib/config/anchors.ts`) via `src/lib/config/scorecard.ts`, so it never drifts from reality. Built for agents to ingest, and viewable by humans.

- **Humans:** [`/anchors/scorecard`](/anchors/scorecard) — verdicts and signals rendered with status icons.
- **Agents:** `/api/scorecard` — always serves data. JSON by default; Markdown via `?format=md` or an `Accept: text/markdown` header (an explicit `?format=` wins over the header).

```bash
# JSON — what any standard HTTP client (curl, fetch, requests, …) gets by default
curl https://<host>/api/scorecard

# Markdown — a self-describing report (signal meanings + per-anchor detail)
curl 'https://<host>/api/scorecard?format=md'
curl -H 'Accept: text/markdown' https://<host>/api/scorecard
```

**Each entry:**

| Field        | Meaning                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdict`    | `ready` · `partial` · `blocked`                                                                                                                     |
| `signals[]`  | the five buildability signals, each with `severity` (`required` / `friction`), `status` (`met` / `partial` / `failed` / `unverified`), and a `note` |
| `blockers[]` | failed **required** signals — the reasons a verdict is `blocked`                                                                                    |
| `caveats[]`  | other not-met signals (friction failures + any partial/unverified)                                                                                  |
| `localAsset` | informational only — **not** part of the verdict                                                                                                    |

The verdict rule: a failed **required** signal → `blocked`; a failed **friction** signal (or any partial/unverified) → `partial`; all five met → `ready`.

**Scope:** reflects anchors in the production config only (curated + honorable mentions). Fees and liquidity are assessed separately by the BD team and intentionally omitted; the reference test anchor is excluded.

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

1. Create `/src/lib/anchors/[anchor-name]/{client.ts,types.ts,index.ts}` shaped however the anchor's API works.
2. Create `/src/lib/server/[anchor-name]Instance.ts` — singleton getter.
3. Create `/src/lib/api/[anchor-name].ts` — client-side fetch wrappers.
4. Create `/src/routes/api/anchor/[anchor-name]/<operation>/+server.ts` per operation.
5. Create `/src/routes/anchors/[anchor-name]/+page.svelte` (landing) and `<flow>/+page.svelte` per flow. Compose primitives from `src/lib/components/`.
6. Add the provider to `src/lib/constants.ts` (`PROVIDER`).
7. Add to `src/lib/config/anchors.ts` (`ANCHORS`) and `src/lib/config/regions.ts` if regional.
8. Add tests under `tests/anchors/[anchor-name]/`.
9. Document in `/src/lib/anchors/[anchor-name]/README.md`.

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
