---
paths:
    - 'src/lib/anchors/**'
    - 'src/lib/server/**'
    - 'src/lib/api/**'
    - 'src/lib/wallet/**'
    - 'src/routes/anchors/**'
    - 'src/routes/api/anchor/**'
    - 'tests/anchors/**'
---

# Anchor integrations

## Clients (`src/lib/anchors/<name>/`)

- Self-contained and portable: the directory pulls in nothing from the app besides `@stellar/stellar-sdk` and, for SEP anchors, `../sep`. No SvelteKit imports.
- Every client takes `debug?: boolean`, which gates **all** console logging (default off): requests, responses, and errors when set; nothing when not. **Never log credentials or SEP-10 tokens, even in debug.** Cover both behaviors in a `debug logging` test block.
- Keep clients browser-safe: no Node `Buffer` (decode base64 with `atob`), and never call the global `fetch` as a method of the client (browsers throw "Illegal invocation"). Default it as `config.fetchFn || ((input, init) => fetch(input, init))`.
- Own error class per client (`SeevcashError`, `TrMockError`, `EtherfuseError`, ...).

## Browser vs. proxy

- **SEP anchors** (testanchor, trmock, seevcash) should run in the browser: pages instantiate the client directly, e.g. `new SeevcashRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER, debug: dev })`. No server singleton, no `src/lib/api/` wrapper, no proxy route. Fall back to a proxy only when the anchor's CORS (or similar) is broken; check the toml, auth, preflights with `Authorization`, and error responses first.
- **API-key anchors** (Etherfuse, Koywe, Manteca, Chipper): server singleton in `src/lib/server/<name>Instance.ts` (passes `debug: dev`), browser wrapper in `src/lib/api/<name>.ts`, proxy routes in `src/routes/api/anchor/<name>/<operation>/+server.ts`.

## SEP specifics

- Read every endpoint from the anchor's `stellar.toml` (`sep1.get*Endpoint`), never hard-code `${BASE}/sep6`.
- SEP-10 in pages goes through `createSep10Session` (`$lib/wallet/sep10-session`), which caches tokens in `authStore` and drops expired ones.
- Withdrawals: SEP-6 may omit `account_id`, and SEP-24 always defers payment details to the transaction. Poll until `pending_user_transfer_start` with `withdraw_anchor_account`, then build the payment **at click time** (the XDR has a 180s timebound and a sequence number).
- Record anchor wire quirks, with the date verified, in the client's README and a code comment.

## Pages (`src/routes/anchors/<name>/`)

- Landing pages use `<AnchorRegionSelector {profile} />` for the region section; don't hand-roll it.
- Flow pages are bespoke and self-contained (see `CLAUDE.md`). Compose primitives from `src/lib/components/`.
