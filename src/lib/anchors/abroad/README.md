# Abroad Finance Anchor Integration

## Overview

[Abroad Finance](https://abroad.finance) is a cross-border payments infrastructure provider that enables conversion from stablecoins (USDC) to local fiat currencies via instant payment rails.

**This is an off-ramp only provider.** On-ramp (fiat → crypto) is not supported.

## Supported Regions

| Region | Currency | Payment Rail | Direction     |
| ------ | -------- | ------------ | ------------- |
| Brazil | BRL      | PIX          | Off-ramp only |

## Authentication

All requests require an `X-API-Key` header. Obtain API keys by contacting `support@abroad.com`.

## Off-Ramp Flow

1. **Get Quote** — `POST /quote` with amount, crypto currency (USDC), network (stellar), payment method (pix), and target currency (BRL).
2. **Create Transaction** — `POST /transaction` with quote ID, user ID, and bank account details.
3. **Sign & Submit** — Build a USDC payment transaction to Abroad's `deposit_address` with `transaction_reference` as the Stellar memo. Sign with Freighter and submit to Stellar.
4. **Poll Status** — `GET /transaction/{id}` to track the transaction until `PAYMENT_COMPLETED`.

## KYC

KYC is redirect-based. If a transaction response contains a `kycLink`, the user must complete identity verification at that URL before the payout will process.

## Transaction Statuses

| Abroad Status        | Mapped Status |
| -------------------- | ------------- |
| `AWAITING_PAYMENT`   | `pending`     |
| `PROCESSING_PAYMENT` | `processing`  |
| `PAYMENT_COMPLETED`  | `completed`   |
| `PAYMENT_FAILED`     | `failed`      |
| `PAYMENT_EXPIRED`    | `expired`     |
| `WRONG_AMOUNT`       | `failed`      |

## Environment Variables

```env
ABROAD_API_KEY=""
ABROAD_BASE_URL="https://api.abroad.finance"
```

## API Documentation

- [Abroad Finance Docs](https://docs.abroad.finance)
- [GitHub Repository](https://github.com/abroad-finance/abroad)
