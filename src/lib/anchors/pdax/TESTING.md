# PDAX integration — live sandbox test plan

The on-ramp got partway through this morning before the sandbox closed. The off-ramp has never been exercised end-to-end. This doc is what we need a tester near Manila to run during sandbox hours.

**Sandbox hours**: Mon–Fri 06:00–22:00 Asia/Manila (PHT, UTC+8). Excludes PH holidays.

## Setup

1. Clone, `pnpm install`.
2. Set `.env`:

    ```text
    PDAX_USERNAME=<credentials from PDAX>
    PDAX_PASSWORD=<credentials from PDAX>
    PDAX_BASE_URL=https://<our-fly-proxy>.fly.dev
    PDAX_PROXY_SECRET=<matches PROXY_SECRET on the Fly app>
    ETHERFUSE_API_KEY=<not needed, leave blank>
    ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
    PUBLIC_STELLAR_NETWORK=testnet
    PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
    ```

    Use the Fly proxy URL — its egress IP is the one PDAX has whitelisted. Don't bother trying to whitelist your laptop IP.
3. `pnpm dev`. Open `http://localhost:5173/anchors/pdax`.
4. Install Freighter (browser extension), set it to **testnet**, fund the account from the testnet faucet, add a USDC trustline (the off-ramp page surfaces a button).

## On-ramp test (PHP → USDC)

1. `/anchors/pdax/onramp`, connect Freighter.
2. Fill the registration form; pick Philippines.
3. KYC form: click **Fill Test Data (Sandbox)**, submit. Should land on the amount step (no verification loop — if it loops back to the form, the `submitKyc → kycStatus` writeback regressed).
4. Enter `1000` PHP. Get quote.
5. **Confirm and get payment details.** Expected: PDAX returns a `payment_checkout_url` and the UI shows pending. If you get `"sender_national_identity_number is only accept alphanum"` or any other Joi-style validation error, capture the field name — sandbox values may need updates in `src/lib/anchors/sandbox.ts`.
6. Open the payment_checkout_url in a new tab and complete the simulated InstaPay payment (PDAX's sandbox provides a button for this).
7. Watch the page. The poll should advance: `pending → processing → completed`. Expected wire activity:
    - `POST /v1/trade` (one call only — verify in proxy logs)
    - `POST /v1/crypto/withdraw`
    - `GET /v1/crypto/transactions?identifier=<our-uuid>` returning `status: completed` with a `txn_hash`
8. End state: USDC trustline balance increases; `stellarTxHash` shown.

**If it gets stuck**:

- At `pending` after PDAX-side payment confirmation: `GET /v1/fiat/transactions?identifier=<uuid>` should be returning your tx with `status: COMPLETED` or a non-null `fulfilled_at`. If it returns somebody else's tx or `[]`, that's the new "no first-record fallback" behaviour from this morning's commit doing what it should — PDAX isn't matching by identifier.
- At `processing` for >30s: trade probably succeeded but `/crypto/withdraw` is failing. Check proxy logs.

## Off-ramp test (USDC → PHP) — never tested before this branch

1. `/anchors/pdax/offramp`. Same Freighter + KYC as above (KYC state persists in localStorage).
2. Enter `50` USDC. Get quote.
3. Bank account form should render the Philippines variant (bank dropdown sourced from PDAX's `BANK_CODES`, account name, account number). **If you see the SPEI form (CLABE field), that's a regression** — the layout's `paymentRail` isn't propagating.
4. Click **Fill Test Data (Sandbox)**, then **Confirm & Sign**.
5. Freighter pops up with a Stellar payment to PDAX's deposit address with a memo. Sign + submit.
6. Watch the page. Expected wire activity:
    - First poll: `GET /v1/crypto/transactions` (no `?identifier=` filter) — we match `type === 'crypto_in'` + `receiver_wallet_address_tag === <memo>` client-side.
    - Once matched: `POST /v1/trade` (sell side) → `POST /v1/fiat/withdraw`.
    - Final poll: `GET /v1/fiat/transactions?identifier=<uuid>` shows `COMPLETED`.
7. End state: PHP arrives in the sandbox bank account.

**Most likely failure mode**: the memo-matching step. If PDAX's sandbox response shape for `/crypto/transactions` differs from our type — particularly if the memo lives in a field other than `receiver_wallet_address_tag`, or if `type` is something other than `'crypto_in'` — the off-ramp will hang in `crypto_pending` forever. Capture a sample response (proxy logs) and adjust `findCryptoDepositByMemo` in `client.ts`.

## Things to live-validate (changed this branch, not yet hit by a real PDAX response)

| Concern | Where | What confirms it |
| --- | --- | --- |
| `/crypto/transactions` returns `receiver_wallet_address_tag` | `client.ts:findCryptoDepositByMemo` | Off-ramp advances past `crypto_pending` |
| Trade idempotency dedupes on retry | `client.ts:executeTrade` (uses `transactionId`) | Force a retry (kill the dev server mid-poll, restart) — `tradeBodies` should still produce one order, not two |
| Auth refresh falls back to login on non-401 | `auth.ts:refreshOrRelogin` | Hard to trigger naturally; only matters if a refresh token expires unusually |
| JWT `exp` is the actual TTL | `auth.ts:readJwtExp` | If polling stops working after ~10 min and `expiry: 600` is wrong, tokens will silently 401 |
| `country: 'PH'` flows through (no MX defaulting) | `customers/+server.ts` | Customer record should show `country: 'PH'` |

## Open questions to ask PDAX team

1. Does `GET /v1/crypto/transactions` accept a `tag` or `memo` query parameter, or pagination / date filters? OpenAPI documents only `identifier` and `txn_hash`; pulling the full unfiltered list won't scale.
2. What's the actual JWT lifetime, and is the `expiry` field in the login response authoritative? We're now reading the access token's `exp` claim — confirm that's the source of truth.
3. Is `gcash_cashin` still a supported method? OpenAPI example uses it but the docs list omits it.
4. Webhook signature scheme for `/config/webhook` — none documented.
5. Quote expiry SLA — `expires_at` is returned but no typical duration documented.

## Troubleshooting

- **Proxy logs**: `flyctl logs -a <proxy-app-name>` from the proxy/ dir. Every request is logged with method, path, upstream status.
- **Common errors**:
  - `"accessToken" is required` (Joi format) → header issue. The proxy now rewrites `X-Pdax-Access-Token`/`X-Pdax-Id-Token` to `access_token`/`id_token`. If this comes back, the proxy redeploy didn't land — verify with `flyctl status`.
  - `"<field> is only accept alphanum"` → sandbox prefill in `sandbox.ts` needs scrubbing.
  - `OT010003` (quote expired) → user took too long; restart the flow.
  - `OT010001` (duplicate request) → the deterministic idempotency_id worked — PDAX correctly deduped a retry.
- **State store loss**: if `getOnRampTransaction` returns 404 for a tx you just created, the dev server probably restarted. State is in-memory only (see `pdax/README.md`).

## Files worth opening before starting

- `src/lib/anchors/pdax/client.ts` — the state machine; almost every issue lands here.
- `src/lib/anchors/pdax/openapi.yaml` — source of truth for request/response shapes.
- `src/lib/anchors/sandbox.ts` — sandbox prefill values that PDAX may reject.
- `proxy/app.py` — the Fly proxy (header rewriting, IP whitelist).
