# MoneyGram Anchor Integration

## Overview

[MoneyGram](https://www.moneygram.com) provides cash off-ramp services via the Stellar SEP-24 protocol. Users send USDC on Stellar and pick up cash at MoneyGram agent locations worldwide, or receive via bank deposit or PIX in select countries.

This is the first SEP-compliant anchor in the app. It uses the existing SEP library (`src/lib/anchors/sep/`) rather than a proprietary REST API.

**MoneyGram supports cash off-ramp in 174+ countries.** This integration is configured for Mexico and Brazil, but can be expanded.

## Supported Regions

| Region | Currency | Payment Rail | Direction     |
| ------ | -------- | ------------ | ------------- |
| Mexico | MXN      | Cash Pickup  | Off-ramp only |
| Brazil | BRL      | Cash Pickup  | Off-ramp only |

## Architecture

MoneyGram's SEP flow is fundamentally different from other anchors in this app. The user's JWT lives client-side, and SEP-24 calls go directly from the browser to MoneyGram (CORS allowed per SEP spec).

### Auth Flow (SEP-10)

1. Client requests challenge via our proxy route (`/api/anchor/moneygram/sep10`)
2. Server fetches challenge from MoneyGram, co-signs with `SEP1_SIGNING_KEY_SECRET` if `client_domain` operation is present
3. Client signs challenge with Freighter
4. Client submits signed challenge directly to MoneyGram → receives JWT
5. JWT stays client-side for all subsequent calls

### Off-Ramp Flow (SEP-24)

1. Client calls MoneyGram's SEP-24 `withdraw/interactive` endpoint directly (with JWT)
2. MoneyGram returns an interactive URL
3. User completes KYC, selects payout country/method, and confirms in MoneyGram's hosted UI
4. Client polls MoneyGram's SEP-24 transaction endpoint for `pending_user_transfer_start` status
5. Client builds USDC payment to MoneyGram's Stellar address with memo, signs with Freighter
6. Client polls for `completed` status and retrieves the MoneyGram reference number

### Server-Side Client

The `MoneyGramClient` implements the `Anchor` interface for **metadata only** (name, tokens, currencies, capabilities). All operation methods throw `UNSUPPORTED_OPERATION` — the actual SEP flow is orchestrated client-side using the SEP library directly.

## Environment Variables

```env
MONEYGRAM_DOMAIN="extstellar.moneygram.com"
```

`SEP1_SIGNING_KEY_SECRET` (already exists) is used by the SEP-10 proxy route for `client_domain` co-signing.

## MoneyGram Environments

| Environment | Domain                         | Network           |
| ----------- | ------------------------------ | ----------------- |
| Sandbox     | `extstellar.moneygram.com`     | Testnet           |
| Preview     | `previewstellar.moneygram.com` | Mainnet (limited) |
| Production  | `stellar.moneygram.com`        | Mainnet           |

## Documentation

- [MoneyGram Developer Docs](https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps)
- [SEP-10 Spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md)
- [SEP-24 Spec](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md)
- [MoneyGram Postman Collection](https://www.postman.com/sdf-eng/sdf-public-workspace/collection/ossy3ql/moneygram-stellar-api)
