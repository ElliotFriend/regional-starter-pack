/**
 * SeevCash — SEP-compliant ramp client.
 *
 * A focused wrapper around the SEP modules (`../sep`) for SeevCash's Ghana
 * anchor, which bridges USDC on Stellar with GHS over mobile money (MTN,
 * Telecel, AirtelTigo). GHS is off-chain fiat, so the only Stellar asset is
 * USDC. On testnet (`anchor.seevcash.com`) the mobile money leg is simulated
 * and the Stellar leg pays real testnet USDC.
 *
 * Plain SEP-6 `deposit` / `withdraw` (not the `-exchange` variants): the
 * anchor converts at its current rate, and SEP-38 `/price` previews it.
 *
 * **Browser-safe.** SeevCash holds no secrets (auth is SEP-10, signed by the
 * user's wallet) and serves CORS on every SEP endpoint, so the demo calls it
 * straight from the browser with no proxy routes. It works server-side too.
 *
 * SEP-10 tokens are passed explicitly to each method that needs them, so a
 * single instance is safe to share.
 *
 * @example
 * ```ts
 * const anchor = new SeevcashRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER });
 * const challenge = await anchor.getChallenge('G...');
 * // sign challenge.transaction with the wallet
 * const { token } = await anchor.submitChallenge(signedXdr);
 *
 * await anchor.putCustomer(token, { first_name: 'Ama', mobile_money_number: '+233...', ... });
 * const price = await anchor.getPrice({ kind: 'deposit', amount: '5' });
 * const deposit = await anchor.deposit(token, { amount: '5', account: 'G...' });
 * ```
 */

import { Asset, Horizon, Operation, TransactionBuilder, Memo, StrKey } from '@stellar/stellar-sdk';
import { sep1, sep6, sep10, sep12, sep38 } from '../sep';
import { SepApiError } from '../sep/types';
import type {
    Sep6Info,
    Sep6Transaction,
    Sep6DepositResponse,
    Sep6WithdrawResponse,
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep12CustomerRequest,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep38PriceResponse,
} from '../sep/types';

type StellarTomlRecord = sep1.StellarTomlRecord;

/** Configuration for {@link SeevcashRampClient}. */
export interface SeevcashRampClientConfig {
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

/** Error thrown by {@link SeevcashRampClient}. */
export class SeevcashError extends Error {
    readonly statusCode: number;
    readonly code: string;

    constructor(message: string, statusCode = 500, code = 'SEEVCASH_ERROR') {
        super(message);
        this.name = 'SeevcashError';
        this.statusCode = statusCode;
        this.code = code;
    }

    /** The anchor's stellar.toml does not advertise a required SEP. */
    static sepUnsupported(sepName: string): SeevcashError {
        return new SeevcashError(
            `SeevCash does not advertise ${sepName} support`,
            501,
            'SEP_NOT_SUPPORTED',
        );
    }

    /** Wrap a SEP-layer failure, preserving the anchor's status and message. */
    static from(err: unknown, fallback: string): SeevcashError {
        if (err instanceof SeevcashError) return err;
        if (err instanceof SepApiError) {
            return new SeevcashError(err.message, err.status ?? 502, 'ANCHOR_ERROR');
        }
        if (err instanceof Error) return new SeevcashError(err.message || fallback);
        return new SeevcashError(fallback);
    }
}

const DEFAULT_DOMAIN = 'anchor.seevcash.com';
const DEFAULT_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const DEFAULT_HORIZON = 'https://horizon-testnet.stellar.org';
const ASSET_CODE = 'USDC';
const FIAT_ASSET_ID = 'iso4217:GHS';
/**
 * SEP-6 `funding_method` for both directions. The anchor rejects a withdrawal
 * without it (`400 funding_method is required`), though its docs omit it.
 * The payout number comes from the customer's SEP-12 `mobile_money_*` fields;
 * `dest` / `dest_extra` are ignored. Verified 2026-10-05.
 */
const FUNDING_METHOD = 'mobile';
/** SEP-38 delivery method for the GHS leg. */
const DELIVERY_METHOD = 'mobile_money';

/** SEP-6 hash memos arrive base64-encoded; `Memo.hash` takes hex. No Node `Buffer`. */
function base64ToHex(value: string): string {
    return Array.from(atob(value), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function withRequestLogging(baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        // URL and status only — never headers or bodies, which carry the JWT.
        console.log(`[SeevCash] ${method} ${url}`);
        try {
            const response = await baseFetch(input, init);
            console.log(`[SeevCash] Response (${response.status}) ${method} ${url}`);
            return response;
        } catch (err) {
            console.error(`[SeevCash] Request failed ${method} ${url}:`, err);
            throw err;
        }
    };
}

/** Standalone SEP client for SeevCash. */
export class SeevcashRampClient {
    readonly name = 'seevcash';
    readonly displayName = 'SeevCash';
    readonly supportedCurrencies: readonly string[] = ['GHS'];
    readonly supportedRails: readonly string[] = ['mobile-money'];

    private readonly domain: string;
    private readonly usdcIssuer: string;
    private readonly networkPassphrase: string;
    private readonly horizonUrl: string;
    private readonly fetchFn: typeof fetch;
    private tomlCache: StellarTomlRecord | null = null;

    constructor(config: SeevcashRampClientConfig = {}) {
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
        if (!ep) throw SeevcashError.sepUnsupported(sepName);
        return ep;
    }

    // =========================================================================
    // Asset identifiers
    // =========================================================================

    /** The full SEP-38 identifier for USDC. */
    sep38AssetId(): string {
        return sep38.stellarAssetId(ASSET_CODE, this.usdcIssuer);
    }

    /** The off-chain GHS leg identifier. */
    fiatAssetId(): string {
        return FIAT_ASSET_ID;
    }

    // =========================================================================
    // SEP-10 wallet auth
    // =========================================================================

    async getChallenge(account: string): Promise<Sep10ChallengeResponse> {
        const toml = await this.toml();
        const authEndpoint = sep1.getSep10Endpoint(toml);
        if (!authEndpoint) throw SeevcashError.sepUnsupported('SEP-10');
        try {
            return await sep10.getChallenge(
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
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to get the auth challenge');
        }
    }

    async submitChallenge(signedTransactionXdr: string): Promise<Sep10TokenResponse> {
        const authEndpoint = await this.endpoint(sep1.getSep10Endpoint, 'SEP-10');
        try {
            return await sep10.submitChallenge(authEndpoint, signedTransactionXdr, this.fetchFn);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to submit the auth challenge');
        }
    }

    decodeToken(token: string) {
        return sep10.decodeToken(token);
    }

    // =========================================================================
    // SEP-12 KYC
    // =========================================================================

    async getCustomer(
        token: string,
        params: Sep12CustomerRequest = {},
    ): Promise<Sep12CustomerResponse> {
        const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
        const account = params.account ?? sep10.decodeToken(token).sub;
        try {
            return await sep12.getCustomer(kycServer, token, { ...params, account }, this.fetchFn);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to read the customer');
        }
    }

    /**
     * Submit SEP-9 KYC fields. The anchor stores (and reports `ACCEPTED` for)
     * any key it is sent, recognised or not — use SEP-9 names such as
     * `birth_date` (its docs say `date_of_birth`, which it does not
     * recognise). `mobile_money_number` / `mobile_money_provider` set the
     * collection and payout wallet for SEP-6.
     */
    async putCustomer(
        token: string,
        request: Sep12PutCustomerRequest,
    ): Promise<Sep12PutCustomerResponse> {
        const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
        const account = (request.account as string | undefined) ?? sep10.decodeToken(token).sub;
        try {
            return await sep12.putCustomer(kycServer, token, { ...request, account }, this.fetchFn);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to update the customer');
        }
    }

    // =========================================================================
    // SEP-38 indicative prices
    // =========================================================================

    /**
     * Preview the conversion for a SEP-6 ramp. `amount` is always USDC: what
     * the user receives on a deposit, or sends on a withdrawal.
     */
    async getPrice(params: {
        kind: 'deposit' | 'withdraw';
        amount: string;
    }): Promise<Sep38PriceResponse> {
        const quoteServer = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
        const request =
            params.kind === 'deposit'
                ? {
                      sell_asset: this.fiatAssetId(),
                      buy_asset: this.sep38AssetId(),
                      buy_amount: params.amount,
                      sell_delivery_method: DELIVERY_METHOD,
                  }
                : {
                      sell_asset: this.sep38AssetId(),
                      buy_asset: this.fiatAssetId(),
                      sell_amount: params.amount,
                      buy_delivery_method: DELIVERY_METHOD,
                  };
        try {
            return await sep38.getPrice(quoteServer, { ...request, context: 'sep6' }, this.fetchFn);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to get a price');
        }
    }

    // =========================================================================
    // SEP-6 ramps
    // =========================================================================

    async info(): Promise<Sep6Info> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        try {
            return await sep6.getInfo(transferServer, this.fetchFn);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to read SEP-6 info');
        }
    }

    /**
     * Start a mobile money deposit. `amount` is the USDC to receive; the
     * anchor sends a collection prompt for the GHS equivalent to the
     * customer's KYC'd mobile money number.
     */
    async deposit(
        token: string,
        params: { amount: string; account: string },
    ): Promise<Sep6DepositResponse> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        try {
            return await sep6.deposit(
                transferServer,
                token,
                {
                    asset_code: ASSET_CODE,
                    account: params.account,
                    amount: params.amount,
                    funding_method: FUNDING_METHOD,
                },
                this.fetchFn,
            );
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to start the deposit');
        }
    }

    /**
     * Start a mobile money withdrawal and pre-build the signable Stellar
     * payment XDR (USDC to the anchor, with its memo) the user's wallet must
     * sign and submit.
     */
    async withdraw(
        token: string,
        params: { amount: string; account: string },
    ): Promise<Sep6WithdrawResponse & { signableXdr: string }> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        let response: Sep6WithdrawResponse;
        try {
            response = await sep6.withdraw(
                transferServer,
                token,
                {
                    asset_code: ASSET_CODE,
                    account: params.account,
                    amount: params.amount,
                    funding_method: FUNDING_METHOD,
                },
                this.fetchFn,
            );
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to start the withdrawal');
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
            throw SeevcashError.from(err, 'Failed to read the transaction');
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
            throw new SeevcashError(`Invalid source account: ${params.from}`, 400, 'BAD_REQUEST');
        }
        let source: Horizon.AccountResponse;
        try {
            source = await new Horizon.Server(this.horizonUrl).loadAccount(params.from);
        } catch (err) {
            throw SeevcashError.from(err, 'Failed to load the source account');
        }
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
                      ? Memo.hash(base64ToHex(params.memo))
                      : Memo.text(params.memo),
            );
        }

        return builder.setTimeout(180).build().toXDR();
    }
}

/** Create a new {@link SeevcashRampClient} instance. */
export function createSeevcashRampClient(config?: SeevcashRampClientConfig): SeevcashRampClient {
    return new SeevcashRampClient(config);
}
