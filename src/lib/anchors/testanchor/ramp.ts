/**
 * Test Anchor — SEP-compliant ramp client.
 *
 * A focused wrapper around the SEP modules (`../sep`) for talking to the
 * Stellar test anchor (testanchor.stellar.org). Returns SEP-shaped responses
 * directly — there's no adaptation layer because testanchor IS SEP. Copy this
 * file alongside `../sep/*` into any TypeScript project.
 *
 * **Server-side only** for SEP-10 token handling and Horizon access; the
 * underlying SEP modules themselves are framework-agnostic.
 *
 * SEP-10 tokens are passed explicitly to each method that needs them, so a
 * single instance is safe to share across requests.
 *
 * @example
 * ```ts
 * import { TestAnchorRampClient } from 'path/to/anchors/testanchor';
 *
 * const anchor = new TestAnchorRampClient();
 * const challenge = await anchor.getChallenge('G...');
 * // sign challenge.transaction with the wallet
 * const { token } = await anchor.submitChallenge(signedXdr);
 *
 * const deposit = await anchor.sep24Deposit(token, {
 *     asset_code: 'SRT',
 *     asset_issuer: 'GCDNJUBQSX...',
 *     account: 'G...',
 * });
 * window.open(deposit.url);
 * ```
 */

import { Asset, Horizon, Operation, TransactionBuilder, Memo, StrKey } from '@stellar/stellar-sdk';
import { sep1, sep6, sep10, sep12, sep24, sep38 } from '../sep';
import type {
    Sep6Transaction,
    Sep6DepositRequest,
    Sep6DepositResponse,
    Sep6WithdrawRequest,
    Sep6WithdrawResponse,
    Sep10ChallengeResponse,
    Sep10TokenResponse,
    Sep12CustomerRequest,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep12PutCustomerResponse,
    Sep24Transaction,
    Sep24DepositRequest,
    Sep24WithdrawRequest,
    Sep24InteractiveResponse,
    Sep38PriceRequest,
    Sep38PriceResponse,
} from '../sep/types';

type StellarTomlRecord = sep1.StellarTomlRecord;

/** Token supported by the testanchor. */
export interface TestAnchorTokenInfo {
    symbol: string;
    name: string;
    issuer: string;
    description: string;
}

/** Configuration for {@link TestAnchorRampClient}. */
export interface TestAnchorRampClientConfig {
    domain?: string;
    networkPassphrase?: string;
    horizonUrl?: string;
    fetchFn?: typeof fetch;
}

/** Error thrown when the anchor's stellar.toml does not advertise a required SEP. */
export class TestAnchorSepUnsupportedError extends Error {
    statusCode = 501;
    code = 'SEP_NOT_SUPPORTED';
    constructor(sepName: string) {
        super(`Test anchor does not advertise ${sepName} support`);
        this.name = 'TestAnchorSepUnsupportedError';
    }
}

const DEFAULT_DOMAIN = 'testanchor.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const DEFAULT_HORIZON = 'https://horizon-testnet.stellar.org';

function withRequestLogging(baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        console.log(`[TestAnchor] ${method} ${url}`);
        try {
            const response = await baseFetch(input, init);
            console.log(`[TestAnchor] Response (${response.status}) ${method} ${url}`);
            return response;
        } catch (err) {
            console.error(`[TestAnchor] Request failed ${method} ${url}:`, err);
            throw err;
        }
    };
}

/** Standalone SEP-compliant client for the Stellar test anchor. */
export class TestAnchorRampClient {
    readonly name = 'testanchor';
    readonly displayName = 'Test Anchor';
    readonly supportedTokens: readonly TestAnchorTokenInfo[] = [
        {
            symbol: 'SRT',
            name: 'Stellar Reference Token',
            issuer: 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B',
            description:
                'The Stellar Reference Token issued by the SDF test anchor for end-to-end SEP integration testing.',
        },
        {
            symbol: 'USDC',
            name: 'USD Coin (testnet)',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'Testnet USD Coin supported by the SDF test anchor.',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['USD'];
    readonly supportedRails: readonly string[] = ['bank'];

    private readonly domain: string;
    private readonly networkPassphrase: string;
    private readonly horizonUrl: string;
    private readonly fetchFn: typeof fetch;
    private tomlCache: StellarTomlRecord | null = null;

    constructor(config: TestAnchorRampClientConfig = {}) {
        this.domain = config.domain || DEFAULT_DOMAIN;
        this.networkPassphrase = config.networkPassphrase || TESTNET_PASSPHRASE;
        this.horizonUrl = config.horizonUrl || DEFAULT_HORIZON;
        this.fetchFn = withRequestLogging(config.fetchFn || fetch);
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
        if (!ep) throw new TestAnchorSepUnsupportedError(sepName);
        return ep;
    }

    findToken(symbol: string): TestAnchorTokenInfo | undefined {
        const code = symbol.includes(':') ? symbol.split(':')[0] : symbol;
        return this.supportedTokens.find((t) => t.symbol.toUpperCase() === code.toUpperCase());
    }

    toSep38Asset(code: string): string {
        const token = this.findToken(code);
        if (token) return sep38.stellarAssetId(token.symbol, token.issuer);
        return sep38.fiatAssetId(code);
    }

    // =========================================================================
    // SEP-10 wallet auth
    // =========================================================================

    async getChallenge(account: string): Promise<Sep10ChallengeResponse> {
        const toml = await this.toml();
        const authEndpoint = sep1.getSep10Endpoint(toml);
        if (!authEndpoint) throw new TestAnchorSepUnsupportedError('SEP-10');
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
    // SEP-12 KYC
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

    async getPrice(request: Sep38PriceRequest): Promise<Sep38PriceResponse> {
        const quoteServer = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
        return sep38.getPrice(quoteServer, request, this.fetchFn);
    }

    // =========================================================================
    // SEP-6 programmatic ramps
    // =========================================================================

    async sep6Deposit(token: string, request: Sep6DepositRequest): Promise<Sep6DepositResponse> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        return sep6.deposit(transferServer, token, request, this.fetchFn);
    }

    /**
     * Initiate a SEP-6 withdrawal and pre-build the signable Stellar payment
     * XDR the user's wallet must sign and submit.
     */
    async sep6Withdraw(
        token: string,
        request: Sep6WithdrawRequest,
        sourceAccount: string,
    ): Promise<Sep6WithdrawResponse & { signableXdr: string }> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        const response = await sep6.withdraw(transferServer, token, request, this.fetchFn);
        const tokenInfo = this.findToken(request.asset_code);
        const signableXdr = await this.buildWithdrawalXdr({
            from: sourceAccount,
            to: response.account_id,
            assetCode: tokenInfo?.symbol ?? request.asset_code,
            assetIssuer: tokenInfo?.issuer,
            amount: request.amount || '0',
            memo: response.memo,
            memoType: response.memo_type,
        });
        return { ...response, signableXdr };
    }

    async getSep6Transaction(token: string, id: string): Promise<Sep6Transaction | null> {
        const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
        try {
            return await sep6.getTransaction(transferServer, token, id, this.fetchFn);
        } catch (err) {
            return this.nullIfNotFound(err);
        }
    }

    // =========================================================================
    // SEP-24 interactive ramps
    // =========================================================================

    async sep24Deposit(
        token: string,
        request: Sep24DepositRequest,
    ): Promise<Sep24InteractiveResponse> {
        const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
        return sep24.deposit(transferServer, token, request, this.fetchFn);
    }

    async sep24Withdraw(
        token: string,
        request: Sep24WithdrawRequest,
    ): Promise<Sep24InteractiveResponse> {
        const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
        return sep24.withdraw(transferServer, token, request, this.fetchFn);
    }

    async getSep24Transaction(token: string, id: string): Promise<Sep24Transaction | null> {
        const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
        try {
            return await sep24.getTransaction(transferServer, token, id, this.fetchFn);
        } catch (err) {
            return this.nullIfNotFound(err);
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    private nullIfNotFound<T>(err: unknown): T | null {
        if (err && typeof err === 'object' && 'status' in err && err.status === 404) return null;
        throw err;
    }

    private async buildWithdrawalXdr(params: {
        from: string;
        to: string;
        assetCode: string;
        assetIssuer?: string;
        amount: string;
        memo?: string;
        memoType?: string;
    }): Promise<string> {
        if (!StrKey.isValidEd25519PublicKey(params.from)) {
            throw new Error(`Invalid source account: ${params.from}`);
        }
        const horizon = new Horizon.Server(this.horizonUrl);
        const source = await horizon.loadAccount(params.from);
        const asset = params.assetIssuer
            ? new Asset(params.assetCode, params.assetIssuer)
            : Asset.native();

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

/** Create a new {@link TestAnchorRampClient} instance. */
export function createTestAnchorRampClient(
    config?: TestAnchorRampClientConfig,
): TestAnchorRampClient {
    return new TestAnchorRampClient(config);
}
