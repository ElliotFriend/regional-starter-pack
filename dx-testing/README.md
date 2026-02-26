# DX Testing

Developer experience testing for the portable anchor library. Each round has an AI subagent build an application using the library in a different framework or against a different provider, documenting friction, gaps, and wins along the way.

## Rounds

| Directory                           | Framework              | Provider             | Verdict | Key Issues                                                                                                                                                 |
| ----------------------------------- | ---------------------- | -------------------- | :-----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [react-etherfuse](react-etherfuse/) | React + Vite           | Etherfuse            |  8/10   | `erasableSyntaxOnly` incompatibility, barrel index conflicts with selective copying, wallet helpers not advertised as portable, no non-SvelteKit guidance  |
| [nextjs-blindpay](nextjs-blindpay/) | Next.js (App Router)   | BlindPay             |  9/10   | Composite customer ID is a leaky abstraction, `createCustomer()` stub behavior surprising, barrel index (confirmed), token config not portable (confirmed) |
| [express-backend](express-backend/) | Express 5 + TypeScript | Etherfuse + BlindPay |  10/10  | No library issues. Express 5 param typing (`string \| string[]`) required a helper, but that's an Express issue.                                           |
| [nextjs-etherfuse](nextjs-etherfuse/) | Next.js (App Router)   | Etherfuse            |  9/10   | Token info only accessible via instantiated client (minor ergonomics). All prior fixes validated — zero friction on copy, build, or API translation.        |

## Cross-Round Issue Tracker

Issues that appear across multiple rounds get tracked here to identify patterns.

| Issue                                                                                                             | Rounds Seen                                       | Status                                       |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `erasableSyntaxOnly` — parameter properties in `AnchorError`/`WalletError`                                        | react-etherfuse                                   | **Fixed** (before round 2)                   |
| Barrel `anchors/index.ts` breaks selective copying                                                                | react-etherfuse, nextjs-blindpay, express-backend | **Fixed** (barrel deleted)                   |
| `wallet/` not called out as portable in docs                                                                      | react-etherfuse                                   | **Fixed** (README updated)                   |
| No usage guidance for non-SvelteKit consumers                                                                     | react-etherfuse                                   | **Fixed** (README updated)                   |
| Token config (`config/tokens.ts`) not portable (`$lib` paths)                                                     | react-etherfuse, nextjs-blindpay                  | **Fixed** (token data on `Anchor` interface) |
| Composite customer ID (`customerId:resourceId`) is a leaky abstraction                                            | nextjs-blindpay                                   | **Fixed** (`resourceId` field added)         |
| `createCustomer()` stub generates invalid receiver IDs (UUID instead of 15-char `re_` format) — causes 400 errors | nextjs-blindpay                                   | **Fixed** (empty ID instead of UUID)         |

## How a Round Works

1. Scaffold a test project (Vite, Next.js, Express, etc.) into `sample-dx-project/` at the repo root (gitignored, wiped each round)
2. A subagent reads the repo docs and source, copies what it needs, builds an app
3. The subagent writes a `BUILD_JOURNAL.md` documenting every decision, friction point, and fix
4. A supervisor reviews the output and writes a `DX_REPORT.md` with findings and recommendations
5. Both files are saved here under a descriptive directory name
6. The test project scaffold is disposable — the reports are the deliverable

## Blocked / Waiting

| Provider | Issue                                                 | What Works                                                              | What's Blocked                                                                                                                                                                                       | Status                  |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| BlindPay | USDB testnet token issuer is wrong on BlindPay's side | Customer creation, KYC (ToS + receiver), blockchain wallet registration | On-ramp: the transaction returned by their `/v1/instances/{instance_id}/create-asset-trustline` endpoint fails because the USDB issuer doesn't match testnet. Can't proceed past trustline creation. | Waiting on BlindPay fix |

## Ideas for Future Rounds

- [x] **Next.js + BlindPay** — Done (round 2)
- [x] **Express/Node backend** — Done (round 3)
- [ ] **SEP flow** — Tests the SEP modules (`sep/`) against `testanchor.stellar.org` from a plain TypeScript project. Exercises a completely different integration path.
- [ ] **AlfredPay + form KYC** — Tests the `kycFlow: 'form'` path and email-based customer lookup (`getCustomerByEmail`).
