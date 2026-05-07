# PDAX Client

Server-side TypeScript client for the [PDAX](https://pdax.ph) (Philippine Digital Asset Exchange) institutional API. Handles fiat on/off ramps in the Philippines:

- **Philippines** — PHP ↔ USDC on Stellar via the InstaPay / PESONet payment rails.

PDAX exposes a **stateless, per-transaction API**: it does not retain customer records or KYC state on its end. Sender and beneficiary identity fields are submitted with every ramp request. As a result, this client owns customer / KYC state locally; only the ramp-execution methods (`getQuote`, `createOnRamp`, `getOnRampTransaction`, `createOffRamp`, `getOffRampTransaction`) actually call PDAX over the wire.

**This client must only run on the server.** It authenticates with username + password and caches a JWT pair (`access_token` + `id_token`) used by every authenticated PDAX request.

## Files

| File            | Purpose                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `client.ts`     | `PdaxClient` class — implements the shared `Anchor` interface                 |
| `auth.ts`       | `PdaxAuth` — login, JWT caching, proactive refresh, MFA-rejection             |
| `stateStore.ts` | `PdaxStateStore` adapter interface + `InMemoryPdaxStateStore` default impl    |
| `types.ts`      | PDAX-specific request/response shapes plus internal state-machine types       |
| `reference.ts`  | Generated lookup tables (banks, countries, identity-field specs, error codes) |
| `openapi.yaml`  | Generated OpenAPI 3.2 spec                                                    |
| `index.ts`      | Re-exports the client class, auth helper, state store, and reference data     |

`reference.ts` and `openapi.yaml` are regenerated from the PDAX docs by `scripts/pdax/generate-openapi.py` — do not edit them by hand.

## Integration Flow

PDAX requires three calls to complete a single on-ramp, orchestrated by the client:

### On-ramp (PHP → USDC)

1. **Customer / KYC (local-only)** — `createCustomer`, `submitKyc`. Identity fields are stored client-side in the `kycStore` and replayed on every PDAX request.
2. **Quote** — `POST /v2/trade/quote` — `side: 'buy'`, `base_currency: 'PHP'`, `quote_currency: 'USDCXLM'`, `currency: 'PHP'`, `quantity: <PHP amount>`. Returns a firm quote with `expires_at`.
3. **Fiat deposit** — `POST /v1/fiat/deposit` with the full identity payload + a generated `identifier`. Returns a `payment_checkout_url` (DragonPay / GrabPay / InstaPay-via-QRPh) the user pays into.
4. **Trade execution** _(triggered by polling `getOnRampTransaction`)_ — once `/fiat/transactions` reports `COMPLETED` for our identifier, the client posts `/v1/trade` with the quote id to lock in the conversion.
5. **Crypto withdrawal** _(also triggered by polling)_ — `POST /v1/crypto/withdraw` to the user's Stellar address. Status is then tracked via `/v1/crypto/transactions?identifier=…` until `completed`.

### Off-ramp (USDC → PHP)

1. **Customer / KYC** — same local-only flow.
2. **Quote** — `POST /v2/trade/quote` with `side: 'sell'`, `currency: 'USDCXLM'`, `quantity: <USDC amount>`.
3. **Crypto deposit address** — `GET /v1/crypto/deposit?currency=USDCXLM` returns a Stellar address + memo. The user's wallet builds a normal payment transaction to that address; the off-ramp UI handles the signing.
4. **Trade execution** _(triggered by polling)_ — once the deposit shows up on `/crypto/transactions`, the client posts `/v1/trade` with the quote id.
5. **Fiat withdrawal** _(also triggered by polling)_ — `POST /v1/fiat/withdraw` with the full identity + bank-account payload. Status is tracked via `/fiat/transactions?identifier=…`.

## State machine

The on-ramp and off-ramp are multi-step. Each call to `getOn/OffRampTransaction` inspects PDAX's per-leg status via the polling endpoints and advances the state machine when it can.

| On-ramp stage       | Triggered by                        | Next call                   |
| ------------------- | ----------------------------------- | --------------------------- |
| `fiat_pending`      | `createOnRamp` writes initial state | poll `/fiat/transactions`   |
| `fiat_fulfilled`    | fiat txn shows `COMPLETED`          | `POST /v1/trade`            |
| `trade_executed`    | trade succeeds                      | `POST /v1/crypto/withdraw`  |
| `crypto_dispatched` | withdraw accepted by PDAX           | poll `/crypto/transactions` |
| `completed`         | crypto txn shows `completed`        | terminal                    |

Off-ramp mirrors the same shape with `crypto_pending → crypto_received → trade_executed → fiat_dispatched → completed`.

### State storage — `PdaxStateStore`

PDAX has no concept of an order id, so the orchestration state above has to live somewhere on our side. The client takes a pluggable `PdaxStateStore` adapter at construction time:

```ts
import { PdaxClient, InMemoryPdaxStateStore } from '$lib/anchors/pdax';

const pdax = new PdaxClient({
    username,
    password,
    baseUrl,
    stateStore: new InMemoryPdaxStateStore(), // default if omitted
});
```

The interface is six methods (get/put/delete for on-ramp and off-ramp records). Pick the implementation that fits your deployment:

- **Single-process Node / dev / tests** → `InMemoryPdaxStateStore` (default). Records live on the client instance.
- **Vercel / Lambda / multi-instance serverless** → write a small adapter against your KV of choice. **Do not ship the in-memory default to serverless** — different request invocations land on different isolates, so `getOnRampTransaction` will return `null` for a transaction that `createOnRamp` just created on a sibling isolate, and the off-ramp poll loop will quietly stop. The interface is intentionally minimal; a Vercel KV adapter is ~25 lines:

    ```ts
    import { kv } from '@vercel/kv';
    import type { PdaxStateStore } from '$lib/anchors/pdax';
    import type { PdaxOnRampState, PdaxOffRampState } from '$lib/anchors/pdax/types';

    export class VercelKvPdaxStateStore implements PdaxStateStore {
        async getOnRamp(id: string) {
            return (await kv.get<PdaxOnRampState>(`pdax:onramp:${id}`)) ?? null;
        }
        async putOnRamp(s: PdaxOnRampState) {
            await kv.set(`pdax:onramp:${s.id}`, s, { ex: 86400 });
        }
        async deleteOnRamp(id: string) {
            await kv.del(`pdax:onramp:${id}`);
        }
        async getOffRamp(id: string) {
            return (await kv.get<PdaxOffRampState>(`pdax:offramp:${id}`)) ?? null;
        }
        async putOffRamp(s: PdaxOffRampState) {
            await kv.set(`pdax:offramp:${s.id}`, s, { ex: 86400 });
        }
        async deleteOffRamp(id: string) {
            await kv.del(`pdax:offramp:${id}`);
        }
    }
    ```

The Anchor interface (`getOnRampTransaction(id)`) is the same as Etherfuse — id-in, transaction-out. State persistence is invisible to the consumer.

## Authentication

`PdaxAuth` owns the JWT lifecycle:

- Logs in once via `POST /pdax-institution/v1/login` with username / password.
- Caches `access_token`, `id_token`, `refresh_token`, and `expiry`.
- **Refreshes 5 minutes before expiry** via `PUT /pdax-institution/v1/refresh-token`. (Note: the request uses camelCase `refreshToken` even though the response uses snake_case `refresh_token`.)
- Falls back to a fresh login if the refresh-token call returns `401`.
- **Rejects MFA challenges**: if the login response carries a `challenge_name`, an `AnchorError` with code `MFA_REQUIRED` is thrown — MFA must be disabled on the API account for this integration.

`getTokens()` returns `{ accessToken, idToken }` as a pair so callers don't have to make two trips through the cache for the two required headers.

## Environment variables

```env
PDAX_USERNAME=""
PDAX_PASSWORD=""
PDAX_BASE_URL="https://stage.services.sandbox.pdax.ph/api/pdax-api"
```

The `baseUrl` should stop at `/api/pdax-api` — the client appends the `/pdax-institution/v1` (or `/v2/trade/...`) path prefix per call.

## Known limitations

- **Asset availability**: PDAX does not list a Philippines-denominated stablebond on Stellar. The integration uses USDC instead, which means it does not strictly meet the project's "locally denominated asset on Stellar" curation criterion. See `src/lib/config/anchors.ts` `knownIssues` for the surfaced caveat.
- **KYC / compliance responsibility**: PDAX's API is per-transaction; we own customer-level KYC and any compliance enforcement (BSP VASP registration, etc.) for real-user usage. The demo enforces only the per-transaction required-field set.
- **No webhooks (yet)**: the demo polls. PDAX supports a webhook registration endpoint plus signed event payloads; adding it is a follow-up.
- **Trade idempotency**: the orchestrator generates a fresh `idempotency_id` per `POST /v1/trade` call. If two pollers for the same ramp fire concurrently with `stage: 'fiat_fulfilled'`, both could trigger a trade. In-process this is mitigated by the single-timer browser polling loop; a multi-pod deployment should add a state-store-level lock or derive the idempotency id deterministically (e.g. from the ramp `identifier`).

## Regenerating reference / OpenAPI

The PDAX docs are password-gated. To pull a fresh `page-data.json` and regenerate:

```bash
export PDAX_DOCS_COOKIE='session=...; remember_me=...'
python3 scripts/pdax/generate-openapi.py --fetch
```

See the docstring in `scripts/pdax/generate-openapi.py` for the cookie-extraction recipe.
