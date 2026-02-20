# DX Testing

Developer experience testing for the portable anchor library. Each round has an AI subagent build an application using the library in a different framework or against a different provider, documenting friction, gaps, and wins along the way.

## Rounds

| Directory | Framework | Provider | Verdict | Key Issues |
|-----------|-----------|----------|:-------:|------------|
| [react-etherfuse](react-etherfuse/) | React + Vite | Etherfuse | 8/10 | `erasableSyntaxOnly` incompatibility, barrel index conflicts with selective copying, wallet helpers not advertised as portable, no non-SvelteKit guidance |

## Cross-Round Issue Tracker

Issues that appear across multiple rounds get tracked here to identify patterns.

| Issue | Rounds Seen | Status |
|-------|-------------|--------|
| `erasableSyntaxOnly` — parameter properties in `AnchorError`/`WalletError` | react-etherfuse | Open |
| Barrel `anchors/index.ts` breaks selective copying | react-etherfuse | Open |
| `wallet/` not called out as portable in docs | react-etherfuse | Open |
| No usage guidance for non-SvelteKit consumers | react-etherfuse | Open |
| Token config (`config/tokens.ts`) not portable (`$lib` paths) | react-etherfuse | Open |

## How a Round Works

1. Scaffold a test project (Vite, Next.js, Express, etc.) inside `_<name>-test/` (gitignored)
2. A subagent reads the repo docs and source, copies what it needs, builds an app
3. The subagent writes a `BUILD_JOURNAL.md` documenting every decision, friction point, and fix
4. A supervisor reviews the output and writes a `DX_REPORT.md` with findings and recommendations
5. Both files are saved here under a descriptive directory name
6. The test project scaffold is disposable — the reports are the deliverable

## Ideas for Future Rounds

- **Next.js + BlindPay** — Tests a different provider with different capability flags (`requiresBankBeforeQuote`, `requiresBlockchainWalletRegistration`, `requiresAnchorPayoutSubmission`). Also tests the library in a framework with built-in API routes (no separate backend proxy needed).
- **Express/Node backend** — Tests server-side usage with real API keys. No browser, no wallet, no CORS. Validates that the library works as a backend dependency.
- **SEP flow** — Tests the SEP modules (`sep/`) against `testanchor.stellar.org` from a plain TypeScript project. Exercises a completely different integration path.
- **AlfredPay + form KYC** — Tests the `kycFlow: 'form'` path and email-based customer lookup (`getCustomerByEmail`).
