# TR Mock Anchor

Client for `tr-mock-anchor.fly.dev` — a Turkish TRY↔USDC **mock** anchor on
Stellar testnet, built by Kaan Kacar (`github.com/kaankacar/tr-mock-anchor`).

It is not operated by BiLira and it moves no real money. The bank leg and KYC
are simulated; the Stellar leg pays real testnet USDC.

- Integration guide: <https://tr-mock-anchor.fly.dev/sep>
- Concepts and Turkish rails: <https://tr-mock-anchor.fly.dev/guide>
- What changes on mainnet: <https://tr-mock-anchor.fly.dev/mainnet>

## Known wire quirk

`deposit-exchange` and `withdraw-exchange` reject the SEP-38 identifier
`stellar:USDC:<issuer>` and require the bare code `USDC`, while the fiat leg
still requires `iso4217:TRY`. `TrMockRampClient.exchangeAssetRef()` encodes
this; `sep38AssetId()` returns the spec form for SEP-38 quotes, which do
accept it. Verified 2026-09-15. See `docs/bilira-mock-sep6-findings.md`.
