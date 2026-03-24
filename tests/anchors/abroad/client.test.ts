import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { AbroadClient } from '$lib/anchors/abroad/client';
import { AnchorError } from '$lib/anchors/types';

const BASE_URL = 'http://abroad.test';
const API_KEY = 'test-abroad-key';

function createClient(): AbroadClient {
    return new AbroadClient({
        apiKey: API_KEY,
        baseUrl: BASE_URL,
    });
}

describe('AbroadClient', () => {
    describe('client properties', () => {
        it('has correct name and displayName', () => {
            const client = createClient();
            expect(client.name).toBe('abroad');
            expect(client.displayName).toBe('Abroad Finance');
        });

        it('supports USDC token with correct issuer', () => {
            const client = createClient();
            expect(client.supportedTokens).toHaveLength(1);
            expect(client.supportedTokens[0].symbol).toBe('USDC');
            expect(client.supportedTokens[0].issuer).toBe(
                'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            );
        });

        it('supports BRL currency', () => {
            const client = createClient();
            expect(client.supportedCurrencies).toEqual(['BRL']);
        });

        it('supports pix rail', () => {
            const client = createClient();
            expect(client.supportedRails).toEqual(['pix']);
        });

        it('has correct capabilities', () => {
            const client = createClient();
            expect(client.capabilities.kycFlow).toBe('redirect');
            expect(client.capabilities.kycUrl).toBe(true);
            expect(client.capabilities.requiresOffRampSigning).toBe(true);
        });
    });

    describe('getQuote', () => {
        it('calls POST /quote with correct body and returns mapped Quote', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quote`, async ({ request }) => {
                    expect(request.headers.get('X-API-Key')).toBe(API_KEY);

                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.amount).toBe(100);
                    expect(body.crypto_currency).toBe('USDC');
                    expect(body.network).toBe('stellar');
                    expect(body.payment_method).toBe('pix');
                    expect(body.target_currency).toBe('BRL');

                    return HttpResponse.json({
                        id: 'quote-001',
                        crypto_amount: '18.50',
                        fiat_amount: '100.00',
                        exchange_rate: '5.405',
                        fee: '1.50',
                        expires_at: '2026-03-24T01:00:00Z',
                        created_at: '2026-03-24T00:00:00Z',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                    });
                }),
            );

            const quote = await client.getQuote({
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                fromAmount: '100',
            });

            expect(quote.id).toBe('quote-001');
            expect(quote.fromCurrency).toBe('USDC');
            expect(quote.toCurrency).toBe('BRL');
            expect(quote.fromAmount).toBeDefined();
            expect(quote.toAmount).toBeDefined();
            expect(quote.exchangeRate).toBe('5.405');
            expect(quote.fee).toBe('1.50');
            expect(quote.expiresAt).toBe('2026-03-24T01:00:00Z');
        });

        it('throws AnchorError on API error', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/quote`, () => {
                    return HttpResponse.json({ error: 'Invalid amount' }, { status: 400 });
                }),
            );

            try {
                await client.getQuote({
                    fromCurrency: 'USDC',
                    toCurrency: 'BRL',
                    fromAmount: '0',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
            }
        });
    });

    describe('createOffRamp', () => {
        it('creates a transaction and returns OffRampTransaction with stellarAddress and memo', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/transaction`, async ({ request }) => {
                    expect(request.headers.get('X-API-Key')).toBe(API_KEY);

                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.quote_id).toBe('quote-001');

                    return HttpResponse.json({
                        id: 'tx-001',
                        status: 'AWAITING_PAYMENT',
                        transaction_reference: 'memo-abc-123',
                        deposit_address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890ABCDEFGHIJ',
                        crypto_amount: '18.50',
                        fiat_amount: '100.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.createOffRamp({
                customerId: 'cust-001',
                quoteId: 'quote-001',
                stellarAddress: 'GUSER123',
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                amount: '18.50',
                fiatAccountId: 'acct-001',
            });

            expect(tx.id).toBe('tx-001');
            expect(tx.status).toBe('pending');
            expect(tx.memo).toBe('memo-abc-123');
            expect(tx.stellarAddress).toBe('GABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890ABCDEFGHIJ');
            expect(tx.fromCurrency).toBe('USDC');
            expect(tx.toCurrency).toBe('BRL');
        });
    });

    describe('getOffRampTransaction', () => {
        it('maps AWAITING_PAYMENT to pending', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-001`, ({ request }) => {
                    expect(request.headers.get('X-API-Key')).toBe(API_KEY);
                    return HttpResponse.json({
                        id: 'tx-001',
                        status: 'AWAITING_PAYMENT',
                        transaction_reference: 'memo-abc',
                        deposit_address: 'GADDR',
                        crypto_amount: '18.50',
                        fiat_amount: '100.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-001');
            expect(tx).not.toBeNull();
            expect(tx!.status).toBe('pending');
        });

        it('maps PROCESSING_PAYMENT to processing', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-002`, () => {
                    return HttpResponse.json({
                        id: 'tx-002',
                        status: 'PROCESSING_PAYMENT',
                        transaction_reference: 'memo-def',
                        deposit_address: 'GADDR',
                        crypto_amount: '10.00',
                        fiat_amount: '50.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-002');
            expect(tx!.status).toBe('processing');
        });

        it('maps PAYMENT_COMPLETED to completed', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-003`, () => {
                    return HttpResponse.json({
                        id: 'tx-003',
                        status: 'PAYMENT_COMPLETED',
                        transaction_reference: 'memo-ghi',
                        deposit_address: 'GADDR',
                        crypto_amount: '10.00',
                        fiat_amount: '50.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-003');
            expect(tx!.status).toBe('completed');
        });

        it('maps PAYMENT_FAILED to failed', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-004`, () => {
                    return HttpResponse.json({
                        id: 'tx-004',
                        status: 'PAYMENT_FAILED',
                        transaction_reference: 'memo-jkl',
                        deposit_address: 'GADDR',
                        crypto_amount: '10.00',
                        fiat_amount: '50.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-004');
            expect(tx!.status).toBe('failed');
        });

        it('maps PAYMENT_EXPIRED to expired', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-005`, () => {
                    return HttpResponse.json({
                        id: 'tx-005',
                        status: 'PAYMENT_EXPIRED',
                        transaction_reference: 'memo-mno',
                        deposit_address: 'GADDR',
                        crypto_amount: '10.00',
                        fiat_amount: '50.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-005');
            expect(tx!.status).toBe('expired');
        });

        it('maps WRONG_AMOUNT to failed', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-006`, () => {
                    return HttpResponse.json({
                        id: 'tx-006',
                        status: 'WRONG_AMOUNT',
                        transaction_reference: 'memo-pqr',
                        deposit_address: 'GADDR',
                        crypto_amount: '10.00',
                        fiat_amount: '50.00',
                        crypto_currency: 'USDC',
                        target_currency: 'BRL',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-006');
            expect(tx!.status).toBe('failed');
        });

        it('returns null for 404', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/transaction/tx-nonexistent`, () => {
                    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
                }),
            );

            const tx = await client.getOffRampTransaction('tx-nonexistent');
            expect(tx).toBeNull();
        });
    });

    describe('on-ramp methods throw UNSUPPORTED_OPERATION', () => {
        it('createOnRamp throws AnchorError', async () => {
            const client = createClient();

            try {
                await client.createOnRamp({
                    customerId: 'cust-001',
                    quoteId: 'quote-001',
                    stellarAddress: 'GUSER123',
                    fromCurrency: 'BRL',
                    toCurrency: 'USDC',
                    amount: '100',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('UNSUPPORTED_OPERATION');
                expect(anchorErr.statusCode).toBe(501);
            }
        });

        it('getOnRampTransaction throws AnchorError', async () => {
            const client = createClient();

            try {
                await client.getOnRampTransaction('tx-001');
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('UNSUPPORTED_OPERATION');
                expect(anchorErr.statusCode).toBe(501);
            }
        });
    });

    describe('createCustomer', () => {
        it('creates a customer', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers`, async ({ request }) => {
                    expect(request.headers.get('X-API-Key')).toBe(API_KEY);

                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.email).toBe('user@example.com');
                    expect(body.country).toBe('BR');

                    return HttpResponse.json({
                        id: 'cust-001',
                        email: 'user@example.com',
                        created_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const customer = await client.createCustomer({
                email: 'user@example.com',
                country: 'BR',
            });

            expect(customer.id).toBe('cust-001');
            expect(customer.email).toBe('user@example.com');
            expect(customer.kycStatus).toBe('not_started');
        });
    });

    describe('getCustomer', () => {
        it('retrieves a customer by ID', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-001`, ({ request }) => {
                    expect(request.headers.get('X-API-Key')).toBe(API_KEY);

                    return HttpResponse.json({
                        id: 'cust-001',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const customer = await client.getCustomer({ customerId: 'cust-001' });

            expect(customer).not.toBeNull();
            expect(customer!.id).toBe('cust-001');
            expect(customer!.email).toBe('user@example.com');
        });

        it('returns null for 404', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-nonexistent`, () => {
                    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
                }),
            );

            const customer = await client.getCustomer({ customerId: 'cust-nonexistent' });
            expect(customer).toBeNull();
        });
    });

    describe('getKycUrl', () => {
        it('returns kycLink URL', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-001/kyc-url`, () => {
                    return HttpResponse.json({
                        kyc_url: 'https://abroad.finance/kyc/verify/cust-001',
                    });
                }),
            );

            const url = await client.getKycUrl!('cust-001');
            expect(url).toBe('https://abroad.finance/kyc/verify/cust-001');
        });
    });

    describe('getKycStatus', () => {
        it('returns kyc status', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-001`, () => {
                    return HttpResponse.json({
                        id: 'cust-001',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        created_at: '2026-03-24T00:00:00Z',
                        updated_at: '2026-03-24T00:00:00Z',
                    });
                }),
            );

            const status = await client.getKycStatus('cust-001');
            expect(status).toBe('approved');
        });
    });

    describe('registerFiatAccount', () => {
        it('registers a PIX fiat account', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/customers/cust-001/fiat-accounts`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.type).toBe('pix');
                    expect(body.pix_key).toBe('12345678901');
                    expect(body.tax_id).toBe('12345678901');
                    expect(body.account_holder_name).toBe('João Silva');

                    return HttpResponse.json({
                        id: 'acct-001',
                        type: 'PIX',
                        status: 'active',
                        created_at: '2026-03-24T00:00:00Z',
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

            expect(account.id).toBe('acct-001');
            expect(account.type).toBe('PIX');
            expect(account.status).toBe('active');
        });
    });

    describe('getFiatAccounts', () => {
        it('returns list of fiat accounts', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/customers/cust-001/fiat-accounts`, () => {
                    return HttpResponse.json([
                        {
                            id: 'acct-001',
                            type: 'PIX',
                            account_number: '12345678901',
                            bank_name: 'Banco do Brasil',
                            account_holder_name: 'João Silva',
                            created_at: '2026-03-24T00:00:00Z',
                        },
                    ]);
                }),
            );

            const accounts = await client.getFiatAccounts('cust-001');
            expect(accounts).toHaveLength(1);
            expect(accounts[0].id).toBe('acct-001');
            expect(accounts[0].type).toBe('PIX');
        });
    });
});
