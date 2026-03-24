# Transfero Anchor Integration

## Overview

[Transfero](https://transfero.com) is a Brazilian fintech providing Banking-as-a-Service infrastructure for fiat on/off ramps on the Stellar network. They are also the issuer of the BRZ (Brazilian Digital Token) stablecoin.

Adapted from community contribution by [@wmendes](https://github.com/wmendes/stellar-ramps-sdk).

## Supported Regions

| Region | Currency | Payment Rail | Tokens    | Direction         |
| ------ | -------- | ------------ | --------- | ----------------- |
| Brazil | BRL      | PIX          | USDC, BRZ | On-ramp, Off-ramp |

## Authentication

OAuth2 client credentials flow. POST to `/auth/token` with `client_id`, `client_secret`, `scope`, and `grant_type=client_credentials`. Token is cached with a 5-minute safety margin before expiry.

## On-Ramp Flow

1. **Get Quote** — `POST /api/quote/v2/requestquote`
2. **Create Swap Order** — `POST /api/ramp/v2/swaporder` with quote ID and Stellar wallet address
3. **Fund** — User sends BRL via PIX per Transfero's instructions
4. **Receive Crypto** — Transfero delivers USDC/BRZ to user's Stellar wallet

## Off-Ramp Flow (Two-Step: Preview → Accept)

1. **Preview** — `POST /api/ramp/v2/swaporder/preview` with PIX key and quote request. Returns `previewId` + locked quote.
2. **Accept** — `POST /api/ramp/v2/swaporder/accept` with `previewId`. Returns deposit address + memo.
3. **Send Crypto** — Build USDC payment to Transfero's deposit address with memo, sign with Freighter, submit to Stellar.
4. **Receive Fiat** — Transfero delivers BRL via PIX.

## Identity Model

Transfero has no customer management API. Users are identified by `taxId` (CPF/CNPJ) passed inline with each ramp request. The client stores customer data in-memory to satisfy the Anchor interface.

## Transaction Statuses

| Transfero Status       | Mapped Status |
| ---------------------- | ------------- |
| `SwapOrderCreated`     | `pending`     |
| `DepositReceived`      | `processing`  |
| `TradeCompleted`       | `processing`  |
| `WithdrawalCompleted`  | `processing`  |
| `SwapOrderCompleted`   | `completed`   |
| `Failed`               | `failed`      |
| `Canceled`/`Cancelled` | `cancelled`   |

## Environment Variables

```env
TRANSFERO_CLIENT_ID=""
TRANSFERO_CLIENT_SECRET=""
TRANSFERO_SCOPE=""
TRANSFERO_API_URL="https://sandbox-api-baasic.transfero.com"
```

## API Documentation

- [Transfero BaaSiC API Docs](https://docs.transfero.com)
- [Community Fork](https://github.com/wmendes/stellar-ramps-sdk)
