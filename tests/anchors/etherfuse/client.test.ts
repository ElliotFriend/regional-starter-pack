import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { EtherfuseClient } from '$lib/anchors/etherfuse/client';
import { AnchorError } from '$lib/anchors/types';
import type { PixPaymentInstructions } from '$lib/anchors/types';
import type {
    EtherfuseKycIdentityRequest,
    EtherfuseKycDocumentRequest,
} from '$lib/anchors/etherfuse/types';

const BASE_URL = 'http://etherfuse.test';
const API_KEY = 'test-api-key';
const STELLAR_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';

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
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                // email should NOT be sent to the onboarding endpoint
                expect(body).not.toHaveProperty('email');
                expect(body.publicKey).toBe(STELLAR_PUBKEY);
                expect(body.blockchain).toBe('stellar');
                expect(body).toHaveProperty('customerId');
                expect(body).toHaveProperty('bankAccountId');
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: STELLAR_PUBKEY,
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

        await expect(client.createCustomer({ email: 'alice@example.com' })).rejects.toThrow(
            AnchorError,
        );

        try {
            await client.createCustomer({ email: 'alice@example.com' });
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('MISSING_PUBLIC_KEY');
            expect(anchorErr.statusCode).toBe(400);
        }
    });

    it('throws AnchorError with INVALID_PUBLIC_KEY for malformed Stellar keys', async () => {
        const client = createClient();

        try {
            await client.createCustomer({
                email: 'alice@example.com',
                publicKey: 'not-a-stellar-key',
            });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('INVALID_PUBLIC_KEY');
            expect(anchorErr.statusCode).toBe(400);
            expect(anchorErr.message).toContain('not-a-stellar-key');
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
                            message:
                                'Customer already exists, see org: e1a2b3c4-d5e6-7f89-0abc-def012345678',
                        },
                    },
                    { status: 409 },
                );
            }),
            http.post(
                `${BASE_URL}/ramp/customer/e1a2b3c4-d5e6-7f89-0abc-def012345678/bank-accounts`,
                () => {
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
                },
            ),
        );

        const customer = await client.createCustomer({
            email: 'alice@example.com',
            publicKey: STELLAR_PUBKEY,
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
                    displayName: null,
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                });
            }),
        );

        const customer = await client.getCustomer({ customerId: 'cust-1' });

        expect(customer).not.toBeNull();
        expect(customer!.id).toBe('cust-1');
        expect(customer!.email).toBe('');
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

        const customer = await client.getCustomer({ customerId: 'not-found' });
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
            stellarAddress: STELLAR_PUBKEY,
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
            stellarAddress: STELLAR_PUBKEY,
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
        expect(tx.stellarAddress).toBe(STELLAR_PUBKEY);
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
            stellarAddress: STELLAR_PUBKEY,
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
        expect(tx.stellarAddress).toBe(STELLAR_PUBKEY);
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

        const url = await client.getKycUrl!('cust-1', STELLAR_PUBKEY, 'bank-1');
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
        ['approved_chain_deploying', 'approved'],
        ['rejected', 'rejected'],
    ] as const)('maps Etherfuse status "%s" to "%s"', async (etherfuseStatus, expectedStatus) => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1/kyc/${STELLAR_PUBKEY}`, () => {
                return HttpResponse.json({
                    customerId: 'cust-1',
                    publicKey: STELLAR_PUBKEY,
                    status: etherfuseStatus,
                    updatedAt: '2025-06-01T00:00:00Z',
                });
            }),
        );

        const status = await client.getKycStatus('cust-1', STELLAR_PUBKEY);
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
            await client.getCustomer({ customerId: 'err-json' });
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
            await client.getCustomer({ customerId: 'err-text' });
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

        const result = await client.getAssets('stellar', 'mxn', STELLAR_PUBKEY);
        expect(result).toBeUndefined();
    });

    it('falls back to status code message when error body fields are all empty', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-empty-fields`, () => {
                return HttpResponse.json({ error: { code: '', message: '' } }, { status: 422 });
            }),
        );

        try {
            await client.getCustomer({ customerId: 'err-empty-fields' });
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
            await client.getCustomer({ customerId: 'err-no-code' });
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
                return HttpResponse.json({ error: null }, { status: 500 });
            }),
        );

        try {
            await client.getCustomer({ customerId: 'err-null-error' });
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
                publicKey: STELLAR_PUBKEY,
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
            publicKey: STELLAR_PUBKEY,
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
            publicKey: STELLAR_PUBKEY,
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
                publicKey: STELLAR_PUBKEY,
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
                publicKey: STELLAR_PUBKEY,
            }),
        ).rejects.toThrow();

        // Verify it's NOT an AnchorError (it's a fetch TypeError)
        try {
            await client.createCustomer({
                email: 'alice@example.com',
                publicKey: STELLAR_PUBKEY,
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
            http.get(`${BASE_URL}/ramp/customer/cust-1/kyc/${STELLAR_PUBKEY}`, () => {
                return HttpResponse.json({
                    customerId: 'cust-1',
                    publicKey: STELLAR_PUBKEY,
                    status: 'some_weird_status',
                    updatedAt: '2025-06-01T00:00:00Z',
                });
            }),
        );

        const status = await client.getKycStatus('cust-1', STELLAR_PUBKEY);
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
        expect(tx!.toAmount).toBe(''); // amountInTokens || ''
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
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    quoteId: 'quote-empty-amt',
                    customerId: '',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5ISSUER',
                    },
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
            stellarAddress: STELLAR_PUBKEY,
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
                    quoteId: 'quote-no-after-fee',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5ISSUER',
                    },
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
            stellarAddress: STELLAR_PUBKEY,
        });

        expect(quote.toAmount).toBe('50'); // falls back to destinationAmount
    });

    it('defaults fee to 0 when feeAmount is null', async () => {
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
                    quoteId: 'quote-no-fee',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5ISSUER',
                    },
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
            stellarAddress: STELLAR_PUBKEY,
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
                    quoteAssets: {
                        type: 'offramp',
                        sourceAsset: 'CETES:GCRYUGD5ISSUER',
                        targetAsset: 'MXN:FIAT',
                    },
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
            stellarAddress: STELLAR_PUBKEY,
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
                capturedBody = (await request.json()) as Record<string, unknown>;
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
            stellarAddress: STELLAR_PUBKEY,
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
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 10,
                    pageNumber: 0,
                    totalPages: 0,
                });
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
            stellarAddress: STELLAR_PUBKEY,
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
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    presigned_url: 'https://onboard.test/kyc-no-bank',
                });
            }),
        );

        const url = await client.getKycUrl!('cust-1', STELLAR_PUBKEY);
        expect(url).toBe('https://onboard.test/kyc-no-bank');
        expect(capturedBody).toBeDefined();
        // bankAccountId should be a valid UUID (auto-generated)
        expect(capturedBody!.bankAccountId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(capturedBody!.customerId).toBe('cust-1');
        expect(capturedBody!.publicKey).toBe(STELLAR_PUBKEY);
    });
});

// ---------------------------------------------------------------------------
// acceptAgreements()
// ---------------------------------------------------------------------------

describe('acceptAgreements()', () => {
    it('happy path: calls all three agreement endpoints and returns last response', async () => {
        const client = createClient();
        const presignedUrl = 'https://onboard.test/presigned-abc';

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:01Z',
                    agreementType: 'terms_and_conditions',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:02Z',
                    agreementType: 'customer_agreement',
                });
            }),
        );

        const result = await client.acceptAgreements(presignedUrl);
        expect(result).toEqual({
            success: true,
            acceptedAt: '2025-07-01T00:00:02Z',
            agreementType: 'customer_agreement',
        });
    });

    it('throws AnchorError on failure from first agreement endpoint', async () => {
        const client = createClient();
        const presignedUrl = 'https://onboard.test/presigned-fail';

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return HttpResponse.json(
                    { error: { code: 'AGREEMENT_EXPIRED', message: 'Agreement expired' } },
                    { status: 410 },
                );
            }),
        );

        try {
            await client.acceptAgreements(presignedUrl);
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('AGREEMENT_EXPIRED');
            expect(anchorErr.statusCode).toBe(410);
            expect(anchorErr.message).toBe('Agreement expired');
        }
    });

    it('throws AnchorError with UNKNOWN_ERROR when error body is empty', async () => {
        const client = createClient();
        const presignedUrl = 'https://onboard.test/presigned-empty';

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return new HttpResponse('', { status: 403 });
            }),
        );

        try {
            await client.acceptAgreements(presignedUrl);
            expect.fail('Expected AnchorError');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('UNKNOWN_ERROR');
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

        const result = await client.getAssets('stellar', 'mxn', STELLAR_PUBKEY);
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

        const result = await client.getAssets('stellar', 'mxn', STELLAR_PUBKEY);
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

        await client.getAssets('stellar', 'mxn', STELLAR_PUBKEY);
        const url = new URL(capturedUrl);
        expect(url.searchParams.get('blockchain')).toBe('stellar');
        expect(url.searchParams.get('currency')).toBe('mxn');
        expect(url.searchParams.get('wallet')).toBe(STELLAR_PUBKEY);
    });

    it('always includes all three query params', async () => {
        const client = createClient();
        let capturedUrl = '';

        server.use(
            http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ assets: [] });
            }),
        );

        await client.getAssets('stellar', 'mxn', STELLAR_PUBKEY);
        const url = new URL(capturedUrl);
        expect(url.searchParams.get('blockchain')).toBe('stellar');
        expect(url.searchParams.get('currency')).toBe('mxn');
        expect(url.searchParams.get('wallet')).toBe(STELLAR_PUBKEY);
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

        it('does not send email to the onboarding endpoint', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            const customer = await client.createCustomer({
                email: 'alice@example.com',
                publicKey: STELLAR_PUBKEY,
            });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody).not.toHaveProperty('email');
            // email is still returned on the Customer object (client-side only)
            expect(customer.email).toBe('alice@example.com');
        });

        it('throws INVALID_PUBLIC_KEY for non-Stellar public keys', async () => {
            const client = createClient();

            try {
                await client.createCustomer({
                    email: 'alice@example.com',
                    publicKey: 'not-a-stellar-key',
                });
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('INVALID_PUBLIC_KEY');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('stores email on the returned Customer without sending it to API', async () => {
            const client = createClient();
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
                }),
            );

            const customer = await client.createCustomer({ publicKey: STELLAR_PUBKEY });

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.email).toBeUndefined();
            expect(customer.email).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------
    // getCustomer input validation
    // -----------------------------------------------------------------
    describe('getCustomer input validation', () => {
        it('throws AnchorError when customerId is missing', async () => {
            const client = createClient();

            try {
                await client.getCustomer({ email: 'user@example.com' });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_CUSTOMER_ID');
                expect(anchorErr.statusCode).toBe(400);
            }
        });

        it('throws AnchorError when customerId is empty string', async () => {
            const client = createClient();

            try {
                await client.getCustomer({ customerId: '' });
                expect.fail('Expected AnchorError');
            } catch (err) {
                expect(err).toBeInstanceOf(AnchorError);
                const anchorErr = err as AnchorError;
                expect(anchorErr.code).toBe('MISSING_CUSTOMER_ID');
                expect(anchorErr.statusCode).toBe(400);
            }
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
                            {
                                symbol: 'MXN',
                                identifier: 'MXN',
                                name: 'MXN',
                                currency: 'MXN',
                                balance: null,
                                image: null,
                            },
                            {
                                symbol: 'CETES',
                                identifier: 'CETES:GCRYUGD5ISSUER',
                                name: 'CETES',
                                currency: null,
                                balance: null,
                                image: null,
                            },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: {
                            type: 'onramp',
                            sourceAsset: 'MXN',
                            targetAsset: 'CETES:GCRYUGD5ISSUER',
                        },
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
                stellarAddress: STELLAR_PUBKEY,
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
                            {
                                symbol: 'MXN',
                                identifier: 'MXN',
                                name: 'MXN',
                                currency: 'MXN',
                                balance: null,
                                image: null,
                            },
                            {
                                symbol: 'CETES',
                                identifier: 'CETES:GCRYUGD5ISSUER',
                                name: 'CETES',
                                currency: null,
                                balance: null,
                                image: null,
                            },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: {
                            type: 'onramp',
                            sourceAsset: 'MXN',
                            targetAsset: 'CETES:GCRYUGD5ISSUER',
                        },
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
                stellarAddress: STELLAR_PUBKEY,
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
                            {
                                symbol: 'MXN',
                                identifier: 'MXN',
                                name: 'MXN',
                                currency: 'MXN',
                                balance: null,
                                image: null,
                            },
                            {
                                symbol: 'CETES',
                                identifier: 'CETES:GCRYUGD5ISSUER',
                                name: 'CETES',
                                currency: null,
                                balance: null,
                                image: null,
                            },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: {
                            type: 'onramp',
                            sourceAsset: 'MXN',
                            targetAsset: 'CETES:GCRYUGD5ISSUER',
                        },
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
                stellarAddress: STELLAR_PUBKEY,
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
                            {
                                symbol: 'MXN',
                                identifier: 'MXN',
                                name: 'MXN',
                                currency: 'MXN',
                                balance: null,
                                image: null,
                            },
                            {
                                symbol: 'CETES',
                                identifier: 'CETES:GCRYUGD5ISSUER',
                                name: 'CETES',
                                currency: null,
                                balance: null,
                                image: null,
                            },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        quoteId: 'quote-1',
                        customerId: '',
                        blockchain: 'stellar',
                        quoteAssets: {
                            type: 'onramp',
                            sourceAsset: 'MXN',
                            targetAsset: 'CETES:GCRYUGD5ISSUER',
                        },
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
                stellarAddress: STELLAR_PUBKEY,
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
                        items: [
                            {
                                bankAccountId: 'bank-1',
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
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: {
                            orderId: 'order-1',
                            depositClabe: '012345678901234567',
                            depositAmount: '1000.00',
                        },
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
                        items: [
                            {
                                bankAccountId: 'bank-1',
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
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: {
                            orderId: 'order-1',
                            depositClabe: '012345678901234567',
                            depositAmount: 'not-a-number',
                        },
                    });
                }),
            );

            const tx = await client.createOnRamp({
                customerId: 'cust-1',
                quoteId: 'quote-1',
                stellarAddress: STELLAR_PUBKEY,
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
                        items: [
                            {
                                bankAccountId: 'bank-1',
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
                http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        onramp: {
                            orderId: 'order-1',
                            depositClabe: '012345678901234567',
                            depositAmount: '1000.00',
                        },
                    });
                }),
            );

            await client.createOnRamp({
                customerId: 'cust-1',
                quoteId: '',
                stellarAddress: STELLAR_PUBKEY,
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
                        items: [
                            {
                                bankAccountId: 'bank-1',
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
                        totalItems: 0,
                        pageSize: 10,
                        pageNumber: 0,
                        totalPages: 0,
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
                stellarAddress: STELLAR_PUBKEY,
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

            await client.getKycUrl('', STELLAR_PUBKEY);
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
                        totalItems: 0,
                        pageSize: 10,
                        pageNumber: 0,
                        totalPages: 0,
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

// ---------------------------------------------------------------------------
// Client static properties and config
// ---------------------------------------------------------------------------

describe('client static properties', () => {
    it('has correct name and displayName', () => {
        const client = createClient();
        expect(client.name).toBe('etherfuse');
        expect(client.displayName).toBe('Etherfuse');
    });

    it('has correct capabilities', () => {
        const client = createClient();
        expect(client.capabilities.kycFlow).toBe('iframe');
        expect(client.capabilities.deferredOffRampSigning).toBe(true);
        expect(client.capabilities.sandbox).toBe(true);
        expect(client.capabilities.kycUrl).toBe(true);
        expect(client.capabilities.requiresOffRampSigning).toBe(true);
    });

    it('supports CETES with correct issuer', () => {
        const client = createClient();
        const token = client.supportedTokens.find((t) => t.symbol === 'CETES');
        expect(token).toBeDefined();
        expect(token?.name).toBe('Etherfuse CETES');
        expect(token?.issuer).toBe('GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4');
        expect(token?.description).toBeTruthy();
    });

    it('supports MXN and BRL currencies', () => {
        const client = createClient();
        expect(client.supportedCurrencies).toEqual(['MXN', 'BRL']);
    });

    it('supports spei and pix payment rails', () => {
        const client = createClient();
        expect(client.supportedRails).toEqual(['spei', 'pix']);
    });

    it('defaults blockchain to "stellar" when defaultBlockchain is not provided', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );

        await client.createCustomer({ email: 'test@example.com', publicKey: STELLAR_PUBKEY });
        expect(capturedBody!.blockchain).toBe('stellar');
    });

    it('uses custom defaultBlockchain when provided in config', async () => {
        const customClient = new EtherfuseClient({
            apiKey: API_KEY,
            baseUrl: BASE_URL,
            defaultBlockchain: 'evm',
        });
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );

        await customClient.createCustomer({ email: 'test@example.com', publicKey: STELLAR_PUBKEY });
        expect(capturedBody!.blockchain).toBe('evm');
    });
});

// ---------------------------------------------------------------------------
// getCustomer() displayName handling
// ---------------------------------------------------------------------------

describe('getCustomer() displayName handling', () => {
    it('returns empty email string even when API response has non-null displayName', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-named`, () => {
                return HttpResponse.json({
                    customerId: 'cust-named',
                    displayName: 'Alice Garcia',
                    createdAt: '2025-06-01T00:00:00Z',
                    updatedAt: '2025-06-02T00:00:00Z',
                });
            }),
        );

        const customer = await client.getCustomer({ customerId: 'cust-named' });
        expect(customer).not.toBeNull();
        expect(customer!.id).toBe('cust-named');
        // displayName is in the Etherfuse response but our Anchor mapping always returns ''
        expect(customer!.email).toBe('');
        expect(customer!.kycStatus).toBe('not_started');
    });

    it('throws on non-404 errors from getCustomer', async () => {
        const client = createClient();

        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-500`, () => {
                return HttpResponse.json(
                    { error: { code: 'INTERNAL_ERROR', message: 'DB unavailable' } },
                    { status: 500 },
                );
            }),
        );

        try {
            await client.getCustomer({ customerId: 'cust-500' });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.statusCode).toBe(500);
            expect(anchorErr.code).toBe('INTERNAL_ERROR');
        }
    });
});

// ---------------------------------------------------------------------------
// submitKycIdentity()
// ---------------------------------------------------------------------------

const IDENTITY_REQUEST: EtherfuseKycIdentityRequest = {
    pubkey: STELLAR_PUBKEY,
    identity: {
        id: STELLAR_PUBKEY,
        name: { givenName: 'Alice', familyName: 'Garcia' },
        dateOfBirth: '1990-05-15',
        address: {
            street: '123 Main St',
            city: 'Mexico City',
            region: 'CDMX',
            postalCode: '06600',
            country: 'MX',
        },
        idNumbers: [{ value: 'ABCD123456HDFGRS01', type: 'CURP' }],
    },
};

describe('submitKycIdentity()', () => {
    it('POSTs to /ramp/customer/{id}/kyc and returns API response', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-kyc/kyc`, () => {
                return HttpResponse.json({
                    status: 'proposed',
                    message: 'KYC submitted successfully',
                });
            }),
        );

        const result = await client.submitKycIdentity('cust-kyc', IDENTITY_REQUEST);
        expect(result).toEqual({ status: 'proposed', message: 'KYC submitted successfully' });
    });

    it('sends the full nested identity body to the correct endpoint', async () => {
        const client = createClient();
        let capturedBody: unknown;
        let capturedUrl = '';

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-kyc-body/kyc`, async ({ request }) => {
                capturedUrl = request.url;
                capturedBody = await request.json();
                return HttpResponse.json({ status: 'proposed', message: 'OK' });
            }),
        );

        await client.submitKycIdentity('cust-kyc-body', IDENTITY_REQUEST);

        expect(capturedUrl).toContain('/ramp/customer/cust-kyc-body/kyc');
        expect(capturedBody).toEqual(IDENTITY_REQUEST);

        const body = capturedBody as typeof IDENTITY_REQUEST;
        expect(body.pubkey).toBe(STELLAR_PUBKEY);
        expect(body.identity.name.givenName).toBe('Alice');
        expect(body.identity.name.familyName).toBe('Garcia');
        expect(body.identity.dateOfBirth).toBe('1990-05-15');
        expect(body.identity.address.country).toBe('MX');
        expect(body.identity.idNumbers[0].type).toBe('CURP');
    });

    it('throws AnchorError on 422 validation failure', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-kyc-err/kyc`, () => {
                return HttpResponse.json(
                    { error: { code: 'VALIDATION_ERROR', message: 'Invalid identity data' } },
                    { status: 422 },
                );
            }),
        );

        try {
            await client.submitKycIdentity('cust-kyc-err', IDENTITY_REQUEST);
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('VALIDATION_ERROR');
            expect(anchorErr.statusCode).toBe(422);
            expect(anchorErr.message).toBe('Invalid identity data');
        }
    });

    it('returns undefined for 200 response with empty body', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-kyc-empty/kyc`, () => {
                return new HttpResponse('', { status: 200 });
            }),
        );

        const result = await client.submitKycIdentity('cust-kyc-empty', IDENTITY_REQUEST);
        expect(result).toBeUndefined();
    });

    it('throws AnchorError on 409 conflict', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-kyc-conflict/kyc`, () => {
                return HttpResponse.json(
                    { error: { code: 'CONFLICT', message: 'KYC already submitted' } },
                    { status: 409 },
                );
            }),
        );

        try {
            await client.submitKycIdentity('cust-kyc-conflict', IDENTITY_REQUEST);
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('CONFLICT');
            expect(anchorErr.statusCode).toBe(409);
        }
    });
});

// ---------------------------------------------------------------------------
// submitKycDocuments()
// ---------------------------------------------------------------------------

const DOCUMENT_REQUEST: EtherfuseKycDocumentRequest = {
    pubkey: STELLAR_PUBKEY,
    documentType: 'document',
    images: [
        { label: 'id_front', image: 'data:image/jpeg;base64,/9j/frontdata' },
        { label: 'id_back', image: 'data:image/jpeg;base64,/9j/backdata' },
    ],
};

const SELFIE_REQUEST: EtherfuseKycDocumentRequest = {
    pubkey: STELLAR_PUBKEY,
    documentType: 'selfie',
    images: [{ label: 'selfie', image: 'data:image/jpeg;base64,/9j/selfiedata' }],
};

describe('submitKycDocuments()', () => {
    it('POSTs to /ramp/customer/{id}/kyc/documents and returns API response', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-docs/kyc/documents`, () => {
                return HttpResponse.json({ status: 'proposed', message: 'Documents submitted' });
            }),
        );

        const result = await client.submitKycDocuments('cust-docs', DOCUMENT_REQUEST);
        expect(result).toEqual({ status: 'proposed', message: 'Documents submitted' });
    });

    it('sends documentType "document" with id_front and id_back images', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(
                `${BASE_URL}/ramp/customer/cust-doc-body/kyc/documents`,
                async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ status: 'proposed', message: 'OK' });
                },
            ),
        );

        await client.submitKycDocuments('cust-doc-body', DOCUMENT_REQUEST);

        expect(capturedBody!.pubkey).toBe(STELLAR_PUBKEY);
        expect(capturedBody!.documentType).toBe('document');
        const images = capturedBody!.images as Array<{ label: string; image: string }>;
        expect(images).toHaveLength(2);
        expect(images[0].label).toBe('id_front');
        expect(images[0].image).toBe('data:image/jpeg;base64,/9j/frontdata');
        expect(images[1].label).toBe('id_back');
    });

    it('sends documentType "selfie" with selfie image', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(
                `${BASE_URL}/ramp/customer/cust-selfie-body/kyc/documents`,
                async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({ status: 'proposed', message: 'OK' });
                },
            ),
        );

        await client.submitKycDocuments('cust-selfie-body', SELFIE_REQUEST);

        expect(capturedBody!.documentType).toBe('selfie');
        const images = capturedBody!.images as Array<{ label: string; image: string }>;
        expect(images).toHaveLength(1);
        expect(images[0].label).toBe('selfie');
        expect(images[0].image).toBe('data:image/jpeg;base64,/9j/selfiedata');
    });

    it('POSTs to the correct endpoint URL (not /kyc, but /kyc/documents)', async () => {
        const client = createClient();
        let capturedUrl = '';

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-url-check/kyc/documents`, ({ request }) => {
                capturedUrl = request.url;
                return HttpResponse.json({ status: 'proposed', message: 'OK' });
            }),
        );

        await client.submitKycDocuments('cust-url-check', DOCUMENT_REQUEST);
        expect(capturedUrl).toContain('/ramp/customer/cust-url-check/kyc/documents');
    });

    it('throws AnchorError on 400 bad request', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-docs-err/kyc/documents`, () => {
                return HttpResponse.json(
                    { error: { code: 'UNSUPPORTED_FORMAT', message: 'Invalid image format' } },
                    { status: 400 },
                );
            }),
        );

        try {
            await client.submitKycDocuments('cust-docs-err', DOCUMENT_REQUEST);
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('UNSUPPORTED_FORMAT');
            expect(anchorErr.statusCode).toBe(400);
            expect(anchorErr.message).toBe('Invalid image format');
        }
    });

    it('returns undefined for 200 response with empty body', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-docs-empty/kyc/documents`, () => {
                return new HttpResponse('', { status: 200 });
            }),
        );

        const result = await client.submitKycDocuments('cust-docs-empty', DOCUMENT_REQUEST);
        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// acceptElectronicSignature()
// ---------------------------------------------------------------------------

describe('acceptElectronicSignature()', () => {
    it('POSTs to /ramp/agreements/electronic-signature with presignedUrl in body', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;
        let capturedUrl = '';

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, async ({ request }) => {
                capturedUrl = request.url;
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
        );

        const result = await client.acceptElectronicSignature('https://onboard.test/presigned-sig');

        expect(result.success).toBe(true);
        expect(result.agreementType).toBe('electronic_signature');
        expect(result.acceptedAt).toBe('2025-07-01T00:00:00Z');
        expect(capturedUrl).toContain('/ramp/agreements/electronic-signature');
        expect(capturedBody!.presignedUrl).toBe('https://onboard.test/presigned-sig');
    });

    it('throws AnchorError on 403 forbidden', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return HttpResponse.json(
                    { error: { code: 'FORBIDDEN', message: 'Not authorized' } },
                    { status: 403 },
                );
            }),
        );

        try {
            await client.acceptElectronicSignature('https://bad.url');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('FORBIDDEN');
            expect(anchorErr.statusCode).toBe(403);
        }
    });
});

// ---------------------------------------------------------------------------
// acceptTermsAndConditions()
// ---------------------------------------------------------------------------

describe('acceptTermsAndConditions()', () => {
    it('POSTs to /ramp/agreements/terms-and-conditions with presignedUrl in body', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:01Z',
                    agreementType: 'terms_and_conditions',
                });
            }),
        );

        const result = await client.acceptTermsAndConditions('https://onboard.test/presigned-tc');

        expect(result.success).toBe(true);
        expect(result.agreementType).toBe('terms_and_conditions');
        expect(result.acceptedAt).toBe('2025-07-01T00:00:01Z');
        expect(capturedBody!.presignedUrl).toBe('https://onboard.test/presigned-tc');
    });

    it('throws AnchorError on 410 gone (expired URL)', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, () => {
                return HttpResponse.json(
                    { error: { code: 'EXPIRED', message: 'Presigned URL expired' } },
                    { status: 410 },
                );
            }),
        );

        try {
            await client.acceptTermsAndConditions('https://expired.url');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('EXPIRED');
            expect(anchorErr.statusCode).toBe(410);
        }
    });
});

// ---------------------------------------------------------------------------
// acceptCustomerAgreement()
// ---------------------------------------------------------------------------

describe('acceptCustomerAgreement()', () => {
    it('POSTs to /ramp/agreements/customer-agreement with presignedUrl in body', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:02Z',
                    agreementType: 'customer_agreement',
                });
            }),
        );

        const result = await client.acceptCustomerAgreement('https://onboard.test/presigned-ca');

        expect(result.success).toBe(true);
        expect(result.agreementType).toBe('customer_agreement');
        expect(result.acceptedAt).toBe('2025-07-01T00:00:02Z');
        expect(capturedBody!.presignedUrl).toBe('https://onboard.test/presigned-ca');
    });

    it('throws AnchorError on 500 server error', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, () => {
                return HttpResponse.json(
                    { error: { code: 'INTERNAL_ERROR', message: 'Server error' } },
                    { status: 500 },
                );
            }),
        );

        try {
            await client.acceptCustomerAgreement('https://error.url');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('INTERNAL_ERROR');
            expect(anchorErr.statusCode).toBe(500);
        }
    });
});

// ---------------------------------------------------------------------------
// acceptAgreements() additional error and forwarding tests
// ---------------------------------------------------------------------------

describe('acceptAgreements() additional paths', () => {
    it('throws AnchorError when second endpoint (terms-and-conditions) fails', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, () => {
                return HttpResponse.json(
                    { error: { code: 'FORBIDDEN', message: 'T&C already accepted' } },
                    { status: 409 },
                );
            }),
        );

        try {
            await client.acceptAgreements('https://onboard.test/presigned');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('FORBIDDEN');
            expect(anchorErr.statusCode).toBe(409);
        }
    });

    it('throws AnchorError when third endpoint (customer-agreement) fails', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, () => {
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:01Z',
                    agreementType: 'terms_and_conditions',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, () => {
                return HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
                    { status: 404 },
                );
            }),
        );

        try {
            await client.acceptAgreements('https://onboard.test/presigned');
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AnchorError);
            const anchorErr = err as AnchorError;
            expect(anchorErr.code).toBe('NOT_FOUND');
            expect(anchorErr.statusCode).toBe(404);
        }
    });

    it('forwards the same presignedUrl to all three agreement endpoints', async () => {
        const client = createClient();
        const presignedUrl = 'https://onboard.test/my-presigned-url';
        const capturedPresignedUrls: string[] = [];

        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                capturedPresignedUrls.push(body.presignedUrl as string);
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                capturedPresignedUrls.push(body.presignedUrl as string);
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:01Z',
                    agreementType: 'terms_and_conditions',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                capturedPresignedUrls.push(body.presignedUrl as string);
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2025-07-01T00:00:02Z',
                    agreementType: 'customer_agreement',
                });
            }),
        );

        await client.acceptAgreements(presignedUrl);

        expect(capturedPresignedUrls).toHaveLength(3);
        expect(capturedPresignedUrls[0]).toBe(presignedUrl);
        expect(capturedPresignedUrls[1]).toBe(presignedUrl);
        expect(capturedPresignedUrls[2]).toBe(presignedUrl);
    });
});

// ---------------------------------------------------------------------------
// mapOrderStatus() all known statuses
// ---------------------------------------------------------------------------

describe('mapOrderStatus() all known statuses', () => {
    it.each([
        ['created', 'pending'],
        ['funded', 'processing'],
        ['completed', 'completed'],
        ['failed', 'failed'],
        ['refunded', 'refunded'],
        ['canceled', 'cancelled'], // Etherfuse uses "canceled" (1 L); shared type uses "cancelled" (2 L)
    ] as const)(
        'maps Etherfuse order status "%s" to shared status "%s"',
        async (etherfuseStatus, expectedStatus) => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/ramp/order/order-map-${etherfuseStatus}`, () => {
                    return HttpResponse.json({
                        orderId: `order-map-${etherfuseStatus}`,
                        customerId: 'cust-1',
                        createdAt: '2025-06-01T00:00:00Z',
                        updatedAt: '2025-06-01T00:00:00Z',
                        amountInFiat: '100',
                        amountInTokens: '5',
                        walletId: 'w-1',
                        bankAccountId: 'b-1',
                        orderType: 'onramp',
                        status: etherfuseStatus,
                    });
                }),
            );

            const tx = await client.getOnRampTransaction(`order-map-${etherfuseStatus}`);
            expect(tx!.status).toBe(expectedStatus);
        },
    );
});

// ---------------------------------------------------------------------------
// getFiatAccounts() pagination params
// ---------------------------------------------------------------------------

describe('getFiatAccounts() pagination params', () => {
    it('sends pageSize: 100 and pageNumber: 0 in POST body', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-pg/bank-accounts`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 0,
                });
            }),
        );

        await client.getFiatAccounts('cust-pg');

        expect(capturedBody).toBeDefined();
        expect(capturedBody!.pageSize).toBe(100);
        expect(capturedBody!.pageNumber).toBe(0);
    });

    it('maps optional label and deletedAt fields from list response', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-extra/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-x',
                            customerId: 'cust-extra',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-02T00:00:00Z',
                            deletedAt: null,
                            abbrClabe: '0123...4567',
                            etherfuseDepositClabe: '012345678901234567',
                            label: 'My BBVA account',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
        );

        const accounts = await client.getFiatAccounts('cust-extra');

        expect(accounts).toHaveLength(1);
        expect(accounts[0].id).toBe('bank-x');
        expect(accounts[0].accountNumber).toBe('0123...4567');
        // label and deletedAt are on the API type but our mapping uses abbrClabe as accountNumber
        expect(accounts[0].type).toBe('SPEI');
    });
});

// ---------------------------------------------------------------------------
// createOnRamp() unified request body (EtherfuseOrderRequest)
// ---------------------------------------------------------------------------

describe('createOnRamp() unified EtherfuseOrderRequest body', () => {
    it('sends orderId, bankAccountId, publicKey, quoteId — no legacy fields', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-unified/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-unified',
                            customerId: 'cust-unified',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-unified-1',
                        depositClabe: '012345678901234567',
                        depositAmount: '1000.00',
                    },
                });
            }),
        );

        await client.createOnRamp({
            customerId: 'cust-unified',
            quoteId: 'quote-unified',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '1000',
        });

        expect(capturedBody).toBeDefined();
        // Fields that MUST be present per EtherfuseOrderRequest
        expect(capturedBody!.orderId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(capturedBody!.bankAccountId).toBe('bank-unified');
        expect(capturedBody!.publicKey).toBe(STELLAR_PUBKEY);
        expect(capturedBody!.quoteId).toBe('quote-unified');
        // Legacy fields that must NOT appear in the new unified request
        expect(capturedBody).not.toHaveProperty('orderType');
        expect(capturedBody).not.toHaveProperty('fromCurrency');
        expect(capturedBody).not.toHaveProperty('toCurrency');
        expect(capturedBody).not.toHaveProperty('amount');
        expect(capturedBody).not.toHaveProperty('customerId');
        expect(capturedBody).not.toHaveProperty('stellarAddress');
        expect(capturedBody).not.toHaveProperty('blockchain');
    });

    it('includes memo when provided', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-memo/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-m',
                            customerId: 'cust-memo',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-memo',
                        depositClabe: '012345678901234567',
                        depositAmount: '1000.00',
                    },
                });
            }),
        );

        await client.createOnRamp({
            customerId: 'cust-memo',
            quoteId: 'quote-1',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '1000',
            memo: 'payment-ref-abc',
        });

        expect(capturedBody!.memo).toBe('payment-ref-abc');
    });

    it('omits memo from request when not provided', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-no-memo/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-nm',
                            customerId: 'cust-no-memo',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            etherfuseDepositClabe: '012345678901234567',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-no-memo',
                        depositClabe: '012345678901234567',
                        depositAmount: '1000.00',
                    },
                });
            }),
        );

        await client.createOnRamp({
            customerId: 'cust-no-memo',
            quoteId: 'quote-1',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'MXN',
            toCurrency: 'CETES',
            amount: '1000',
        });

        expect(capturedBody!.memo).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// createOffRamp() unified request body (EtherfuseOrderRequest)
// ---------------------------------------------------------------------------

describe('createOffRamp() unified EtherfuseOrderRequest body', () => {
    it('sends orderId, bankAccountId, publicKey, quoteId — no legacy fields', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-off-unified/bank-accounts`, () => {
                return HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-off-unified',
                            customerId: 'cust-off-unified',
                            createdAt: '2025-01-01T00:00:00Z',
                            updatedAt: '2025-01-01T00:00:00Z',
                            abbrClabe: '9876...5432',
                            etherfuseDepositClabe: '987654321098765432',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ offramp: { orderId: 'order-off-unified' } });
            }),
        );

        await client.createOffRamp({
            customerId: 'cust-off-unified',
            quoteId: 'quote-off-unified',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'CETES',
            toCurrency: 'MXN',
            amount: '50',
            fiatAccountId: '',
        });

        expect(capturedBody).toBeDefined();
        expect(capturedBody!.orderId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(capturedBody!.bankAccountId).toBe('bank-off-unified');
        expect(capturedBody!.publicKey).toBe(STELLAR_PUBKEY);
        expect(capturedBody!.quoteId).toBe('quote-off-unified');
        // Legacy fields must NOT be present
        expect(capturedBody).not.toHaveProperty('orderType');
        expect(capturedBody).not.toHaveProperty('fromCurrency');
        expect(capturedBody).not.toHaveProperty('toCurrency');
        expect(capturedBody).not.toHaveProperty('amount');
        expect(capturedBody).not.toHaveProperty('customerId');
        expect(capturedBody).not.toHaveProperty('stellarAddress');
    });

    it('uses provided fiatAccountId directly without auto-fetching bank accounts', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;
        let bankAccountsRequested = false;

        server.use(
            http.post(`${BASE_URL}/ramp/customer/:customerId/bank-accounts`, () => {
                bankAccountsRequested = true;
                return HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 0,
                });
            }),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ offramp: { orderId: 'order-explicit-bank' } });
            }),
        );

        await client.createOffRamp({
            customerId: 'cust-1',
            quoteId: 'quote-1',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'CETES',
            toCurrency: 'MXN',
            amount: '50',
            fiatAccountId: 'explicit-bank-id-xyz',
        });

        expect(bankAccountsRequested).toBe(false);
        expect(capturedBody!.bankAccountId).toBe('explicit-bank-id-xyz');
    });

    it('includes memo when provided', async () => {
        const client = createClient();
        let capturedBody: Record<string, unknown> | undefined;

        server.use(
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                capturedBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ offramp: { orderId: 'order-off-memo' } });
            }),
        );

        await client.createOffRamp({
            customerId: '',
            quoteId: 'quote-1',
            stellarAddress: STELLAR_PUBKEY,
            fromCurrency: 'CETES',
            toCurrency: 'MXN',
            amount: '50',
            fiatAccountId: 'bank-direct',
            memo: 'off-ramp-ref-123',
        });

        expect(capturedBody!.memo).toBe('off-ramp-ref-123');
    });
});

// ---------------------------------------------------------------------------
// Brazil / PIX
// ---------------------------------------------------------------------------

describe('Brazil / PIX support', () => {
    describe('getQuote currency parameterization', () => {
        it('queries /ramp/assets with currency=brl when fromCurrency is BRL', async () => {
            const client = createClient();
            let capturedCurrency: string | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                    const url = new URL(request.url);
                    capturedCurrency = url.searchParams.get('currency');
                    return HttpResponse.json({
                        assets: [
                            {
                                symbol: 'TESOURO',
                                identifier:
                                    'TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
                                name: 'TESOURO Token',
                                currency: null,
                                balance: null,
                                image: null,
                            },
                            {
                                symbol: 'BRL',
                                identifier: 'BRL',
                                name: 'Brazilian Real',
                                currency: 'BRL',
                                balance: null,
                                image: null,
                            },
                        ],
                    });
                }),
                http.post(`${BASE_URL}/ramp/quote`, () => {
                    return HttpResponse.json({
                        quoteId: 'quote-brl-1',
                        customerId: 'cust-1',
                        blockchain: 'stellar',
                        quoteAssets: {
                            type: 'onramp',
                            sourceAsset: 'BRL',
                            targetAsset:
                                'TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
                        },
                        sourceAmount: '100',
                        destinationAmount: '20',
                        destinationAmountAfterFee: '19.8',
                        exchangeRate: '0.2',
                        feeBps: '100',
                        feeAmount: '0.2',
                        expiresAt: '2025-07-01T00:00:00Z',
                        createdAt: '2025-06-30T00:00:00Z',
                        updatedAt: '2025-06-30T00:00:00Z',
                    });
                }),
            );

            await client.getQuote({
                fromCurrency: 'BRL',
                toCurrency: 'TESOURO',
                fromAmount: '100',
                customerId: 'cust-1',
                stellarAddress: STELLAR_PUBKEY,
            });

            expect(capturedCurrency).toBe('brl');
        });

        it('queries /ramp/assets with currency=mxn when fromCurrency is MXN (regression)', async () => {
            const client = createClient();
            let capturedCurrency: string | null = null;

            server.use(
                http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                    const url = new URL(request.url);
                    capturedCurrency = url.searchParams.get('currency');
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
                        quoteId: 'quote-mxn-1',
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

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'CETES',
                fromAmount: '1000',
                customerId: 'cust-1',
                stellarAddress: STELLAR_PUBKEY,
            });

            expect(capturedCurrency).toBe('mxn');
        });
    });

    describe('TESOURO supportedTokens entry', () => {
        it('lists TESOURO with the same Stellar issuer as CETES and a non-coming-soon description', () => {
            const client = createClient();
            const tesouro = client.supportedTokens.find((t) => t.symbol === 'TESOURO');
            expect(tesouro).toBeDefined();
            expect(tesouro!.name).toBe('Etherfuse TESOURO');
            expect(tesouro!.issuer).toBe(
                'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
            );
            expect(tesouro!.description).toBeTruthy();
            expect(tesouro!.description.toLowerCase()).not.toContain('coming soon');
        });
    });

    describe('getFiatAccounts maps PIX-shaped items', () => {
        it('returns SavedFiatAccount with type "PIX" when items carry PIX fields', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-br-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [
                            {
                                bankAccountId: 'bank-pix-1',
                                customerId: 'cust-br-1',
                                createdAt: '2025-07-01T00:00:00Z',
                                updatedAt: '2025-07-01T00:00:00Z',
                                pixKey: '4465393f-f1b6-4838-9b6b-0be33b228390',
                                pixKeyType: 'evp',
                                accountHolderName: 'Sandboxed Testered',
                                label: 'brat2',
                                compliant: true,
                                status: 'active',
                            },
                        ],
                        totalItems: 1,
                        pageSize: 100,
                        pageNumber: 0,
                        totalPages: 1,
                    });
                }),
            );

            const accounts = await client.getFiatAccounts('cust-br-1');
            expect(accounts).toHaveLength(1);
            expect(accounts[0].id).toBe('bank-pix-1');
            expect(accounts[0].type).toBe('PIX');
            expect(accounts[0].accountNumber).toBe('4465393f-f1b6-4838-9b6b-0be33b228390');
            expect(accounts[0].accountHolderName).toBe('Sandboxed Testered');
        });
    });

    describe('createOnRamp with BRL maps PIX deposit instructions', () => {
        it('returns paymentInstructions of the PIX variant when the order response carries PIX fields', async () => {
            const client = createClient();

            server.use(
                http.post(`${BASE_URL}/ramp/customer/cust-br-1/bank-accounts`, () => {
                    return HttpResponse.json({
                        items: [
                            {
                                bankAccountId: 'bank-pix-auto',
                                customerId: 'cust-br-1',
                                createdAt: '2025-07-01T00:00:00Z',
                                updatedAt: '2025-07-01T00:00:00Z',
                                pixKey: '4465393f-f1b6-4838-9b6b-0be33b228390',
                                pixKeyType: 'evp',
                                accountHolderName: 'Sandboxed Testered',
                                compliant: true,
                                status: 'active',
                            },
                        ],
                        totalItems: 1,
                        pageSize: 100,
                        pageNumber: 0,
                        totalPages: 1,
                    });
                }),
                http.post(`${BASE_URL}/ramp/order`, () => {
                    return HttpResponse.json({
                        onramp: {
                            orderId: 'order-onramp-br-1',
                            depositPixKey: 'etherfuse-deposit-pix-key-uuid',
                            depositPixKeyType: 'evp',
                            depositPixCode:
                                '00020126360014BR.GOV.BCB.PIX0114deposit-pix-key52040000530398654041005802BR5910Etherfuse6009Sao Paulo62070503***6304ABCD',
                            depositAmount: '100.00',
                            beneficiary: 'Etherfuse BR',
                        },
                    });
                }),
            );

            const tx = await client.createOnRamp({
                customerId: 'cust-br-1',
                quoteId: 'quote-brl-1',
                stellarAddress: STELLAR_PUBKEY,
                fromCurrency: 'BRL',
                toCurrency: 'TESOURO',
                amount: '100',
            });

            expect(tx.id).toBe('order-onramp-br-1');
            expect(tx.fromCurrency).toBe('BRL');
            expect(tx.toCurrency).toBe('TESOURO');
            expect(tx.paymentInstructions).toBeDefined();
            expect(tx.paymentInstructions!.type).toBe('pix');
            const pix = tx.paymentInstructions as PixPaymentInstructions;
            expect(pix.pixKey).toBe('etherfuse-deposit-pix-key-uuid');
            expect(pix.pixKeyType).toBe('evp');
            expect(pix.pixCode).toBe(
                '00020126360014BR.GOV.BCB.PIX0114deposit-pix-key52040000530398654041005802BR5910Etherfuse6009Sao Paulo62070503***6304ABCD',
            );
            expect(pix.amount).toBe('100.00');
            expect(pix.currency).toBe('BRL');
        });
    });

    describe('mapOnRampTransaction PIX branch', () => {
        it('maps PIX deposit fields when present in EtherfuseOrderResponse', async () => {
            const client = createClient();

            server.use(
                http.get(`${BASE_URL}/ramp/order/order-pix-1`, () => {
                    return HttpResponse.json({
                        orderId: 'order-pix-1',
                        customerId: 'cust-br-1',
                        createdAt: '2025-07-01T00:00:00Z',
                        updatedAt: '2025-07-02T00:00:00Z',
                        amountInFiat: '100',
                        amountInTokens: '20',
                        walletId: 'wallet-1',
                        bankAccountId: 'bank-pix-1',
                        depositPixKey: 'etherfuse-deposit-pix-key-uuid',
                        depositPixKeyType: 'evp',
                        depositPixCode: 'BR-EMV-COPYPASTE-STRING',
                        orderType: 'onramp',
                        status: 'funded',
                        statusPage: 'https://status.test/order-pix-1',
                    });
                }),
            );

            const tx = await client.getOnRampTransaction('order-pix-1');
            expect(tx).not.toBeNull();
            expect(tx!.paymentInstructions).toBeDefined();
            expect(tx!.paymentInstructions!.type).toBe('pix');
            const pix = tx!.paymentInstructions as PixPaymentInstructions;
            expect(pix.pixKey).toBe('etherfuse-deposit-pix-key-uuid');
            expect(pix.pixCode).toBe('BR-EMV-COPYPASTE-STRING');
        });
    });
});
