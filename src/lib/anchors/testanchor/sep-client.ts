/**
 * Test Anchor SEP Client
 *
 * Implements the Anchor interface for the Stellar test anchor
 * (testanchor.stellar.org). This is a metadata-only client — the actual
 * SEP flow is orchestrated client-side via SepRampPage + Sep24RampFlow.
 *
 * This client is NOT listed in config/regions (no sidebar entry).
 * It's only accessible by navigating directly to /anchors/testanchor/*.
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

export class TestAnchorSepClient implements Anchor {
    readonly name = 'testanchor';
    readonly displayName = 'Stellar Test Anchor';
    readonly capabilities: AnchorCapabilities = {
        sep24: true,
        sep6: true,
        kycFlow: 'redirect',
        kycUrl: true,
        requiresOffRampSigning: true,
        sandbox: true,
    };
    readonly supportedTokens: readonly TokenInfo[] = [
        {
            symbol: 'USDC',
            name: 'USD Coin',
            issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            description: 'A fully-reserved stablecoin pegged 1:1 to the US Dollar',
        },
    ];
    readonly supportedCurrencies: readonly string[] = ['USD'];
    readonly supportedRails: readonly string[] = ['bank_transfer'];
    readonly sepDomain: string;

    constructor(sepDomain: string) {
        this.sepDomain = sepDomain;
    }

    async createCustomer(input: CreateCustomerInput): Promise<Customer> {
        return {
            id: crypto.randomUUID(),
            email: input.email,
            kycStatus: 'not_started',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }

    async getCustomer(_input: GetCustomerInput): Promise<Customer | null> {
        return null;
    }

    async getQuote(_input: GetQuoteInput): Promise<Quote> {
        throw new AnchorError(
            'Test anchor quotes are provided inside the SEP-24 interactive UI',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async createOnRamp(_input: CreateOnRampInput): Promise<OnRampTransaction> {
        throw new AnchorError(
            'Test anchor on-ramp is initiated client-side via SEP-24',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async getOnRampTransaction(_id: string): Promise<OnRampTransaction | null> {
        throw new AnchorError(
            'Test anchor transaction polling is done client-side via SEP-24',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async createOffRamp(_input: CreateOffRampInput): Promise<OffRampTransaction> {
        throw new AnchorError(
            'Test anchor off-ramp is initiated client-side via SEP-24',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async getOffRampTransaction(_id: string): Promise<OffRampTransaction | null> {
        throw new AnchorError(
            'Test anchor transaction polling is done client-side via SEP-24',
            'UNSUPPORTED_OPERATION',
            501,
        );
    }

    async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
        return {
            id: crypto.randomUUID(),
            customerId: input.customerId,
            type: 'bank_transfer',
            status: 'active',
            createdAt: new Date().toISOString(),
        };
    }

    async getFiatAccounts(_customerId: string): Promise<SavedFiatAccount[]> {
        return [];
    }

    async getKycStatus(_customerId: string): Promise<KycStatus> {
        return 'not_started';
    }
}
