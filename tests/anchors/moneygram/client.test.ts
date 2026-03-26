import { describe, it, expect } from 'vitest';
import { MoneyGramClient } from '$lib/anchors/moneygram/client';
import { AnchorError } from '$lib/anchors/types';

function createClient(): MoneyGramClient {
    return new MoneyGramClient('extstellar.moneygram.com');
}

describe('MoneyGramClient', () => {
    describe('client properties', () => {
        it('has correct name and displayName', () => {
            const client = createClient();
            expect(client.name).toBe('moneygram');
            expect(client.displayName).toBe('MoneyGram');
        });

        it('supports USDC token with correct issuer', () => {
            const client = createClient();
            expect(client.supportedTokens).toHaveLength(1);
            expect(client.supportedTokens[0].symbol).toBe('USDC');
            expect(client.supportedTokens[0].issuer).toBe(
                'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            );
        });

        it('supports MXN and BRL currencies', () => {
            const client = createClient();
            expect(client.supportedCurrencies).toContain('MXN');
            expect(client.supportedCurrencies).toContain('BRL');
        });

        it('supports cash_pickup rail', () => {
            const client = createClient();
            expect(client.supportedRails).toContain('cash_pickup');
        });

        it('has sepDomain set', () => {
            const client = createClient();
            expect(client.sepDomain).toBe('extstellar.moneygram.com');
        });

        it('has correct capabilities', () => {
            const client = createClient();
            expect(client.capabilities.sep24).toBe(true);
            expect(client.capabilities.kycFlow).toBe('redirect');
            expect(client.capabilities.kycUrl).toBe(true);
            expect(client.capabilities.requiresOffRampSigning).toBe(true);
        });
    });

    describe('unsupported operations', () => {
        it('createOnRamp throws UNSUPPORTED_OPERATION', async () => {
            const client = createClient();

            try {
                await client.createOnRamp({
                    customerId: 'cust-001',
                    quoteId: 'quote-001',
                    stellarAddress: 'GUSER123',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: '100',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                expect((err as AnchorError).code).toBe('UNSUPPORTED_OPERATION');
                expect((err as AnchorError).statusCode).toBe(501);
            }
        });

        it('getOnRampTransaction throws UNSUPPORTED_OPERATION', async () => {
            const client = createClient();

            try {
                await client.getOnRampTransaction('tx-001');
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                expect((err as AnchorError).code).toBe('UNSUPPORTED_OPERATION');
            }
        });

        it('getQuote throws UNSUPPORTED_OPERATION', async () => {
            const client = createClient();

            try {
                await client.getQuote({
                    fromCurrency: 'USDC',
                    toCurrency: 'MXN',
                    fromAmount: '100',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                expect((err as AnchorError).code).toBe('UNSUPPORTED_OPERATION');
            }
        });

        it('createOffRamp throws UNSUPPORTED_OPERATION (flow is client-side)', async () => {
            const client = createClient();

            try {
                await client.createOffRamp({
                    customerId: 'cust-001',
                    quoteId: 'quote-001',
                    stellarAddress: 'GUSER123',
                    fromCurrency: 'USDC',
                    toCurrency: 'MXN',
                    amount: '100',
                    fiatAccountId: 'acct-001',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                expect((err as AnchorError).code).toBe('UNSUPPORTED_OPERATION');
            }
        });

        it('getOffRampTransaction throws UNSUPPORTED_OPERATION (polling is client-side)', async () => {
            const client = createClient();

            try {
                await client.getOffRampTransaction('tx-001');
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                expect((err as AnchorError).code).toBe('UNSUPPORTED_OPERATION');
            }
        });
    });

    describe('stateless stub methods', () => {
        it('createCustomer returns customer with not_started KYC', async () => {
            const client = createClient();

            const customer = await client.createCustomer({
                email: 'user@example.com',
                country: 'MX',
            });

            expect(customer.id).toBeDefined();
            expect(customer.email).toBe('user@example.com');
            expect(customer.kycStatus).toBe('not_started');
        });

        it('getCustomer returns null', async () => {
            const client = createClient();
            const customer = await client.getCustomer({ customerId: 'any-id' });
            expect(customer).toBeNull();
        });

        it('registerFiatAccount returns generated ID', async () => {
            const client = createClient();

            const account = await client.registerFiatAccount({
                customerId: 'cust-001',
                account: {
                    type: 'spei',
                    clabe: '012345678901234567',
                    beneficiary: 'Test User',
                },
            });

            expect(account.id).toBeDefined();
            expect(account.customerId).toBe('cust-001');
        });

        it('getFiatAccounts returns empty', async () => {
            const client = createClient();
            const accounts = await client.getFiatAccounts('cust-001');
            expect(accounts).toHaveLength(0);
        });

        it('getKycStatus returns not_started', async () => {
            const client = createClient();
            const status = await client.getKycStatus('cust-001');
            expect(status).toBe('not_started');
        });
    });
});
