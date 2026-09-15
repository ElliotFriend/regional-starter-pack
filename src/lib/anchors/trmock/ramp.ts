/**
 * TR Mock Anchor — SEP-compliant ramp client.
 *
 * A focused wrapper around the SEP modules (`../sep`) for talking to Kaan
 * Kacar's Turkish TRY↔USDC mock anchor (tr-mock-anchor.fly.dev). The anchor
 * is a **sandbox stand-in**, not a production provider: the bank leg and KYC
 * are simulated, the Stellar leg is real testnet USDC.
 *
 * **Server-side only** for SEP-10 token handling and Horizon access; the
 * underlying SEP modules themselves are framework-agnostic.
 *
 * SEP-10 tokens are passed explicitly to each method that needs them, so a
 * single instance is safe to share across requests.
 *
 * @example
 * ```ts
 * const anchor = new TrMockRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER });
 * const challenge = await anchor.getChallenge('G...');
 * // sign challenge.transaction with the wallet
 * const { token } = await anchor.submitChallenge(signedXdr);
 *
 * const quote = await anchor.createQuote(token, {
 *     sell_asset: anchor.fiatAssetId(),
 *     buy_asset: anchor.sep38AssetId(),
 *     sell_amount: '1000',
 *     context: 'sep6',
 * });
 * const deposit = await anchor.depositExchange(token, {
 *     amount: '1000',
 *     account: 'G...',
 *     quoteId: quote.id,
 * });
 * ```
 */

import { Asset, Horizon, Operation, TransactionBuilder, Memo, StrKey } from '@stellar/stellar-sdk';
import { sep1, sep6, sep10, sep12, sep38 } from '../sep';
import { SepApiError } from '../sep/types';
import type {
    Sep6Transaction,
    Sep6DepositResponse,
    Sep6WithdrawResponse,
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep12CustomerRequest,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep38QuoteRequest,
    Sep38QuoteResponse,
} from '../sep/types';

type StellarTomlRecord = sep1.StellarTomlRecord;

/** Configuration for {@link TrMockRampClient}. */
export interface TrMockRampClientConfig {
    domain?: string;
    /** Testnet USDC issuer. Supplied by the host app (`PUBLIC_USDC_ISSUER`). */
    usdcIssuer?: string;
    networkPassphrase?: string;
    horizonUrl?: string;
    fetchFn?: typeof fetch;
    /**
     * Log request URLs and response statuses to the console. Off by default.
     * Never logs credentials. Note: `toml()` resolves via the SDK's
     * `StellarToml.Resolver`, which has its own HTTP client, so toml fetches
     * are never logged.
     */
    debug?: boolean;
}

/** Error thrown by {@link TrMockRampClient}. */
export class TrMockError extends Error {
    readonly statusCode: number;
    readonly code: string;

    constructor(message: string, statusCode = 500, code = 'TRMOCK_ERROR') {
        super(message);
        this.name = 'TrMockError';
        this.statusCode = statusCode;
        this.code = code;
    }

    /** The anchor's stellar.toml does not advertise a required SEP. */
    static sepUnsupported(sepName: string): TrMockError {
        return new TrMockError(
            `TR Mock Anchor does not advertise ${sepName} support`,
            501,
            'SEP_NOT_SUPPORTED',
        );
    }

    /** Wrap a SEP-layer failure, preserving the anchor's status and message. */
    static from(err: unknown, fallback: string): TrMockError {
        if (err instanceof SepApiError) {
            return new TrMockError(err.message, err.status ?? 502, 'ANCHOR_ERROR');
        }
        if (err instanceof Error) return new TrMockError(err.message || fallback);
        return new TrMockError(fallback);
    }
}

const DEFAULT_DOMAIN = 'tr-mock-anchor.fly.dev';
const DEFAULT_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const DEFAULT_HORIZON = 'https://horizon-testnet.stellar.org';
const ASSET_CODE = 'USDC';
const FIAT_ASSET_ID = 'iso4217:TRY';
const FUNDING_METHOD = 'bank_account';

function withRequestLogging(baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        // URL and status only — never headers or bodies, which carry the JWT.
        console.log(`[TRMock] ${method} ${url}`);
        try {
            const response = await baseFetch(input, init);
            console.log(`[TRMock] Response (${response.status}) ${method} ${url}`);
            return response;
        } catch (err) {
            console.error(`[TRMock] Request failed ${method} ${url}:`, err);
            throw err;
        }
    };
}

/** Standalone SEP client for the TR Mock Anchor. */
export class TrMockRampClient {
    readonly name = 'trmock';
    readonly displayName = 'TR Mock Anchor';
    readonly supportedCurrencies: readonly string[] = ['TRY'];
    readonly supportedRails: readonly string[] = ['fast'];

    private readonly domain: string;
    private readonly usdcIssuer: string;
    private readonly networkPassphrase: string;
    private readonly horizonUrl: string;
    private readonly fetchFn: typeof fetch;
    private tomlCache: StellarTomlRecord | null = null;

    constructor(config: TrMockRampClientConfig = {}) {
        this.domain = config.domain || DEFAULT_DOMAIN;
        this.usdcIssuer = config.usdcIssuer || DEFAULT_USDC_ISSUER;
        this.networkPassphrase = config.networkPassphrase || TESTNET_PASSPHRASE;
        this.horizonUrl = config.horizonUrl || DEFAULT_HORIZON;
        const baseFetch = config.fetchFn || fetch;
        this.fetchFn = config.debug ? withRequestLogging(baseFetch) : baseFetch;
    }

    // =========================================================================
    // SEP-1 discovery
    // =========================================================================

    async toml(): Promise<StellarTomlRecord> {
        if (!this.tomlCache) {
            this.tomlCache = await sep1.fetchStellarToml(this.domain);
        }
        return this.tomlCache;
    }

    private async endpoint(
        getter: (toml: StellarTomlRecord) => string | undefined,
        sepName: string,
    ): Promise<string> {
        const ep = getter(await this.toml());
        if (!ep) throw TrMockError.sepUnsupported(sepName);
        return ep;
    }

    // =========================================================================
    // Asset identifiers
    // =========================================================================

    /** The full SEP-38 identifier. SEP-38 `/quote` requires this form. */
    sep38AssetId(): string {
        return sep38.stellarAssetId(ASSET_CODE, this.usdcIssuer);
    }

    /**
     * The Stellar-leg asset reference for `deposit-exchange` /
     * `withdraw-exchange`.
     *
     * SEP-6 specifies a SEP-38 identifier here, but this anchor rejects
     * `stellar:USDC:<issuer>` on those two endpoints with
     * `400 unsupported destination_asset` and requires the bare code, while
     * still requiring the full `iso4217:TRY` on the fiat leg. Verified live
     * 2026-09-15 (internal notes, not in this repo). If the anchor is fixed
     * to accept both, this becomes `sep38AssetId()`.
     */
    exchangeAssetRef(): string {
        return ASSET_CODE;
    }

    /** The off-chain leg identifier. */
    fiatAssetId(): string {
        return FIAT_ASSET_ID;
    }

    // =========================================================================
    // SEP-10 wallet auth
    // =========================================================================

    async getChallenge(account: string): Promise<Sep10ChallengeResponse> {
        const toml = await this.toml();
        const authEndpoint = sep1.getSep10Endpoint(toml);
        if (!authEndpoint) throw TrMockError.sepUnsupported('SEP-10');
        return sep10.getChallenge(
            {
                authEndpoint,
                serverSigningKey: sep1.getSigningKey(toml) || '',
                networkPassphrase: this.networkPassphrase,
                homeDomain: this.domain,
            },
            account,
            {},
            this.fetchFn,
        );
    }

    async submitChallenge(signedTransactionXdr: string): Promise<Sep10TokenResponse> {
        const authEndpoint = await this.endpoint(sep1.getSep10Endpoint, 'SEP-10');
        return sep10.submitChallenge(authEndpoint, signedTransactionXdr, this.fetchFn);
    }

    decodeToken(token: string) {
        return sep10.decodeToken(token);
    }

    // =========================================================================
    // SEP-12 KYC (simulated — the anchor auto-accepts every customer)
    // =========================================================================

    async getCustomer(
        token: string,
        params: Sep12CustomerRequest = {},
    ): Promise<Sep12CustomerResponse> {
        const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
        const account = params.account ?? sep10.decodeToken(token).sub;
        return sep12.getCustomer(kycServer, token, { ...params, account }, this.fetchFn);
    }

    async putCustomer(
        token: string,
        request: Sep12PutCustomerRequest,
    ): Promise<Sep12PutCustomerResponse> {
        const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
        const account = (request.account as string | undefined) ?? sep10.decodeToken(token).sub;
        return sep12.putCustomer(kycServer, token, { ...request, account }, this.fetchFn);
    }

    // =========================================================================
    // SEP-38 quotes
    // =========================================================================

    async createQuote(token: string, request: Sep38QuoteRequest): Promise<Sep38QuoteResponse> {
        const quoteServer = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
        try {
            return await sep38.postQuote(quoteServer, token, request, this.fetchFn);
        } catch (err) {
            throw TrMockError.from(err, 'Failed to create quote');
        }
    }

    // =========================================================================
    // SEP-6 quoted ramps
    // =========================================================================

    async depositExchange(
        token: string,
        params: { amount: string; account: string; quoteId?: string },
    ): Promise<Sep6DepositResponse> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        try {
            return await sep6.depositExchange(
                transferServer,
                token,
                {
                    destination_asset: this.exchangeAssetRef(),
                    source_asset: this.fiatAssetId(),
                    amount: params.amount,
                    account: params.account,
                    quote_id: params.quoteId,
                    funding_method: FUNDING_METHOD,
                },
                this.fetchFn,
            );
        } catch (err) {
            throw TrMockError.from(err, 'Failed to start the deposit');
        }
    }

    /**
     * Start a quoted withdrawal and pre-build the signable Stellar payment XDR
     * the user's wallet must sign and submit.
     */
    async withdrawExchange(
        token: string,
        params: { amount: string; account: string; quoteId?: string; dest?: string },
    ): Promise<Sep6WithdrawResponse & { signableXdr: string }> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        let response: Sep6WithdrawResponse;
        try {
            response = await sep6.withdrawExchange(
                transferServer,
                token,
                {
                    source_asset: this.exchangeAssetRef(),
                    destination_asset: this.fiatAssetId(),
                    amount: params.amount,
                    account: params.account,
                    quote_id: params.quoteId,
                    funding_method: FUNDING_METHOD,
                    dest: params.dest,
                },
                this.fetchFn,
            );
        } catch (err) {
            throw TrMockError.from(err, 'Failed to start the withdrawal');
        }

        const signableXdr = await this.buildWithdrawalXdr({
            from: params.account,
            to: response.account_id,
            amount: params.amount,
            memo: response.memo,
            memoType: response.memo_type,
        });
        return { ...response, signableXdr };
    }

    async getTransaction(token: string, id: string): Promise<Sep6Transaction | null> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        try {
            return await sep6.getTransaction(transferServer, token, id, this.fetchFn);
        } catch (err) {
            if (err instanceof SepApiError && err.status === 404) return null;
            throw TrMockError.from(err, 'Failed to read the transaction');
        }
    }

    // =========================================================================
    // Sandbox helpers
    // =========================================================================

    /**
     * Stand in for the incoming TRY bank transfer. Sandbox-only: a production
     * anchor observes a real transfer instead.
     */
    async simulateBankTransfer(
        token: string,
        transactionId: string,
        amount: string,
    ): Promise<void> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        const response = await this.fetchFn(
            `${transferServer}/tx/${encodeURIComponent(transactionId)}/simulate-bank-transfer`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ amount }),
            },
        );
        if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            throw new TrMockError(
                body.error || `Failed to simulate the bank transfer: ${response.status}`,
                response.status,
                'ANCHOR_ERROR',
            );
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private async buildWithdrawalXdr(params: {
        from: string;
        to: string;
        amount: string;
        memo?: string;
        memoType?: string;
    }): Promise<string> {
        if (!StrKey.isValidEd25519PublicKey(params.from)) {
            throw new TrMockError(`Invalid source account: ${params.from}`, 400, 'BAD_REQUEST');
        }
        const horizon = new Horizon.Server(this.horizonUrl);
        const source = await horizon.loadAccount(params.from);
        const asset = new Asset(ASSET_CODE, this.usdcIssuer);

        const builder = new TransactionBuilder(source, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        }).addOperation(
            Operation.payment({ destination: params.to, asset, amount: params.amount }),
        );

        if (params.memo) {
            builder.addMemo(
                params.memoType === 'id'
                    ? Memo.id(params.memo)
                    : params.memoType === 'hash'
                      ? Memo.hash(Buffer.from(params.memo, 'base64'))
                      : Memo.text(params.memo),
            );
        }

        return builder.setTimeout(180).build().toXDR();
    }
}

/** Create a new {@link TrMockRampClient} instance. */
export function createTrMockRampClient(config?: TrMockRampClientConfig): TrMockRampClient {
    return new TrMockRampClient(config);
}
