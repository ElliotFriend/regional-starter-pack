# Anchor Library Portability: DX Report — Next.js + BlindPay

## Thesis Under Test

> This repository provides useful information, examples, and copy/paste-friendly code that can be easily incorporated into any TypeScript project to enable anchor integration in a breeze.

## Methodology

Same approach as the React + Etherfuse round: an AI subagent (acting as a Next.js developer with no prior context) reads the repo docs and source, copies the portable library, and builds an application. This round tests a different provider (BlindPay) and a different framework (Next.js with App Router), and adds a backend proxy layer via API routes.

The full prompt given to the subagent is in Appendix A.

## Test Application

**Stack:** Next.js 16 (App Router) + React + TypeScript + Tailwind CSS

**What was built:**
- 8 API route handlers proxying to `BlindPayClient` (with mock fallback when API calls fail)
- Server-side anchor factory (`server.ts`) — the Next.js equivalent of `anchorFactory.ts`
- Client-side API helper module calling the proxy routes
- Wallet connection component using portable Freighter helpers
- On-ramp flow: blockchain wallet registration, amount input, composite customer ID, quote, SPEI payment instructions, polling
- Off-ramp flow: bank account selection (before quote!), amount input, composite customer ID, quote, signing, payout submission to BlindPay, polling
- Main page with customer creation, KYC status display, capability badge display

**Lines of code:** ~1,800 lines of Next.js/React (page + 3 components + 8 API routes + 1 API helper + 1 server factory)

---

## Verdict: 9/10

Up from 8/10 in the React round. The `erasableSyntaxOnly` fix eliminated the only file-modification friction from round 1, resulting in **zero modifications to any portable library file**. The Next.js API route pattern is a natural fit for the CORS proxy architecture, and BlindPay's more complex capability profile was correctly implemented using the interface's capability flags.

---

## What Worked

### 1. Zero-modification copy (8 files verbatim)

Every portable library file copied without changes:

| File | Source | Changes |
|------|--------|---------|
| `anchors/types.ts` | `src/lib/anchors/types.ts` | None |
| `anchors/blindpay/client.ts` | `src/lib/anchors/blindpay/client.ts` | None |
| `anchors/blindpay/types.ts` | `src/lib/anchors/blindpay/types.ts` | None |
| `anchors/blindpay/index.ts` | `src/lib/anchors/blindpay/index.ts` | None |
| `wallet/freighter.ts` | `src/lib/wallet/freighter.ts` | None |
| `wallet/stellar.ts` | `src/lib/wallet/stellar.ts` | None |
| `wallet/types.ts` | `src/lib/wallet/types.ts` | None |
| `wallet/index.ts` | `src/lib/wallet/index.ts` | None |

This is the target state for portability. The `erasableSyntaxOnly` fix (from round 1 findings) directly caused this improvement — `AnchorError` and `WalletError` now use explicit field declarations.

### 2. API route pattern maps naturally

The SvelteKit CORS proxy pattern (`/api/anchor/[provider]/[operation]`) translates directly to Next.js App Router:

```
SvelteKit:  src/routes/api/anchor/[provider]/customers/+server.ts
Next.js:    src/app/api/anchor/blindpay/customers/route.ts
```

The subagent built 8 route handlers (customers, kyc, quotes, onramp, offramp, fiat-accounts, blockchain-wallets, payout-submit) with a consistent pattern: parse request, call `BlindPayClient`, catch errors, return mock fallback. The `server.ts` factory mirrors `anchorFactory.ts` almost exactly.

### 3. BlindPay capability flags drove correct flow logic

The subagent correctly implemented all BlindPay-specific behaviors without hardcoding provider names:

- **`requiresBlockchainWalletRegistration`**: On-ramp registers a wallet on mount before allowing quotes
- **`requiresBankBeforeQuote`**: Off-ramp shows bank account selection BEFORE the quote step (6-step state machine: `input → bank → quote → signing → pending → complete`)
- **`compositeQuoteCustomerId`**: Both flows construct `customerId:resourceId` for quote requests (on-ramp uses `blockchainWalletId`, off-ramp uses `bankAccountId`)
- **`requiresAnchorPayoutSubmission`**: Off-ramp submits signed XDR back to BlindPay via the `payout-submit` route instead of submitting directly to Stellar

### 4. Type system guided correct API route shapes

The API routes import `AnchorError` from the portable library for error handling, and the client-side API helper uses the portable types (`Customer`, `Quote`, `OnRampTransaction`, etc.) for response typing. TypeScript caught shape mismatches at compile time.

### 5. Mock fallback pattern is production-relevant

Each API route tries the real `BlindPayClient` call first, then falls back to mock data on failure. This is a realistic pattern for development environments where API keys aren't configured, and it validates that the client instantiation and method signatures are correct even when the API is unreachable.

---

## What Didn't Work

### Issue 1: Composite customer ID is a leaky abstraction

**Severity:** Medium — works correctly but is confusing

**Problem:** BlindPay's quote API expects a `customerId:resourceId` composite format, but this is encoded in the generic `GetQuoteInput.customerId` field. The subagent had to understand this convention from the BlindPay README and construct the composite string manually in each flow component:

```typescript
// OnRampFlow.tsx
const compositeId = customer.blockchainWalletId
    ? `${customer.id}:${customer.blockchainWalletId}`
    : customer.id;

// OffRampFlow.tsx
const compositeId = `${customer.id}:${accountId}`;
```

This is BlindPay-specific logic leaking into generic application code. A developer who doesn't read the BlindPay README would have no idea this format is expected.

**Possible fixes:**
- Add a helper function in the portable library: `BlindPayClient.buildQuoteCustomerId(customerId, resourceId)`
- Add a `resourceId` field to `GetQuoteInput` and have `BlindPayClient.getQuote()` handle the concatenation internally
- At minimum, add JSDoc on `GetQuoteInput.customerId` noting that some providers expect composite formats

### Issue 2: `createCustomer()` stub generates invalid receiver IDs

**Severity:** High — causes runtime API failures

**Problem:** `BlindPayClient.createCustomer()` doesn't make a real API call. It returns a local stub with `crypto.randomUUID()` as the customer ID (a 36-character UUID like `51ab61af-4b46-4761-9f70-d4815b5984cf`). However, every downstream BlindPay API call expects a 15-character receiver ID (like `re_Du878zVwJKhe`).

When the Next.js app tried to register a blockchain wallet using the stub ID, the real BlindPay API returned:

```
POST /v1/instances/in_Du878zVwJKhe/receivers/51ab61af-4b46-4761-9f70-d4815b5984cf/blockchain-wallets
400: {"success":false,"message":"One or more params are not valid","errors":[{"code":"too_big","maximum":15,"type":"string","inclusive":true,"exact":true,"message":"String must contain exactly 15 character(s)","path":["receiver_id"]}]}
```

The stub ID is the wrong format and the wrong length. This means any app using real BlindPay API keys that calls `createCustomer()` then passes the resulting ID to `registerBlockchainWallet()`, `getFiatAccounts()`, `getQuote()`, etc. will get 400 errors.

The root cause is that BlindPay's customer creation is actually done via `createReceiver()` (a BlindPay-specific method not on the `Anchor` interface). The `createCustomer()` stub exists to satisfy the `Anchor` interface contract, but it generates IDs that are incompatible with BlindPay's API.

**Fix options:**
- Have `createCustomer()` call `createReceiver()` internally and return the real receiver ID
- Or document clearly that `createCustomer()` is a no-op on BlindPay and the consumer must call `createReceiver()` through the KYC flow first to get a valid receiver ID
- At minimum, if the stub must exist, generate an ID in the correct format (15 chars, `re_` prefix)

### Issue 3: Barrel `anchors/index.ts` (confirmed from round 1)

**Severity:** Low

Same issue as round 1. The subagent skipped the barrel index and imported directly from `blindpay/` and `types.ts`. The workaround is obvious but the documentation could be clearer.

### Issue 4: Token config not portable (confirmed from round 1)

**Severity:** Low

The subagent read `config/tokens.ts` to find the USDB issuer address but couldn't copy the file (uses `$lib` paths). Ended up hardcoding `'USDB'` in the flow components. Same finding as round 1.

---

## Comparison with Round 1 (React + Etherfuse)

| Dimension | React + Etherfuse | Next.js + BlindPay |
|-----------|:-:|:-:|
| Files needing modification | 2 | 0 |
| `erasableSyntaxOnly` issue | Yes | No (fixed) |
| Backend proxy layer | No (client-side mock only) | Yes (8 API routes) |
| BlindPay capability flags exercised | 0 | 5 |
| Composite customer ID | N/A | Yes (friction point) |
| Deferred signing | Yes (Etherfuse) | N/A (BlindPay uses payout submission) |
| Bank-before-quote flow | No | Yes |
| Wallet registration flow | No | Yes |
| Barrel index skipped | Yes | Yes |
| Token config hardcoded | Yes | Yes |

### New findings this round
- Composite customer ID is a leaky abstraction
- `createCustomer()` stub behavior is surprising
- The API route proxy pattern maps naturally from SvelteKit to Next.js
- Mock fallback in API routes is a useful development pattern

### Confirmed from round 1
- Barrel `index.ts` conflicts with selective copying
- Token config is not portable (`$lib` paths)

### Resolved since round 1
- `erasableSyntaxOnly` incompatibility (fixed before this round)

---

## Recommendations

### Priority 1: Address composite customer ID leakiness

Either:
- Have `BlindPayClient.getQuote()` accept `resourceId` as a separate parameter and build the composite internally
- Or add clear JSDoc on `GetQuoteInput.customerId` explaining the composite format convention

### Priority 2: JSDoc on `Anchor.createCustomer()`

Note that some providers may return a local stub rather than making a real API call, and that provider-specific setup methods (like `createReceiver`) may be needed.

### Priority 3: Carry forward round 1 recommendations

- Improve copy instructions (barrel index, wallet callout)
- Consider making token config portable

---

## File Manifest

### Portable library files used (from `src/lib/`)

| File | Copied Verbatim |
|------|:-:|
| `anchors/types.ts` | Yes |
| `anchors/blindpay/client.ts` | Yes |
| `anchors/blindpay/types.ts` | Yes |
| `anchors/blindpay/index.ts` | Yes |
| `wallet/freighter.ts` | Yes |
| `wallet/stellar.ts` | Yes |
| `wallet/types.ts` | Yes |
| `wallet/index.ts` | Yes |

### Next.js application files created

| File | Lines | Purpose |
|------|------:|---------|
| `src/lib/anchors/blindpay/server.ts` | 31 | Server-side BlindPayClient factory |
| `src/lib/api/anchor.ts` | 195 | Client-side API helpers |
| `src/app/api/anchor/blindpay/customers/route.ts` | 77 | Customer creation/lookup |
| `src/app/api/anchor/blindpay/kyc/route.ts` | 58 | KYC status + redirect URL |
| `src/app/api/anchor/blindpay/quotes/route.ts` | 66 | Quote generation |
| `src/app/api/anchor/blindpay/onramp/route.ts` | 105 | On-ramp creation + polling |
| `src/app/api/anchor/blindpay/offramp/route.ts` | 108 | Off-ramp creation + polling |
| `src/app/api/anchor/blindpay/fiat-accounts/route.ts` | 76 | Bank account management |
| `src/app/api/anchor/blindpay/blockchain-wallets/route.ts` | 48 | Wallet registration |
| `src/app/api/anchor/blindpay/payout-submit/route.ts` | 59 | Signed payout submission |
| `src/components/WalletConnect.tsx` | 102 | Wallet connection UI |
| `src/components/OnRampFlow.tsx` | 416 | MXN -> USDB with wallet registration |
| `src/components/OffRampFlow.tsx` | 557 | USDB -> MXN with bank-before-quote |
| `src/app/page.tsx` | 242 | Main page with tabs + customer management |

---

## Appendix A: Subagent Prompt

The following prompt was given to the subagent verbatim:

> **Task: Build a Next.js Application Using the Portable Anchor Library (BlindPay)**
>
> You are a Next.js developer who has discovered the Stellar Regional Starter Pack — a SvelteKit application with a portable anchor integration library. You want to build a Next.js application that integrates with BlindPay, one of the three supported anchor providers.
>
> **Your Goal**
>
> Build a working Next.js + TypeScript application that demonstrates a BlindPay integration for stablecoin on-ramp (fiat -> USDB) and off-ramp (USDB -> fiat) flows. You should also build Next.js API route handlers that proxy to BlindPay, instantiating the `BlindPayClient` server-side (with dummy API keys since we won't hit a real server).
>
> **How to Work**
>
> 1. Start by reading the documentation and source code in the reference SvelteKit repo. The key files are:
>    - `README.md` (top-level) and `CLAUDE.md` — project overview
>    - `src/lib/anchors/README.md` — anchor library documentation
>    - `src/lib/anchors/types.ts` — the shared `Anchor` interface and all common types
>    - `src/lib/anchors/blindpay/client.ts` — the `BlindPayClient` implementation
>    - `src/lib/anchors/blindpay/types.ts` — BlindPay API types
>    - `src/lib/anchors/blindpay/README.md` — BlindPay integration documentation
>    - `src/lib/wallet/freighter.ts`, `src/lib/wallet/stellar.ts`, `src/lib/wallet/types.ts` — portable wallet helpers
>    - `src/lib/components/OnRampFlow.svelte` and `src/lib/components/OffRampFlow.svelte` — reference UI implementations
>    - `src/lib/config/tokens.ts` — token definitions
>
> 2. Decide what to copy into the Next.js project at `_nextjs-test/`. Copy portable library files into `_nextjs-test/src/`. Maintain the relative directory structure so internal imports resolve.
>
> 3. Build the application. The Next.js project is already scaffolded at `_nextjs-test/` with TypeScript, Tailwind, App Router, and `src/` directory. Stellar dependencies are installed.
>
> 4. Build Next.js API route handlers (in `src/app/api/`) that instantiate `BlindPayClient` with dummy config and proxy requests. Use mock/dummy API keys — nothing will hit a real server, but the route structure and client instantiation should be real.
>
> 5. Document everything in `_nextjs-test/BUILD_JOURNAL.md`.
>
> **BlindPay-Specific Context**
>
> BlindPay has significantly different capabilities from Etherfuse:
> - `kycFlow: 'redirect'` — KYC is handled by redirecting to BlindPay's hosted page
> - `requiresBankBeforeQuote: true` — Off-ramp requires bank account selection BEFORE getting a quote
> - `requiresBlockchainWalletRegistration: true` — On-ramp requires wallet registration
> - `requiresAnchorPayoutSubmission: true` — Off-ramp uses BlindPay's payout endpoint instead of direct Stellar submission
> - `compositeQuoteCustomerId: true` — Quote API expects `customerId:resourceId` format
> - Token: USDB (not CETES)
> - Global coverage
>
> **What to Build**
>
> - API route handlers that instantiate `BlindPayClient` and proxy operations
> - Client-side components for wallet connection, on-ramp flow (with wallet registration), off-ramp flow (with bank-before-quote)
> - A main page tying it together
>
> **Verification**: `npx tsc --noEmit` and `npm run build` should pass with zero errors.
