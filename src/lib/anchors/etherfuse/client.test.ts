import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import { EtherfuseClient } from './client';
import { AnchorError } from '../types';

const BASE_URL = 'http://etherfuse.test';
const API_KEY = 'test-api-key';

function createClient() {
    return new EtherfuseClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

// ---------------------------------------------------------------------------
// createCustomer
// ---------------------------------------------------------------------------

describe('createCustomer', () => {
    it('returns a Customer with id, email, kycStatus, and bankAccountId', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: 'GABCDEF',
        });

        expect(customer.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(customer.email).toBe('alice@example.com');
        expect(customer.kycStatus).toBe('not_started');
        expect(customer.bankAccountId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(customer.createdAt).toBeTruthy();
        expect(customer.updatedAt).toBeTruthy();
    });

    it('throws AnchorError with MISSING_PUBLIC_KEY when publicKey is missing', async () => {
        const client = createClient();

        await expect(
            client.createCustomer({ email: 'alice@example.com' }),
        ).rejects.toThrow(AnchorError);

        try {
            await client.createCustomer({ email: 'alice@example.com' });
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it('recovers existing customer on 409 conflict', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: 'Customer already exists, see org: e1a2b3c4-d5e6-7f89-0abc-def012345678',
                        },
                    },
                    { status: 409 },
                );
            }),
            http.post(`${BASE_URL}/ramp/customer/e1a2b3c4-d5e6-7f89-0abc-def012345678/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-acct-456',
                            customerId: 'e1a2b3c4-d5e6-7f89-0abc-def012345678',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '1067...8699',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: 'GABCDEF',
        });

        expect(customer.id).toBe('e1a2b3c4-d5e6-7f89-0abc-def012345678');
        expect(customer.email).toBe('alice@example.com');
        expect(customer.kycStatus).toBe('not_started');
        expect(customer.bankAccountId).toBe('bank-acct-456');
    });
});

// ---------------------------------------------------------------------------
// getCustomer
// ---------------------------------------------------------------------------

describe('getCustomer', () => {
    it('returns a mapped Customer on success', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1`, () => {
                return HttpResponse.json({
                    customerId: 'cust-1',
                    email: 'bob@example.com',
                    publicKey: 'GXYZ',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                });
            }),
        );

        const customer = await client.getCustomer('cust-1');

        expect(customer).not.toBeNull();
        expect(customer!.id).toBe('cust-1');
        expect(customer!.email).toBe('bob@example.com');
        expect(customer!.kycStatus).toBe('not_started');
        expect(customer!.createdAt).toBe('2025-06-01T00:00:00Z');
        expect(customer!.updatedAt).toBe('2025-06-02T00:00:00Z');
    });

    it('returns null on 404', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/not-found`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                    { status: 404 },
                );
            }),
        );

        const customer = await client.getCustomer('not-found');
        expect(customer).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------

describe('getQuote', () => {
    it('resolves asset identifiers and returns a mapped Quote', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return HttpResponse.json({
                    assets: [
                        {
                            symbol: 'CETES',
                            identifier: 'CETES:GCRYUGD5ISSUER',
                            name: 'CETES Token',
                            currency: null,
                            balance: null,
                            image: null,
                        },
                        {
                            symbol: 'MXN',
                            identifier: 'MXN',
                            name: 'Mexican Peso',
                            currency: 'MXN',
                            balance: null,
                            image: null,
                        },
                    ],
                });
            }),
            http.post(`${BASE_URL}/ramp/quote`, () => {
                return HttpResponse.json({
                    quoteId: 'quote-abc',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5ISSUER',
                    },
                    sourceAmount: '1000',
                    destinationAmount: '50',
                    destinationAmountAfterFee: '49.5',
                    exchangeRate: '0.05',
                    feeBps: '100',
                    feeAmount: '0.5',
                    expiresAt: '2025-07-01T00:00:00Z',
                    createdAt: '2025-06-30T00:00:00Z',
                    updatedAt: '2025-06-30T00:00:00Z',
                });
            }),
        );

        const quote = await client.getQuote({
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            fromAmount: '1000',
            customerId: 'cust-1',
            stellarAddress: 'GABCDEF',
        });

        expect(quote.id).toBe('quote-abc');
        expect(quote.fromCurrency).toBe('MXN');
        expect(quote.toCurrency).toBe('CETES:GCRYUGD5ISSUER');
        expect(quote.fromAmount).toBe('1000');
        expect(quote.toAmount).toBe('49.5');
        expect(quote.exchangeRate).toBe('0.05');
        expect(quote.fee).toBe('0.5');
        expect(quote.expiresAt).toBe('2025-07-01T00:00:00Z');
        expect(quote.createdAt).toBe('2025-06-30T00:00:00Z');
    });
});

// ---------------------------------------------------------------------------
// createOnRamp
// ---------------------------------------------------------------------------

describe('createOnRamp', () => {
    it('auto-fetches bankAccountId and returns OnRampTransaction with paymentInstructions', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-acct-auto',
                            customerId: 'cust-1',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, () => {
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-onramp-1',
                        depositClabe: '012345678901234567',
                        depositAmount: '1000.00',
                    },
                });
            }),
        );

        const tx = await client.createOnRamp({
            customerId: 'cust-1',
            quoteId: 'quote-1',
            stellarAddress: 'GABCDEF',
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '1000',
        });

        expect(tx.id).toBe('order-onramp-1');
        expect(tx.customerId).toBe('cust-1');
        expect(tx.quoteId).toBe('quote-1');
        expect(tx.status).toBe('pending');
        expect(tx.fromAmount).toBe('1000');
        expect(tx.fromCurrency).toBe('MXN');
        expect(tx.toCurrency).toBe('CETES');
        expect(tx.stellarAddress).toBe('GABCDEF');
        expect(tx.paymentInstructions).toEqual({
            type: 'spei',
            clabe: '012345678901234567',
            amount: '1000.00',
            currency: 'MXN',
        });
        expect(tx.createdAt).toBeTruthy();
        expect(tx.updatedAt).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// getOnRampTransaction
// ---------------------------------------------------------------------------

describe('getOnRampTransaction', () => {
    it('maps EtherfuseOrderResponse to OnRampTransaction', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-1`, () => {
                return HttpResponse.json({
                    orderId: 'order-1',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '50',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    depositClabe: '012345678901234567',
                    orderType: 'onramp',
                    status: 'funded',
                    statusPage: 'https://status.test/order-1',
                    feeBps: 20,
                    feeAmountInFiat: '2.00',
                });
            }),
        );

        const tx = await client.getOnRampTransaction('order-1');

        expect(tx).not.toBeNull();
        expect(tx!.id).toBe('order-1');
        expect(tx!.customerId).toBe('cust-1');
        expect(tx!.status).toBe('processing'); // 'funded' maps to 'processing'
        expect(tx!.fromAmount).toBe('1000');
        expect(tx!.toAmount).toBe('50');
        expect(tx!.feeBps).toBe(20);
        expect(tx!.feeAmount).toBe('2.00');
        expect(tx!.paymentInstructions).toEqual({
            type: 'spei',
            clabe: '012345678901234567',
            amount: '1000',
            currency: '',
        });
        expect(tx!.createdAt).toBe('2025-06-01T00:00:00Z');
        expect(tx!.updatedAt).toBe('2025-06-02T00:00:00Z');
    });

    it('returns null on 404', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/missing`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Order not found' } },
                    { status: 404 },
                );
            }),
        );

        const tx = await client.getOnRampTransaction('missing');
        expect(tx).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// registerFiatAccount
// ---------------------------------------------------------------------------

describe('registerFiatAccount', () => {
    it('returns a RegisteredFiatAccount', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/bank-account`, () => {
                return HttpResponse.json({
                    bankAccountId: 'bank-new-1',
                    customerId: 'cust-1',
                    status: 'active',
                    createdAt: '2025-07-01T00:00:00Z',
                });
            }),
        );

        const result = await client.registerFiatAccount({
            customerId: 'cust-1',
            account: {
                type: 'spei',
                clabe: '012345678901234567',
                beneficiary: 'Alice Garcia',
                bankName: 'BBVA',
            },
        });

        expect(result.id).toBe('bank-new-1');
        expect(result.customerId).toBe('cust-1');
        expect(result.type).toBe('SPEI');
        expect(result.status).toBe('active');
        expect(result.createdAt).toBe('2025-07-01T00:00:00Z');
    });
});

// ---------------------------------------------------------------------------
// getFiatAccounts
// ---------------------------------------------------------------------------

describe('getFiatAccounts', () => {
    it('returns mapped SavedFiatAccount[]', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-1',
                            customerId: 'cust-1',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-02T00:00:00Z',
                            abbrClabe: '1067...8699',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                        {
                            bankAccountId: 'bank-2',
                            customerId: 'cust-1',
                            createdAt: '2025-02-01T00:00:00Z',
                            updatedAt: '2025-02-02T00:00:00Z',
                            abbrClabe: '2345...6789',
                            etherfuseDepositClabe: '112345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 2,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
        );

        const accounts = await client.getFiatAccounts('cust-1');

        expect(accounts).toHaveLength(2);
        expect(accounts[0].id).toBe('bank-1');
        expect(accounts[0].type).toBe('SPEI');
        expect(accounts[0].accountNumber).toBe('1067...8699');
        expect(accounts[0].createdAt).toBe('2025-01-01T00:00:00Z');
        expect(accounts[1].id).toBe('bank-2');
    });

    it('returns empty array on 404', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/no-accounts/bank-accounts`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                    { status: 404 },
                );
            }),
        );

        const accounts = await client.getFiatAccounts('no-accounts');
        expect(accounts).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// createOffRamp
// ---------------------------------------------------------------------------

describe('createOffRamp', () => {
    it('auto-fetches bankAccountId and returns OffRampTransaction with signableTransaction undefined', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-off-1',
                            customerId: 'cust-1',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '9876...5432',
                            etherfuseDepositClabe: '987654321098765432',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, () => {
                return HttpResponse.json({
                    offramp: {
                        orderId: 'order-offramp-1',
                    },
                });
            }),
        );

        const tx = await client.createOffRamp({
            customerId: 'cust-1',
            quoteId: 'quote-off-1',
            stellarAddress: 'GABCDEF',
            fromCurrency: 'CETES',
            toCurrency: 'MXN',
            amount: '50',
            fiatAccountId: '', // empty to trigger auto-fetch
        });

        expect(tx.id).toBe('order-offramp-1');
        expect(tx.customerId).toBe('cust-1');
        expect(tx.quoteId).toBe('quote-off-1');
        expect(tx.status).toBe('pending');
        expect(tx.fromAmount).toBe('50');
        expect(tx.fromCurrency).toBe('CETES');
        expect(tx.toCurrency).toBe('MXN');
        expect(tx.stellarAddress).toBe('GABCDEF');
        expect(tx.signableTransaction).toBeUndefined();
        expect(tx.fiatAccount).toEqual({
            id: 'bank-off-1',
            type: 'spei',
            label: 'Bank Account',
        });
        expect(tx.createdAt).toBeTruthy();
        expect(tx.updatedAt).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// getOffRampTransaction
// ---------------------------------------------------------------------------

describe('getOffRampTransaction', () => {
    it('maps burnTransaction to signableTransaction', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-off-1`, () => {
                return HttpResponse.json({
                    orderId: 'order-off-1',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '50',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    burnTransaction: 'XDR_BASE64',
                    orderType: 'offramp',
                    status: 'created',
                    statusPage: 'https://status.test/order-off-1',
                    feeBps: 20,
                    feeAmountInFiat: '2.00',
                });
            }),
        );

        const tx = await client.getOffRampTransaction('order-off-1');

        expect(tx).not.toBeNull();
        expect(tx!.id).toBe('order-off-1');
        expect(tx!.signableTransaction).toBe('XDR_BASE64');
        expect(tx!.status).toBe('pending'); // 'created' maps to 'pending'
        expect(tx!.fromAmount).toBe('50');
        expect(tx!.toAmount).toBe('1000');
        expect(tx!.statusPage).toBe('https://status.test/order-off-1');
        expect(tx!.fiatAccount).toEqual({
            id: 'bank-1',
            type: 'spei',
            label: 'Bank Account',
        });
    });

    it('returns null on 404', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/missing-off`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Order not found' } },
                    { status: 404 },
                );
            }),
        );

        const tx = await client.getOffRampTransaction('missing-off');
        expect(tx).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getKycUrl
// ---------------------------------------------------------------------------

describe('getKycUrl', () => {
    it('throws AnchorError when publicKey is missing', async () => {
        const client = createClient();

        try {
            await client.getKycUrl!('cust-1');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it('returns presigned URL on success', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json({
                    presigned_url: 'https://onboard.test/kyc-session-xyz',
                });
            }),
        );

        const url = await client.getKycUrl!('cust-1', 'GABCDEF', 'bank-1');
        expect(url).toBe('https://onboard.test/kyc-session-xyz');
    });
});

// ---------------------------------------------------------------------------
// getKycStatus
// ---------------------------------------------------------------------------

describe('getKycStatus', () => {
    it('throws AnchorError when publicKey is missing', async () => {
        const client = createClient();

        try {
            await client.getKycStatus('cust-1');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it.each([
        ['not_started', 'not_started'],
        ['proposed', 'pending'],
        ['approved', 'approved'],
        ['rejected', 'rejected'],
    ] as const)('maps Etherfuse status "%s" to "%s"', async (etherfuseStatus, expectedStatus) => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1/kyc/GABCDEF`, () => {
                return HttpResponse.json({
                    customerId: 'cust-1',
                    publicKey: 'GABCDEF',
                    status: etherfuseStatus,
                    updatedAt: '2025-06-01T00:00:00Z',
                });
            }),
        );

        const status = await client.getKycStatus('cust-1', 'GABCDEF');
        expect(status).toBe(expectedStatus);
    });
});

// ---------------------------------------------------------------------------
// request error handling
// ---------------------------------------------------------------------------

describe('request error handling', () => {
    it('parses JSON error body into AnchorError', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-json`, () => {
                return HttpResponse.json(
                    { error: { code: 'BAD_REQUEST', message: 'bad' } },
                    { status: 400 },
                );
            }),
        );

        try {
            await client.getCustomer('err-json');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('BAD_REQUEST');
            expect(anchorErr.message).toBe('bad');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it('handles non-JSON error body', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-text`, () => {
                return new HttpResponse('Internal Server Error', { status: 500 });
            }),
        );

        try {
            await client.getCustomer('err-text');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.message).toBe('Internal Server Error');
            expect(anchorErr.code).toBe('UNKNOWN_ERROR');
            expect(anchorErr.statusCode).toBe(500);
        }
    });
});
