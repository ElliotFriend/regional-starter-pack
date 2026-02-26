import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import { AlfredPayClient } from './client';
import { AnchorError } from '../types';

const BASE_URL = 'http://alfredpay.test';
const API_KEY = 'test-key';
const API_SECRET = 'test-secret';

function createClient(): AlfredPayClient {
    return new AlfredPayClient({
        apiKey: API_KEY,
        apiSecret: API_SECRET,
        baseUrl: BASE_URL,
    });
}

describe('AlfredPayClient', () => {
    describe('createCustomer', () => {
        it('creates a customer and returns Customer with kycStatus not_started', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, async ({ request }) => {
                    expect(request.headers.get('api-key')).toBe(API_KEY);
                    expect(request.headers.get('api-secret')).toBe(API_SECRET);

                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.email).toBe('user@example.com');
                    expect(body.type).toBe('INDIVIDUAL');
                    expect(body.country).toBe('MX');

                    return HttpResponse.json({
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const customer = await client.createCustomer({ email: 'user@example.com' });

            expect(customer.id).toBe('cust-123');
            expect(customer.email).toBe('user@example.com');
            expect(customer.kycStatus).toBe('not_started');
            expect(customer.createdAt).toBe('2025-01-01T00:00:00Z');
            expect(customer.updatedAt).toBe('2025-01-01T00:00:00Z');
        });

        it('defaults country to MX when not provided', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.country).toBe('MX');

                    return HttpResponse.json({
                        customerId: 'cust-456',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            await client.createCustomer({ email: 'user@example.com' });
        });
    });

    describe('getCustomer', () => {
        it('fetches a customer by ID and maps kyc_status', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123`, ({ request }) => {
                    expect(request.headers.get('api-key')).toBe(API_KEY);
                    expect(request.headers.get('api-secret')).toBe(API_SECRET);

                    return HttpResponse.json({
                        id: 'cust-123',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const customer = await client.getCustomer('cust-123');

            expect(customer).not.toBeNull();
            expect(customer!.id).toBe('cust-123');
            expect(customer!.email).toBe('user@example.com');
            expect(customer!.kycStatus).toBe('approved');
            expect(customer!.createdAt).toBe('2025-01-01T00:00:00Z');
            expect(customer!.updatedAt).toBe('2025-01-02T00:00:00Z');
        });

        it('returns null when customer is not found (404)', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/nonexistent`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                        { status: 404 },
                    );
                }),
            );

            const customer = await client.getCustomer('nonexistent');
            expect(customer).toBeNull();
        });
    });

    describe('getCustomerByEmail', () => {
        it('finds a customer by email and country', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/find/user%40example.com/MX`, () => {
                    return HttpResponse.json({ customerId: 'cust-789' });
                }),
            );

            const customer = await client.getCustomerByEmail('user@example.com', 'MX');

            expect(customer).not.toBeNull();
            expect(customer!.id).toBe('cust-789');
            expect(customer!.email).toBe('user@example.com');
            expect(customer!.kycStatus).toBe('not_started');
        });

        it('returns null when customer is not found (404)', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/find/nobody%40example.com/MX`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                        { status: 404 },
                    );
                }),
            );

            const customer = await client.getCustomerByEmail('nobody@example.com', 'MX');
            expect(customer).toBeNull();
        });
    });

    describe('getQuote', () => {
        it('returns a quote with summed fees', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.fromCurrency).toBe('MXN');
                    expect(body.toCurrency).toBe('USDC');
                    expect(body.chain).toBe('XLM');
                    expect(body.paymentMethodType).toBe('SPEI');

                    return HttpResponse.json({
                        quoteId: 'quote-001',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '1000.00',
                        toAmount: '55.00',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [
                            { type: 'commissionFee', amount: '1.50', currency: 'MXN' },
                            { type: 'processingFee', amount: '0.50', currency: 'MXN' },
                        ],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '1000.00',
            });

            expect(quote.id).toBe('quote-001');
            expect(quote.fromCurrency).toBe('MXN');
            expect(quote.toCurrency).toBe('USDC');
            expect(quote.fromAmount).toBe('1000.00');
            expect(quote.toAmount).toBe('55.00');
            expect(quote.exchangeRate).toBe('0.055');
            expect(quote.fee).toBe('2.00');
            expect(quote.expiresAt).toBe('2025-01-01T01:00:00Z');
        });
    });

    describe('createOnRamp', () => {
        it('creates an on-ramp transaction with payment instructions', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/onramp`, () => {
                    return HttpResponse.json({
                        transaction: {
                            transactionId: 'onramp-001',
                            customerId: 'cust-123',
                            quoteId: 'quote-001',
                            status: 'CREATED',
                            fromAmount: '1000.00',
                            fromCurrency: 'MXN',
                            toAmount: '55.00',
                            toCurrency: 'USDC',
                            depositAddress: 'GABCD1234STELLAR',
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                            txHash: null,
                            memo: 'memo-123',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                        },
                        fiatPaymentInstructions: {
                            paymentType: 'SPEI',
                            clabe: '012345678901234567',
                            reference: 'REF-001',
                            expirationDate: '2025-01-01T01:00:00Z',
                            paymentDescription: 'Fund on-ramp',
                            bankName: 'STP',
                            accountHolderName: 'Alfred Pay SA',
                        },
                    });
                }),
            );

            const tx = await client.createOnRamp({
                customerId: 'cust-123',
                quoteId: 'quote-001',
                stellarAddress: 'GABCD1234STELLAR',
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                amount: '1000.00',
                memo: 'memo-123',
            });

            expect(tx.id).toBe('onramp-001');
            expect(tx.customerId).toBe('cust-123');
            expect(tx.quoteId).toBe('quote-001');
            expect(tx.status).toBe('pending');
            expect(tx.fromAmount).toBe('1000.00');
            expect(tx.fromCurrency).toBe('MXN');
            expect(tx.toAmount).toBe('55.00');
            expect(tx.toCurrency).toBe('USDC');
            expect(tx.stellarAddress).toBe('GABCD1234STELLAR');
            expect(tx.stellarTxHash).toBeUndefined();

            expect(tx.paymentInstructions).toBeDefined();
            expect(tx.paymentInstructions!.type).toBe('spei');
            expect(tx.paymentInstructions!.clabe).toBe('012345678901234567');
            expect(tx.paymentInstructions!.bankName).toBe('STP');
            expect(tx.paymentInstructions!.beneficiary).toBe('Alfred Pay SA');
            expect(tx.paymentInstructions!.reference).toBe('REF-001');
            expect(tx.paymentInstructions!.amount).toBe('1000.00');
            expect(tx.paymentInstructions!.currency).toBe('MXN');
        });
    });

    describe('getOnRampTransaction', () => {
        it('fetches an on-ramp transaction from FLAT response', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/onramp/onramp-001`, () => {
                    return HttpResponse.json({
                        transactionId: 'onramp-001',
                        customerId: 'cust-123',
                        quoteId: 'quote-001',
                        status: 'PROCESSING',
                        fromAmount: '1000.00',
                        fromCurrency: 'MXN',
                        toAmount: '55.00',
                        toCurrency: 'USDC',
                        depositAddress: 'GABCD1234STELLAR',
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                        txHash: 'stellar-hash-abc',
                        memo: 'memo-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T01:00:00Z',
                        fiatPaymentInstructions: {
                            paymentType: 'SPEI',
                            clabe: '012345678901234567',
                            reference: 'REF-001',
                            expirationDate: '2025-01-01T01:00:00Z',
                            paymentDescription: 'Fund on-ramp',
                            bankName: 'STP',
                            accountHolderName: 'Alfred Pay SA',
                        },
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-001');

            expect(tx).not.toBeNull();
            expect(tx!.id).toBe('onramp-001');
            expect(tx!.status).toBe('processing');
            expect(tx!.stellarTxHash).toBe('stellar-hash-abc');
            expect(tx!.paymentInstructions).toBeDefined();
            expect(tx!.paymentInstructions!.clabe).toBe('012345678901234567');
        });

        it('returns null when transaction is not found (404)', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/onramp/nonexistent`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'Transaction not found' } },
                        { status: 404 },
                    );
                }),
            );

            const tx = await client.getOnRampTransaction('nonexistent');
            expect(tx).toBeNull();
        });
    });

    describe('registerFiatAccount', () => {
        it('registers a fiat account and returns RegisteredFiatAccount', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.customerId).toBe('cust-123');
                    expect(body.type).toBe('SPEI');

                    return HttpResponse.json({
                        fiatAccountId: 'fiat-001',
                        customerId: 'cust-123',
                        type: 'SPEI',
                        status: 'ACTIVE',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const account = await client.registerFiatAccount({
                customerId: 'cust-123',
                account: {
                    type: 'spei',
                    clabe: '012345678901234567',
                    beneficiary: 'Juan Perez',
                    bankName: 'Banorte',
                },
            });

            expect(account.id).toBe('fiat-001');
            expect(account.customerId).toBe('cust-123');
            expect(account.type).toBe('SPEI');
            expect(account.status).toBe('ACTIVE');
            expect(account.createdAt).toBe('2025-01-01T00:00:00Z');
        });
    });

    describe('getFiatAccounts', () => {
        it('returns mapped SavedFiatAccount[] with accountHolderName from metadata', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, ({ request }) => {
                    const url = new URL(request.url);
                    expect(url.searchParams.get('customerId')).toBe('cust-123');

                    return HttpResponse.json([
                        {
                            fiatAccountId: 'fiat-001',
                            type: 'SPEI',
                            accountNumber: '012345678901234567',
                            accountType: 'CHECKING',
                            accountName: 'My Account',
                            accountAlias: 'Alias Name',
                            bankName: 'Banorte',
                            createdAt: '2025-01-01T00:00:00Z',
                            isExternal: true,
                            metadata: {
                                accountHolderName: 'Juan Perez',
                            },
                        },
                    ]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-123');

            expect(accounts).toHaveLength(1);
            expect(accounts[0].id).toBe('fiat-001');
            expect(accounts[0].type).toBe('SPEI');
            expect(accounts[0].accountNumber).toBe('012345678901234567');
            expect(accounts[0].bankName).toBe('Banorte');
            expect(accounts[0].accountHolderName).toBe('Juan Perez');
            expect(accounts[0].createdAt).toBe('2025-01-01T00:00:00Z');
        });

        it('falls back to accountAlias when metadata.accountHolderName is absent', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json([
                        {
                            fiatAccountId: 'fiat-002',
                            type: 'SPEI',
                            accountNumber: '012345678901234568',
                            accountType: 'CHECKING',
                            accountName: 'Account Name',
                            accountAlias: 'Fallback Alias',
                            bankName: 'BBVA',
                            createdAt: '2025-01-02T00:00:00Z',
                            isExternal: false,
                        },
                    ]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-123');

            expect(accounts).toHaveLength(1);
            expect(accounts[0].accountHolderName).toBe('Fallback Alias');
        });

        it('returns empty array when 404', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'No accounts found' } },
                        { status: 404 },
                    );
                }),
            );

            const accounts = await client.getFiatAccounts('cust-999');
            expect(accounts).toEqual([]);
        });
    });

    describe('createOffRamp', () => {
        it('creates an off-ramp transaction and maps it correctly', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/offramp`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.customerId).toBe('cust-123');
                    expect(body.quoteId).toBe('quote-002');
                    expect(body.fiatAccountId).toBe('fiat-001');

                    return HttpResponse.json({
                        transactionId: 'offramp-001',
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                        fromCurrency: 'USDC',
                        toCurrency: 'MXN',
                        fromAmount: '50.00',
                        toAmount: '900.00',
                        chain: 'XLM',
                        status: 'CREATED',
                        fiatAccountId: 'fiat-001',
                        depositAddress: 'GXYZ9876STELLAR',
                        expiration: '2025-01-01T02:00:00Z',
                        memo: 'offramp-memo',
                    });
                }),
            );

            const tx = await client.createOffRamp({
                customerId: 'cust-123',
                quoteId: 'quote-002',
                stellarAddress: 'GXYZ9876STELLAR',
                fromCurrency: 'USDC',
                toCurrency: 'MXN',
                amount: '50.00',
                fiatAccountId: 'fiat-001',
                memo: 'offramp-memo',
            });

            expect(tx.id).toBe('offramp-001');
            expect(tx.customerId).toBe('cust-123');
            expect(tx.status).toBe('pending');
            expect(tx.fromAmount).toBe('50.00');
            expect(tx.fromCurrency).toBe('USDC');
            expect(tx.toAmount).toBe('900.00');
            expect(tx.toCurrency).toBe('MXN');
            expect(tx.stellarAddress).toBe('GXYZ9876STELLAR');
            expect(tx.memo).toBe('offramp-memo');
            expect(tx.fiatAccount).toBeDefined();
            expect(tx.fiatAccount!.id).toBe('fiat-001');
            expect(tx.fiatAccount!.type).toBe('spei');
            expect(tx.createdAt).toBe('2025-01-01T00:00:00Z');
            expect(tx.updatedAt).toBe('2025-01-01T00:00:00Z');
        });
    });

    describe('getOffRampTransaction', () => {
        it('fetches an off-ramp transaction by ID', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-001`, () => {
                    return HttpResponse.json({
                        transactionId: 'offramp-001',
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T01:00:00Z',
                        fromCurrency: 'USDC',
                        toCurrency: 'MXN',
                        fromAmount: '50.00',
                        toAmount: '900.00',
                        chain: 'XLM',
                        status: 'COMPLETED',
                        fiatAccountId: 'fiat-001',
                        depositAddress: 'GXYZ9876STELLAR',
                        expiration: '2025-01-01T02:00:00Z',
                        memo: 'offramp-memo',
                        txHash: 'stellar-tx-hash-xyz',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-001');

            expect(tx).not.toBeNull();
            expect(tx!.id).toBe('offramp-001');
            expect(tx!.status).toBe('completed');
            expect(tx!.stellarTxHash).toBe('stellar-tx-hash-xyz');
        });

        it('returns null when transaction is not found (404)', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/nonexistent`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'Transaction not found' } },
                        { status: 404 },
                    );
                }),
            );

            const tx = await client.getOffRampTransaction('nonexistent');
            expect(tx).toBeNull();
        });
    });

    describe('getKycUrl', () => {
        it('returns the verification URL', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123/kyc/MX/url`, () => {
                    return HttpResponse.json({
                        verification_url: 'https://kyc.alfredpay.io/verify/abc123',
                        submissionId: 'sub-001',
                    });
                }),
            );

            const url = await client.getKycUrl('cust-123');

            expect(url).toBe('https://kyc.alfredpay.io/verify/abc123');
        });
    });

    describe('getKycStatus', () => {
        it('delegates to getCustomer and returns the kycStatus', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123`, () => {
                    return HttpResponse.json({
                        id: 'cust-123',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const status = await client.getKycStatus('cust-123');
            expect(status).toBe('approved');
        });

        it('throws AnchorError with CUSTOMER_NOT_FOUND when customer does not exist', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/nonexistent`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                        { status: 404 },
                    );
                }),
            );

            await expect(client.getKycStatus('nonexistent')).rejects.toThrow(AnchorError);
            await expect(client.getKycStatus('nonexistent')).rejects.toMatchObject({
                code: 'CUSTOMER_NOT_FOUND',
            });
        });
    });

    describe('error handling', () => {
        it('throws AnchorError with parsed JSON error details', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return HttpResponse.json(
                        { error: { code: 'BAD', message: 'bad request' } },
                        { status: 400 },
                    );
                }),
            );

            try {
                await client.createCustomer({ email: 'user@example.com' });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('bad request');
                expect(anchorError.code).toBe('BAD');
                expect(anchorError.statusCode).toBe(400);
            }
        });

        it('throws AnchorError with plain text when response is not JSON', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return new HttpResponse('Internal Server Error', {
                        status: 500,
                        headers: { 'Content-Type': 'text/plain' },
                    });
                }),
            );

            try {
                await client.createCustomer({ email: 'user@example.com' });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('Internal Server Error');
                expect(anchorError.statusCode).toBe(500);
            }
        });
    });
});
