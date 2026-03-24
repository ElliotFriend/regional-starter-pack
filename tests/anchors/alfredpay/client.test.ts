import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { AlfredPayClient } from '$lib/anchors/alfredpay/client';
import { AnchorError } from '$lib/anchors/types';

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
        it('finds a customer by email and country', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/find/user%40example.com/MX`, ({ request }) => {
                    expect(request.headers.get('api-key')).toBe(API_KEY);
                    expect(request.headers.get('api-secret')).toBe(API_SECRET);

                    return HttpResponse.json({ customerId: 'cust-789' });
                }),
            );

            const customer = await client.getCustomer({ email: 'user@example.com', country: 'MX' });

            expect(customer).not.toBeNull();
            expect(customer!.id).toBe('cust-789');
            expect(customer!.email).toBe('user@example.com');
            expect(customer!.kycStatus).toBe('not_started');
        });

        it('defaults country to MX when not provided', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/find/user%40example.com/MX`, () => {
                    return HttpResponse.json({ customerId: 'cust-default' });
                }),
            );

            const customer = await client.getCustomer({ email: 'user@example.com' });
            expect(customer).not.toBeNull();
            expect(customer!.id).toBe('cust-default');
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

            const customer = await client.getCustomer({
                email: 'nobody@example.com',
                country: 'MX',
            });
            expect(customer).toBeNull();
        });

        it('throws AnchorError when email is missing', async () => {
            const client = createClient();

            try {
                await client.getCustomer({ customerId: 'cust-123' });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_EMAIL');
                expect(anchorErr.statusCode).toBe(400);
            }
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
        it('calls GET /customers/:id and maps statusKyc to shared KycStatus', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123`, () => {
                    return HttpResponse.json({
                        statusKyc: 'COMPLETED',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const status = await client.getKycStatus('cust-123');
            expect(status).toBe('approved');
        });

        it('maps IN_REVIEW to pending', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123`, () => {
                    return HttpResponse.json({
                        statusKyc: 'IN_REVIEW',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const status = await client.getKycStatus('cust-123');
            expect(status).toBe('pending');
        });

        it('returns not_started when statusKyc is absent', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123`, () => {
                    return HttpResponse.json({
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const status = await client.getKycStatus('cust-123');
            expect(status).toBe('not_started');
        });

        it('throws AnchorError when customer does not exist (404)', async () => {
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
                code: 'NOT_FOUND',
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

    // ==========================================================================
    // Edge case tests
    // ==========================================================================

    describe('request() edge cases', () => {
        it('falls back to status code message when error body is empty', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return new HttpResponse('', {
                        status: 502,
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
                expect(anchorError.message).toBe('AlfredPay API error: 502');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(502);
            }
        });

        it('uses optional chaining fallbacks when error field is null', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return HttpResponse.json({ error: null }, { status: 422 });
                }),
            );

            try {
                await client.createCustomer({ email: 'user@example.com' });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                // error?.message is undefined, error?.code is undefined
                // Falls through to errorText which is the JSON string
                expect(anchorError.message).toBe('{"error":null}');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(422);
            }
        });

        it('uses optional chaining fallbacks when error field is missing', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return HttpResponse.json({ unexpected: 'shape' }, { status: 400 });
                }),
            );

            try {
                await client.createCustomer({ email: 'user@example.com' });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('{"unexpected":"shape"}');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(400);
            }
        });

        it('uses UNKNOWN_ERROR code when error has message but no code', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, () => {
                    return HttpResponse.json(
                        { error: { message: 'something went wrong' } },
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
                expect(anchorError.message).toBe('something went wrong');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(400);
            }
        });
    });

    describe('mapQuote() fee edge cases', () => {
        it('returns totalFee "0.00" when fees array is empty', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, () => {
                    return HttpResponse.json({
                        quoteId: 'quote-empty-fees',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '500.00',
                        toAmount: '27.50',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '500.00',
            });

            expect(quote.fee).toBe('0.00');
        });

        it('correctly sums a single fee item', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, () => {
                    return HttpResponse.json({
                        quoteId: 'quote-single-fee',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '500.00',
                        toAmount: '27.50',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [{ type: 'commissionFee', amount: '3.75', currency: 'MXN' }],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '500.00',
            });

            expect(quote.fee).toBe('3.75');
        });

        it('returns totalFee "0.00" when fees have string "0" amounts', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, () => {
                    return HttpResponse.json({
                        quoteId: 'quote-zero-fees',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '500.00',
                        toAmount: '27.50',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [
                            { type: 'commissionFee', amount: '0', currency: 'MXN' },
                            { type: 'processingFee', amount: '0', currency: 'MXN' },
                        ],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '500.00',
            });

            expect(quote.fee).toBe('0.00');
        });
    });

    describe('mapOnRampTransaction() edge cases', () => {
        it('falls back to pending for unknown status values', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/onramp`, () => {
                    return HttpResponse.json({
                        transaction: {
                            transactionId: 'onramp-unknown',
                            customerId: 'cust-123',
                            quoteId: 'quote-001',
                            status: 'SOME_UNKNOWN_STATUS',
                            fromAmount: '1000.00',
                            fromCurrency: 'MXN',
                            toAmount: '55.00',
                            toCurrency: 'USDC',
                            depositAddress: 'GABCD1234STELLAR',
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                            txHash: null,
                            memo: '',
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
                memo: '',
            });

            expect(tx.status).toBe('pending');
        });

        it('maps missing txHash to undefined', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/onramp`, () => {
                    return HttpResponse.json({
                        transaction: {
                            transactionId: 'onramp-no-hash',
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
                            memo: '',
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
                memo: '',
            });

            expect(tx.stellarTxHash).toBeUndefined();
        });

        it('maps payment instructions with missing/null fields', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/onramp`, () => {
                    return HttpResponse.json({
                        transaction: {
                            transactionId: 'onramp-null-instr',
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
                            memo: '',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                        },
                        fiatPaymentInstructions: {
                            paymentType: 'SPEI',
                            clabe: null,
                            reference: null,
                            expirationDate: null,
                            paymentDescription: null,
                            bankName: null,
                            accountHolderName: null,
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
                memo: '',
            });

            expect(tx.paymentInstructions).toBeDefined();
            expect(tx.paymentInstructions!.clabe).toBeNull();
            expect(tx.paymentInstructions!.bankName).toBeNull();
            expect(tx.paymentInstructions!.beneficiary).toBeNull();
            expect(tx.paymentInstructions!.reference).toBeNull();
            expect(tx.paymentInstructions!.amount).toBe('1000.00');
            expect(tx.paymentInstructions!.currency).toBe('MXN');
        });
    });

    describe('mapOnRampFlatTransaction() edge cases', () => {
        it('falls back to pending for unknown status values', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/onramp/onramp-unknown-flat`, () => {
                    return HttpResponse.json({
                        transactionId: 'onramp-unknown-flat',
                        customerId: 'cust-123',
                        quoteId: 'quote-001',
                        status: 'REFUNDED',
                        fromAmount: '1000.00',
                        fromCurrency: 'MXN',
                        toAmount: '55.00',
                        toCurrency: 'USDC',
                        depositAddress: 'GABCD1234STELLAR',
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                        txHash: null,
                        memo: '',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
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

            const tx = await client.getOnRampTransaction('onramp-unknown-flat');

            expect(tx).not.toBeNull();
            expect(tx!.status).toBe('pending');
        });
    });

    describe('mapOffRampTransaction() edge cases', () => {
        it('defaults quoteId to empty string when quote field is null', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-no-quote`, () => {
                    return HttpResponse.json({
                        transactionId: 'offramp-no-quote',
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
                        memo: 'memo',
                        quote: null,
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-no-quote');

            expect(tx).not.toBeNull();
            expect(tx!.quoteId).toBe('');
        });

        it('sets fiatAccount to undefined when fiatAccountId is null', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-no-fiat`, () => {
                    return HttpResponse.json({
                        transactionId: 'offramp-no-fiat',
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                        fromCurrency: 'USDC',
                        toCurrency: 'MXN',
                        fromAmount: '50.00',
                        toAmount: '900.00',
                        chain: 'XLM',
                        status: 'CREATED',
                        fiatAccountId: null,
                        depositAddress: 'GXYZ9876STELLAR',
                        expiration: '2025-01-01T02:00:00Z',
                        memo: 'memo',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-no-fiat');

            expect(tx).not.toBeNull();
            expect(tx!.fiatAccount).toBeUndefined();
        });

        it('sets fiatAccount to undefined when fiatAccountId is empty string', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-empty-fiat`, () => {
                    return HttpResponse.json({
                        transactionId: 'offramp-empty-fiat',
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                        fromCurrency: 'USDC',
                        toCurrency: 'MXN',
                        fromAmount: '50.00',
                        toAmount: '900.00',
                        chain: 'XLM',
                        status: 'CREATED',
                        fiatAccountId: '',
                        depositAddress: 'GXYZ9876STELLAR',
                        expiration: '2025-01-01T02:00:00Z',
                        memo: 'memo',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-empty-fiat');

            expect(tx).not.toBeNull();
            expect(tx!.fiatAccount).toBeUndefined();
        });

        it('falls back to pending for unknown status values', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-unknown`, () => {
                    return HttpResponse.json({
                        transactionId: 'offramp-unknown',
                        customerId: 'cust-123',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                        fromCurrency: 'USDC',
                        toCurrency: 'MXN',
                        fromAmount: '50.00',
                        toAmount: '900.00',
                        chain: 'XLM',
                        status: 'SOME_UNKNOWN_STATUS',
                        fiatAccountId: 'fiat-001',
                        depositAddress: 'GXYZ9876STELLAR',
                        expiration: '2025-01-01T02:00:00Z',
                        memo: 'memo',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-unknown');

            expect(tx).not.toBeNull();
            expect(tx!.status).toBe('pending');
        });
    });

    describe('createCustomer() edge cases', () => {
        it('sends explicit country parameter override instead of default MX', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/create`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.country).toBe('BR');
                    expect(body.email).toBe('user@example.com');
                    expect(body.type).toBe('INDIVIDUAL');

                    return HttpResponse.json({
                        customerId: 'cust-br-001',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const customer = await client.createCustomer({
                email: 'user@example.com',
                country: 'BR',
            });

            expect(customer.id).toBe('cust-br-001');
        });
    });

    describe('getCustomer() edge cases', () => {
        it('re-throws non-404 errors', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/find/error%40example.com/MX`, () => {
                    return HttpResponse.json(
                        { error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
                        { status: 429 },
                    );
                }),
            );

            try {
                await client.getCustomer({ email: 'error@example.com', country: 'MX' });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.statusCode).toBe(429);
                expect(anchorError.message).toBe('Too many requests');
            }
        });
    });

    describe('getQuote() edge cases', () => {
        it('sends both fromAmount and toAmount when both are provided', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.fromAmount).toBe('1000.00');
                    expect(body.toAmount).toBe('55.00');
                    expect(body.fromCurrency).toBe('MXN');
                    expect(body.toCurrency).toBe('USDC');

                    return HttpResponse.json({
                        quoteId: 'quote-both',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '1000.00',
                        toAmount: '55.00',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '1000.00',
                toAmount: '55.00',
            });

            expect(quote.id).toBe('quote-both');
        });

        it('sends request body with neither fromAmount nor toAmount when both are omitted', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.fromAmount).toBeUndefined();
                    expect(body.toAmount).toBeUndefined();
                    expect(body.fromCurrency).toBe('MXN');
                    expect(body.toCurrency).toBe('USDC');
                    expect(body.chain).toBe('XLM');
                    expect(body.paymentMethodType).toBe('SPEI');

                    return HttpResponse.json({
                        quoteId: 'quote-neither',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '0.00',
                        toAmount: '0.00',
                        rate: '0.055',
                        expiration: '2025-01-01T01:00:00Z',
                        fees: [],
                        chain: 'XLM',
                        paymentMethodType: 'SPEI',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
            });

            expect(quote.id).toBe('quote-neither');
        });
    });

    describe('createOnRamp() edge cases', () => {
        it('sends empty string for memo when memo is undefined', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.memo).toBe('');

                    return HttpResponse.json({
                        transaction: {
                            transactionId: 'onramp-no-memo',
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
                            memo: '',
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
                // memo intentionally omitted
            });

            expect(tx.id).toBe('onramp-no-memo');
        });
    });

    describe('getFiatAccounts() edge cases', () => {
        it('returns empty array for successful response with empty array', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json([]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-123');
            expect(accounts).toEqual([]);
        });

        it('falls back to accountName when metadata and accountAlias are both undefined', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json([
                        {
                            fiatAccountId: 'fiat-003',
                            type: 'SPEI',
                            accountNumber: '012345678901234569',
                            accountType: 'CHECKING',
                            accountName: 'Final Fallback Name',
                            bankName: 'Santander',
                            createdAt: '2025-01-03T00:00:00Z',
                            isExternal: true,
                        },
                    ]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-123');

            expect(accounts).toHaveLength(1);
            expect(accounts[0].accountHolderName).toBe('Final Fallback Name');
        });

        it('returns undefined accountHolderName when all name fields are undefined', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json([
                        {
                            fiatAccountId: 'fiat-004',
                            type: 'SPEI',
                            accountNumber: '012345678901234570',
                            accountType: 'CHECKING',
                            bankName: 'Citibanamex',
                            createdAt: '2025-01-04T00:00:00Z',
                            isExternal: true,
                        },
                    ]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-123');

            expect(accounts).toHaveLength(1);
            expect(accounts[0].accountHolderName).toBeUndefined();
        });

        it('re-throws non-404 errors', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/fiatAccounts`, () => {
                    return HttpResponse.json(
                        { error: { code: 'INTERNAL_ERROR', message: 'Database error' } },
                        { status: 500 },
                    );
                }),
            );

            try {
                await client.getFiatAccounts('cust-123');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.statusCode).toBe(500);
                expect(anchorError.message).toBe('Database error');
            }
        });
    });

    describe('createOffRamp() edge cases', () => {
        it('sends empty string for memo when memo is undefined', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/offramp`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.memo).toBe('');

                    return HttpResponse.json({
                        transactionId: 'offramp-no-memo',
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
                        memo: '',
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
                // memo intentionally omitted
            });

            expect(tx.id).toBe('offramp-no-memo');
        });
    });

    describe('getOffRampTransaction() edge cases', () => {
        it('re-throws non-404 errors', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/offramp/offramp-500`, () => {
                    return HttpResponse.json(
                        { error: { code: 'INTERNAL_ERROR', message: 'Server failure' } },
                        { status: 500 },
                    );
                }),
            );

            try {
                await client.getOffRampTransaction('offramp-500');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.statusCode).toBe(500);
                expect(anchorError.message).toBe('Server failure');
            }
        });
    });

    describe('getKycUrl() edge cases', () => {
        it('returns undefined when response has missing verification_url', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123/kyc/MX/url`, () => {
                    return HttpResponse.json({
                        submissionId: 'sub-001',
                    });
                }),
            );

            const url = await client.getKycUrl('cust-123');
            expect(url).toBeUndefined();
        });
    });

    describe('submitKycFile', () => {
        it('uploads a file and returns the file response', async () => {
            const client = createClient();

            server.use(
                http.post(
                    `${BASE_URL}/customers/cust-123/kyc/sub-001/files`,
                    async ({ request }) => {
                        expect(request.headers.get('api-key')).toBe(API_KEY);
                        expect(request.headers.get('api-secret')).toBe(API_SECRET);

                        // Verify it is a FormData request (no Content-Type: application/json)
                        const contentType = request.headers.get('Content-Type');
                        expect(contentType).toContain('multipart/form-data');

                        return HttpResponse.json({
                            fileId: 'file-001',
                            fileType: 'National ID Front',
                            status: 'UPLOADED',
                        });
                    },
                ),
            );

            const file = new Blob(['fake-image-data'], { type: 'image/jpeg' });
            const result = await client.submitKycFile(
                'cust-123',
                'sub-001',
                'National ID Front',
                file,
                'id-front.jpg',
            );

            expect(result.fileId).toBe('file-001');
            expect(result.fileType).toBe('National ID Front');
            expect(result.status).toBe('UPLOADED');
        });

        it('throws AnchorError on upload failure', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/cust-123/kyc/sub-001/files`, () => {
                    return HttpResponse.json(
                        { error: { code: 'FILE_TOO_LARGE', message: 'File exceeds size limit' } },
                        { status: 413 },
                    );
                }),
            );

            const file = new Blob(['fake-image-data'], { type: 'image/jpeg' });

            try {
                await client.submitKycFile('cust-123', 'sub-001', 'Selfie', file, 'selfie.jpg');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('File exceeds size limit');
                expect(anchorError.code).toBe('FILE_TOO_LARGE');
                expect(anchorError.statusCode).toBe(413);
            }
        });
    });

    describe('getKycSubmission', () => {
        it('returns the KYC submission for a customer', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/kyc/cust-123`, () => {
                    return HttpResponse.json({
                        submissionId: 'sub-001',
                        status: 'IN_REVIEW',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const submission = await client.getKycSubmission('cust-123');

            expect(submission).not.toBeNull();
            expect(submission!.submissionId).toBe('sub-001');
            expect(submission!.status).toBe('IN_REVIEW');
            expect(submission!.createdAt).toBe('2025-01-01T00:00:00Z');
        });

        it('returns null when no submission exists (404)', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/kyc/cust-no-sub`, () => {
                    return HttpResponse.json(
                        { error: { code: 'NOT_FOUND', message: 'No submission found' } },
                        { status: 404 },
                    );
                }),
            );

            const submission = await client.getKycSubmission('cust-no-sub');
            expect(submission).toBeNull();
        });
    });

    describe('getKycSubmissionStatus', () => {
        it('returns the KYC submission status', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-123/kyc/sub-001/status`, () => {
                    return HttpResponse.json({
                        submissionId: 'sub-001',
                        status: 'COMPLETED',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const result = await client.getKycSubmissionStatus('cust-123', 'sub-001');

            expect(result.submissionId).toBe('sub-001');
            expect(result.status).toBe('COMPLETED');
            expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
            expect(result.updatedAt).toBe('2025-01-02T00:00:00Z');
        });
    });

    describe('getKycRequirementsRaw', () => {
        it('returns raw KYC requirements for a given country', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/kycRequirements`, ({ request }) => {
                    const url = new URL(request.url);
                    expect(url.searchParams.get('country')).toBe('BR');

                    return HttpResponse.json({
                        country: 'BR',
                        requirements: {
                            personal: [
                                { name: 'firstName', required: true, type: 'string' },
                                { name: 'lastName', required: true, type: 'string' },
                            ],
                            documents: [
                                {
                                    name: 'National ID Front',
                                    required: true,
                                    type: 'file',
                                    description: 'Front of national ID',
                                },
                            ],
                        },
                    });
                }),
            );

            const requirements = await client.getKycRequirementsRaw('BR');

            expect(requirements.country).toBe('BR');
            expect(requirements.requirements.personal).toHaveLength(2);
            expect(requirements.requirements.personal[0].name).toBe('firstName');
            expect(requirements.requirements.documents).toHaveLength(1);
            expect(requirements.requirements.documents[0].name).toBe('National ID Front');
        });

        it('defaults to MX when country is not provided', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/kycRequirements`, ({ request }) => {
                    const url = new URL(request.url);
                    expect(url.searchParams.get('country')).toBe('MX');

                    return HttpResponse.json({
                        country: 'MX',
                        requirements: {
                            personal: [{ name: 'firstName', required: true, type: 'string' }],
                            documents: [{ name: 'Selfie', required: true, type: 'file' }],
                        },
                    });
                }),
            );

            const requirements = await client.getKycRequirementsRaw();

            expect(requirements.country).toBe('MX');
        });
    });

    describe('getKycRequirements (shared format)', () => {
        it('returns KYC requirements in the shared KycRequirements format', async () => {
            const client = createClient();
            const requirements = await client.getKycRequirements();

            expect(requirements.fields).toBeDefined();
            expect(requirements.documents).toBeDefined();
            expect(requirements.fields.length).toBeGreaterThan(0);
            expect(requirements.documents.length).toBeGreaterThan(0);
            expect(requirements.fields[0]).toHaveProperty('key');
            expect(requirements.fields[0]).toHaveProperty('label');
            expect(requirements.fields[0]).toHaveProperty('type');
            expect(requirements.documents[0]).toHaveProperty('key');
            expect(requirements.documents[0]).toHaveProperty('mode');
        });
    });

    describe('submitKycData', () => {
        it('submits KYC personal data and returns the submission response', async () => {
            const client = createClient();

            const kycData = {
                firstName: 'Juan',
                lastName: 'Perez',
                dateOfBirth: '1990-01-15',
                country: 'MX',
                city: 'Mexico City',
                state: 'CDMX',
                address: '123 Reforma Ave',
                zipCode: '06600',
                nationalities: ['MX'],
                email: 'juan@example.com',
                dni: 'CURP123456789',
            };

            server.use(
                http.post(`${BASE_URL}/customers/cust-123/kyc`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.kycSubmission).toEqual(kycData);

                    return HttpResponse.json({
                        submissionId: 'sub-002',
                        status: 'CREATED',
                        createdAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const result = await client.submitKycData('cust-123', kycData);

            expect(result.submissionId).toBe('sub-002');
            expect(result.status).toBe('CREATED');
            expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
        });
    });

    describe('finalizeKycSubmission', () => {
        it('finalizes a KYC submission without error', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/cust-123/kyc/sub-001/submit`, () => {
                    return HttpResponse.json({ message: 'Submission finalized' });
                }),
            );

            // Should complete without throwing
            await expect(
                client.finalizeKycSubmission('cust-123', 'sub-001'),
            ).resolves.toBeUndefined();
        });
    });

    describe('sendSandboxWebhook', () => {
        it('sends a sandbox webhook event', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/webhooks`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.referenceId).toBe('tx-001');
                    expect(body.eventType).toBe('ONRAMP');
                    expect(body.status).toBe('COMPLETED');
                    expect(body.metadata).toEqual({ extra: 'data' });

                    return HttpResponse.json({ message: 'Webhook sent' });
                }),
            );

            // Should complete without throwing
            await expect(
                client.sendSandboxWebhook({
                    referenceId: 'tx-001',
                    eventType: 'ONRAMP',
                    status: 'COMPLETED',
                    metadata: { extra: 'data' },
                }),
            ).resolves.toBeUndefined();
        });
    });

    describe('completeKycSandbox', () => {
        it('sends a KYC COMPLETED webhook for the given submission', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/webhooks`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.referenceId).toBe('sub-sandbox-001');
                    expect(body.eventType).toBe('KYC');
                    expect(body.status).toBe('COMPLETED');
                    expect(body.metadata).toBeNull();

                    return HttpResponse.json({ message: 'Webhook sent' });
                }),
            );

            // Should complete without throwing
            await expect(client.completeKycSandbox('sub-sandbox-001')).resolves.toBeUndefined();
        });
    });

    // ==========================================================================
    // Input validation behavior (characterization tests)
    // ==========================================================================

    describe('input validation behavior', () => {
        describe('createCustomer input validation', () => {
            it('throws MISSING_EMAIL when email is empty', async () => {
                const client = createClient();

                await expect(client.createCustomer({ email: '' })).rejects.toThrow(
                    'email is required for AlfredPay',
                );
            });

            it('throws MISSING_EMAIL when email is undefined', async () => {
                const client = createClient();

                await expect(client.createCustomer({})).rejects.toThrow(
                    'email is required for AlfredPay',
                );
            });

            it('passes invalid email format to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/customers/create`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            customerId: 'cust-bad-email',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.createCustomer({ email: 'not-an-email' });

                expect(capturedBody.email).toBe('not-an-email');
            });

            it('does not send publicKey to API (not used by AlfredPay)', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/customers/create`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            customerId: 'cust-no-pk',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.createCustomer({
                    email: 'user@example.com',
                    publicKey: 'GABCDEF1234567890',
                });

                expect(capturedBody).not.toHaveProperty('publicKey');
            });
        });

        describe('getCustomer input validation', () => {
            it('throws AnchorError when email is missing (empty object)', async () => {
                const client = createClient();

                try {
                    await client.getCustomer({});
                    expect.fail('Should have thrown');
                } catch (error) {
                    expect(error).toBeInstanceOf(AnchorError);
                    const anchorError = error as AnchorError;
                    expect(anchorError.code).toBe('MISSING_EMAIL');
                    expect(anchorError.statusCode).toBe(400);
                }
            });

            it('throws AnchorError when only customerId is provided (no email)', async () => {
                const client = createClient();

                try {
                    await client.getCustomer({ customerId: 'cust-123' });
                    expect.fail('Should have thrown');
                } catch (error) {
                    expect(error).toBeInstanceOf(AnchorError);
                    const anchorError = error as AnchorError;
                    expect(anchorError.code).toBe('MISSING_EMAIL');
                    expect(anchorError.statusCode).toBe(400);
                }
            });

            it('sends request with email containing special characters', async () => {
                const client = createClient();
                let capturedUrl = '';

                server.use(
                    http.get(
                        `${BASE_URL}/customers/find/test%2Buser%40example.com/MX`,
                        ({ request }) => {
                            capturedUrl = request.url;
                            return HttpResponse.json({ customerId: 'cust-special' });
                        },
                    ),
                );

                await client.getCustomer({ email: 'test+user@example.com' });

                // encodeURIComponent('test+user@example.com') produces 'test%2Buser%40example.com'
                expect(capturedUrl).toContain('test%2Buser%40example.com');
            });
        });

        describe('getQuote input validation', () => {
            it('omits fromAmount from request body when it is undefined', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            quoteId: 'quote-no-from',
                            fromCurrency: 'MXN',
                            toCurrency: 'USDC',
                            fromAmount: '0.00',
                            toAmount: '50.00',
                            rate: '0.055',
                            expiration: '2025-01-01T01:00:00Z',
                            fees: [],
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                        });
                    }),
                );

                await client.getQuote({
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    toAmount: '50.00',
                });

                expect(capturedBody).not.toHaveProperty('fromAmount');
            });

            it('omits toAmount from request body when it is undefined', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            quoteId: 'quote-no-to',
                            fromCurrency: 'MXN',
                            toCurrency: 'USDC',
                            fromAmount: '1000.00',
                            toAmount: '55.00',
                            rate: '0.055',
                            expiration: '2025-01-01T01:00:00Z',
                            fees: [],
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                        });
                    }),
                );

                await client.getQuote({
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    fromAmount: '1000.00',
                });

                expect(capturedBody).not.toHaveProperty('toAmount');
            });

            it('passes non-numeric fromAmount to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            quoteId: 'quote-nan',
                            fromCurrency: 'MXN',
                            toCurrency: 'USDC',
                            fromAmount: 'abc',
                            toAmount: '0.00',
                            rate: '0.055',
                            expiration: '2025-01-01T01:00:00Z',
                            fees: [],
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                        });
                    }),
                );

                await client.getQuote({
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    fromAmount: 'abc',
                });

                expect(capturedBody.fromAmount).toBe('abc');
            });

            it('passes negative fromAmount to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            quoteId: 'quote-neg',
                            fromCurrency: 'MXN',
                            toCurrency: 'USDC',
                            fromAmount: '-100',
                            toAmount: '0.00',
                            rate: '0.055',
                            expiration: '2025-01-01T01:00:00Z',
                            fees: [],
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                        });
                    }),
                );

                await client.getQuote({
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    fromAmount: '-100',
                });

                expect(capturedBody.fromAmount).toBe('-100');
            });

            it('passes zero fromAmount to API — "0" is a non-empty string so it is included', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            quoteId: 'quote-zero',
                            fromCurrency: 'MXN',
                            toCurrency: 'USDC',
                            fromAmount: '0',
                            toAmount: '0.00',
                            rate: '0.055',
                            expiration: '2025-01-01T01:00:00Z',
                            fees: [],
                            chain: 'XLM',
                            paymentMethodType: 'SPEI',
                        });
                    }),
                );

                await client.getQuote({
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    fromAmount: '0',
                });

                // "0" is a non-empty string (truthy in JS), so it is included in the request body
                expect(capturedBody).toHaveProperty('fromAmount', '0');
            });
        });

        describe('createOnRamp input validation', () => {
            it('passes empty stellarAddress as depositAddress without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transaction: {
                                transactionId: 'onramp-empty-addr',
                                customerId: 'cust-123',
                                quoteId: 'quote-001',
                                status: 'CREATED',
                                fromAmount: '1000.00',
                                fromCurrency: 'MXN',
                                toAmount: '55.00',
                                toCurrency: 'USDC',
                                depositAddress: '',
                                chain: 'XLM',
                                paymentMethodType: 'SPEI',
                                txHash: null,
                                memo: '',
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

                await client.createOnRamp({
                    customerId: 'cust-123',
                    quoteId: 'quote-001',
                    stellarAddress: '',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: '1000.00',
                });

                expect(capturedBody.depositAddress).toBe('');
            });

            it('passes non-numeric amount to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transaction: {
                                transactionId: 'onramp-nan-amt',
                                customerId: 'cust-123',
                                quoteId: 'quote-001',
                                status: 'CREATED',
                                fromAmount: 'abc',
                                fromCurrency: 'MXN',
                                toAmount: '0.00',
                                toCurrency: 'USDC',
                                depositAddress: 'GABCD1234STELLAR',
                                chain: 'XLM',
                                paymentMethodType: 'SPEI',
                                txHash: null,
                                memo: '',
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

                await client.createOnRamp({
                    customerId: 'cust-123',
                    quoteId: 'quote-001',
                    stellarAddress: 'GABCD1234STELLAR',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: 'abc',
                });

                expect(capturedBody.amount).toBe('abc');
            });

            it('passes empty customerId to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transaction: {
                                transactionId: 'onramp-empty-cust',
                                customerId: '',
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
                                memo: '',
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

                await client.createOnRamp({
                    customerId: '',
                    quoteId: 'quote-001',
                    stellarAddress: 'GABCD1234STELLAR',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: '1000.00',
                });

                expect(capturedBody.customerId).toBe('');
            });

            it('passes empty quoteId to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transaction: {
                                transactionId: 'onramp-empty-quote',
                                customerId: 'cust-123',
                                quoteId: '',
                                status: 'CREATED',
                                fromAmount: '1000.00',
                                fromCurrency: 'MXN',
                                toAmount: '55.00',
                                toCurrency: 'USDC',
                                depositAddress: 'GABCD1234STELLAR',
                                chain: 'XLM',
                                paymentMethodType: 'SPEI',
                                txHash: null,
                                memo: '',
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

                await client.createOnRamp({
                    customerId: 'cust-123',
                    quoteId: '',
                    stellarAddress: 'GABCD1234STELLAR',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: '1000.00',
                });

                expect(capturedBody.quoteId).toBe('');
            });

            it('sends empty string memo when memo is undefined', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/onramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transaction: {
                                transactionId: 'onramp-no-memo-val',
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
                                memo: '',
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

                await client.createOnRamp({
                    customerId: 'cust-123',
                    quoteId: 'quote-001',
                    stellarAddress: 'GABCD1234STELLAR',
                    fromCurrency: 'MXN',
                    toCurrency: 'USDC',
                    amount: '1000.00',
                    // memo intentionally omitted
                });

                expect(capturedBody.memo).toBe('');
            });
        });

        describe('createOffRamp input validation', () => {
            it('passes empty fiatAccountId to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/offramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transactionId: 'offramp-empty-fiat',
                            customerId: 'cust-123',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            fromCurrency: 'USDC',
                            toCurrency: 'MXN',
                            fromAmount: '50.00',
                            toAmount: '900.00',
                            chain: 'XLM',
                            status: 'CREATED',
                            fiatAccountId: '',
                            depositAddress: 'GXYZ9876STELLAR',
                            expiration: '2025-01-01T02:00:00Z',
                            memo: 'memo',
                        });
                    }),
                );

                await client.createOffRamp({
                    customerId: 'cust-123',
                    quoteId: 'quote-002',
                    stellarAddress: 'GXYZ9876STELLAR',
                    fromCurrency: 'USDC',
                    toCurrency: 'MXN',
                    amount: '50.00',
                    fiatAccountId: '',
                });

                expect(capturedBody.fiatAccountId).toBe('');
            });

            it('passes empty stellarAddress without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/offramp`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            transactionId: 'offramp-empty-addr',
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
                            depositAddress: '',
                            expiration: '2025-01-01T02:00:00Z',
                            memo: 'memo',
                        });
                    }),
                );

                await client.createOffRamp({
                    customerId: 'cust-123',
                    quoteId: 'quote-002',
                    stellarAddress: '',
                    fromCurrency: 'USDC',
                    toCurrency: 'MXN',
                    amount: '50.00',
                    fiatAccountId: 'fiat-001',
                });

                expect(capturedBody.originAddress).toBe('');
            });
        });

        describe('registerFiatAccount input validation', () => {
            it('passes empty CLABE to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            fiatAccountId: 'fiat-empty-clabe',
                            customerId: 'cust-123',
                            type: 'SPEI',
                            status: 'ACTIVE',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.registerFiatAccount({
                    customerId: 'cust-123',
                    account: {
                        type: 'spei',
                        clabe: '',
                        beneficiary: 'Juan Perez',
                    },
                });

                const fields = capturedBody.fiatAccountFields as Record<string, unknown>;
                expect(fields.accountNumber).toBe('');
                expect(fields.networkIdentifier).toBe('');
            });

            it('passes short CLABE to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            fiatAccountId: 'fiat-short-clabe',
                            customerId: 'cust-123',
                            type: 'SPEI',
                            status: 'ACTIVE',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.registerFiatAccount({
                    customerId: 'cust-123',
                    account: {
                        type: 'spei',
                        clabe: '123',
                        beneficiary: 'Juan Perez',
                    },
                });

                const fields = capturedBody.fiatAccountFields as Record<string, unknown>;
                expect(fields.accountNumber).toBe('123');
                expect(fields.networkIdentifier).toBe('123');
            });

            it('passes non-numeric CLABE to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            fiatAccountId: 'fiat-alpha-clabe',
                            customerId: 'cust-123',
                            type: 'SPEI',
                            status: 'ACTIVE',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.registerFiatAccount({
                    customerId: 'cust-123',
                    account: {
                        type: 'spei',
                        clabe: 'not-a-number-clabe',
                        beneficiary: 'Juan Perez',
                    },
                });

                const fields = capturedBody.fiatAccountFields as Record<string, unknown>;
                expect(fields.accountNumber).toBe('not-a-number-clabe');
                expect(fields.networkIdentifier).toBe('not-a-number-clabe');
            });

            it('passes empty beneficiary to API without validation', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            fiatAccountId: 'fiat-empty-bene',
                            customerId: 'cust-123',
                            type: 'SPEI',
                            status: 'ACTIVE',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.registerFiatAccount({
                    customerId: 'cust-123',
                    account: {
                        type: 'spei',
                        clabe: '012345678901234567',
                        beneficiary: '',
                    },
                });

                const fields = capturedBody.fiatAccountFields as Record<string, unknown>;
                expect(fields.accountName).toBe('');
                expect(fields.accountAlias).toBe('');
                const metadata = fields.metadata as Record<string, unknown>;
                expect(metadata.accountHolderName).toBe('');
            });

            it('uses empty string when bankName is undefined', async () => {
                const client = createClient();
                let capturedBody: Record<string, unknown> = {};

                server.use(
                    http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            fiatAccountId: 'fiat-no-bank',
                            customerId: 'cust-123',
                            type: 'SPEI',
                            status: 'ACTIVE',
                            createdAt: '2025-01-01T00:00:00Z',
                        });
                    }),
                );

                await client.registerFiatAccount({
                    customerId: 'cust-123',
                    account: {
                        type: 'spei',
                        clabe: '012345678901234567',
                        beneficiary: 'Juan Perez',
                        // bankName intentionally omitted
                    },
                });

                const fields = capturedBody.fiatAccountFields as Record<string, unknown>;
                expect(fields.accountBankCode).toBe('');
            });
        });

        describe('getKycUrl input validation', () => {
            it('passes empty customerId to URL without validation', async () => {
                const client = createClient();
                let capturedUrl = '';

                server.use(
                    http.get(new RegExp(`${BASE_URL}/customers/.*/kyc/.*/url`), ({ request }) => {
                        capturedUrl = request.url;
                        return HttpResponse.json({
                            verification_url: 'https://kyc.alfredpay.io/verify/empty',
                            submissionId: 'sub-empty',
                        });
                    }),
                );

                await client.getKycUrl('');

                // The client builds URL as `/customers/${customerId}/kyc/${country}/url`
                // With empty customerId, this produces `/customers//kyc/MX/url`
                expect(capturedUrl).toContain('/customers/');
                expect(capturedUrl).toContain('/kyc/MX/url');
            });
        });

        describe('getKycStatus input validation', () => {
            it('does not use publicKey parameter', async () => {
                const client = createClient();
                let capturedUrl = '';

                server.use(
                    http.get(`${BASE_URL}/customers/cust-123`, ({ request }) => {
                        capturedUrl = request.url;
                        return HttpResponse.json({
                            statusKyc: 'COMPLETED',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-02T00:00:00Z',
                        });
                    }),
                );

                // AlfredPayClient.getKycStatus calls GET /customers/{id} directly
                // for KYC info — it doesn't go through getCustomer().
                const status = await client.getKycStatus('cust-123');

                expect(status).toBe('approved');
                expect(capturedUrl).toContain('/customers/cust-123');
            });
        });

        describe('getFiatAccounts input validation', () => {
            it('passes empty customerId in query string without validation', async () => {
                const client = createClient();
                let capturedUrl = '';

                server.use(
                    http.get(`${BASE_URL}/fiatAccounts`, ({ request }) => {
                        capturedUrl = request.url;
                        return HttpResponse.json([]);
                    }),
                );

                await client.getFiatAccounts('');

                const url = new URL(capturedUrl);
                expect(url.searchParams.get('customerId')).toBe('');
            });
        });
    });

    describe('Brazil / PIX support', () => {
        it('supportedCurrencies includes BRL', () => {
            const client = createClient();
            expect(client.supportedCurrencies).toContain('BRL');
        });

        it('supportedRails includes pix', () => {
            const client = createClient();
            expect(client.supportedRails).toContain('pix');
        });

        it('still supports MXN and spei (no regression)', () => {
            const client = createClient();
            expect(client.supportedCurrencies).toContain('MXN');
            expect(client.supportedRails).toContain('spei');
        });

        it('getQuote with BRL sends paymentMethodType PIX', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.fromCurrency).toBe('BRL');
                    expect(body.toCurrency).toBe('USDC');
                    expect(body.paymentMethodType).toBe('PIX');

                    return HttpResponse.json({
                        quoteId: 'quote-br-001',
                        fromCurrency: 'BRL',
                        toCurrency: 'USDC',
                        fromAmount: '500.00',
                        toAmount: '90.00',
                        rate: '0.18',
                        expiration: '2026-03-24T01:00:00Z',
                        fees: [{ type: 'commissionFee', amount: '2.00', currency: 'BRL' }],
                        chain: 'XLM',
                        paymentMethodType: 'PIX',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'BRL',
                toCurrency: 'USDC',
                fromAmount: '500.00',
            });

            expect(quote.id).toBe('quote-br-001');
            expect(quote.fromCurrency).toBe('BRL');
        });

        it('getQuote with MXN still sends paymentMethodType SPEI', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quotes`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.paymentMethodType).toBe('SPEI');

                    return HttpResponse.json({
                        quoteId: 'quote-mx-001',
                        fromCurrency: 'MXN',
                        toCurrency: 'USDC',
                        fromAmount: '1000.00',
                        toAmount: '55.00',
                        rate: '0.055',
                        expiration: '2026-03-24T01:00:00Z',
                        fees: [{ type: 'commissionFee', amount: '1.50', currency: 'MXN' }],
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

            expect(quote.id).toBe('quote-mx-001');
        });

        it('registerFiatAccount with PIX type sends correct fields', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/fiatAccounts`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.type).toBe('PIX');
                    const fields = body.fiatAccountFields as Record<string, unknown>;
                    expect(fields.pixKey).toBe('12345678901');
                    expect(fields.taxId).toBe('12345678901');
                    expect(fields.accountHolderName).toBe('João Silva');

                    return HttpResponse.json({
                        fiatAccountId: 'acct-br-001',
                        customerId: 'cust-001',
                        type: 'PIX',
                        status: 'ACTIVE',
                        createdAt: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const account = await client.registerFiatAccount({
                customerId: 'cust-001',
                account: {
                    type: 'pix',
                    pixKey: '12345678901',
                    taxId: '12345678901',
                    accountHolderName: 'João Silva',
                },
            });

            expect(account.id).toBe('acct-br-001');
            expect(account.type).toBe('PIX');
        });
    });
});
