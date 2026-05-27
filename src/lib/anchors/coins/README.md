# Coins.ph

Server-side TypeScript client for [Coins.ph](https://coins.ph), the leading crypto on/off-ramp in the Philippines. Wired here as an **interactive (SEP-24-style)** [`Anchor`](../types.ts): the entire customer-facing flow is hosted in a Coins.ph widget reached via a signed URL.

> **Status: on-ramp, launch-only, provisionally curated.** This is a first integration built without sandbox credentials. It is functionally complete and unit-tested, but **not yet verified live**. See [Caveats & open questions](#caveats--open-questions).

## Files

| File         | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| `client.ts`  | `CoinsRampClient` — implements the `Anchor` `interactive` facet |
| `signing.ts` | HMAC-SHA256 request signing (Web Crypto, isomorphic)            |
| `types.ts`   | Config + Coins.ph order/status types                            |
| `index.ts`   | Re-exports the client and public types                          |

## How it maps to the Anchor model

Coins.ph fits the **`interactive` facet** (the SEP-24 archetype): the anchor hosts login, KYC/MFA, payment, and settlement. The portable surface is:

- `interactive.startOnRamp(input)` → builds a **signed widget URL** and returns `{ interactiveUrl, transactionId: '' }`. The app opens the URL (the shared `InteractiveRampFlow` component does this in a popup).
- `interactive.getOnRampTransaction(id)` → returns `null` (see launch-only below).
- `interactive.startOffRamp` / `getOffRampTransaction` → throw `AnchorError('NOT_IMPLEMENTED', 501)`.

It deliberately has **no `auth` facet**: Coins.ph authenticates the end user itself (phone/email + MFA) inside the widget, so there is no SEP-10 wallet handshake. `requiresWalletAuth` is `false`. The connected Freighter wallet's public key is used only as the **USDC destination address** (`address`) passed to the widget.

`flowStyles: ['interactive']`, `supportedCurrencies: ['PHP']`, `supportedRails: ['instapay', 'pesonet', 'gcash', 'maya']`, `supportedTokens: [USDC]` (issuer from config).

## Signing

Both the widget URL and the (future) REST calls authenticate the **merchant** with an HMAC-SHA256 signature keyed by the merchant `secretKey`. Signing happens **server-side only** — the client is instantiated by the anchor factory from `$env/dynamic/private`, and only the finished signed URL (carrying `signature`, never the secret) is returned to the browser.

`signing.ts` uses the **Web Crypto API** (`crypto.subtle`) rather than `node:crypto`, keeping the portable library isomorphic and dependency-free.

```typescript
import { CoinsRampClient } from 'path/to/anchors/coins';

const coins = new CoinsRampClient({
    apiKey: process.env.COINS_API_KEY!,
    secretKey: process.env.COINS_SECRET_KEY!, // server-side only
    merchantId: process.env.COINS_MERCHANT_ID!,
    widgetBaseUrl: 'https://9001.pl-qa.coinsxyz.me', // sandbox; prod is https://coins.ph
    country: 'PH',
    usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
});

// On-ramp: build the signed widget URL and open it for the user.
const { interactiveUrl } = await coins.interactive!.startOnRamp({
    assetCode: 'USDC',
    account: 'G...', // user's Stellar address (USDC destination)
    amount: '100', // optional; user can also enter it in the widget
});
window.open(interactiveUrl, '_blank');
```

## Launch-only status

The hosted widget creates the order **after** the user logs in, so no order id is available when we build the URL. As a result:

- `startOnRamp` returns an **empty `transactionId`**.
- `getOnRampTransaction` returns **`null`** — there is nothing to poll yet.

The shared interactive UI degrades gracefully (it polls, gets nothing, and after a timeout tells the user to check back later). Completion is confirmed **out-of-band** (Coins.ph sends an email when the order completes).

**Follow-up (deferred):** server-side status can be added via Coins.ph's order/status APIs — `ramp/v1/orderDetail` (poll by `orderId`) and the **callback webhook** (`POST` to a merchant URL on status change). This needs (a) a public webhook endpoint, (b) a small order store, and (c) a way to correlate the launched widget session with the resulting `orderId`. The coarse status enum is in `types.ts` (`CoinsOrderStatus`); the documented `orderStatus` values include `CREATE`, `RISK_REVIEW`, `QUOTE_ACCEPTED`, `CRYPTO_*`, `PAYOUT_*`, with terminal states `SUCCEEDED`, `FAILED`, `CANCELLED`, `REFUNDED`, `EXPIRED`.

## Caveats & open questions

These are the things to confirm against the Coins.ph sandbox once credentials are available:

1. **Stellar network support.** The ramp docs we have list EVM chains and Solana as networks — **Stellar is not listed** (only a `tag` field "for XRP/XLM/EOS" hints at it). USDC-on-Stellar is **assumed** per project direction. This is the top risk; if Stellar isn't supported, the integration can't function.
2. **Widget URL param names + signature canonicalization.** The exact query-param keys (`type`/`token`/`network`/`address`/`amount` vs. the REST `targetCurrency`/`targetNetwork`/`targetAmount`/`targetAddress`), and how the signature is canonicalized (field ordering, whether `timestamp`/`nonce` are signed or header-only), are not fully pinned down. Both are isolated in `signing.ts` and `client.ts` for a one-place correction.
3. **Quality criteria.** Coins.ph offers USDC/USDT (USD-pegged), **not a PHP-denominated Stellar asset**, so it does not meet the project's "locally denominated asset" criterion — the same gap as the USDC-only honorable mentions. It is listed as **curated provisionally**; revisit (or move to honorable mention) pending a PHP-denominated asset.
4. **Off-ramp model.** Off-ramp (USDC → PHP) is not implemented. The REST docs describe a merchant-custodial on-chain model (`confirmOnChainFunding` / `initOnChainFund`); whether the consumer widget shows a Stellar deposit address for a user sending their own USDC needs confirmation.

## Environment variables

Read via `$env/dynamic/private` (so missing values don't break the build before provisioning):

```env
COINS_API_KEY=""
COINS_SECRET_KEY=""
COINS_MERCHANT_ID=""
COINS_WIDGET_BASE_URL="https://9001.pl-qa.coinsxyz.me"   # sandbox; prod is https://coins.ph
COINS_API_BASE_URL=""
COINS_COUNTRY="PH"
```

The USDC issuer is taken from the public `PUBLIC_USDC_ISSUER`.
