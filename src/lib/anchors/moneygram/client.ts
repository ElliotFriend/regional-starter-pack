/**
 * MoneyGram SEP-24 Anchor Client
 *
 * MoneyGram is a SEP-24 interactive anchor providing cash off-ramp services.
 * Users send USDC on Stellar and pick up cash at MoneyGram agent locations
 * (or receive via bank deposit/PIX in some countries).
 *
 * This client implements the {@link Anchor} interface for **metadata only**.
 * All operation methods throw `UNSUPPORTED_OPERATION` because the actual
 * SEP-24 flow is orchestrated client-side:
 *
 * 1. SEP-10 auth: Challenge is proxied through our server (for client_domain
 *    co-signing), then signed by Freighter on the client side. JWT stays
 *    client-side.
 * 2. SEP-24 calls: Client calls MoneyGram directly (CORS supported per spec).
 * 3. USDC payment: Client builds and signs the Stellar transaction.
 *
 * @see https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps
 */

import type {
    Anchor,
    AnchorCapabilities,
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
    RegisterFiatAccountInput,
    RegisteredFiatAccount,
    SavedFiatAccount,
    KycStatus,
} from '../types';
import { AnchorError } from '../types';

export class MoneyGramClient implements Anchor {
    readonly name = 'moneygram';
    readonly displayName = 'MoneyGram';
    readonly capabilities: AnchorCapabilities = {
        sep24: true,
        kycFlow: 'redirect',
        kycUrl: true,
        requiresOffRampSigning: true,
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDC',
            name: 'USD Coin',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['MXN', 'BRL'];
    readonly supportedRails: readonly string[] = ['cash_pickup'];
    readonly sepDomain: string;

    constructor(sepDomain: string) {
        this.sepDomain = sepDomain;
    }

    // =========================================================================
    // Customer (stateless — MoneyGram uses wallet address as identity)
    // =========================================================================

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        const now = new Date().toISOString();
        return {
            id: crypto.randomUUID(),
            email: input.email,
            kycStatus: 'not_started',
            createdAt: now,
            updatedAt: now,
        };
    }

    async getCustomer(_input: GetCustomerInput): Promise<Customer | null> {
        return null;
    }

    // =========================================================================
    // Quote (not supported — quotes happen inside SEP-24 interactive UI)
    // =========================================================================

    async getQuote(_input: GetQuoteInput): Promise<Quote> {
        throw new AnchorError(
            'MoneyGram quotes are provided inside the SEP-24 interactive UI',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    // =========================================================================
    // On-ramp (not supported — cash off-ramp only)
    // =========================================================================

    async createOnRamp(_input: CreateOnRampInput): Promise<OnRampTransaction> {
        throw new AnchorError(
            'MoneyGram on-ramp is not supported in this integration',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async getOnRampTransaction(_transactionId: string): Promise<OnRampTransaction | null> {
        throw new AnchorError(
            'MoneyGram on-ramp is not supported in this integration',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    // =========================================================================
    // Off-ramp (flow is client-side via SEP-24)
    // =========================================================================

    async createOffRamp(_input: CreateOffRampInput): Promise<OffRampTransaction> {
        throw new AnchorError(
            'MoneyGram off-ramp is initiated client-side via SEP-24 interactive flow',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async getOffRampTransaction(_transactionId: string): Promise<OffRampTransaction | null> {
        throw new AnchorError(
            'MoneyGram transaction polling is done client-side via SEP-24',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    // =========================================================================
    // Fiat accounts (stateless — cash pickup doesn't need bank details)
    // =========================================================================

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        return {
            id: crypto.randomUUID(),
            customerId: input.customerId,
            type: 'cash_pickup',
            status: 'active',
            createdAt: new Date().toISOString(),
        };
    }

    async getFiatAccounts(_customerId: string): Promise<SavedFiatAccount[]> {
        return [];
    }

    // =========================================================================
    // KYC (handled inside MoneyGram's SEP-24 interactive UI)
    // =========================================================================

    async getKycStatus(_customerId: string): Promise<KycStatus> {
        return 'not_started';
    }
}
