import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { TransferoClient } from '$lib/anchors/transfero/client';
import { AnchorError } from '$lib/anchors/types';

const BASE_URL = 'http://transfero.test';
const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const SCOPE = 'test-scope';

function createClient(): TransferoClient {
    return new TransferoClient({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        scope: SCOPE,
        baseUrl: BASE_URL,
    });
}

/** Set up the auth token endpoint to succeed. */
function mockAuth() {
    server.use(
        http.post(`${BASE_URL}/auth/token`, async ({ request }) => {
            const text = await request.text();
            expect(text).toContain('grant_type=client_credentials');
            expect(text).toContain(`client_id=${CLIENT_ID}`);
            expect(text).toContain(`client_secret=${CLIENT_SECRET}`);
            expect(text).toContain(`scope=${SCOPE}`);

            return HttpResponse.json({
                access_token: 'test-token-123',
                expires_in: 3599,
                token_type: 'Bearer',
            });
        }),
    );
}

describe('TransferoClient', () => {
    describe('client properties', () => {
        it('has correct name and displayName', () => {
            const client = createClient();
            expect(client.name).toBe('transfero');
            expect(client.displayName).toBe('Transfero');
        });

        it('supports USDC and BRZ tokens with correct issuers', () => {
            const client = createClient();
            expect(client.supportedTokens.length).toBeGreaterThanOrEqual(2);

            const usdc = client.supportedTokens.find((t) => t.symbol === 'USDC');
            expect(usdc).toBeDefined();
            expect(usdc!.issuer).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

            const brz = client.supportedTokens.find((t) => t.symbol === 'BRZ');
            expect(brz).toBeDefined();
            expect(brz!.issuer).toBe('GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2');
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
            expect(client.capabilities.sandbox).toBe(true);
            expect(client.capabilities.requiresOffRampSigning).toBe(true);
        });
    });

    describe('OAuth2 authentication', () => {
        it('fetches token with client_credentials grant on first API call', async () => {
            const client = createClient();
            let authCalled = false;

            server.use(
                http.post(`${BASE_URL}/auth/token`, async ({ request }) => {
                    authCalled = true;
                    const text = await request.text();
                    expect(text).toContain('grant_type=client_credentials');
                    expect(request.headers.get('Content-Type')).toContain(
                        'application/x-www-form-urlencoded',
                    );

                    return HttpResponse.json({
                        access_token: 'fresh-token',
                        expires_in: 3599,
                    });
                }),
                http.post(`${BASE_URL}/api/quote/v2/requestquote`, ({ request }) => {
                    expect(request.headers.get('Authorization')).toBe('Bearer fresh-token');
                    return HttpResponse.json([
                        {
                            quoteId: 'q-1',
                            price: 5.4,
                            expireAt: '2026-03-25T00:00:00Z',
                        },
                    ]);
                }),
            );

            await client.getQuote({
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                fromAmount: '100',
            });

            expect(authCalled).toBe(true);
        });

        it('caches token and reuses on second call', async () => {
            const client = createClient();
            let authCallCount = 0;

            server.use(
                http.post(`${BASE_URL}/auth/token`, () => {
                    authCallCount++;
                    return HttpResponse.json({
                        access_token: 'cached-token',
                        expires_in: 3599,
                    });
                }),
                http.post(`${BASE_URL}/api/quote/v2/requestquote`, () => {
                    return HttpResponse.json([
                        { quoteId: 'q-1', price: 5.4, expireAt: '2026-03-25T00:00:00Z' },
                    ]);
                }),
            );

            await client.getQuote({
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                fromAmount: '100',
            });
            await client.getQuote({
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                fromAmount: '200',
            });

            expect(authCallCount).toBe(1);
        });

        it('throws AnchorError on auth failure', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/auth/token`, () => {
                    return HttpResponse.text('Unauthorized', { status: 401 });
                }),
            );

            try {
                await client.getQuote({
                    fromCurrency: 'USDC',
                    toCurrency: 'BRL',
                    fromAmount: '100',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const ae = err as AnchorError;
                expect(ae.code).toBe('TRANSFERO_AUTH_FAILED');
            }
        });
    });

    describe('getQuote', () => {
        it('calls POST /api/quote/v2/requestquote with correct body', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.post(`${BASE_URL}/api/quote/v2/requestquote`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.baseCurrency).toBe('USDC');
                    expect(body.quoteCurrency).toBe('BRL');
                    expect(body.baseCurrencySize).toBe(100);
                    expect(body.side).toBe('sell');

                    return HttpResponse.json([
                        {
                            quoteId: 'quote-001',
                            price: 540.0,
                            expireAt: '2026-03-25T01:00:00Z',
                        },
                    ]);
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
            expect(quote.expiresAt).toBe('2026-03-25T01:00:00Z');
        });

        it('throws on empty array response', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.post(`${BASE_URL}/api/quote/v2/requestquote`, () => {
                    return HttpResponse.json([]);
                }),
            );

            try {
                await client.getQuote({
                    fromCurrency: 'USDC',
                    toCurrency: 'BRL',
                    fromAmount: '100',
                });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
            }
        });
    });

    describe('createOnRamp', () => {
        it('creates on-ramp with crypto withdrawal info', async () => {
            const client = createClient();
            mockAuth();

            // First create a customer so identity is available
            const customer = await client.createCustomer({
                email: 'user@example.com',
                name: 'Test User',
                taxId: '12345678901',
                taxIdCountry: 'BRA',
                country: 'BR',
            });

            server.use(
                http.post(`${BASE_URL}/api/ramp/v2/swaporder`, async ({ request }) => {
                    expect(request.headers.get('Authorization')).toBe('Bearer test-token-123');
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.taxId).toBe('12345678901');
                    expect(body.quoteId).toBe('quote-001');
                    const crypto = body.cryptoWithdrawalInformation as Record<string, unknown>;
                    expect(crypto.blockchain).toBe('Stellar');
                    expect(crypto.key).toBe('GUSER123');

                    return HttpResponse.json({
                        id: 'onramp-001',
                        status: 'SwapOrderCreated',
                        createdAt: '2026-03-25T00:00:00Z',
                        updatedAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.createOnRamp({
                customerId: customer.id,
                quoteId: 'quote-001',
                stellarAddress: 'GUSER123',
                fromCurrency: 'BRL',
                toCurrency: 'USDC',
                amount: '500',
            });

            expect(tx.id).toBe('onramp-001');
            expect(tx.status).toBe('pending');
            expect(tx.stellarAddress).toBe('GUSER123');
        });
    });

    describe('getOnRampTransaction', () => {
        it('maps SwapOrderCreated to pending', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/onramp-001`, () => {
                    return HttpResponse.json({
                        id: 'onramp-001',
                        status: 'SwapOrderCreated',
                        createdAt: '2026-03-25T00:00:00Z',
                        updatedAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-001');
            expect(tx).not.toBeNull();
            expect(tx!.status).toBe('pending');
        });

        it('maps DepositReceived to processing', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/onramp-002`, () => {
                    return HttpResponse.json({
                        id: 'onramp-002',
                        status: 'DepositReceived',
                        createdAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-002');
            expect(tx!.status).toBe('processing');
        });

        it('maps SwapOrderCompleted to completed', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/onramp-003`, () => {
                    return HttpResponse.json({
                        id: 'onramp-003',
                        status: 'SwapOrderCompleted',
                        createdAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-003');
            expect(tx!.status).toBe('completed');
        });

        it('maps Failed to failed', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/onramp-004`, () => {
                    return HttpResponse.json({
                        id: 'onramp-004',
                        status: 'Failed',
                        createdAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-004');
            expect(tx!.status).toBe('failed');
        });

        it('maps Canceled to cancelled', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/onramp-005`, () => {
                    return HttpResponse.json({
                        id: 'onramp-005',
                        status: 'Canceled',
                        createdAt: '2026-03-25T00:00:00Z',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('onramp-005');
            expect(tx!.status).toBe('cancelled');
        });
    });

    describe('createOffRamp (preview → accept)', () => {
        it('calls preview then accept and returns transaction with deposit info', async () => {
            const client = createClient();
            mockAuth();

            const customer = await client.createCustomer({
                email: 'user@example.com',
                name: 'Test User',
                taxId: '12345678901',
                taxIdCountry: 'BRA',
            });

            // Register a PIX account
            await client.registerFiatAccount({
                customerId: customer.id,
                account: {
                    type: 'pix',
                    pixKey: 'user@example.com',
                    taxId: '12345678901',
                    accountHolderName: 'Test User',
                },
            });

            const accounts = await client.getFiatAccounts(customer.id);
            const fiatAccountId = accounts[0].id;

            server.use(
                http.post(`${BASE_URL}/api/ramp/v2/swaporder/preview`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.taxId).toBe('12345678901');
                    expect(body.depositBlockchain).toBe('Stellar');
                    const qr = body.quoteRequest as Record<string, unknown>;
                    expect(qr.side).toBe('Sell');
                    expect(qr.baseCurrency).toBe('USDC');
                    expect(qr.quoteCurrency).toBe('BRL');

                    return HttpResponse.json({
                        previewId: 'preview-001',
                        status: 'Preview',
                        quoteInformation: {
                            baseCurrencySize: 100,
                            quoteCurrencySize: 540,
                            expireAt: '2026-03-25T01:00:00Z',
                        },
                        depositInformation: {
                            depositAddress: 'GTRANSFERO_DEPOSIT_ADDR',
                            memo: 'memo-xyz',
                            blockchain: 'Stellar',
                        },
                    });
                }),
                http.post(`${BASE_URL}/api/ramp/v2/swaporder/accept`, async ({ request }) => {
                    const body = (await request.json()) as Record<string, unknown>;
                    expect(body.previewId).toBe('preview-001');

                    return HttpResponse.json({
                        id: 'offramp-001',
                        status: 'SwapOrderCreated',
                        createdAt: '2026-03-25T00:00:00Z',
                        updatedAt: '2026-03-25T00:00:00Z',
                        quote: {
                            baseCurrencySize: 100,
                            quoteCurrencySize: 540,
                        },
                        depositInformation: {
                            depositAddress: 'GTRANSFERO_DEPOSIT_ADDR',
                            memo: 'memo-xyz',
                            blockchain: 'Stellar',
                        },
                    });
                }),
            );

            const tx = await client.createOffRamp({
                customerId: customer.id,
                quoteId: 'quote-001',
                stellarAddress: 'GUSER123',
                fromCurrency: 'USDC',
                toCurrency: 'BRL',
                amount: '100',
                fiatAccountId,
            });

            expect(tx.id).toBe('offramp-001');
            expect(tx.status).toBe('pending');
            expect(tx.stellarAddress).toBe('GTRANSFERO_DEPOSIT_ADDR');
            expect(tx.memo).toBe('memo-xyz');
            expect(tx.fromCurrency).toBe('USDC');
            expect(tx.toCurrency).toBe('BRL');
        });
    });

    describe('getOffRampTransaction', () => {
        it('returns transaction with deposit info', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/offramp-001`, () => {
                    return HttpResponse.json({
                        id: 'offramp-001',
                        status: 'SwapOrderCompleted',
                        createdAt: '2026-03-25T00:00:00Z',
                        updatedAt: '2026-03-25T00:01:00Z',
                        depositInformation: {
                            depositAddress: 'GTRANSFERO_ADDR',
                            memo: 'memo-abc',
                        },
                    });
                }),
            );

            const tx = await client.getOffRampTransaction('offramp-001');
            expect(tx).not.toBeNull();
            expect(tx!.status).toBe('completed');
            expect(tx!.stellarAddress).toBe('GTRANSFERO_ADDR');
            expect(tx!.memo).toBe('memo-abc');
        });

        it('returns null for 404', async () => {
            const client = createClient();
            mockAuth();

            server.use(
                http.get(`${BASE_URL}/api/ramp/v2/id/nonexistent`, () => {
                    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
                }),
            );

            const tx = await client.getOffRampTransaction('nonexistent');
            expect(tx).toBeNull();
        });
    });

    describe('customer (in-memory)', () => {
        it('createCustomer stores and returns customer with approved KYC', async () => {
            const client = createClient();

            const customer = await client.createCustomer({
                email: 'user@example.com',
                name: 'Test User',
                taxId: '12345678901',
                country: 'BR',
            });

            expect(customer.id).toBeDefined();
            expect(customer.email).toBe('user@example.com');
            expect(customer.kycStatus).toBe('approved');
        });

        it('getCustomer retrieves by ID', async () => {
            const client = createClient();

            const created = await client.createCustomer({
                email: 'user@example.com',
                name: 'Test User',
                taxId: '12345678901',
            });

            const found = await client.getCustomer({ customerId: created.id });
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.email).toBe('user@example.com');
        });

        it('getCustomer retrieves by email', async () => {
            const client = createClient();

            await client.createCustomer({
                email: 'findme@example.com',
                name: 'Find Me',
                taxId: '99999999999',
            });

            const found = await client.getCustomer({ email: 'findme@example.com' });
            expect(found).not.toBeNull();
            expect(found!.email).toBe('findme@example.com');
        });

        it('getCustomer returns null for unknown', async () => {
            const client = createClient();
            const found = await client.getCustomer({ customerId: 'unknown' });
            expect(found).toBeNull();
        });
    });

    describe('fiat accounts (in-memory)', () => {
        it('registerFiatAccount stores and returns account', async () => {
            const client = createClient();

            const account = await client.registerFiatAccount({
                customerId: 'cust-001',
                account: {
                    type: 'pix',
                    pixKey: 'user@example.com',
                    taxId: '12345678901',
                    accountHolderName: 'Test User',
                },
            });

            expect(account.id).toBeDefined();
            expect(account.customerId).toBe('cust-001');
            expect(account.type).toBe('pix');
            expect(account.status).toBe('active');
        });

        it('getFiatAccounts returns stored accounts', async () => {
            const client = createClient();

            await client.registerFiatAccount({
                customerId: 'cust-002',
                account: {
                    type: 'pix',
                    pixKey: '12345678901',
                    taxId: '12345678901',
                    accountHolderName: 'User Two',
                },
            });

            const accounts = await client.getFiatAccounts('cust-002');
            expect(accounts).toHaveLength(1);
            expect(accounts[0].type).toBe('pix');
            expect(accounts[0].accountNumber).toBe('12345678901');
        });

        it('getFiatAccounts returns empty for unknown customer', async () => {
            const client = createClient();
            const accounts = await client.getFiatAccounts('unknown');
            expect(accounts).toHaveLength(0);
        });
    });

    describe('getKycStatus', () => {
        it('always returns approved', async () => {
            const client = createClient();
            const status = await client.getKycStatus('any-id');
            expect(status).toBe('approved');
        });
    });
});
