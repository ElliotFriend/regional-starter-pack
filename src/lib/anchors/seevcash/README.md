# SeevCash

Client for `anchor.seevcash.com`, SeevCash's Ghana SEP anchor on Stellar
testnet. It bridges USDC with GHS over mobile money (MTN, Telecel,
AirtelTigo). GHS is off-chain fiat; USDC is the only Stellar asset.

On testnet the mobile money leg is simulated and the Stellar leg pays real
testnet USDC. Mainnet runs on a separate host, `anchor-prod.seevcash.com`.

The client is browser-safe. SeevCash holds no secrets and serves CORS
(`Access-Control-Allow-Origin: *`, with `Authorization` and `Content-Type`
allowed) on every SEP endpoint, so the demo calls it directly from the
browser with no proxy routes.

- Docs: <https://docs.seevcash.com/docs/anchor>
- Machine-readable docs: <https://docs.seevcash.com/llms-full.txt>

## Usage

```typescript
import { SeevcashRampClient } from 'path/to/anchors/seevcash';

const anchor = new SeevcashRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER });
// Optional: domain, networkPassphrase, horizonUrl, fetchFn, debug
```

Methods: `getChallenge` / `submitChallenge` (SEP-10), `getCustomer` /
`putCustomer` (SEP-12), `getPrice({ kind, amount })` (SEP-38 preview; `amount`
is always USDC), `info`, `deposit`, `withdraw` (returns a ready `signableXdr`),
and `getTransaction` (null on 404). Errors are `SeevcashError`, carrying the
anchor's status and message.

## Flow

1. SEP-10 auth (any keypair; no API key).
2. SEP-12 `PUT /customer` with SEP-9 fields, including `mobile_money_number`
   and `mobile_money_provider`. Testnet auto-accepts.
3. Optional SEP-38 `/price` preview (`getPrice`).
4. SEP-6 `deposit` (the anchor prompts the customer's mobile money wallet) or
   `withdraw` (the wallet pays USDC to `account_id` with the returned memo).
5. Poll SEP-6 `/transaction`.

## Wire quirks (verified 2026-10-05)

- `/withdraw` requires `funding_method` (`mobile`), which the docs omit. The
  payout number comes from the SEP-12 `mobile_money_*` fields; `dest` and
  `dest_extra` are ignored.
- SEP-12 accepts and reports `ACCEPTED` for any key, recognised or not. Use
  SEP-9 `birth_date`; the docs' `date_of_birth` is not recognised.
- SEP-24 lives at the toml's `TRANSFER_SERVER_SEP0024` root, not the docs'
  `/sep24/...` paths, and its hosted page currently returns 500. This client
  covers SEP-6 only.
- SEP-10 JWTs expire after 15 minutes (the docs say 24 hours).
- `/sep6/info` advertises `account_creation: true`, but a deposit to an
  unfunded account errors ("Destination account ... does not exist"). The
  account must exist and trust USDC first.
- SEP-6 transaction objects include `amount_in` and `amount_out` but omit
  `amount_fee`.
