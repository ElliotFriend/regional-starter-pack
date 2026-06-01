/**
 * Etherfuse API Client
 *
 * A standalone, framework-agnostic client for the Etherfuse fiat on/off ramp API.
 * Depends only on `@stellar/stellar-sdk` for Stellar public-key validation; copy
 * `client.ts`, `types.ts`, and `index.ts` together into any TypeScript project.
 *
 * **Server-side only** — authenticates with an API key that must never be
 * exposed to the browser.
 *
 * @example
 * ```ts
 * import { EtherfuseClient } from 'path/to/anchors/etherfuse';
 *
 * const etherfuse = new EtherfuseClient({
 *     apiKey: process.env.ETHERFUSE_API_KEY!,
 *     baseUrl: process.env.ETHERFUSE_BASE_URL!,
 * });
 *
 * const customer = await etherfuse.createCustomer({
 *     publicKey: 'G...',
 *     email: 'user@example.com',
 * });
 * ```
 */

import { StrKey } from '@stellar/stellar-sdk';
import {
    EtherfuseError,
    type EtherfuseConfig,
    type EtherfuseTokenInfo,
    type EtherfuseRail,
    type EtherfuseCustomer,
    type EtherfuseQuote,
    type EtherfuseOnRampOrder,
    type EtherfuseOffRampOrder,
    type EtherfuseSavedBankAccount,
    type EtherfuseDeposit,
    type EtherfuseKycStatus,
    type CreateCustomerArgs,
    type GetQuoteArgs,
    type CreateOnRampOrderArgs,
    type CreateOffRampOrderArgs,
    type GetKycUrlArgs,
    type GetKycStatusArgs,
    type GetAssetsArgs,
    type EtherfuseOnboardingResponse,
    type EtherfuseCustomerResponse,
    type EtherfuseQuoteResponse,
    type EtherfuseCreateOnRampResponse,
    type EtherfuseCreateOffRampResponse,
    type EtherfuseOrderResponse,
    type EtherfuseKycStatusResponse,
    type EtherfuseBankAccountListResponse,
    type EtherfuseAssetsResponse,
    type EtherfuseAgreementResponse,
    type EtherfuseErrorResponse,
    type EtherfuseKycIdentityRequest,
    type EtherfuseKycDocumentRequest,
} from './types';

/**
 * Client for the Etherfuse fiat on/off ramp API.
 *
 * Supports customer management, KYC (hosted via presigned URL or programmatic
 * via direct submission), currency quotes, on-ramp (fiat → CETES/TESOURO) and
 * off-ramp (CETES/TESOURO → fiat) orders over Stellar, with payouts via SPEI
 * (Mexico) and PIX (Brazil) rails.
 */
export class EtherfuseClient {
    /** Machine-readable provider identifier. */
    readonly name = 'etherfuse';
    /** Human-readable provider name. */
    readonly displayName = 'Etherfuse';
    /** Tokens issued by Etherfuse on Stellar. */
    readonly supportedTokens: readonly EtherfuseTokenInfo[] = [
        {
            symbol: 'CETES',
            name: 'Etherfuse CETES',
            issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
            description:
                "Etherfuse CETES, officially known as Mexican Federal Treasury Certificates, are Mexico's oldest short-term debt securities issued by the Ministry of Finance.",
            fiatCurrency: 'MXN',
            rail: 'spei',
        },
        {
            symbol: 'TESOURO',
            name: 'Etherfuse TESOURO',
            issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
            description:
                "Etherfuse TESOURO is a tokenized representation of Brazil's Tesouro Direto, the federal government's program of short-term debt securities issued by the National Treasury.",
            fiatCurrency: 'BRL',
            rail: 'pix',
        },
    ];
    /** ISO 4217 fiat currency codes supported by Etherfuse. */
    readonly supportedCurrencies: readonly string[] = ['MXN', 'BRL'];
    /** Payment rails supported by Etherfuse. */
    readonly supportedRails: readonly EtherfuseRail[] = ['spei', 'pix'];

    private readonly config: EtherfuseConfig;
    private readonly blockchain: string;

    constructor(config: EtherfuseConfig) {
        this.config = config;
        this.blockchain = config.defaultBlockchain || 'stellar';
    }

    // =========================================================================
    // Customer
    // =========================================================================

    /**
     * Create a new customer via the Etherfuse onboarding flow.
     *
     * Generates partner-side UUIDs for the customer and bank account and
     * requests a presigned onboarding URL (fetch with {@link getKycUrl} to
     * retrieve the URL afterwards). On a 409 conflict (publicKey already
     * registered), recovers the existing customer ID.
     *
     * @throws {EtherfuseError} If `publicKey` is missing/invalid or on API failure.
     */
    async createCustomer(args: CreateCustomerArgs): Promise<EtherfuseCustomer> {
        if (!args.publicKey) {
            throw new EtherfuseError(
                'publicKey is required to create an Etherfuse customer',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }
        if (!StrKey.isValidEd25519PublicKey(args.publicKey)) {
            throw new EtherfuseError(
                `Invalid Stellar public key: ${args.publicKey}`,
                'INVALID_PUBLIC_KEY',
                400,
            );
        }

        const customerId = crypto.randomUUID();
        const bankAccountId = crypto.randomUUID();

        try {
            await this.request<EtherfuseOnboardingResponse>('POST', '/ramp/onboarding-url', {
                customerId,
                bankAccountId,
                publicKey: args.publicKey,
                blockchain: this.blockchain,
            });

            const now = new Date().toISOString();
            return {
                id: customerId,
                email: args.email,
                kycStatus: 'not_started',
                country: args.country,
                bankAccountId,
                createdAt: now,
                updatedAt: now,
            };
        } catch (err) {
            // 409 means this public key is already registered — parse existing customer ID
            if (err instanceof EtherfuseError && err.statusCode === 409) {
                const match = err.message.match(/see org:\s*([0-9a-f-]+)/i);
                if (match) {
                    const existingCustomerId = match[1];
                    console.log(
                        `[Etherfuse] Public key already registered, using existing customer: ${existingCustomerId}`,
                    );

                    let existingBankAccountId: string | undefined;
                    try {
                        const accounts = await this.listBankAccounts(existingCustomerId);
                        if (accounts.length > 0) {
                            existingBankAccountId = accounts[0].id;
                        }
                    } catch (bankErr) {
                        console.warn(
                            `[Etherfuse] Could not fetch bank accounts for recovered customer:`,
                            bankErr,
                        );
                    }

                    const now = new Date().toISOString();
                    return {
                        id: existingCustomerId,
                        email: args.email,
                        kycStatus: 'not_started',
                        country: args.country,
                        bankAccountId: existingBankAccountId,
                        createdAt: now,
                        updatedAt: now,
                    };
                }
            }
            throw err;
        }
    }

    /**
     * Fetch a customer by ID.
     *
     * @returns The customer, or `null` if not found.
     * @throws {EtherfuseError} On non-404 API errors.
     */
    async getCustomer(customerId: string): Promise<EtherfuseCustomer | null> {
        if (!customerId) {
            throw new EtherfuseError('customerId is required', 'MISSING_CUSTOMER_ID', 400);
        }
        try {
            const response = await this.request<EtherfuseCustomerResponse>(
                'GET',
                `/ramp/customer/${customerId}`,
            );
            return {
                id: response.customerId,
                kycStatus: 'not_started',
                createdAt: response.createdAt,
                updatedAt: response.updatedAt,
            };
        } catch (error) {
            if (error instanceof EtherfuseError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    // =========================================================================
    // KYC
    // =========================================================================

    /**
     * Get a presigned URL for the Etherfuse hosted KYC / onboarding flow.
     *
     * Embed in an iframe (or open in a popup) for the user to complete identity
     * verification, agreement acceptance, and bank-account registration.
     *
     * @throws {EtherfuseError} If `publicKey` is missing or on API failure.
     */
    async getKycUrl(args: GetKycUrlArgs): Promise<string> {
        if (!args.publicKey) {
            throw new EtherfuseError(
                'publicKey is required for KYC onboarding',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }
        const resolvedBankAccountId = args.bankAccountId || crypto.randomUUID();
        const response = await this.request<EtherfuseOnboardingResponse>(
            'POST',
            '/ramp/onboarding-url',
            {
                customerId: args.customerId,
                bankAccountId: resolvedBankAccountId,
                publicKey: args.publicKey,
                blockchain: this.blockchain,
            },
        );
        return response.presigned_url;
    }

    /**
     * Get the current KYC status for a customer + wallet pair.
     *
     * @throws {EtherfuseError} If `publicKey` is missing or the API fails.
     */
    async getKycStatus(args: GetKycStatusArgs): Promise<EtherfuseKycStatus> {
        if (!args.publicKey) {
            throw new EtherfuseError(
                'publicKey is required for KYC status checks',
                'MISSING_PUBLIC_KEY',
                400,
            );
        }
        const response = await this.request<EtherfuseKycStatusResponse>(
            'GET',
            `/ramp/customer/${args.customerId}/kyc/${args.publicKey}`,
        );
        return response.status;
    }

    /**
     * Submit programmatic KYC identity data (alternative to the hosted flow).
     *
     * Currently blocked by an upstream issue: agreements POSTs return 406. Use
     * {@link getKycUrl} for the hosted flow in production.
     */
    async submitKycIdentity(
        customerId: string,
        identity: EtherfuseKycIdentityRequest,
    ): Promise<unknown> {
        return this.request('POST', `/ramp/customer/${customerId}/kyc`, identity);
    }

    /**
     * Upload KYC identity documents. Images should be Base64-encoded data URLs.
     */
    async submitKycDocuments(
        customerId: string,
        document: EtherfuseKycDocumentRequest,
    ): Promise<unknown> {
        return this.request('POST', `/ramp/customer/${customerId}/kyc/documents`, document);
    }

    // =========================================================================
    // Agreements (used inside the hosted onboarding flow)
    // =========================================================================

    /** Accept the electronic signature consent agreement. */
    async acceptElectronicSignature(presignedUrl: string): Promise<EtherfuseAgreementResponse> {
        return this.request<EtherfuseAgreementResponse>(
            'POST',
            '/ramp/agreements/electronic-signature',
            { presignedUrl },
        );
    }

    /** Accept the terms and conditions agreement. */
    async acceptTermsAndConditions(presignedUrl: string): Promise<EtherfuseAgreementResponse> {
        return this.request<EtherfuseAgreementResponse>(
            'POST',
            '/ramp/agreements/terms-and-conditions',
            { presignedUrl },
        );
    }

    /** Accept the customer agreement. */
    async acceptCustomerAgreement(presignedUrl: string): Promise<EtherfuseAgreementResponse> {
        return this.request<EtherfuseAgreementResponse>(
            'POST',
            '/ramp/agreements/customer-agreement',
            { presignedUrl },
        );
    }

    /** Accept all three legal agreements in sequence. */
    async acceptAgreements(presignedUrl: string): Promise<EtherfuseAgreementResponse> {
        await this.acceptElectronicSignature(presignedUrl);
        await this.acceptTermsAndConditions(presignedUrl);
        return this.acceptCustomerAgreement(presignedUrl);
    }

    // =========================================================================
    // Quote
    // =========================================================================

    /**
     * Request a currency conversion quote.
     *
     * Token symbols (e.g. `"CETES"`) are auto-resolved to `CODE:ISSUER`
     * identifiers via `/ramp/assets` when needed — provide `stellarAddress` to
     * enable resolution.
     *
     * @throws {EtherfuseError} On API failure.
     */
    async getQuote(args: GetQuoteArgs): Promise<EtherfuseQuote> {
        const quoteId = crypto.randomUUID();
        const [sourceAsset, targetAsset] = await this.resolveAssetPair(
            args.fromAsset,
            args.toAsset,
            args.stellarAddress || '',
        );
        const type: 'onramp' | 'offramp' = sourceAsset.includes(':') ? 'offramp' : 'onramp';

        const response = await this.request<EtherfuseQuoteResponse>('POST', '/ramp/quote', {
            quoteId,
            customerId: args.customerId || '',
            blockchain: this.blockchain,
            quoteAssets: { type, sourceAsset, targetAsset },
            // Etherfuse expects sourceAmount as a JSON string ("500"), not a
            // number (500) — `<input type="number">` bindings can leak numbers
            // even though the type signature says string, so coerce here.
            sourceAmount: String(args.sourceAmount),
        });

        return {
            id: response.quoteId,
            ramp: type,
            sourceAsset: response.quoteAssets.sourceAsset,
            targetAsset: response.quoteAssets.targetAsset,
            sourceAmount: response.sourceAmount,
            destinationAmount: response.destinationAmountAfterFee || response.destinationAmount,
            exchangeRate: response.exchangeRate,
            fee: response.feeAmount || '0',
            feeBps: response.feeBps ?? undefined,
            expiresAt: response.expiresAt,
            createdAt: response.createdAt,
        };
    }

    // =========================================================================
    // On-ramp
    // =========================================================================

    /**
     * Create an on-ramp order (fiat → tokens on Stellar).
     *
     * Returns deposit instructions the user must follow to fund the order.
     *
     * @throws {EtherfuseError} On API failure.
     */
    async createOnRampOrder(args: CreateOnRampOrderArgs): Promise<EtherfuseOnRampOrder> {
        const orderId = crypto.randomUUID();

        let bankAccountId = args.bankAccountId;
        if (!bankAccountId) {
            const accounts = await this.listBankAccounts(args.customerId);
            if (accounts.length > 0) {
                bankAccountId = accounts[0].id;
            }
        }
        if (!bankAccountId) {
            throw new EtherfuseError(
                'No bank account available for customer',
                'NO_BANK_ACCOUNT',
                400,
            );
        }

        const response = await this.request<EtherfuseCreateOnRampResponse>('POST', '/ramp/order', {
            orderId,
            bankAccountId,
            publicKey: args.publicKey,
            quoteId: args.quoteId,
            memo: args.memo || undefined,
        });

        const { onramp } = response;
        const now = new Date().toISOString();

        return {
            id: onramp.orderId,
            customerId: args.customerId,
            quoteId: args.quoteId,
            status: 'created',
            amountInFiat: onramp.depositAmount || '',
            amountInTokens: '',
            fiatCurrency: '',
            stellarAsset: '',
            stellarAddress: args.publicKey,
            deposit: buildDepositInstructions({
                depositClabe: onramp.depositClabe,
                bankName: onramp.bankName,
                beneficiary: onramp.beneficiary,
                depositPixKey: onramp.depositPixKey,
                depositPixKeyType: onramp.depositPixKeyType,
                depositPixCode: onramp.depositPixCode,
                amount: onramp.depositAmount,
                currency: '',
            }),
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch the current state of an on-ramp order.
     *
     * @returns The order, or `null` if not found.
     * @throws {EtherfuseError} On non-404 API errors.
     */
    async getOnRampOrder(orderId: string): Promise<EtherfuseOnRampOrder | null> {
        try {
            const response = await this.request<EtherfuseOrderResponse>(
                'GET',
                `/ramp/order/${orderId}`,
            );
            return mapOnRampOrder(response);
        } catch (error) {
            if (error instanceof EtherfuseError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    // =========================================================================
    // Off-ramp
    // =========================================================================

    /**
     * Create an off-ramp order (tokens on Stellar → fiat via bank).
     *
     * Returns immediately with `burnTransaction: undefined`. Poll
     * {@link getOffRampOrder} until `burnTransaction` is populated, then have
     * the user sign and submit the XDR via Freighter (or another wallet).
     *
     * @throws {EtherfuseError} On API failure.
     */
    async createOffRampOrder(args: CreateOffRampOrderArgs): Promise<EtherfuseOffRampOrder> {
        const orderId = crypto.randomUUID();

        const response = await this.request<EtherfuseCreateOffRampResponse>('POST', '/ramp/order', {
            orderId,
            bankAccountId: args.bankAccountId,
            publicKey: args.publicKey,
            quoteId: args.quoteId,
            memo: args.memo || undefined,
        });

        const { offramp } = response;
        const now = new Date().toISOString();

        return {
            id: offramp.orderId,
            customerId: args.customerId,
            quoteId: args.quoteId,
            status: 'created',
            amountInTokens: '',
            amountInFiat: '',
            fiatCurrency: '',
            stellarAsset: '',
            stellarAddress: args.publicKey,
            bankAccountId: args.bankAccountId,
            burnTransaction: undefined,
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Fetch the current state of an off-ramp order. Polls for the signable
     * `burnTransaction` XDR once Etherfuse has prepared it.
     *
     * @returns The order, or `null` if not found.
     * @throws {EtherfuseError} On non-404 API errors.
     */
    async getOffRampOrder(orderId: string): Promise<EtherfuseOffRampOrder | null> {
        try {
            const response = await this.request<EtherfuseOrderResponse>(
                'GET',
                `/ramp/order/${orderId}`,
            );
            return mapOffRampOrder(response);
        } catch (error) {
            if (error instanceof EtherfuseError && error.statusCode === 404) {
                return null;
            }
            throw error;
        }
    }

    // =========================================================================
    // Bank accounts
    // =========================================================================

    /**
     * List all bank accounts registered to a customer.
     *
     * @returns Array of bank accounts (empty if none, including on 404).
     * @throws {EtherfuseError} On non-404 API errors.
     */
    async listBankAccounts(customerId: string): Promise<EtherfuseSavedBankAccount[]> {
        try {
            const response = await this.request<EtherfuseBankAccountListResponse>(
                'POST',
                `/ramp/customer/${customerId}/bank-accounts`,
                { pageSize: 100, pageNumber: 0 },
            );
            return response.items.map((account) => {
                const isPix = !!account.pixKey;
                return {
                    id: account.bankAccountId,
                    rail: isPix ? 'pix' : 'spei',
                    accountIdentifier: isPix ? (account.pixKey ?? '') : (account.abbrClabe ?? ''),
                    accountHolderName: account.accountHolderName,
                    status: account.status,
                    compliant: account.compliant,
                    createdAt: account.createdAt,
                };
            });
        } catch (error) {
            if (error instanceof EtherfuseError && error.statusCode === 404) {
                return [];
            }
            throw error;
        }
    }

    // =========================================================================
    // Assets
    // =========================================================================

    /**
     * List rampable assets available on Etherfuse for a given blockchain/currency.
     *
     * @throws {EtherfuseError} On API failure.
     */
    async getAssets(args: GetAssetsArgs): Promise<EtherfuseAssetsResponse> {
        const params = new URLSearchParams({
            blockchain: args.blockchain || this.blockchain,
            currency: args.currency,
            wallet: args.wallet,
        });
        return this.request<EtherfuseAssetsResponse>('GET', `/ramp/assets?${params.toString()}`);
    }

    // =========================================================================
    // Sandbox
    // =========================================================================

    /**
     * Simulate a fiat-received event for an on-ramp order. **Sandbox only.**
     *
     * Useful for testing without sending real SPEI/PIX transfers.
     *
     * @returns The HTTP status code from the Etherfuse API (200, 400, or 404).
     */
    async simulateFiatReceived(orderId: string): Promise<number> {
        const url = `${this.config.baseUrl}/ramp/order/fiat_received`;
        console.log(`[Etherfuse] POST ${url}`, JSON.stringify({ orderId }));

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.config.apiKey,
            },
            body: JSON.stringify({ orderId }),
        });

        const text = await response.text();
        console.log(`[Etherfuse] Response (${response.status}):`, text || '(empty)');

        return response.status;
    }

    // =========================================================================
    // Internals
    // =========================================================================

    /**
     * Resolve a currency pair to `CODE:ISSUER` format via `GET /ramp/assets`.
     * Codes that already contain `:` pass through unchanged.
     */
    private async resolveAssetPair(
        fromAsset: string,
        toAsset: string,
        wallet: string,
    ): Promise<[string, string]> {
        if (fromAsset.includes(':') && toAsset.includes(':')) {
            return [fromAsset, toAsset];
        }
        const fiat = !fromAsset.includes(':')
            ? fromAsset
            : !toAsset.includes(':')
              ? toAsset
              : 'MXN';
        const response = await this.getAssets({
            blockchain: this.blockchain,
            currency: fiat.toLowerCase(),
            wallet,
        });
        const identifiers = new Map(response.assets.map((a) => [a.symbol, a.identifier]));
        return [identifiers.get(fromAsset) ?? fromAsset, identifiers.get(toAsset) ?? toAsset];
    }

    /** Send an authenticated JSON request. */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        endpoint: string,
        body?: unknown,
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;
        console.log(`[Etherfuse] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: this.config.apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Etherfuse] Error ${response.status}:`, errorText);

            let errorData: EtherfuseErrorResponse = {
                error: { code: 'UNKNOWN_ERROR', message: '' },
            };
            try {
                errorData = JSON.parse(errorText) as EtherfuseErrorResponse;
            } catch {
                // Not JSON
            }

            throw new EtherfuseError(
                errorData.error?.message || errorText || `Etherfuse API error: ${response.status}`,
                errorData.error?.code || 'UNKNOWN_ERROR',
                response.status,
            );
        }

        const text = await response.text();
        console.log(`[Etherfuse] Response:`, text || '(empty)');

        if (!text) {
            return undefined as T;
        }
        return JSON.parse(text) as T;
    }
}

// ===========================================================================
// Module-private mapping helpers
// ===========================================================================

function buildDepositInstructions(fields: {
    depositClabe?: string;
    bankName?: string;
    beneficiary?: string;
    depositPixKey?: string;
    depositPixKeyType?: string;
    depositPixCode?: string;
    amount?: string;
    currency?: string;
}): EtherfuseDeposit | undefined {
    const amount = fields.amount || '';
    const currency = fields.currency || '';
    if (fields.depositClabe) {
        return {
            rail: 'spei',
            clabe: fields.depositClabe,
            bankName: fields.bankName,
            beneficiary: fields.beneficiary,
            amount,
            currency,
        };
    }
    if (fields.depositPixCode || fields.depositPixKey) {
        return {
            rail: 'pix',
            pixCode: fields.depositPixCode || fields.depositPixKey || '',
            pixKey: fields.depositPixKey,
            pixKeyType: fields.depositPixKeyType,
            beneficiary: fields.beneficiary,
            amount,
            currency,
        };
    }
    return undefined;
}

function mapOnRampOrder(response: EtherfuseOrderResponse): EtherfuseOnRampOrder {
    return {
        id: response.orderId,
        customerId: response.customerId,
        quoteId: '',
        status: response.status,
        amountInFiat: response.amountInFiat || '',
        amountInTokens: response.amountInTokens || '',
        fiatCurrency: '',
        stellarAsset: '',
        stellarAddress: '',
        feeBps: response.feeBps,
        feeAmountInFiat: response.feeAmountInFiat,
        deposit: buildDepositInstructions({
            depositClabe: response.depositClabe,
            depositPixKey: response.depositPixKey,
            depositPixKeyType: response.depositPixKeyType,
            depositPixCode: response.depositPixCode,
            amount: response.amountInFiat,
            currency: '',
        }),
        confirmedTxSignature: response.confirmedTxSignature,
        statusPage: response.statusPage,
        memo: response.memo,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
    };
}

function mapOffRampOrder(response: EtherfuseOrderResponse): EtherfuseOffRampOrder {
    return {
        id: response.orderId,
        customerId: response.customerId,
        quoteId: '',
        status: response.status,
        amountInTokens: response.amountInTokens || '',
        amountInFiat: response.amountInFiat || '',
        fiatCurrency: '',
        stellarAsset: '',
        stellarAddress: '',
        bankAccountId: response.bankAccountId,
        feeBps: response.feeBps,
        feeAmountInFiat: response.feeAmountInFiat,
        burnTransaction: response.burnTransaction,
        confirmedTxSignature: response.confirmedTxSignature,
        statusPage: response.statusPage,
        memo: response.memo,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
    };
}
