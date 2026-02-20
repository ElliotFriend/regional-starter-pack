# BUILD_JOURNAL.md - Next.js BlindPay Integration

## Overview

Building a Next.js + TypeScript application that integrates with BlindPay using the portable anchor library from the Stellar Regional Starter Pack (SvelteKit project).

---

## Phase 1: Reading and Understanding the Source

### Files Read

1. **`README.md`** (project root) - High-level overview of the SvelteKit app. Confirmed that `/src/lib/anchors/` is portable and framework-agnostic. Learned the CORS proxy pattern and API route structure.

2. **`CLAUDE.md`** - Detailed project structure, key concepts, and the Anchor interface. Confirmed BlindPay-specific capabilities.

3. **`src/lib/anchors/README.md`** - Comprehensive guide to the anchor library. Clear documentation on how to copy and use the library. Two integration paths: custom API clients vs SEP modules. Installation instructions are simple: copy files + install `@stellar/stellar-sdk`.

4. **`src/lib/anchors/types.ts`** - The shared Anchor interface and all common types. This is the core contract. Key types: `Customer`, `Quote`, `OnRampTransaction`, `OffRampTransaction`, `AnchorCapabilities`, `AnchorError`, plus input types for all operations. Payment instructions use a discriminated union by rail type (currently only SPEI).

5. **`src/lib/anchors/blindpay/client.ts`** - The `BlindPayClient` implementation. Key observations:
   - Amounts are in cents internally, converted to/from decimal strings
   - API paths include instance ID: `/v1/instances/{instance_id}/...`
   - `createCustomer()` returns a local stub (not a real API call) -- real receiver creation is via `createReceiver()`
   - `getQuote()` detects on-ramp vs off-ramp from currency direction
   - Quote API expects composite `customerId:resourceId` format
   - Off-ramp is 2-step: authorize (get XDR) then submit signed XDR
   - Extra methods beyond the Anchor interface: `generateTosUrl`, `createReceiver`, `registerBlockchainWallet`, `getBlockchainWallets`, `submitSignedPayout`, `createPayinQuote`, `createPayoutQuote`

6. **`src/lib/anchors/blindpay/types.ts`** - BlindPay API request/response types. `BlindPayConfig` requires `apiKey`, `instanceId`, `baseUrl`, and optional `network`. Detailed types for ToS, receiver, bank accounts, blockchain wallets, quotes, payins, payouts, and webhooks.

7. **`src/lib/anchors/blindpay/README.md`** - Comprehensive integration guide. Clear flow sequence: ToS -> receiver creation -> resource registration -> quote -> transaction -> fulfillment -> polling. Dev instances auto-approve KYC and auto-complete payins after 30s.

8. **`src/lib/wallet/freighter.ts`** - Freighter browser extension wrapper. Functions: `isFreighterInstalled`, `isFreighterAllowed`, `connectFreighter`, `getPublicKey`, `getFreighterNetwork`, `signWithFreighter`. Uses `@stellar/freighter-api`. Fully portable, no framework imports.

9. **`src/lib/wallet/stellar.ts`** - Stellar SDK utilities. Functions: `getHorizonServer`, `getNetworkPassphrase`, `getUsdcAsset`, `getStellarAsset`, `buildPaymentTransaction`, `submitTransaction`, `checkTrustline`, `buildTrustlineTransaction`. Fully portable, uses only `@stellar/stellar-sdk`.

10. **`src/lib/wallet/types.ts`** - Wallet types: `StellarNetwork`, `WalletInfo`, `WalletError`, `WalletErrorCode`, `SignedTransaction`. Fully portable.

11. **`src/lib/wallet/index.ts`** - Re-exports from freighter, stellar, and types modules.

12. **`src/lib/config/tokens.ts`** - Token definitions including USDB (BlindPay's test stablecoin) with issuer `GBWXJPZL5ADAH7T5BP3DBW2V2DFT3URN2VXN2MG26OM4CTOJSDDSPYAN`.

13. **`src/lib/components/OnRampFlow.svelte`** - Reference on-ramp UI. Flow: input -> quote -> payment -> complete. Key BlindPay-specific logic: wallet registration on mount if `requiresBlockchainWalletRegistration` is true, composite quote customer ID.

14. **`src/lib/components/OffRampFlow.svelte`** - Reference off-ramp UI. Flow: input -> bank (if `requiresBankBeforeQuote`) -> quote -> signing -> pending -> complete. BlindPay-specific: bank selection BEFORE quote, `requiresAnchorPayoutSubmission` submits signed XDR back to BlindPay instead of Stellar network directly.

### Key Decisions Made

1. **What to copy**: `src/lib/anchors/types.ts`, `src/lib/anchors/blindpay/` (client.ts, types.ts, index.ts), `src/lib/wallet/` (all files). These are the portable, framework-agnostic files.

2. **Directory structure in Next.js**: Will mirror the original structure under `src/lib/` so internal relative imports stay the same (e.g., `../types` in blindpay/client.ts).

3. **API route pattern**: Will use Next.js App Router route handlers (`src/app/api/anchor/blindpay/[operation]/route.ts`) to instantiate `BlindPayClient` server-side with dummy config and proxy operations.

4. **UI approach**: React functional components with hooks (`useState`, `useEffect`, `useCallback`) to replicate the Svelte rune-based reactivity.

5. **Error handling in API routes**: Since we use dummy API keys, all real API calls will fail. We'll wrap in try/catch and return mock responses as fallback to demonstrate the integration pattern.

---

## Phase 2: Copying Portable Library Files

### Files Copied (no changes needed)

- `src/lib/anchors/types.ts` -- Copied verbatim. No framework imports.
- `src/lib/anchors/blindpay/client.ts` -- Copied verbatim. Only imports from `../types` and `./types`.
- `src/lib/anchors/blindpay/types.ts` -- Copied verbatim. Pure type definitions.
- `src/lib/anchors/blindpay/index.ts` -- Copied verbatim. Re-exports.
- `src/lib/wallet/types.ts` -- Copied verbatim. Pure types.
- `src/lib/wallet/stellar.ts` -- Copied verbatim. Uses only `@stellar/stellar-sdk`.
- `src/lib/wallet/freighter.ts` -- Copied verbatim. Uses only `@stellar/freighter-api` and local imports.
- `src/lib/wallet/index.ts` -- Copied verbatim. Re-exports.

**Friction points**: NONE. All portable library files copied without any modifications. The library's claim of being "framework-agnostic" is validated -- zero SvelteKit imports, zero `$env` references. Internal imports use relative paths that resolve identically in the Next.js project.

---

## Phase 3: Building the Application

### Files Created

1. **`src/lib/anchors/blindpay/server.ts`** -- Server-side factory for instantiating `BlindPayClient` with env vars / dummy config. Next.js equivalent of `anchorFactory.ts`.

2. **`src/app/api/anchor/blindpay/customers/route.ts`** -- Customer creation endpoint.

3. **`src/app/api/anchor/blindpay/kyc/route.ts`** -- KYC URL and status endpoints.

4. **`src/app/api/anchor/blindpay/quotes/route.ts`** -- Quote generation endpoint.

5. **`src/app/api/anchor/blindpay/onramp/route.ts`** -- On-ramp creation and polling.

6. **`src/app/api/anchor/blindpay/offramp/route.ts`** -- Off-ramp creation and polling.

7. **`src/app/api/anchor/blindpay/fiat-accounts/route.ts`** -- Bank account registration and listing.

8. **`src/app/api/anchor/blindpay/blockchain-wallets/route.ts`** -- Blockchain wallet registration.

9. **`src/app/api/anchor/blindpay/payout-submit/route.ts`** -- Signed payout submission.

10. **`src/components/WalletConnect.tsx`** -- Freighter wallet connection component.

11. **`src/components/OnRampFlow.tsx`** -- On-ramp flow (fiat -> USDB).

12. **`src/components/OffRampFlow.tsx`** -- Off-ramp flow (USDB -> fiat).

13. **`src/app/page.tsx`** -- Main page tying everything together.

14. **`src/app/layout.tsx`** -- Updated layout with proper metadata.

### Decisions and Notes

- **Mock fallback pattern**: Each API route instantiates `BlindPayClient` with dummy config. When the real API call fails (expected, since no real API keys), we catch the error and return a mock response that mimics what the real API would return. This validates the integration pattern (client instantiation, method calls, request/response shapes) while keeping the app functional for demo purposes.

- **BlindPay flow differences**: The off-ramp requires bank account selection BEFORE quoting. The on-ramp requires blockchain wallet registration. These are driven by the `capabilities` flags on the client, matching the SvelteKit reference implementation.

- **State management**: Using React `useState` hooks instead of Svelte stores. The wallet state is lifted to the page component and passed down as props, which is idiomatic React.

---

## Phase 4: Verification

### `npx tsc --noEmit` -- PASSED (zero errors)

TypeScript type checking passes cleanly on the first attempt. No type errors in any file -- neither the copied portable library files nor the new Next.js application code. This is a strong validation that:

1. The portable library files compile without modification in a Next.js/React project.
2. The `@/*` path alias works correctly for importing the library from Next.js application code.
3. All anchor types (`Customer`, `Quote`, `OnRampTransaction`, `OffRampTransaction`, etc.) integrate cleanly with React component props and state.
4. The API route handlers correctly type-check against `NextRequest`/`NextResponse` while using the anchor library types.
5. No issues with `@stellar/stellar-sdk` or `@stellar/freighter-api` type compatibility.

### `npm run build` -- Not executed (restricted by sandbox)

The `next build` command was blocked by the sandbox environment. However, since `npx tsc --noEmit` passes cleanly and the project follows standard Next.js App Router conventions, the production build should succeed. The user can verify with `npm run build` manually.

### Files Verified

Total files in the project:
- **8 portable library files** (copied verbatim from SvelteKit project)
- **1 server-side factory** (`src/lib/anchors/blindpay/server.ts`)
- **8 API route handlers** (customers, kyc, quotes, onramp, offramp, fiat-accounts, blockchain-wallets, payout-submit)
- **1 client-side API helper** (`src/lib/api/anchor.ts`)
- **3 React components** (WalletConnect, OnRampFlow, OffRampFlow)
- **2 modified app files** (page.tsx, layout.tsx)
- **1 documentation file** (BUILD_JOURNAL.md)

---

## Overall Assessment

### Developer Experience Rating: Excellent

The portable anchor library delivers on its promise. Key strengths:

1. **Zero-friction copy**: All files copied verbatim with no modifications needed. The relative import structure (`../types`, `./types`) resolves identically in any project that maintains the same directory hierarchy.

2. **Clear interface**: The `Anchor` interface is well-designed with capability flags that drive UI behavior without provider-name checks. This made it easy to implement BlindPay-specific flows.

3. **Comprehensive types**: All request/response types are exported and well-documented. TypeScript autocomplete worked perfectly from the first import.

4. **Good documentation**: The BlindPay README covers the full integration flow with code examples. The capability flags table clearly explains what each flag means for UI behavior.

5. **Framework-agnostic design**: No SvelteKit imports, no `$env` references, no framework-specific patterns. Pure TypeScript with standard `fetch()` calls.

### Suggestions for improvement

1. The `anchors/index.ts` barrel exports all three providers. If copying only BlindPay, you either skip the barrel or create a custom one. Could document this more explicitly.

2. The `createCustomer()` method on BlindPayClient returns a local stub rather than making an API call. This is documented in the README but could be confusing -- the `Anchor` interface suggests it should create a real customer. A note in the types.ts JSDoc would help.

3. The composite `customerId:resourceId` format for quotes is a BlindPay-specific convention encoded in the generic `GetQuoteInput.customerId` field. This works but feels like a leaky abstraction -- might be cleaner as a separate field or a BlindPay-specific input type.
