/**
 * Test Anchor — {@link Anchor} adapter
 *
 * Wraps the SEP protocol modules (`../sep`) as a first-class {@link Anchor}
 * implementation so the Stellar test anchor (testanchor.stellar.org) can be
 * driven through the same unified interface as any other provider.
 *
 * The test anchor supports BOTH ramp archetypes, so this adapter exposes both
 * capability facets plus the wallet-auth facet:
 *   - {@link Anchor.auth | auth} — SEP-10 wallet authentication (the handshake is
 *     split so the signing step can run client-side via Freighter).
 *   - {@link Anchor.programmatic | programmatic} — SEP-6 deposit/withdrawal,
 *     SEP-12 KYC, SEP-38 quotes.
 *   - {@link Anchor.interactive | interactive} — SEP-24 interactive deposit/withdrawal.
 *
 * It is framework-agnostic (no SvelteKit imports) and depends only on
 * `@stellar/stellar-sdk` and the sibling `../sep` modules. Unlike
 * {@link TestAnchorClient} (the namespaced SEP playground used by the `/testanchor`
 * demo), this adapter is stateless across calls: SEP-10 tokens are passed in via
 * each method's `auth` parameter rather than stored, which is safe to share as a
 * single server-side instance across requests.
 */

import { Asset, Horizon, Operation, TransactionBuilder, Memo, StrKey } from '@stellar/stellar-sdk';
import { sep1, sep6, sep10, sep12, sep24, sep38 } from '../sep';
import type {
    Sep6Transaction,
    TransactionStatus as SepTransactionStatus,
    Sep12Status,
    Sep12PutCustomerRequest,
} from '../sep/types';

type StellarTomlRecord = sep1.StellarTomlRecord;
import type {
    Anchor,
    WalletAuthOps,
    ProgrammaticOps,
    InteractiveOps,
    AnchorCapabilities,
    AuthChallenge,
    AuthSession,
    TokenInfo,
    Customer,
    Quote,
    OnRampTransaction,
    OffRampTransaction,
    CreateCustomerInput,
    GetCustomerInput,
    GetQuoteInput,
    CreateOnRampInput,
    CreateOffRampInput,
    SavedFiatAccount,
    StartInteractiveInput,
    InteractiveSession,
    GenericPaymentInstructions,
    KycStatus,
    KycRequirements,
    KycSubmissionData,
    KycSubmissionResult,
    TransactionStatus,
} from '../types';
import { AnchorError } from '../types';

/** Configuration for {@link TestAnchorAdapter}. */
export interface TestAnchorAdapterConfig {
    /** Anchor home domain. Defaults to `testanchor.stellar.org`. */
    domain?: string;
    /** Stellar network passphrase. Defaults to the testnet passphrase. */
    networkPassphrase?: string;
    /** Horizon URL used to build off-ramp withdrawal payments. Defaults to testnet Horizon. */
    horizonUrl?: string;
    /** Optional fetch implementation for SSR. */
    fetchFn?: typeof fetch;
}

const DEFAULT_DOMAIN = 'testanchor.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const DEFAULT_HORIZON = 'https://horizon-testnet.stellar.org';

/**
 * Wrap a fetch implementation to log each SEP request method/URL and response
 * status (mirrors the Etherfuse client's request logging). Note: stellar.toml
 * discovery goes through the SDK's resolver, not this fetch, so it is not logged.
 */
function withRequestLogging(baseFetch: typeof fetch): typeof fetch {
    return async (input, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        console.log(`[TestAnchor] ${method} ${url}`);
        try {
            const response = await baseFetch(input, init);
            const response2 = response.clone()
            console.log(`[TestAnchor] Response (${response.status}) ${method} ${url} ${JSON.stringify(await response2.json())}`);
            return response;
        } catch (err) {
            console.error(`[TestAnchor] Request failed ${method} ${url}:`, err);
            throw err;
        }
    };
}

/**
 * {@link Anchor} adapter for the Stellar test anchor, composing the SEP modules.
 */
export class TestAnchorAdapter implements Anchor {
    readonly name = 'testanchor';
    readonly displayName = 'Test Anchor';
    readonly capabilities: AnchorCapabilities = {
        sep6: true,
        sep24: true,
        kycFlow: 'form',
        requiresOffRampSigning: true,
        sandbox: true,
        flowStyles: ['interactive', 'programmatic'],
    };
    // testanchor.stellar.org issues SRT and supports testnet USDC. Issuers are
    // used to build SEP-38 asset identifiers and off-ramp withdrawal payments.
    readonly supportedTokens: readonly TokenInfo[] = [
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

    constructor(config: TestAnchorAdapterConfig = {}) {
        this.domain = config.domain || DEFAULT_DOMAIN;
        this.networkPassphrase = config.networkPassphrase || TESTNET_PASSPHRASE;
        this.horizonUrl = config.horizonUrl || DEFAULT_HORIZON;
        this.fetchFn = withRequestLogging(config.fetchFn || fetch);
    }

    // =========================================================================
    // Discovery & mapping helpers
    // =========================================================================

    /** Fetch (and cache) the anchor's stellar.toml. */
    private async toml(): Promise<StellarTomlRecord> {
        if (!this.tomlCache) {
            this.tomlCache = await sep1.fetchStellarToml(this.domain);
        }
        return this.tomlCache;
    }

    /** Resolve a SEP endpoint from the toml, throwing if the anchor does not support it. */
    private async endpoint(
        getter: (toml: StellarTomlRecord) => string | undefined,
        sepName: string,
    ): Promise<string> {
        const ep = getter(await this.toml());
        if (!ep) {
            throw new AnchorError(
                `Test anchor does not advertise ${sepName} support`,
                'SEP_NOT_SUPPORTED',
                501,
            );
        }
        return ep;
    }

    /** Map a SEP transaction status to the shared {@link TransactionStatus}. */
    private mapStatus(status: SepTransactionStatus): TransactionStatus {
        switch (status) {
            case 'completed':
                return 'completed';
            case 'refunded':
                return 'refunded';
            case 'expired':
                return 'expired';
            case 'error':
            case 'no_market':
                return 'failed';
            case 'incomplete':
            case 'pending_user_transfer_start':
                return 'pending';
            default:
                // All other pending_* states are work-in-progress on the anchor side.
                return 'processing';
        }
    }

    /** Map a SEP-12 KYC status to the shared {@link KycStatus}. */
    private mapKycStatus(status: Sep12Status): KycStatus {
        switch (status) {
            case 'ACCEPTED':
                return 'approved';
            case 'PROCESSING':
                return 'pending';
            case 'REJECTED':
                return 'rejected';
            case 'NEEDS_INFO':
            default:
                return 'update_required';
        }
    }

    /** Look up a supported crypto token by symbol (case-insensitive). */
    private findToken(symbol: string): TokenInfo | undefined {
        const code = symbol.includes(':') ? symbol.split(':')[0] : symbol;
        return this.supportedTokens.find((t) => t.symbol.toUpperCase() === code.toUpperCase());
    }

    /** Build a SEP-38 asset identifier (`stellar:CODE:ISSUER` or `iso4217:CODE`) for a currency code. */
    private toSep38Asset(code: string): string {
        const token = this.findToken(code);
        if (token) {
            return sep38.stellarAssetId(token.symbol, token.issuer);
        }
        return sep38.fiatAssetId(code);
    }

    /** Map a SEP-6/24 transaction to the shared {@link OnRampTransaction}. */
    private mapOnRamp(tx: Sep6Transaction, ctx: { auth?: string } = {}): OnRampTransaction {
        return {
            id: tx.id,
            customerId: ctx.auth ? sep10.decodeToken(ctx.auth).sub : '',
            quoteId: '',
            status: this.mapStatus(tx.status),
            fromAmount: tx.amount_in ?? '',
            fromCurrency: tx.amount_in_asset ?? '',
            toAmount: tx.amount_out ?? '',
            toCurrency: tx.amount_out_asset ?? '',
            stellarAddress: tx.to ?? '',
            feeAmount: tx.amount_fee,
            stellarTxHash: tx.stellar_transaction_id,
            interactiveUrl: tx.more_info_url,
            createdAt: tx.started_at ?? new Date().toISOString(),
            updatedAt: tx.completed_at ?? tx.started_at ?? new Date().toISOString(),
        };
    }

    /** Map a SEP-6/24 transaction to the shared {@link OffRampTransaction}. */
    private mapOffRamp(tx: Sep6Transaction, ctx: { auth?: string } = {}): OffRampTransaction {
        return {
            id: tx.id,
            customerId: ctx.auth ? sep10.decodeToken(ctx.auth).sub : '',
            quoteId: '',
            status: this.mapStatus(tx.status),
            fromAmount: tx.amount_in ?? '',
            fromCurrency: tx.amount_in_asset ?? '',
            toAmount: tx.amount_out ?? '',
            toCurrency: tx.amount_out_asset ?? '',
            stellarAddress: tx.from ?? '',
            feeAmount: tx.amount_fee,
            memo: tx.withdraw_memo,
            stellarTxHash: tx.stellar_transaction_id,
            statusPage: tx.more_info_url,
            interactiveUrl: tx.more_info_url,
            createdAt: tx.started_at ?? new Date().toISOString(),
            updatedAt: tx.completed_at ?? tx.started_at ?? new Date().toISOString(),
        };
    }

    // =========================================================================
    // Wallet authentication facet (SEP-10)
    // =========================================================================

    readonly auth: WalletAuthOps = {
        getChallenge: async (account: string): Promise<AuthChallenge> => {
            const toml = await this.toml();
            const authEndpoint = sep1.getSep10Endpoint(toml);
            if (!authEndpoint) {
                throw new AnchorError(
                    'Test anchor does not advertise SEP-10 support',
                    'SEP_NOT_SUPPORTED',
                    501,
                );
            }
            const challenge = await sep10.getChallenge(
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
            return {
                transactionXdr: challenge.transaction,
                networkPassphrase: challenge.network_passphrase || this.networkPassphrase,
            };
        },

        submitChallenge: async (signedTransactionXdr: string): Promise<AuthSession> => {
            const authEndpoint = await this.endpoint(sep1.getSep10Endpoint, 'SEP-10');
            const { token } = await sep10.submitChallenge(
                authEndpoint,
                signedTransactionXdr,
                this.fetchFn,
            );
            return { token };
        },
    };

    // =========================================================================
    // Programmatic facet (SEP-6 + SEP-12 + SEP-38)
    // =========================================================================

    private requireAuth(auth: string | undefined, op: string): string {
        if (!auth) {
            throw new AnchorError(
                `A SEP-10 session token is required for ${op}. Authenticate via the wallet first.`,
                'AUTH_REQUIRED',
                401,
            );
        }
        return auth;
    }

    readonly programmatic: ProgrammaticOps = {
        createCustomer: async (input: CreateCustomerInput, auth?: string): Promise<Customer> => {
            const token = this.requireAuth(auth, 'createCustomer');
            const account = input.publicKey ?? sep10.decodeToken(token).sub;
            const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            const customer = await sep12.getCustomer(kycServer, token, { account }, this.fetchFn);
            const now = new Date().toISOString();
            return {
                id: customer.id ?? account,
                email: input.email,
                kycStatus: this.mapKycStatus(customer.status),
                country: input.country,
                createdAt: now,
                updatedAt: now,
            };
        },

        getCustomer: async (input: GetCustomerInput, auth?: string): Promise<Customer | null> => {
            const token = this.requireAuth(auth, 'getCustomer');
            const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            const account = sep10.decodeToken(token).sub;
            const customer = await sep12.getCustomer(
                kycServer,
                token,
                { id: input.customerId, account },
                this.fetchFn,
            );
            const now = new Date().toISOString();
            return {
                id: customer.id ?? input.customerId ?? account,
                kycStatus: this.mapKycStatus(customer.status),
                createdAt: now,
                updatedAt: now,
            };
        },

        // SEP-38 price is public, so the session token is accepted (to satisfy
        // ProgrammaticOps) but unused.
        getQuote: async (input: GetQuoteInput, _auth?: string): Promise<Quote> => {
            const quoteServer = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
            const sellAsset = this.toSep38Asset(input.fromCurrency);
            const buyAsset = this.toSep38Asset(input.toCurrency);
            const price = await sep38.getPrice(
                quoteServer,
                {
                    sell_asset: sellAsset,
                    buy_asset: buyAsset,
                    sell_amount: input.fromAmount,
                    buy_amount: input.fromAmount ? undefined : input.toAmount,
                    context: 'sep6',
                },
                this.fetchFn,
            );
            const now = new Date();
            return {
                id: `sep38-${now.getTime()}`,
                fromCurrency: input.fromCurrency,
                toCurrency: input.toCurrency,
                fromAmount: price.sell_amount,
                toAmount: price.buy_amount,
                exchangeRate: price.price,
                fee: price.fee?.total ?? '0',
                expiresAt: new Date(now.getTime() + 60_000).toISOString(),
                createdAt: now.toISOString(),
            };
        },

        createOnRamp: async (
            input: CreateOnRampInput,
            auth?: string,
        ): Promise<OnRampTransaction> => {
            const token = this.requireAuth(auth, 'createOnRamp');
            const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            const token0 = this.findToken(input.toCurrency);
            const response = await sep6.deposit(
                transferServer,
                token,
                {
                    asset_code: token0?.symbol ?? input.toCurrency,
                    // SEP-6 deposit method; the test anchor only supports 'bank_account'
                    // (mirrors the off-ramp withdrawal type).
                    type: 'bank_account',
                    account: input.stellarAddress,
                    amount: input.amount,
                    memo: input.memo,
                },
                this.fetchFn,
            );
            const now = new Date().toISOString();
            return {
                id: response.id ?? '',
                customerId: input.customerId,
                quoteId: input.quoteId,
                status: 'pending',
                fromAmount: input.amount,
                fromCurrency: input.fromCurrency,
                toAmount: '',
                toCurrency: input.toCurrency,
                stellarAddress: input.stellarAddress,
                paymentInstructions: this.depositInstructions(response, input),
                createdAt: now,
                updatedAt: now,
            };
        },

        getOnRampTransaction: async (
            transactionId: string,
            auth?: string,
        ): Promise<OnRampTransaction | null> => {
            const token = this.requireAuth(auth, 'getOnRampTransaction');
            const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            try {
                const tx = await sep6.getTransaction(
                    transferServer,
                    token,
                    transactionId,
                    this.fetchFn,
                );
                return this.mapOnRamp(tx, { auth });
            } catch (err) {
                return this.nullIfNotFound(err);
            }
        },

        // The test anchor collects bank/payout details inside its SEP-6 KYC and
        // withdrawal flow rather than via a saved-account API.
        getFiatAccounts: async (): Promise<SavedFiatAccount[]> => [],

        createOffRamp: async (
            input: CreateOffRampInput,
            auth?: string,
        ): Promise<OffRampTransaction> => {
            const token = this.requireAuth(auth, 'createOffRamp');
            const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            const token0 = this.findToken(input.fromCurrency);
            const response = await sep6.withdraw(
                transferServer,
                token,
                {
                    asset_code: token0?.symbol ?? input.fromCurrency,
                    type: 'bank_account',
                    account: input.stellarAddress,
                    amount: input.amount,
                },
                this.fetchFn,
            );

            // Build the Stellar payment the user must sign to send funds to the
            // anchor. Returned as `signableTransaction` so the existing wallet
            // signing flow (shared with deferred-signing providers) works as-is.
            const signableTransaction = await this.buildWithdrawalXdr({
                from: input.stellarAddress,
                to: response.account_id,
                assetCode: token0?.symbol ?? input.fromCurrency,
                assetIssuer: token0?.issuer,
                amount: input.amount,
                memo: response.memo,
                memoType: response.memo_type,
            });

            const now = new Date().toISOString();
            return {
                id: response.id ?? '',
                customerId: input.customerId,
                quoteId: input.quoteId,
                status: 'pending',
                fromAmount: input.amount,
                fromCurrency: input.fromCurrency,
                toAmount: '',
                toCurrency: input.toCurrency,
                stellarAddress: input.stellarAddress,
                memo: response.memo,
                signableTransaction,
                createdAt: now,
                updatedAt: now,
            };
        },

        getOffRampTransaction: async (
            transactionId: string,
            auth?: string,
        ): Promise<OffRampTransaction | null> => {
            const token = this.requireAuth(auth, 'getOffRampTransaction');
            const transferServer = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            try {
                const tx = await sep6.getTransaction(
                    transferServer,
                    token,
                    transactionId,
                    this.fetchFn,
                );
                return this.mapOffRamp(tx, { auth });
            } catch (err) {
                return this.nullIfNotFound(err);
            }
        },

        getKycStatus: async (
            customerId: string,
            publicKey?: string,
            auth?: string,
        ): Promise<KycStatus> => {
            const token = this.requireAuth(auth, 'getKycStatus');
            const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            const account = publicKey ?? sep10.decodeToken(token).sub;
            const customer = await sep12.getCustomer(kycServer, token, { account }, this.fetchFn);
            return this.mapKycStatus(customer.status);
        },

        // The test anchor's SEP-12 KYC needs only basic SEP-9 natural-person
        // fields. We expose a static set rather than discovering them per-customer
        // via `getCustomer` (which would require an authenticated call here).
        getKycRequirements: async (): Promise<KycRequirements> => ({
            fields: [
                { key: 'first_name', label: 'First Name', type: 'text', required: true },
                { key: 'last_name', label: 'Last Name', type: 'text', required: true },
                {
                    key: 'email_address',
                    label: 'Email Address',
                    type: 'email',
                    required: true,
                    placeholder: 'you@example.com',
                },
            ],
            documents: [],
        }),

        submitKyc: async (
            customerId: string,
            data: KycSubmissionData,
            auth?: string,
        ): Promise<KycSubmissionResult> => {
            const token = this.requireAuth(auth, 'submitKyc');
            const kycServer = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            const account = sep10.decodeToken(token).sub;

            // SEP-12 is keyed by the authenticated account; submit the SEP-9
            // field values (plus any binary document uploads) via PUT /customer.
            const request: Sep12PutCustomerRequest = { account, ...data.fields };
            for (const [key, value] of Object.entries(data.documents)) {
                if (value instanceof Blob) request[key] = value;
            }

            const { id } = await sep12.putCustomer(kycServer, token, request, this.fetchFn);
            const customer = await sep12.getCustomer(
                kycServer,
                token,
                { id, account },
                this.fetchFn,
            );
            return {
                customerId: id,
                kycStatus: this.mapKycStatus(customer.status),
                submissionId: id,
            };
        },
    };

    // =========================================================================
    // Interactive facet (SEP-24)
    // =========================================================================

    readonly interactive: InteractiveOps = {
        startOnRamp: async (input: StartInteractiveInput): Promise<InteractiveSession> => {
            const token = this.requireAuth(input.auth, 'startOnRamp');
            const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            const session = await sep24.deposit(
                transferServer,
                token,
                {
                    asset_code: input.assetCode,
                    asset_issuer: input.assetIssuer,
                    account: input.account,
                    amount: input.amount,
                },
                this.fetchFn,
            );
            return { interactiveUrl: session.url, transactionId: session.id };
        },

        getOnRampTransaction: async (
            transactionId: string,
            auth?: string,
        ): Promise<OnRampTransaction | null> => {
            const token = this.requireAuth(auth, 'getOnRampTransaction');
            const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            try {
                const tx = await sep24.getTransaction(
                    transferServer,
                    token,
                    transactionId,
                    this.fetchFn,
                );
                return this.mapOnRamp(tx, { auth });
            } catch (err) {
                return this.nullIfNotFound(err);
            }
        },

        startOffRamp: async (input: StartInteractiveInput): Promise<InteractiveSession> => {
            const token = this.requireAuth(input.auth, 'startOffRamp');
            const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            const session = await sep24.withdraw(
                transferServer,
                token,
                {
                    asset_code: input.assetCode,
                    asset_issuer: input.assetIssuer,
                    account: input.account,
                    amount: input.amount,
                },
                this.fetchFn,
            );
            return { interactiveUrl: session.url, transactionId: session.id };
        },

        getOffRampTransaction: async (
            transactionId: string,
            auth?: string,
        ): Promise<OffRampTransaction | null> => {
            const token = this.requireAuth(auth, 'getOffRampTransaction');
            const transferServer = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            try {
                const tx = await sep24.getTransaction(
                    transferServer,
                    token,
                    transactionId,
                    this.fetchFn,
                );
                return this.mapOffRamp(tx, { auth });
            } catch (err) {
                return this.nullIfNotFound(err);
            }
        },
    };

    // =========================================================================
    // Internal helpers for the programmatic flow
    // =========================================================================

    /** Return `null` for SEP 404s, re-throw everything else. */
    private nullIfNotFound<T>(err: unknown): T | null {
        if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
            return null;
        }
        throw err;
    }

    /**
     * Map a SEP-6 deposit response's instructions to generic payment
     * instructions for display in the on-ramp UI.
     */
    private depositInstructions(
        response: {
            how?: string;
            instructions?: Record<string, { value: string; description: string }>;
        },
        input: CreateOnRampInput,
    ): GenericPaymentInstructions | undefined {
        const entries = Object.entries(response.instructions ?? {});
        if (entries.length === 0 && !response.how) return undefined;
        return {
            type: 'generic',
            amount: input.amount,
            currency: input.fromCurrency,
            how: response.how,
            fields: entries.map(([key, info]) => ({
                key,
                label: info.description || key,
                value: info.value,
            })),
        };
    }

    /**
     * Build (and serialize to XDR) the Stellar payment a user must sign to fund
     * a SEP-6 withdrawal — a payment of `amount` of the asset to the anchor's
     * `account_id` with the supplied memo.
     */
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
            throw new AnchorError(
                `Invalid source account: ${params.from}`,
                'INVALID_PUBLIC_KEY',
                400,
            );
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

/** Create a new {@link TestAnchorAdapter} instance. */
export function createTestAnchorAdapter(config?: TestAnchorAdapterConfig): TestAnchorAdapter {
    return new TestAnchorAdapter(config);
}
