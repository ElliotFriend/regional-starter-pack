/**
 * Test Anchor Playground Client
 *
 * A stateful, namespaced SEP playground client for testanchor.stellar.org,
 * used by the `/testanchor` demo page to walk through each SEP protocol
 * (SEP-1, SEP-10, SEP-12, SEP-6, SEP-24, SEP-31, SEP-38) interactively.
 *
 * SEP operations are accessed via namespaced properties that mirror the
 * protocol structure: `client.sep6.deposit(...)`, `client.sep24.poll(...)`,
 * `client.sep38.getPrice(...)`, etc. Authentication is stateful — call
 * `client.authenticate(...)` once and the SEP-10 token is cached on the
 * instance.
 *
 * NOT used by the curated `/anchors/testanchor/...` ramp pages — those use
 * the stateless `TestAnchorRampClient` from `./ramp.ts` instead. The two
 * clients coexist deliberately:
 *
 * - `TestAnchorPlaygroundClient` (this file) — stateful, instance-scoped
 *   token, namespaced API, optimised for a one-user-per-page demo.
 * - `TestAnchorRampClient` (`./ramp.ts`) — stateless, token passed per
 *   call, flat API, optimised for serving multiple users from one server
 *   instance and for matching the bespoke per-provider client shape used
 *   by Etherfuse and (eventually) Koywe, PDAX, etc.
 */

import { sep1, sep6, sep10, sep12, sep24, sep31, sep38 } from '../sep';

import type {
    Sep6Info,
    Sep6DepositRequest,
    Sep6DepositResponse,
    Sep6WithdrawRequest,
    Sep6WithdrawResponse,
    Sep6Transaction,
    Sep12CustomerResponse,
    Sep12PutCustomerRequest,
    Sep24Info,
    Sep24DepositRequest,
    Sep24WithdrawRequest,
    Sep24InteractiveResponse,
    Sep24Transaction,
    Sep31Info,
    Sep31PostTransactionRequest,
    Sep31PostTransactionResponse,
    Sep31Transaction,
    Sep38Info,
    Sep38PriceRequest,
    Sep38PriceResponse,
    Sep38QuoteRequest,
    Sep38QuoteResponse,
} from '../sep/types';

export interface TestAnchorPlaygroundConfig {
    domain?: string;
    networkPassphrase?: string;
}

const DEFAULT_DOMAIN = 'testanchor.stellar.org';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * Test Anchor Playground Client — see file-level docstring for the full
 * comparison against `TestAnchorRampClient`.
 */
export class TestAnchorPlaygroundClient {
    private domain: string;
    private networkPassphrase: string;
    private toml: sep1.StellarTomlRecord | null = null;
    private token: string | null = null;
    private account: string | null = null;
    private fetchFn: typeof fetch;

    constructor(config: TestAnchorPlaygroundConfig = {}, fetchFn: typeof fetch = fetch) {
        this.domain = config.domain || DEFAULT_DOMAIN;
        this.networkPassphrase = config.networkPassphrase || TESTNET_PASSPHRASE;
        this.fetchFn = fetchFn;
    }

    // ===========================================================================
    // Private helpers
    // ===========================================================================

    private async endpoint(
        getEndpoint: (toml: sep1.StellarTomlRecord) => string | undefined,
        sepName: string,
    ): Promise<string> {
        const toml = await this.getToml();
        const ep = getEndpoint(toml);
        if (!ep) throw new Error(`Anchor does not support ${sepName}`);
        return ep;
    }

    private requireAuth(): string {
        if (!this.token || sep10.isTokenExpired(this.token)) {
            throw new Error('Not authenticated or token expired. Call authenticate() first.');
        }
        return this.token;
    }

    // ===========================================================================
    // Initialization & Discovery (SEP-1)
    // ===========================================================================

    /** Initialize the client by fetching the stellar.toml file. */
    async initialize(): Promise<sep1.StellarTomlRecord> {
        this.toml = await sep1.fetchStellarToml(this.domain);
        return this.toml;
    }

    /** Get the cached stellar.toml or fetch it if not available. */
    async getToml(): Promise<sep1.StellarTomlRecord> {
        if (!this.toml) {
            await this.initialize();
        }
        return this.toml!;
    }

    /** Check if a specific SEP is supported by this anchor. */
    async supportsSep(sep: 6 | 10 | 12 | 24 | 31 | 38): Promise<boolean> {
        const toml = await this.getToml();
        switch (sep) {
            case 6:
                return !!sep1.getSep6Endpoint(toml);
            case 10:
                return !!sep1.getSep10Endpoint(toml);
            case 12:
                return !!sep1.getSep12Endpoint(toml);
            case 24:
                return !!sep1.getSep24Endpoint(toml);
            case 31:
                return !!sep1.getSep31Endpoint(toml);
            case 38:
                return !!sep1.getSep38Endpoint(toml);
            default:
                return false;
        }
    }

    // ===========================================================================
    // Authentication (SEP-10)
    // ===========================================================================

    /**
     * Authenticate with the anchor using SEP-10.
     * @param account - The user's Stellar public key
     * @param signer - Function to sign the challenge transaction (e.g., from Freighter)
     */
    async authenticate(account: string, signer: sep10.Sep10SignerFn): Promise<string> {
        const toml = await this.getToml();
        const authEndpoint = sep1.getSep10Endpoint(toml);
        const signingKey = sep1.getSigningKey(toml);

        if (!authEndpoint) {
            throw new Error('Anchor does not support SEP-10 authentication');
        }

        this.token = await sep10.authenticate(
            {
                authEndpoint,
                serverSigningKey: signingKey || '',
                networkPassphrase: this.networkPassphrase,
                homeDomain: this.domain,
            },
            account,
            signer,
            { validateChallenge: !!signingKey },
            this.fetchFn,
        );

        this.account = account;
        return this.token;
    }

    /** Check if the client is authenticated. */
    isAuthenticated(): boolean {
        return !!this.token && !sep10.isTokenExpired(this.token);
    }

    /** Get the current JWT token. */
    getToken(): string | null {
        return this.token;
    }

    /** Get the authenticated account. */
    getAccount(): string | null {
        return this.account;
    }

    /** Decode the current JWT token to get the payload. */
    getTokenPayload() {
        if (!this.token) return null;
        return sep10.decodeToken(this.token);
    }

    /** Clear the authentication state. */
    logout(): void {
        this.token = null;
        this.account = null;
    }

    // ===========================================================================
    // SEP-6: Programmatic Deposit/Withdrawal
    // ===========================================================================

    readonly sep6 = {
        getInfo: async (): Promise<Sep6Info> => {
            const ep = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            return sep6.getInfo(ep, this.fetchFn);
        },

        deposit: async (request: Sep6DepositRequest): Promise<Sep6DepositResponse> => {
            const ep = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            return sep6.deposit(ep, this.requireAuth(), request, this.fetchFn);
        },

        withdraw: async (request: Sep6WithdrawRequest): Promise<Sep6WithdrawResponse> => {
            const ep = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            return sep6.withdraw(ep, this.requireAuth(), request, this.fetchFn);
        },

        getTransaction: async (transactionId: string): Promise<Sep6Transaction> => {
            const ep = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            return sep6.getTransaction(ep, this.requireAuth(), transactionId, this.fetchFn);
        },

        getTransactions: async (assetCode: string, limit?: number): Promise<Sep6Transaction[]> => {
            const ep = await this.endpoint(sep1.getSep6Endpoint, 'SEP-6');
            return sep6.getTransactions(
                ep,
                this.requireAuth(),
                { asset_code: assetCode, limit },
                this.fetchFn,
            );
        },
    };

    // ===========================================================================
    // SEP-12: KYC API
    // ===========================================================================

    readonly sep12 = {
        getCustomer: async (type?: string): Promise<Sep12CustomerResponse> => {
            const ep = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            return sep12.getCustomer(ep, this.requireAuth(), { type }, this.fetchFn);
        },

        putCustomer: async (data: Sep12PutCustomerRequest): Promise<{ id: string }> => {
            const ep = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            return sep12.putCustomer(ep, this.requireAuth(), data, this.fetchFn);
        },

        deleteCustomer: async (): Promise<void> => {
            const ep = await this.endpoint(sep1.getSep12Endpoint, 'SEP-12');
            return sep12.deleteCustomer(ep, this.requireAuth(), {}, this.fetchFn);
        },
    };

    // ===========================================================================
    // SEP-24: Interactive Deposit/Withdrawal
    // ===========================================================================

    readonly sep24 = {
        getInfo: async (): Promise<Sep24Info> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.getInfo(ep, this.fetchFn);
        },

        deposit: async (request: Sep24DepositRequest): Promise<Sep24InteractiveResponse> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.deposit(ep, this.requireAuth(), request, this.fetchFn);
        },

        withdraw: async (request: Sep24WithdrawRequest): Promise<Sep24InteractiveResponse> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.withdraw(ep, this.requireAuth(), request, this.fetchFn);
        },

        getTransaction: async (transactionId: string): Promise<Sep24Transaction> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.getTransaction(ep, this.requireAuth(), transactionId, this.fetchFn);
        },

        getTransactions: async (assetCode: string, limit?: number): Promise<Sep24Transaction[]> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.getTransactions(
                ep,
                this.requireAuth(),
                { asset_code: assetCode, limit },
                this.fetchFn,
            );
        },

        poll: async (
            transactionId: string,
            onStatusChange?: (tx: Sep24Transaction) => void,
        ): Promise<Sep24Transaction> => {
            const ep = await this.endpoint(sep1.getSep24Endpoint, 'SEP-24');
            return sep24.pollTransaction(
                ep,
                this.requireAuth(),
                transactionId,
                { onStatusChange },
                this.fetchFn,
            );
        },
    };

    // ===========================================================================
    // SEP-31: Cross-Border Payments
    // ===========================================================================

    readonly sep31 = {
        getInfo: async (): Promise<Sep31Info> => {
            const ep = await this.endpoint(sep1.getSep31Endpoint, 'SEP-31');
            return sep31.getInfo(ep, this.fetchFn);
        },

        createTransaction: async (
            request: Sep31PostTransactionRequest,
        ): Promise<Sep31PostTransactionResponse> => {
            const ep = await this.endpoint(sep1.getSep31Endpoint, 'SEP-31');
            return sep31.postTransaction(ep, this.requireAuth(), request, this.fetchFn);
        },

        getTransaction: async (transactionId: string): Promise<Sep31Transaction> => {
            const ep = await this.endpoint(sep1.getSep31Endpoint, 'SEP-31');
            return sep31.getTransaction(ep, this.requireAuth(), transactionId, this.fetchFn);
        },

        updateTransaction: async (
            transactionId: string,
            fields: Record<string, string>,
        ): Promise<Sep31Transaction> => {
            const ep = await this.endpoint(sep1.getSep31Endpoint, 'SEP-31');
            return sep31.patchTransaction(
                ep,
                this.requireAuth(),
                transactionId,
                fields,
                this.fetchFn,
            );
        },

        poll: async (
            transactionId: string,
            onStatusChange?: (tx: Sep31Transaction) => void,
        ): Promise<Sep31Transaction> => {
            const ep = await this.endpoint(sep1.getSep31Endpoint, 'SEP-31');
            return sep31.pollTransaction(
                ep,
                this.requireAuth(),
                transactionId,
                { onStatusChange },
                this.fetchFn,
            );
        },
    };

    // ===========================================================================
    // SEP-38: Anchor RFQ (Quotes)
    // ===========================================================================

    readonly sep38 = {
        getInfo: async (): Promise<Sep38Info> => {
            const ep = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
            return sep38.getInfo(ep, this.fetchFn);
        },

        getPrice: async (request: Sep38PriceRequest): Promise<Sep38PriceResponse> => {
            const ep = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
            return sep38.getPrice(ep, request, this.fetchFn);
        },

        createQuote: async (request: Sep38QuoteRequest): Promise<Sep38QuoteResponse> => {
            const ep = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
            return sep38.postQuote(ep, this.requireAuth(), request, this.fetchFn);
        },

        getQuote: async (quoteId: string): Promise<Sep38QuoteResponse> => {
            const ep = await this.endpoint(sep1.getSep38Endpoint, 'SEP-38');
            return sep38.getQuote(ep, this.requireAuth(), quoteId, this.fetchFn);
        },
    };
}

/** Create a new `TestAnchorPlaygroundClient` instance. */
export function createTestAnchorPlaygroundClient(
    config?: TestAnchorPlaygroundConfig,
    fetchFn?: typeof fetch,
): TestAnchorPlaygroundClient {
    return new TestAnchorPlaygroundClient(config, fetchFn);
}
