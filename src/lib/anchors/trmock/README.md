# TR Mock Anchor

Client for `tr-mock-anchor.fly.dev` — a Turkish TRY↔USDC **mock** anchor on
Stellar testnet, built by Kaan Kacar (`github.com/kaankacar/tr-mock-anchor`).

It is not operated by BiLira and it moves no real money. The bank leg and KYC
are simulated; the Stellar leg pays real testnet USDC.

- Integration guide: <https://tr-mock-anchor.fly.dev/sep>
- Concepts and Turkish rails: <https://tr-mock-anchor.fly.dev/guide>
- What changes on mainnet: <https://tr-mock-anchor.fly.dev/mainnet>

## Usage

`TrMockRampClient` (errors: `TrMockError`) is browser-safe: the anchor holds no
secrets and serves CORS on its SEP endpoints, so the demo pages construct it
directly, with no proxy routes.

```typescript
import { TrMockRampClient } from 'path/to/anchors/trmock';

const anchor = new TrMockRampClient({
    domain: PUBLIC_TRMOCK_HOME_DOMAIN, // tr-mock-anchor.fly.dev by default
    usdcIssuer: PUBLIC_USDC_ISSUER,
    // Optional: networkPassphrase, horizonUrl, fetchFn, debug
});

// SEP-10 (sign the challenge with the user's wallet)
const challenge = await anchor.getChallenge(publicKey);
const { token } = await anchor.submitChallenge(signedXdr);

// SEP-38 firm quote, then a quoted SEP-6 deposit
const quote = await anchor.createQuote(token, {
    sell_asset: anchor.fiatAssetId(),
    buy_asset: anchor.sep38AssetId(),
    sell_amount: '1000',
    context: 'sep6',
});
const deposit = await anchor.depositExchange(token, {
    amount: '1000',
    account: publicKey,
    quoteId: quote.id,
});

// Sandbox only: stand in for the incoming TRY bank transfer
await anchor.simulateBankTransfer(token, deposit.id!, '1000');

// Poll (null on 404)
const tx = await anchor.getTransaction(token, deposit.id!);
```

`withdrawExchange(token, { amount, account, quoteId?, dest? })` returns the
anchor's account and memo plus a ready `signableXdr` for the wallet to sign.
SEP-12 is available via `getCustomer` / `putCustomer`, but the anchor
auto-approves every customer and gates neither ramp on KYC.

## Known wire quirk

`deposit-exchange` and `withdraw-exchange` reject the SEP-38 identifier
`stellar:USDC:<issuer>` and require the bare code `USDC`, while the fiat leg
still requires `iso4217:TRY`. `TrMockRampClient.exchangeAssetRef()` encodes
this; `sep38AssetId()` returns the spec form for SEP-38 quotes, which do
accept it. Verified 2026-09-15 (internal notes, not in this repo).
