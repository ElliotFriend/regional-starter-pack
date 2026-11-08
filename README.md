# Stellar Regional Starter Pack

A SvelteKit application and portable library for building fiat on/off ramps on the Stellar network. It integrates five curated anchors (Etherfuse, Koywe, Manteca, Chipper, SeevCash), a reference client for the Stellar test anchor, a TR mock anchor, and a composable SEP protocol library for building against any SEP-compliant anchor.

The project curates anchor integrations against **two lenses**: a **commercial** bar (locally denominated asset on Stellar, local payment rails, competitive rates, deep liquidity) and a **developer** bar (open self-service access, accurate docs, high-fidelity sandbox, agent-buildable, fee discoverability). Anchors that don't clear the bar appear as **honorable mentions** on the region pages; candidates still being evaluated are flagged as in-vetting. See the [Anchor Readiness Scorecard](#anchor-readiness-scorecard) for the live, machine-readable view.

## TL;DR: The Most Important Thing

This demo is a fully functional application you can test out and interact with, and (usually) even pull some testnet tokens from the on-ramp simulations! But it's also a tool and a resource.

**The [`/src/lib/anchors/`](./src/lib/anchors/) and [`/src/lib/wallet/`](./src/lib/wallet/) directories are portable, framework-agnostic TypeScript libraries that should work out of the box!** Copy them (or just the parts you need) into any TypeScript project, and your project can interact with the anchors and the Stellar network. Super easy. Barely an inconvenience!

Each anchor is **self-contained**: a single directory holds the client class, its types, an index file, and a README. Copying `anchors/etherfuse/` (or `anchors/seevcash/` plus `anchors/sep/`) into another project pulls in nothing else from this repo, only the `@stellar/stellar-sdk` peer dependency.

## What's Inside

```text
src/lib/anchors/          <- PORTABLE: copy what you need into any TypeScript project
  etherfuse/              <- Etherfuse (Mexico, Brazil; CETES/TESOURO stablebonds)
  koywe/                  <- Koywe (Argentina, Mexico, Colombia; USDC)
  manteca/                <- Manteca (Brazil, Argentina, Colombia; USDC)
  chipper/                <- Chipper (Ghana, Kenya; mobile money, USDC)
  seevcash/               <- SeevCash (Ghana; SEP anchor, mobile money, USDC)
  testanchor/             <- Reference clients for testanchor.stellar.org (ramp + SEP playground)
  trmock/                 <- TR Mock Anchor (Türkiye; SEP sandbox stand-in)
  sep/                    <- SEP protocol modules (SEP-1/6/10/12/24/31/38)
  README.md               <- Library guide and provider index

src/lib/wallet/           <- PORTABLE: Varial wallet, Stellar helpers, SEP-10 session helper

src/lib/server/           <- SvelteKit-specific singletons for API-key anchors (read $env)
src/lib/api/              <- Browser fetch wrappers for those anchors' proxy routes
src/lib/components/       <- Shared UI primitives (provider-agnostic)
src/lib/stores/           <- wallet.svelte.ts (Varial), auth.ts (SEP-10 token cache)
src/lib/config/           <- anchors.ts (+ two-lens criteria), scorecard.ts, regions.ts, rails.ts
src/routes/               <- SvelteKit pages and API routes
```

## Quick Start

```bash
cp .env.example .env      # Configure API keys
pnpm install              # Install dependencies
pnpm dev                  # Run development server
pnpm check                # Type check
pnpm test:run             # Run the test suite once
pnpm build                # Build for production
```

---

## Using the Anchor Library

The `/src/lib/anchors/` directory is **framework-agnostic** and designed to be copied, directory by directory, into any TypeScript project. Each anchor is its own self-contained module. See [`src/lib/anchors/README.md`](./src/lib/anchors/README.md) for the library guide.

### Anchor Providers

| Provider        | Regions                     | Token          | Rails                      | Auth            | Runs in      |
| --------------- | --------------------------- | -------------- | -------------------------- | --------------- | ------------ |
| **Etherfuse**   | Mexico, Brazil              | CETES, TESOURO | SPEI, PIX                  | API key         | Server proxy |
| **Koywe**       | Argentina, Mexico, Colombia | USDC           | WIREAR, QRI, SPEI, PSE     | clientId/secret | Server proxy |
| **Manteca**     | Brazil, Argentina, Colombia | USDC           | PIX, CVU, Bre-B            | API key         | Server proxy |
| **Chipper**     | Ghana, Kenya                | USDC           | Mobile money, M-Pesa, bank | API key         | Server proxy |
| **SeevCash**    | Ghana                       | USDC           | Mobile money               | SEP-10          | Browser      |
| **Test Anchor** | Testnet (reference)         | SRT, USDC      | Bank (simulated)           | SEP-10          | Browser      |
| **TR Mock**     | Türkiye (sandbox stand-in)  | USDC           | FAST (simulated)           | SEP-10          | Browser      |

> **Honorable mentions:** anchors that don't clear the two-lens bar (e.g. AlfredPay, BlindPay, Abroad Finance, Transfero), plus in-vetting BD pipeline candidates flagged `vetting: true` (e.g. Bitso, Fonbnk, Yellow Card, PDAX), are surfaced on the region pages and in the [scorecard](#anchor-readiness-scorecard) with a per-criterion assessment. They have no client code; they live in `HONORABLE_MENTIONS` in `src/lib/config/anchors.ts`.

### Example: Etherfuse (API key, server-side)

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
// order.deposit: SPEI or PIX deposit instructions (discriminated by `rail`)

// 5. Poll until completed
let polled = await anchor.getOnRampOrder(order.id);
while (polled && polled.status !== 'completed' && polled.status !== 'failed') {
    await new Promise((r) => setTimeout(r, 5000));
    polled = await anchor.getOnRampOrder(order.id);
}
```

See [`src/lib/anchors/etherfuse/README.md`](./src/lib/anchors/etherfuse/README.md) for the complete reference.

### Example: A SEP Anchor (browser)

SEP anchors hold no secrets (the user's wallet signs SEP-10), so their clients run directly in the browser. `SeevcashRampClient` is a small wrapper over the `sep/` modules:

```typescript
import { SeevcashRampClient } from './anchors/seevcash';

const anchor = new SeevcashRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER });

// 1. SEP-10 wallet auth (sign with the user's wallet, e.g. Varial)
const challenge = await anchor.getChallenge(publicKey);
const signedXdr = await signWithWallet(challenge.transaction);
const { token } = await anchor.submitChallenge(signedXdr);

// 2. SEP-12 KYC, including the mobile money wallet to collect from / pay out to
await anchor.putCustomer(token, {
    first_name: 'Ama',
    last_name: 'Mensah',
    email_address: 'ama@example.com',
    mobile_money_number: '+233241234567',
    mobile_money_provider: 'MTN',
});

// 3. Preview the rate (SEP-38), then start a SEP-6 deposit
const price = await anchor.getPrice({ kind: 'deposit', amount: '5' });
const deposit = await anchor.deposit(token, { amount: '5', account: publicKey });

// 4. Poll the SEP-6 transaction until the USDC lands
const tx = await anchor.getTransaction(token, deposit.id!);
```

The returned types are **directly the SEP-defined shapes** (`Sep10ChallengeResponse`, `Sep6DepositResponse`, `Sep12CustomerResponse`, ...); there's no adaptation layer. `TestAnchorRampClient` covers both SEP-6 and SEP-24 against the test anchor; see [`src/lib/anchors/testanchor/README.md`](./src/lib/anchors/testanchor/README.md).

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

The `anchors/` and `wallet/` directories have no framework dependencies; they rely only on `@stellar/stellar-sdk` (and the `@stellar/varial-sdk` package for the Varial wallet). Copy only the providers you use; they don't reference each other.

**Keep API keys on a server.** For an API-key anchor, call the client from your backend, the same way this app proxies through `/api/anchor/<name>/*`:

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

**SEP anchors can run in the browser,** provided the anchor serves CORS on its SEP endpoints. The test anchor, TR mock anchor, and SeevCash all do. One known gap: the test anchor's 403 for a missing or invalid token carries no CORS header, so a browser sees a network error instead of the 403.

---

## Architecture

### Browser vs. server

- **API-key anchors** (Etherfuse, Koywe, Manteca, Chipper): a server-side singleton (`src/lib/server/<name>Instance.ts`) reads `$env` and lazily instantiates the client. Pages call browser wrappers (`src/lib/api/<name>.ts`), which hit proxy routes (`src/routes/api/anchor/<name>/*`), so the key never reaches the browser.
- **SEP anchors** (SeevCash, test anchor, TR mock): pages instantiate the client directly. The SEP-10 token stays in the browser (cached by `authStore`), and there's no singleton, wrapper, or proxy route.

This keeps the anchor library (`src/lib/anchors/`) portable and free of SvelteKit imports.

### API Routes

There is no dynamic `[provider]` segment; each anchor's routes live at a static path.

```text
/api/anchor/etherfuse/customers          - POST create, GET by ?customerId=
/api/anchor/etherfuse/quotes             - POST get quote
/api/anchor/etherfuse/onramp             - POST create, GET by ?orderId=
/api/anchor/etherfuse/offramp            - POST create, GET by ?orderId=
/api/anchor/etherfuse/bank-accounts      - GET by ?customerId=
/api/anchor/etherfuse/kyc                - POST presigned URL, GET status
/api/anchor/etherfuse/sandbox            - POST { action: 'simulateFiatReceived', orderId }
/api/anchor/etherfuse/assets             - GET by ?currency=&wallet=

/api/anchor/koywe/quotes                 - POST executable quote
/api/anchor/koywe/onramp                 - POST create on-ramp order
/api/anchor/koywe/offramp                - POST create off-ramp order, or attach a Stellar tx hash
/api/anchor/koywe/order                  - GET by ?orderId= or ?externalId=
/api/anchor/koywe/kyc                    - GET account status by ?email=, POST delegated KYC
/api/anchor/koywe/bank-accounts          - GET list, POST register off-ramp payout account
/api/anchor/koywe/payment-methods        - GET rails for ?symbol=
/api/anchor/koywe/token-currencies       - GET supported pairs + limits

/api/anchor/manteca/users                - POST create end-user, GET by ?userAnyId=
/api/anchor/manteca/kyc                  - POST onboarding identity data, GET status
/api/anchor/manteca/personal-data        - POST personal data for an existing user
/api/anchor/manteca/identity-image       - POST identity document / selfie (multipart)
/api/anchor/manteca/quotes               - GET quote by ?ramp=&asset=&against=
/api/anchor/manteca/ramp                 - POST create a ramp-on or ramp-off synthetic
/api/anchor/manteca/synthetic            - GET synthetic by ?id= (polling)
/api/anchor/manteca/withdraw-destination - GET validate a PIX key / CBU / CVU
/api/anchor/manteca/sandbox-deposit      - POST simulate a deposit (sandbox)

/api/anchor/chipper/capabilities         - GET methods for ?country=GH|KE
/api/anchor/chipper/rate                 - GET rate by ?origin=&destination=
/api/anchor/chipper/validate             - POST validate a payout destination
/api/anchor/chipper/orders               - POST create on/off-ramp order, GET by ?id=
/api/anchor/chipper/simulate-deposit     - POST simulate a bank deposit (sandbox)

/api/scorecard                           - developer-readiness data (JSON; ?format=md for Markdown)
/api/cron/blend/oracle, .../emissions    - scheduled Blend pool maintenance (Vercel Cron)
```

See each provider's README for the exact request shapes.

### UI Components

`src/lib/components/` contains **provider-agnostic primitives**. The flow pages compose them; there are no shared flow components.

- `WalletConnect.svelte`: Varial connect/disconnect.
- `AnchorRegionSelector.svelte`: region tabs and on/off-ramp links for an anchor landing page.
- `CriteriaScorecard.svelte`: renders a two-lens scorecard (compact and `detailed` modes).
- `HonorableMentionAnchors.svelte`: honorable-mention cards for a region page.
- `QuoteDisplay.svelte`: takes a structural quote shape and renders an exchange-rate summary with a countdown.
- `KycIframe.svelte`: embeds a hosted KYC URL and listens for completion messages.
- `ramp/`: `AmountInput`, `TrustlineStatus`, `CompletionStep`.
- `ui/`: `Header`, `Footer`, `Sidebar`, `DevBox`, `ErrorAlert`, `CopyableField`.

### Pages

```text
/                                         - Home page
/anchors                                  - Anchor listing (curated)
/anchors/<name>                           - Landing page for etherfuse, koywe, manteca, chipper, seevcash, trmock
/anchors/<name>/onramp, /offramp          - On- and off-ramp flows for each of those
/anchors/testanchor                       - Test anchor landing page (links to both archetypes)
/anchors/testanchor/interactive/onramp    - SEP-24 deposit
/anchors/testanchor/interactive/offramp   - SEP-24 withdraw
/anchors/testanchor/programmatic/onramp   - SEP-6 deposit
/anchors/testanchor/programmatic/offramp  - SEP-6 withdraw
/anchors/scorecard                        - Developer-readiness scorecard (human view)
/regions                                  - Region listing
/regions/[region]                         - Region detail with curated anchors + honorable mentions
/testanchor                               - Standalone SEP protocol playground (TestAnchorPlaygroundClient)
```

---

## Anchor Readiness Scorecard

A self-updating, machine-readable view of how build-ready each anchor is for developers. It is derived live from the anchor config (`src/lib/config/anchors.ts`) via `src/lib/config/scorecard.ts`, so it never drifts from reality. Built for agents to ingest, and viewable by humans.

- **Humans:** [`/anchors/scorecard`](/anchors/scorecard): verdicts and signals rendered with status icons.
- **Agents:** `/api/scorecard`: always serves data. JSON by default; Markdown via `?format=md` or an `Accept: text/markdown` header (an explicit `?format=` wins over the header).

```bash
# JSON: what any standard HTTP client (curl, fetch, requests, ...) gets by default
curl https://<host>/api/scorecard

# Markdown: a self-describing report (signal meanings + per-anchor detail)
curl 'https://<host>/api/scorecard?format=md'
curl -H 'Accept: text/markdown' https://<host>/api/scorecard
```

**Each entry:**

| Field        | Meaning                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdict`    | `ready` · `partial` · `blocked`                                                                                                                    |
| `signals[]`  | the six buildability signals, each with `severity` (`required` / `friction`), `status` (`met` / `partial` / `failed` / `unverified`), and a `note` |
| `blockers[]` | failed **required** signals: the reasons a verdict is `blocked`                                                                                    |
| `caveats[]`  | other not-met signals (friction failures + any partial/unverified)                                                                                 |
| `localAsset` | informational only, **not** part of the verdict                                                                                                    |

The signals: **required** are local rails, open access, and a high-fidelity sandbox; **friction** are accurate docs, agent-buildability, and fee discoverability. A failed required signal → `blocked`; a failed friction signal (or any partial/unverified) → `partial`; all six met → `ready`.

**Scope:** reflects anchors in the production config only (curated + honorable mentions). Fees and liquidity are assessed separately by the BD team and intentionally omitted; reference anchors (the test anchor and TR mock) are excluded.

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

SEP modules are framework-agnostic and depend only on `@stellar/stellar-sdk`. Network calls accept an optional `fetchFn` (except `sep1.fetchStellarToml`, which uses the SDK's resolver). See [`src/lib/anchors/sep/README.md`](./src/lib/anchors/sep/README.md).

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the API keys for the anchors you use. It covers:

- **Etherfuse:** `ETHERFUSE_API_KEY`, `ETHERFUSE_BASE_URL`
- **Koywe:** `KOYWE_CLIENT_ID`, `KOYWE_SECRET`, `KOYWE_BASE_URL`
- **Manteca:** `MANTECA_API_KEY`, `MANTECA_BASE_URL`
- **Chipper:** `CHIPPER_API_URL`, `CHIPPER_SECRET_KEY`
- **TR Mock Anchor:** `PUBLIC_TRMOCK_HOME_DOMAIN` (public; no key)
- **Stellar:** `PUBLIC_STELLAR_NETWORK`, `PUBLIC_USDC_ISSUER`, `SEP1_SIGNING_KEY_SECRET` (signs this app's own `stellar.toml`)
- **Cron / Blend maintenance:** `CRON_SECRET`, `BLEND_*`

SeevCash and the test anchor need no configuration.

## Tech Stack

- **SvelteKit**: full-stack framework
- **Svelte 5**: UI with runes (`$state`, `$derived`, `$effect`)
- **TypeScript**: type safety throughout
- **Tailwind CSS**: styling
- **Vitest + MSW**: unit and component tests
- **@stellar/stellar-sdk**: Stellar blockchain interaction
- **@stellar/varial-sdk**: wallet connection (Varial browser extension)
- **@lucide/svelte**: UI icons (per-icon deep imports, tree-shakeable)

## Adding a New Anchor

Curated anchors should clear the two-lens bar (`COMMERCIAL_CRITERIA` + `DEVELOPER_CRITERIA` in `src/lib/config/anchors.ts`). If they don't, or are still being evaluated, add them to `HONORABLE_MENTIONS` instead (no client code needed), with a `scorecard` and, for pipeline candidates, `vetting: true`.

For a curated anchor:

1. Create the client in `src/lib/anchors/<name>/`, test-first under `tests/anchors/<name>/`.
2. **SEP anchor:** have the pages instantiate the client in the browser. **API-key anchor:** add a server singleton (`src/lib/server/<name>Instance.ts`), browser wrappers (`src/lib/api/<name>.ts`), and proxy routes (`src/routes/api/anchor/<name>/*`), and list its env vars in `.env.example`.
3. Create `src/routes/anchors/<name>/+page.svelte` (landing, using `AnchorRegionSelector`) and the flow pages.
4. Add the anchor to `ANCHORS` in `src/lib/config/anchors.ts` and to its regions in `src/lib/config/regions.ts`.
5. Document it in `src/lib/anchors/<name>/README.md` and the provider indexes.

The `adding-an-anchor` Claude Code skill walks through the details.

## Claude Code

This repository includes configuration for [Claude Code](https://code.claude.com/docs) to assist with development:

- **`CLAUDE.md`:** project rules loaded in every session (kept short on purpose).
- **`.claude/rules/`:** path-scoped rules that load when Claude works on matching files: `anchor-integrations.md` (client conventions, browser vs. proxy) and `curation-and-scorecard.md` (the two lenses and readiness verdicts).
- **`.claude/skills/`:** workflows Claude loads on demand: `adding-an-anchor` and `assessing-an-anchor`.

### MCP Servers

Configured in `.mcp.json` and loaded automatically when Claude Code starts a session in this repo.

| Server        | URL                              | Description                                                                                                         |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Svelte**    | `https://mcp.svelte.dev/mcp`     | Official Svelte MCP server: Svelte 5 and SvelteKit documentation, code autofixing, and playground links.            |
| **Etherfuse** | `https://docs.etherfuse.com/mcp` | Etherfuse API documentation search: API references, code examples, and integration guides for the Etherfuse anchor. |

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

## License

Apache-2.0

> **Varial wallet connection:** Install and enable the Varial browser extension before connecting. If the wallet is unavailable, the connect control offers an installation link and a retry action. The app uses `@stellar/varial-sdk` and requests authorization and the wallet address in one call.
