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

// ---------------------------------------------------------------------------
// request() edge cases
// ---------------------------------------------------------------------------

describe('request() edge cases', () => {
    it('returns undefined for 200 response with empty body', async () => {
        const client = createClient();

        // Use getAssets() because it directly returns the request() result
        // without accessing properties on it, so we can verify the empty body
        // handling in isolation.
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return new HttpResponse('', { status: 200 });
            }),
        );

        const result = await client.getAssets('stellar', 'mxn');
        expect(result).toBeUndefined();
    });

    it('falls back to status code message when error body fields are all empty', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-empty-fields`, () => {
                return HttpResponse.json(
                    { error: { code: '', message: '' } },
                    { status: 422 },
                );
            }),
        );

        try {
            await client.getCustomer('err-empty-fields');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            // message is empty string, errorText is the JSON string, so falls through to errorText
            expect(anchorErr.message).toBe('{"error":{"code":"","message":""}}');
            expect(anchorErr.code).toBe('UNKNOWN_ERROR'); // empty code falls back
            expect(anchorErr.statusCode).toBe(422);
        }
    });

    it('falls back to UNKNOWN_ERROR when error response has missing error.code', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-no-code`, () => {
                return HttpResponse.json(
                    { error: { message: 'Something went wrong' } },
                    { status: 400 },
                );
            }),
        );

        try {
            await client.getCustomer('err-no-code');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.message).toBe('Something went wrong');
            expect(anchorErr.code).toBe('UNKNOWN_ERROR');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it('handles error response where error field is null via optional chaining fallbacks', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-null-error`, () => {
                return HttpResponse.json(
                    { error: null },
                    { status: 500 },
                );
            }),
        );

        try {
            await client.getCustomer('err-null-error');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            // error?.message is undefined, errorText is '{"error":null}', so message falls through to errorText
            expect(anchorErr.message).toBe('{"error":null}');
            expect(anchorErr.code).toBe('UNKNOWN_ERROR'); // error?.code is undefined
            expect(anchorErr.statusCode).toBe(500);
        }
    });
});

// ---------------------------------------------------------------------------
// createCustomer() 409 recovery edge cases
// ---------------------------------------------------------------------------

describe('createCustomer() 409 recovery edge cases', () => {
    it('re-throws original error when 409 message does not match regex pattern', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: 'Duplicate entry without any org reference',
                        },
                    },
                    { status: 409 },
                );
            }),
        );

        try {
            await client.createCustomer({
                email: 'alice@example.com',
                publicKey: 'GABCDEF',
            });
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.statusCode).toBe(409);
            expect(anchorErr.message).toBe('Duplicate entry without any org reference');
        }
    });

    it('continues with undefined bankAccountId when getFiatAccounts() throws during 409 recovery', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: 'Customer already exists, see org: aaa-bbb-ccc-ddd-eee',
                        },
                    },
                    { status: 409 },
                );
            }),
            http.post(`${BASE_URL}/ramp/customer/aaa-bbb-ccc-ddd-eee/bank-accounts`, () => {
                return HttpResponse.json(
                    { error: { code: 'INTERNAL_ERROR', message: 'DB failure' } },
                    { status: 500 },
                );
            }),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: 'GABCDEF',
        });

        expect(customer.id).toBe('aaa-bbb-ccc-ddd-eee');
        expect(customer.email).toBe('alice@example.com');
        expect(customer.bankAccountId).toBeUndefined();
    });

    it('sets bankAccountId to undefined when 409 recovery returns empty accounts array', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: 'Customer already exists, see org: aaa-bbb-ccc-ddd-eee',
                        },
                    },
                    { status: 409 },
                );
            }),
            http.post(`${BASE_URL}/ramp/customer/aaa-bbb-ccc-ddd-eee/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 0,
                });
            }),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: 'GABCDEF',
        });

        expect(customer.id).toBe('aaa-bbb-ccc-ddd-eee');
        expect(customer.bankAccountId).toBeUndefined();
    });

    it('re-throws non-409 AnchorError (e.g. 400)', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.json(
                    {
                        error: {
                            code: 'BAD_REQUEST',
                            message: 'Invalid email format',
                        },
                    },
                    { status: 400 },
                );
            }),
        );

        try {
            await client.createCustomer({
                email: 'invalid',
                publicKey: 'GABCDEF',
            });
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.statusCode).toBe(400);
            expect(anchorErr.code).toBe('BAD_REQUEST');
            expect(anchorErr.message).toBe('Invalid email format');
        }
    });

    it('re-throws non-AnchorError exceptions', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () => {
                return HttpResponse.error();
            }),
        );

        await expect(
            client.createCustomer({
                email: 'alice@example.com',
                publicKey: 'GABCDEF',
            }),
        ).rejects.toThrow();

        // Verify it's NOT an AnchorError (it's a fetch TypeError)
        try {
            await client.createCustomer({
                email: 'alice@example.com',
                publicKey: 'GABCDEF',
            });
        } catch (err) {
            expect(err).not.toBeInstanceOf(AnchorError);
        }
    });
});

// ---------------------------------------------------------------------------
// mapOrderStatus() unknown status
// ---------------------------------------------------------------------------

describe('mapOrderStatus() unknown status', () => {
    it('falls back to pending for unknown/unmapped status string', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-unknown-status`, () => {
                return HttpResponse.json({
                    orderId: 'order-unknown-status',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '50',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    orderType: 'onramp',
                    status: 'some_unknown_status',
                    statusPage: 'https://status.test/order',
                });
            }),
        );

        const tx = await client.getOnRampTransaction('order-unknown-status');
        expect(tx).not.toBeNull();
        expect(tx!.status).toBe('pending');
    });
});

// ---------------------------------------------------------------------------
// mapKycStatus() unknown status
// ---------------------------------------------------------------------------

describe('mapKycStatus() unknown status', () => {
    it('falls back to not_started for unknown/unmapped KYC status', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1/kyc/GABCDEF`, () => {
                return HttpResponse.json({
                    customerId: 'cust-1',
                    publicKey: 'GABCDEF',
                    status: 'some_weird_status',
                    updatedAt: '2025-06-01T00:00:00Z',
                });
            }),
        );

        const status = await client.getKycStatus('cust-1', 'GABCDEF');
        expect(status).toBe('not_started');
    });
});

// ---------------------------------------------------------------------------
// mapOnRampTransaction() edge cases
// ---------------------------------------------------------------------------

describe('mapOnRampTransaction() edge cases', () => {
    it('returns undefined paymentInstructions when depositClabe is missing', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-no-clabe`, () => {
                return HttpResponse.json({
                    orderId: 'order-no-clabe',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '50',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    orderType: 'onramp',
                    status: 'created',
                    statusPage: 'https://status.test/order',
                });
            }),
        );

        const tx = await client.getOnRampTransaction('order-no-clabe');
        expect(tx).not.toBeNull();
        expect(tx!.paymentInstructions).toBeUndefined();
    });

    it('uses empty string fallbacks for missing optional fields (amountInFiat, amountInTokens)', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-no-amounts`, () => {
                return HttpResponse.json({
                    orderId: 'order-no-amounts',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    orderType: 'onramp',
                    status: 'created',
                    statusPage: 'https://status.test/order',
                    // amountInFiat and amountInTokens are intentionally absent
                });
            }),
        );

        const tx = await client.getOnRampTransaction('order-no-amounts');
        expect(tx).not.toBeNull();
        expect(tx!.fromAmount).toBe(''); // amountInFiat || ''
        expect(tx!.toAmount).toBe('');   // amountInTokens || ''
        expect(tx!.feeBps).toBeUndefined();
        expect(tx!.feeAmount).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// mapOffRampTransaction() edge cases
// ---------------------------------------------------------------------------

describe('mapOffRampTransaction() edge cases', () => {
    it('returns undefined fiatAccount when bankAccountId is missing', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-no-bank`, () => {
                return HttpResponse.json({
                    orderId: 'order-no-bank',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '50',
                    walletId: 'wallet-1',
                    bankAccountId: '',
                    orderType: 'offramp',
                    status: 'created',
                    statusPage: 'https://status.test/order-no-bank',
                });
            }),
        );

        const tx = await client.getOffRampTransaction('order-no-bank');
        expect(tx).not.toBeNull();
        expect(tx!.fiatAccount).toBeUndefined(); // empty string is falsy
    });

    it('populates signableTransaction when burnTransaction is present', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-with-burn`, () => {
                return HttpResponse.json({
                    orderId: 'order-with-burn',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '500',
                    amountInTokens: '25',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    burnTransaction: 'AAAA...XDR_BASE64_ENVELOPE...ZZZZ',
                    orderType: 'offramp',
                    status: 'funded',
                    statusPage: 'https://status.test/order-with-burn',
                    feeBps: 15,
                    feeAmountInFiat: '1.50',
                });
            }),
        );

        const tx = await client.getOffRampTransaction('order-with-burn');
        expect(tx).not.toBeNull();
        expect(tx!.signableTransaction).toBe('AAAA...XDR_BASE64_ENVELOPE...ZZZZ');
        expect(tx!.status).toBe('processing'); // funded -> processing
        expect(tx!.fiatAccount).toEqual({
            id: 'bank-1',
            type: 'spei',
            label: 'Bank Account',
        });
    });

    it('returns undefined signableTransaction when burnTransaction is absent', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/order/order-no-burn`, () => {
                return HttpResponse.json({
                    orderId: 'order-no-burn',
                    customerId: 'cust-1',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                    amountInFiat: '500',
                    amountInTokens: '25',
                    walletId: 'wallet-1',
                    bankAccountId: 'bank-1',
                    orderType: 'offramp',
                    status: 'created',
                    statusPage: 'https://status.test/order-no-burn',
                });
            }),
        );

        const tx = await client.getOffRampTransaction('order-no-burn');
        expect(tx).not.toBeNull();
        expect(tx!.signableTransaction).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getQuote() edge cases
// ---------------------------------------------------------------------------

describe('getQuote() edge cases', () => {
    it('sends empty string when both fromAmount and toAmount are undefined', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return HttpResponse.json({
                    assets: [
                        { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES Token', currency: null, balance: null, image: null },
                        { symbol: 'MXN', identifier: 'MXN', name: 'Mexican Peso', currency: 'MXN', balance: null, image: null },
                    ],
                });
            }),
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                capturedBody = await request.json() as Record<string, unknown>;
                return HttpResponse.json({
                    quoteId: 'quote-empty-amt',
                    customerId: '',
                    blockchain: 'stellar',
                    quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                    sourceAmount: '0',
                    destinationAmount: '0',
                    destinationAmountAfterFee: null,
                    exchangeRate: '0.05',
                    feeBps: null,
                    feeAmount: null,
                    expiresAt: '2025-07-01T00:00:00Z',
                    createdAt: '2025-06-30T00:00:00Z',
                    updatedAt: '2025-06-30T00:00:00Z',
                });
            }),
        );

        const quote = await client.getQuote({
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            // Both fromAmount and toAmount intentionally omitted
            stellarAddress: 'GABCDEF',
        });

        expect(capturedBody).toBeDefined();
        expect(capturedBody!.sourceAmount).toBe('');
        expect(quote.id).toBe('quote-empty-amt');
    });

    it('falls back to destinationAmount when destinationAmountAfterFee is null', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return HttpResponse.json({
                    assets: [
                        { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES Token', currency: null, balance: null, image: null },
                        { symbol: 'MXN', identifier: 'MXN', name: 'Mexican Peso', currency: 'MXN', balance: null, image: null },
                    ],
                });
            }),
            http.post(`${BASE_URL}/ramp/quote`, () => {
                return HttpResponse.json({
                    quoteId: 'quote-no-after-fee',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                    sourceAmount: '1000',
                    destinationAmount: '50',
                    destinationAmountAfterFee: null,
                    exchangeRate: '0.05',
                    feeBps: '100',
                    feeAmount: null,
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

        expect(quote.toAmount).toBe('50'); // falls back to destinationAmount
    });

    it('defaults fee to 0 when feeAmount is null', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return HttpResponse.json({
                    assets: [
                        { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES Token', currency: null, balance: null, image: null },
                        { symbol: 'MXN', identifier: 'MXN', name: 'Mexican Peso', currency: 'MXN', balance: null, image: null },
                    ],
                });
            }),
            http.post(`${BASE_URL}/ramp/quote`, () => {
                return HttpResponse.json({
                    quoteId: 'quote-no-fee',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                    sourceAmount: '1000',
                    destinationAmount: '50',
                    destinationAmountAfterFee: '50',
                    exchangeRate: '0.05',
                    feeBps: null,
                    feeAmount: null,
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

        expect(quote.fee).toBe('0');
    });

    it('skips asset lookup when both currencies already contain colon (fast path)', async () => {
        const client = createClient();
        let assetsRequested = false;

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                assetsRequested = true;
                return HttpResponse.json({ assets: [] });
            }),
            http.post(`${BASE_URL}/ramp/quote`, () => {
                return HttpResponse.json({
                    quoteId: 'quote-fast-path',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: { type: 'offramp', sourceAsset: 'CETES:GCRYUGD5ISSUER', targetAsset: 'MXN:FIAT' },
                    sourceAmount: '50',
                    destinationAmount: '1000',
                    destinationAmountAfterFee: '990',
                    exchangeRate: '20',
                    feeBps: '50',
                    feeAmount: '10',
                    expiresAt: '2025-07-01T00:00:00Z',
                    createdAt: '2025-06-30T00:00:00Z',
                    updatedAt: '2025-06-30T00:00:00Z',
                });
            }),
        );

        const quote = await client.getQuote({
            fromCurrency: 'CETES:GCRYUGD5ISSUER',
            toCurrency: 'MXN:FIAT',
            fromAmount: '50',
            customerId: 'cust-1',
            stellarAddress: 'GABCDEF',
        });

        expect(assetsRequested).toBe(false); // should NOT call /ramp/assets
        expect(quote.id).toBe('quote-fast-path');
        expect(quote.fromCurrency).toBe('CETES:GCRYUGD5ISSUER');
        expect(quote.toCurrency).toBe('MXN:FIAT');
    });
});

// ---------------------------------------------------------------------------
// createOnRamp() edge cases
// ---------------------------------------------------------------------------

describe('createOnRamp() edge cases', () => {
    it('proceeds with undefined bankAccountId when auto-fetch returns empty array', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-empty-banks/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 0,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = await request.json() as Record<string, unknown>;
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-no-bank-auto',
                        depositClabe: '012345678901234567',
                        depositAmount: '500.00',
                    },
                });
            }),
        );

        const tx = await client.createOnRamp({
            customerId: 'cust-empty-banks',
            quoteId: 'quote-1',
            stellarAddress: 'GABCDEF',
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '500',
        });

        expect(tx.id).toBe('order-no-bank-auto');
        expect(capturedBody).toBeDefined();
        expect(capturedBody!.bankAccountId).toBeUndefined();
    });

    it('does not auto-fetch bank accounts when no customerId provided', async () => {
        const client = createClient();
        let bankAccountsRequested = false;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/:customerId/bank-accounts`, () => {
                bankAccountsRequested = true;
                return HttpResponse.json({ items: [], totalItems: 0, pageSize: 10, pageNumber: 0, totalPages: 0 });
            }),
            http.post(`${BASE_URL}/ramp/order`, () => {
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-no-cust',
                        depositClabe: '012345678901234567',
                        depositAmount: '500.00',
                    },
                });
            }),
        );

        const tx = await client.createOnRamp({
            customerId: '',
            quoteId: 'quote-1',
            stellarAddress: 'GABCDEF',
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '500',
        });

        expect(tx.id).toBe('order-no-cust');
        expect(bankAccountsRequested).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getFiatAccounts() edge cases
// ---------------------------------------------------------------------------

describe('getFiatAccounts() edge cases', () => {
    it('returns empty array for successful response with empty items', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-no-items/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 0,
                });
            }),
        );

        const accounts = await client.getFiatAccounts('cust-no-items');
        expect(accounts).toEqual([]);
        expect(accounts).toHaveLength(0);
    });

    it('re-throws non-404 errors', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-500/bank-accounts`, () => {
                return HttpResponse.json(
                    { error: { code: 'INTERNAL_ERROR', message: 'Database error' } },
                    { status: 500 },
                );
            }),
        );

        try {
            await client.getFiatAccounts('cust-500');
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.statusCode).toBe(500);
            expect(anchorErr.code).toBe('INTERNAL_ERROR');
            expect(anchorErr.message).toBe('Database error');
        }
    });
});

// ---------------------------------------------------------------------------
// getKycUrl() edge cases
// ---------------------------------------------------------------------------

describe('getKycUrl() edge cases', () => {
    it('generates a random UUID for bankAccountId when none is provided', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                capturedBody = await request.json() as Record<string, unknown>;
                return HttpResponse.json({
                    presigned_url: 'https://onboard.test/kyc-no-bank',
                });
            }),
        );

        const url = await client.getKycUrl!('cust-1', 'GABCDEF');
        expect(url).toBe('https://onboard.test/kyc-no-bank');
        expect(capturedBody).toBeDefined();
        // bankAccountId should be a valid UUID (auto-generated)
        expect(capturedBody!.bankAccountId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(capturedBody!.customerId).toBe('cust-1');
        expect(capturedBody!.publicKey).toBe('GABCDEF');
    });
});

// ---------------------------------------------------------------------------
// acceptAgreements()
// ---------------------------------------------------------------------------

describe('acceptAgreements()', () => {
    it('happy path: posts to presigned URL and returns parsed JSON', async () => {
        const client = createClient();
        const presignedUrl = `${BASE_URL}/onboarding/presigned-abc`;

        server.use(
            http.post(presignedUrl, () => {
                return HttpResponse.json({ success: true, agreements: ['tos', 'privacy'] });
            }),
        );

        const result = await client.acceptAgreements(presignedUrl);
        expect(result).toEqual({ success: true, agreements: ['tos', 'privacy'] });
    });

    it('throws AnchorError with AGREEMENT_ERROR on failure', async () => {
        const client = createClient();
        const presignedUrl = `${BASE_URL}/onboarding/presigned-fail`;

        server.use(
            http.post(presignedUrl, () => {
                return new HttpResponse('Agreement expired', { status: 410 });
            }),
        );

        try {
            await client.acceptAgreements(presignedUrl);
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('AGREEMENT_ERROR');
            expect(anchorErr.statusCode).toBe(410);
            expect(anchorErr.message).toBe('Agreement expired');
        }
    });

    it('falls back to status code message when error body is empty', async () => {
        const client = createClient();
        const presignedUrl = `${BASE_URL}/onboarding/presigned-empty`;

        server.use(
            http.post(presignedUrl, () => {
                return new HttpResponse('', { status: 403 });
            }),
        );

        try {
            await client.acceptAgreements(presignedUrl);
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('AGREEMENT_ERROR');
            expect(anchorErr.statusCode).toBe(403);
            expect(anchorErr.message).toBe('Etherfuse API error: 403');
        }
    });
});

// ---------------------------------------------------------------------------
// simulateFiatReceived()
// ---------------------------------------------------------------------------

describe('simulateFiatReceived()', () => {
    it('happy path: returns 200 status code', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/order/fiat_received`, () => {
                return HttpResponse.json({ success: true });
            }),
        );

        const statusCode = await client.simulateFiatReceived('order-sim-1');
        expect(statusCode).toBe(200);
    });

    it('returns non-200 status code on error without throwing', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/order/fiat_received`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Order not found' } },
                    { status: 404 },
                );
            }),
        );

        const statusCode = await client.simulateFiatReceived('order-missing');
        expect(statusCode).toBe(404);
    });

    it('returns 400 status code for bad request', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/order/fiat_received`, () => {
                return HttpResponse.json(
                    { error: { code: 'BAD_REQUEST', message: 'Invalid order state' } },
                    { status: 400 },
                );
            }),
        );

        const statusCode = await client.simulateFiatReceived('order-bad');
        expect(statusCode).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// getAssets()
// ---------------------------------------------------------------------------

describe('getAssets()', () => {
    it('happy path: returns assets list', async () => {
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
                            balance: '100',
                            image: 'https://img.test/cetes.png',
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
        );

        const result = await client.getAssets('stellar', 'mxn', 'GABCDEF');
        expect(result.assets).toHaveLength(2);
        expect(result.assets[0].symbol).toBe('CETES');
        expect(result.assets[0].identifier).toBe('CETES:GCRYUGD5ISSUER');
        expect(result.assets[0].balance).toBe('100');
        expect(result.assets[1].symbol).toBe('MXN');
        expect(result.assets[1].currency).toBe('MXN');
    });

    it('returns empty assets array', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                return HttpResponse.json({ assets: [] });
            }),
        );

        const result = await client.getAssets();
        expect(result.assets).toEqual([]);
        expect(result.assets).toHaveLength(0);
    });

    it('builds query params correctly when all parameters are provided', async () => {
        const client = createClient();
        let capturedUrl = '';

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ assets: [] });
            }),
        );

        await client.getAssets('stellar', 'mxn', 'GABCDEF');
        const url = new URL(capturedUrl);
        expect(url.searchParams.get('blockchain')).toBe('stellar');
        expect(url.searchParams.get('currency')).toBe('mxn');
        expect(url.searchParams.get('wallet')).toBe('GABCDEF');
    });

    it('omits query params when no arguments are given', async () => {
        const client = createClient();
        let capturedUrl = '';

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ assets: [] });
            }),
        );

        await client.getAssets();
        const url = new URL(capturedUrl);
        expect(url.search).toBe('');
    });
});

// ---------------------------------------------------------------------------
// input validation behavior
// ---------------------------------------------------------------------------

describe('input validation behavior', () => {
    // -----------------------------------------------------------------
    // createCustomer input validation
    // -----------------------------------------------------------------
    describe('createCustomer input validation', () => {
        it('throws MISSING_PUBLIC_KEY when publicKey is empty string', async () => {
            const client = createClient();

            try {
                await client.createCustomer({ email: 'alice@example.com', publicKey: '' });
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('passes email to API without local validation when email is empty string', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            const customer = await client.createCustomer({ email: '', publicKey: 'GABCDEF' });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.email).toBe('');
            expect(customer.email).toBe('');
        });

        it('passes email to API without local validation when email is invalid format', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            const customer = await client.createCustomer({
                email: 'not-an-email',
                publicKey: 'GABCDEF',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.email).toBe('not-an-email');
            expect(customer.email).toBe('not-an-email');
        });

        it('passes email to API without validation when email is undefined', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            // @ts-expect-error testing undefined email
            const customer = await client.createCustomer({ publicKey: 'GABCDEF' });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.email).toBeUndefined();
            expect(customer.email).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // getCustomer input validation
    // -----------------------------------------------------------------
    describe('getCustomer input validation', () => {
        it('sends request with empty string ID in URL path', async () => {
            const client = createClient();
            let capturedUrl = '';

            server.use(
                http.get(/\/ramp\/customer\//, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json({
                        customerId: '',
                        email: 'test@example.com',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            await client.getCustomer('');
            expect(capturedUrl).toContain('/ramp/customer/');
        });

        it('sends request with whitespace-only ID (whitespace is passed through)', async () => {
            const client = createClient();
            let capturedUrl = '';

            server.use(
                http.get(new RegExp(`${BASE_URL}/ramp/customer/`), ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json({
                        customerId: '   ',
                        email: 'test@example.com',
                        createdAt: '2025-01-01T00:00:00Z',
                        updatedAt: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            await client.getCustomer('   ');
            // Whitespace-only ID is interpolated into the URL path without validation
            expect(capturedUrl).toContain('/ramp/customer/');
        });
    });

    // -----------------------------------------------------------------
    // getQuote input validation
    // -----------------------------------------------------------------
    describe('getQuote input validation', () => {
        it('sends empty sourceAmount when fromAmount is undefined and toAmount is undefined', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, () => {
                    return HttpResponse.json({
                        assets: [
                            { symbol: 'MXN', identifier: 'MXN', name: 'MXN', currency: 'MXN', balance: null, image: null },
                            { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES', currency: null, balance: null, image: null },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                        sourceAmount: '',
                        destinationAmount: '0',
                        destinationAmountAfterFee: '0',
                        exchangeRate: '0',
                        feeAmount: '0',
                        expiresAt: '2025-07-01T00:00:00Z',
                        createdAt: '2025-06-30T00:00:00Z',
                        updatedAt: '2025-06-30T00:00:00Z',
                    });
                }),
            );

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                stellarAddress: 'GABCDEF',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.sourceAmount).toBe('');
        });

        it('converts non-numeric fromAmount to string without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, () => {
                    return HttpResponse.json({
                        assets: [
                            { symbol: 'MXN', identifier: 'MXN', name: 'MXN', currency: 'MXN', balance: null, image: null },
                            { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES', currency: null, balance: null, image: null },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                        sourceAmount: 'abc',
                        destinationAmount: '0',
                        destinationAmountAfterFee: '0',
                        exchangeRate: '0',
                        feeAmount: '0',
                        expiresAt: '2025-07-01T00:00:00Z',
                        createdAt: '2025-06-30T00:00:00Z',
                        updatedAt: '2025-06-30T00:00:00Z',
                    });
                }),
            );

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                fromAmount: 'abc',
                stellarAddress: 'GABCDEF',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.sourceAmount).toBe('abc');
        });

        it('sends zero fromAmount as sourceAmount "0" (string "0" is truthy in JS)', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, () => {
                    return HttpResponse.json({
                        assets: [
                            { symbol: 'MXN', identifier: 'MXN', name: 'MXN', currency: 'MXN', balance: null, image: null },
                            { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES', currency: null, balance: null, image: null },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                        sourceAmount: '0',
                        destinationAmount: '0',
                        destinationAmountAfterFee: '0',
                        exchangeRate: '0',
                        feeAmount: '0',
                        expiresAt: '2025-07-01T00:00:00Z',
                        createdAt: '2025-06-30T00:00:00Z',
                        updatedAt: '2025-06-30T00:00:00Z',
                    });
                }),
            );

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                fromAmount: '0',
                stellarAddress: 'GABCDEF',
            });

            expect(capturedBody).not.toBeNull();
            // String('0' || '') evaluates to String('0') which is '0', because "0" is a truthy string
            expect(capturedBody!.sourceAmount).toBe('0');
        });

        it('sends negative amount without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, () => {
                    return HttpResponse.json({
                        assets: [
                            { symbol: 'MXN', identifier: 'MXN', name: 'MXN', currency: 'MXN', balance: null, image: null },
                            { symbol: 'CETES', identifier: 'CETES:GCRYUGD5ISSUER', name: 'CETES', currency: null, balance: null, image: null },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: { type: 'onramp', sourceAsset: 'MXN', targetAsset: 'CETES:GCRYUGD5ISSUER' },
                        sourceAmount: '-100',
                        destinationAmount: '0',
                        destinationAmountAfterFee: '0',
                        exchangeRate: '0',
                        feeAmount: '0',
                        expiresAt: '2025-07-01T00:00:00Z',
                        createdAt: '2025-06-30T00:00:00Z',
                        updatedAt: '2025-06-30T00:00:00Z',
                    });
                }),
            );

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                fromAmount: '-100',
                stellarAddress: 'GABCDEF',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.sourceAmount).toBe('-100');
        });
    });

    // -----------------------------------------------------------------
    // createOnRamp input validation
    // -----------------------------------------------------------------
    describe('createOnRamp input validation', () => {
        it('passes empty stellarAddress as publicKey without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [{ bankAccountId: 'bank-1', customerId: 'cust-1', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', abbrClabe: '1234...5678', etherfuseDepositClabe: '012345678901234567', compliant: true, status: 'active' }],
                        totalItems: 1, pageSize: 10, pageNumber: 0, totalPages: 1,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: { orderId: 'order-1', depositClabe: '012345678901234567', depositAmount: '1000.00' },
                    });
                }),
            );

            await client.createOnRamp({
                customerId: 'cust-1',
                quoteId: 'quote-1',
                stellarAddress: '',
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                amount: '1000',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.publicKey).toBe('');
        });

        it('passes non-numeric amount to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [{ bankAccountId: 'bank-1', customerId: 'cust-1', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', abbrClabe: '1234...5678', etherfuseDepositClabe: '012345678901234567', compliant: true, status: 'active' }],
                        totalItems: 1, pageSize: 10, pageNumber: 0, totalPages: 1,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: { orderId: 'order-1', depositClabe: '012345678901234567', depositAmount: 'not-a-number' },
                    });
                }),
            );

            const tx = await client.createOnRamp({
                customerId: 'cust-1',
                quoteId: 'quote-1',
                stellarAddress: 'GABCDEF',
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                amount: 'not-a-number',
            });

            expect(capturedBody).not.toBeNull();
            expect(tx.fromAmount).toBe('not-a-number');
        });

        it('passes empty quoteId to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [{ bankAccountId: 'bank-1', customerId: 'cust-1', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', abbrClabe: '1234...5678', etherfuseDepositClabe: '012345678901234567', compliant: true, status: 'active' }],
                        totalItems: 1, pageSize: 10, pageNumber: 0, totalPages: 1,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: { orderId: 'order-1', depositClabe: '012345678901234567', depositAmount: '1000.00' },
                    });
                }),
            );

            await client.createOnRamp({
                customerId: 'cust-1',
                quoteId: '',
                stellarAddress: 'GABCDEF',
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                amount: '1000',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.quoteId).toBe('');
        });
    });

    // -----------------------------------------------------------------
    // createOffRamp input validation
    // -----------------------------------------------------------------
    describe('createOffRamp input validation', () => {
        it('passes empty stellarAddress without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [{ bankAccountId: 'bank-1', customerId: 'cust-1', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', abbrClabe: '1234...5678', etherfuseDepositClabe: '012345678901234567', compliant: true, status: 'active' }],
                        totalItems: 1, pageSize: 10, pageNumber: 0, totalPages: 1,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        offramp: { orderId: 'order-off-1' },
                    });
                }),
            );

            await client.createOffRamp({
                customerId: 'cust-1',
                quoteId: 'quote-1',
                stellarAddress: '',
                fromCurrency: 'CETES',
                toCurrency: 'MXN',
                amount: '50',
                fiatAccountId: '',
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.publicKey).toBe('');
        });

        it('passes empty fiatAccountId without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [],
                        totalItems: 0, pageSize: 10, pageNumber: 0, totalPages: 0,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        offramp: { orderId: 'order-off-1' },
                    });
                }),
            );

            await client.createOffRamp({
                customerId: 'cust-1',
                quoteId: 'quote-1',
                stellarAddress: 'GABCDEF',
                fromCurrency: 'CETES',
                toCurrency: 'MXN',
                amount: '50',
                fiatAccountId: '',
            });

            expect(capturedBody).not.toBeNull();
            // Empty fiatAccountId triggers bank account lookup; with no accounts found,
            // bankAccountId remains as the original empty string
            expect(capturedBody!.bankAccountId).toBe('');
        });
    });

    // -----------------------------------------------------------------
    // registerFiatAccount input validation
    // -----------------------------------------------------------------
    describe('registerFiatAccount input validation', () => {
        it('passes empty CLABE to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/bank-account`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        bankAccountId: 'bank-1',
                        customerId: 'cust-1',
                        status: 'active',
                        createdAt: '2025-07-01T00:00:00Z',
                    });
                }),
            );

            await client.registerFiatAccount({
                customerId: 'cust-1',
                account: { type: 'spei', clabe: '', beneficiary: 'Alice Garcia' },
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.clabe).toBe('');
        });

        it('passes short CLABE (not 18 digits) to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/bank-account`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        bankAccountId: 'bank-1',
                        customerId: 'cust-1',
                        status: 'active',
                        createdAt: '2025-07-01T00:00:00Z',
                    });
                }),
            );

            await client.registerFiatAccount({
                customerId: 'cust-1',
                account: { type: 'spei', clabe: '123', beneficiary: 'Alice Garcia' },
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.clabe).toBe('123');
        });

        it('passes non-numeric CLABE to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/bank-account`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        bankAccountId: 'bank-1',
                        customerId: 'cust-1',
                        status: 'active',
                        createdAt: '2025-07-01T00:00:00Z',
                    });
                }),
            );

            await client.registerFiatAccount({
                customerId: 'cust-1',
                account: { type: 'spei', clabe: 'abcdefghijklmnopqr', beneficiary: 'Alice Garcia' },
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.clabe).toBe('abcdefghijklmnopqr');
        });

        it('passes empty beneficiary without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/bank-account`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        bankAccountId: 'bank-1',
                        customerId: 'cust-1',
                        status: 'active',
                        createdAt: '2025-07-01T00:00:00Z',
                    });
                }),
            );

            await client.registerFiatAccount({
                customerId: 'cust-1',
                account: { type: 'spei', clabe: '012345678901234567', beneficiary: '' },
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.beneficiary).toBe('');
        });

        it('uses empty string fallback when bankName is undefined', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/bank-account`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        bankAccountId: 'bank-1',
                        customerId: 'cust-1',
                        status: 'active',
                        createdAt: '2025-07-01T00:00:00Z',
                    });
                }),
            );

            await client.registerFiatAccount({
                customerId: 'cust-1',
                account: { type: 'spei', clabe: '012345678901234567', beneficiary: 'Alice Garcia' },
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.bankName).toBe('');
        });
    });

    // -----------------------------------------------------------------
    // getKycUrl input validation
    // -----------------------------------------------------------------
    describe('getKycUrl input validation', () => {
        it('throws MISSING_PUBLIC_KEY when publicKey is empty string', async () => {
            const client = createClient();

            try {
                await client.getKycUrl('cust-1', '');
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('throws MISSING_PUBLIC_KEY when publicKey is undefined', async () => {
            const client = createClient();

            try {
                await client.getKycUrl('cust-1', undefined);
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('passes empty customerId to API without validation', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            await client.getKycUrl('', 'GABCDEF');
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.customerId).toBe('');
        });
    });

    // -----------------------------------------------------------------
    // getKycStatus input validation
    // -----------------------------------------------------------------
    describe('getKycStatus input validation', () => {
        it('throws MISSING_PUBLIC_KEY when publicKey is empty string', async () => {
            const client = createClient();

            try {
                await client.getKycStatus('cust-1', '');
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('throws MISSING_PUBLIC_KEY when publicKey is undefined', async () => {
            const client = createClient();

            try {
                await client.getKycStatus('cust-1', undefined);
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });
    });

    // -----------------------------------------------------------------
    // getFiatAccounts input validation
    // -----------------------------------------------------------------
    describe('getFiatAccounts input validation', () => {
        it('passes empty customerId to URL path without validation', async () => {
            const client = createClient();
            let capturedUrl = '';

            server.use(
                http.post(/\/ramp\/customer\/.*\/bank-accounts/, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json({
                        items: [],
                        totalItems: 0, pageSize: 10, pageNumber: 0, totalPages: 0,
                    });
                }),
            );

            await client.getFiatAccounts('');
            // The client constructs /ramp/customer//bank-accounts with empty customerId
            expect(capturedUrl).toContain('/ramp/customer/');
            expect(capturedUrl).toContain('/bank-accounts');
        });
    });
});
