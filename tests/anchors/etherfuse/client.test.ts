import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { EtherfuseClient } from '$lib/anchors/etherfuse/client';
import type {
    EtherfuseSpeiDeposit,
    EtherfusePixDeposit,
    EtherfuseKycIdentityRequest,
    EtherfuseKycDocumentRequest,
} from '$lib/anchors/etherfuse/types';

const BASE_URL = 'http://etherfuse.test';
const API_KEY = 'test-api-key';
const STELLAR_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createClient() {
    return new EtherfuseClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

// ---------------------------------------------------------------------------
// metadata
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('exposes provider identity and token catalog', () => {
        const client = createClient();
        expect(client.name).toBe('etherfuse');
        expect(client.displayName).toBe('Etherfuse');
        expect(client.supportedCurrencies).toEqual(['MXN', 'BRL']);
        expect(client.supportedRails).toEqual(['spei', 'pix']);

        const cetes = client.supportedTokens.find((t) => t.symbol === 'CETES');
        expect(cetes).toBeDefined();
        expect(cetes?.fiatCurrency).toBe('MXN');
        expect(cetes?.rail).toBe('spei');

        const tesouro = client.supportedTokens.find((t) => t.symbol === 'TESOURO');
        expect(tesouro?.fiatCurrency).toBe('BRL');
        expect(tesouro?.rail).toBe('pix');
    });
});

// ---------------------------------------------------------------------------
// createCustomer
// ---------------------------------------------------------------------------

describe('createCustomer', () => {
    it('creates a customer and returns id, email, kycStatus, bankAccountId', async () => {
        const client = createClient();

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                // Email travels under `userInfo`, not at the top level.
                expect(body).not.toHaveProperty('email');
                expect(body.publicKey).toBe(STELLAR_PUBKEY);
                expect(body.blockchain).toBe('stellar');
                expect(body.customerId).toMatch(UUID_PATTERN);
                expect(body.bankAccountId).toMatch(UUID_PATTERN);
                // `userInfo` is recommended (soon required) by Etherfuse so the
                // customer's eventual sign-in attaches to the right user record.
                expect(body.userInfo).toEqual({
                    email: 'alice@example.com',
                    displayName: 'alice@example.com',
                });
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );

        const customer = await client.createCustomer({
            publicKey: STELLAR_PUBKEY,
            email: 'alice@example.com',
            country: 'MX',
        });

        expect(customer.id).toMatch(UUID_PATTERN);
        expect(customer.email).toBe('alice@example.com');
        expect(customer.country).toBe('MX');
        expect(customer.kycStatus).toBe('not_started');
        expect(customer.bankAccountId).toMatch(UUID_PATTERN);
        expect(customer.createdAt).toBeTruthy();
        expect(customer.updatedAt).toBeTruthy();
    });

    it('throws MISSING_PUBLIC_KEY when publicKey is empty', async () => {
        const client = createClient();
        await expect(
            client.createCustomer({ publicKey: '', email: 'x@y.z' }),
        ).rejects.toMatchObject({
            name: 'EtherfuseError',
            code: 'MISSING_PUBLIC_KEY',
            statusCode: 400,
        });
    });

    it('throws INVALID_PUBLIC_KEY for malformed Stellar keys', async () => {
        const client = createClient();
        await expect(
            client.createCustomer({ publicKey: 'not-a-stellar-key' }),
        ).rejects.toMatchObject({
            name: 'EtherfuseError',
            code: 'INVALID_PUBLIC_KEY',
            statusCode: 400,
        });
    });

    it('recovers existing customer + bank account on 409 conflict', async () => {
        const client = createClient();
        const existingCustomerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const existingBankAccountId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () =>
                HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: `Wallet already registered; see org: ${existingCustomerId}`,
                        },
                    },
                    { status: 409 },
                ),
            ),
            http.post(`${BASE_URL}/ramp/customer/${existingCustomerId}/bank-accounts`, () =>
                HttpResponse.json({
                    items: [
                        {
                            bankAccountId: existingBankAccountId,
                            customerId: existingCustomerId,
                            createdAt: '2026-01-01T00:00:00Z',
                            updatedAt: '2026-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                }),
            ),
        );

        const customer = await client.createCustomer({
            publicKey: STELLAR_PUBKEY,
            email: 'alice@example.com',
        });

        expect(customer.id).toBe(existingCustomerId);
        expect(customer.bankAccountId).toBe(existingBankAccountId);
    });

    it('re-throws 409 when message does not match the recovery pattern', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () =>
                HttpResponse.json(
                    { error: { code: 'CONFLICT', message: 'something else' } },
                    { status: 409 },
                ),
            ),
        );
        await expect(client.createCustomer({ publicKey: STELLAR_PUBKEY })).rejects.toMatchObject({
            statusCode: 409,
        });
    });

    it('completes 409 recovery with undefined bankAccountId when bank-account lookup throws', async () => {
        const client = createClient();
        const existingCustomerId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () =>
                HttpResponse.json(
                    {
                        error: {
                            code: 'CONFLICT',
                            message: `already registered; see org: ${existingCustomerId}`,
                        },
                    },
                    { status: 409 },
                ),
            ),
            http.post(`${BASE_URL}/ramp/customer/${existingCustomerId}/bank-accounts`, () =>
                HttpResponse.json(
                    { error: { code: 'INTERNAL', message: 'boom' } },
                    { status: 500 },
                ),
            ),
        );

        const customer = await client.createCustomer({ publicKey: STELLAR_PUBKEY });
        expect(customer.id).toBe(existingCustomerId);
        expect(customer.bankAccountId).toBeUndefined();
    });

    it('re-throws non-409 errors verbatim', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, () =>
                HttpResponse.json(
                    { error: { code: 'BAD_REQUEST', message: 'invalid' } },
                    { status: 400 },
                ),
            ),
        );
        await expect(client.createCustomer({ publicKey: STELLAR_PUBKEY })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
            statusCode: 400,
        });
    });
});

// ---------------------------------------------------------------------------
// getCustomer
// ---------------------------------------------------------------------------

describe('getCustomer', () => {
    it('returns the customer on success', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1`, () =>
                HttpResponse.json({
                    customerId: 'cust-1',
                    displayName: null,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-02T00:00:00Z',
                }),
            ),
        );

        const customer = await client.getCustomer('cust-1');
        expect(customer).toMatchObject({
            id: 'cust-1',
            kycStatus: 'not_started',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
        });
    });

    it('returns null on 404', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/missing`, () =>
                HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'no customer' } },
                    { status: 404 },
                ),
            ),
        );
        expect(await client.getCustomer('missing')).toBeNull();
    });

    it('throws MISSING_CUSTOMER_ID when called with empty id', async () => {
        const client = createClient();
        await expect(client.getCustomer('')).rejects.toMatchObject({
            code: 'MISSING_CUSTOMER_ID',
            statusCode: 400,
        });
    });
});

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------

describe('getQuote', () => {
    it('resolves symbol → CODE:ISSUER via /ramp/assets and returns a quote', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('blockchain')).toBe('stellar');
                expect(url.searchParams.get('currency')).toBe('mxn');
                expect(url.searchParams.get('wallet')).toBe(STELLAR_PUBKEY);
                return HttpResponse.json({
                    assets: [
                        {
                            symbol: 'CETES',
                            identifier: 'CETES:GCRYUGD5',
                            name: 'CETES',
                            currency: 'MXN',
                            balance: null,
                            image: null,
                        },
                    ],
                });
            }),
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quoteAssets).toMatchObject({
                    type: 'onramp',
                    sourceAsset: 'MXN',
                    targetAsset: 'CETES:GCRYUGD5',
                });
                expect(body.sourceAmount).toBe('1000');
                // Stellar on-ramp quotes include the destination wallet so the
                // quote fee can cover one-time account/trustline onboarding.
                expect(body.walletAddress).toBe(STELLAR_PUBKEY);
                return HttpResponse.json({
                    quoteId: 'q-1',
                    customerId: 'cust-1',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5',
                    },
                    sourceAmount: '1000',
                    destinationAmount: '950',
                    exchangeRate: '0.95',
                    feeBps: '20',
                    feeAmount: '2',
                    destinationAmountAfterFee: '948',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                    expiresAt: '2026-01-01T00:02:00Z',
                });
            }),
        );

        const quote = await client.getQuote({
            fromAsset: 'MXN',
            toAsset: 'CETES',
            sourceAmount: '1000',
            customerId: 'cust-1',
            stellarAddress: STELLAR_PUBKEY,
        });

        expect(quote).toMatchObject({
            id: 'q-1',
            ramp: 'onramp',
            sourceAsset: 'MXN',
            targetAsset: 'CETES:GCRYUGD5',
            destinationAmount: '948', // after-fee preferred
            exchangeRate: '0.95',
            fee: '2',
            feeBps: '20',
        });
    });

    it('skips /ramp/assets when both fromAsset and toAsset are pre-resolved CODE:ISSUER strings', async () => {
        const client = createClient();
        let assetsHit = false;
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () => {
                assetsHit = true;
                return HttpResponse.json({ assets: [] });
            }),
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quoteAssets).toMatchObject({
                    type: 'offramp',
                    sourceAsset: 'CETES:GCRYUGD5',
                    targetAsset: 'USDC:GA1234',
                });
                return HttpResponse.json({
                    quoteId: 'q-swap',
                    customerId: '',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'offramp',
                        sourceAsset: 'CETES:GCRYUGD5',
                        targetAsset: 'USDC:GA1234',
                    },
                    sourceAmount: '50',
                    destinationAmount: '50',
                    exchangeRate: '1',
                    feeBps: null,
                    feeAmount: null,
                    destinationAmountAfterFee: null,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                    expiresAt: '2026-01-01T00:02:00Z',
                });
            }),
        );

        await client.getQuote({
            fromAsset: 'CETES:GCRYUGD5',
            toAsset: 'USDC:GA1234',
            sourceAmount: '50',
        });
        expect(assetsHit).toBe(false);
    });

    it('detects off-ramp direction when source is CODE:ISSUER and target is fiat', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () =>
                HttpResponse.json({
                    assets: [
                        {
                            symbol: 'MXN',
                            identifier: 'MXN',
                            name: 'MXN',
                            currency: 'MXN',
                            balance: null,
                            image: null,
                        },
                    ],
                }),
            ),
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quoteAssets).toMatchObject({
                    type: 'offramp',
                    sourceAsset: 'CETES:GCRYUGD5',
                    targetAsset: 'MXN',
                });
                // walletAddress only applies to on-ramps (it funds the
                // destination Stellar wallet); off-ramps must not send it.
                expect(body).not.toHaveProperty('walletAddress');
                return HttpResponse.json({
                    quoteId: 'q-off',
                    customerId: '',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'offramp',
                        sourceAsset: 'CETES:GCRYUGD5',
                        targetAsset: 'MXN',
                    },
                    sourceAmount: '50',
                    destinationAmount: '500',
                    exchangeRate: '10',
                    feeBps: null,
                    feeAmount: null,
                    destinationAmountAfterFee: null,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                    expiresAt: '2026-01-01T00:02:00Z',
                });
            }),
        );

        const quote = await client.getQuote({
            fromAsset: 'CETES:GCRYUGD5',
            toAsset: 'MXN',
            sourceAmount: '50',
            stellarAddress: STELLAR_PUBKEY,
        });

        expect(quote.ramp).toBe('offramp');
        expect(quote.fee).toBe('0');
        expect(quote.feeBps).toBeUndefined();
        expect(quote.destinationAmount).toBe('500');
    });

    it('serializes sourceAmount as a string even when a number is passed', async () => {
        // Regression: Etherfuse's API rejects numeric `sourceAmount` with a
        // 400 ("invalid type: integer, expected a string"). Svelte's
        // `<input type="number">` bindings leak numbers despite the type
        // signature, so the client coerces defensively.
        const client = createClient();
        let bodyText = '';
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, () =>
                HttpResponse.json({
                    assets: [
                        {
                            symbol: 'CETES',
                            identifier: 'CETES:GCRYUGD5',
                            name: 'CETES',
                            currency: 'MXN',
                            balance: null,
                            image: null,
                        },
                    ],
                }),
            ),
            http.post(`${BASE_URL}/ramp/quote`, async ({ request }) => {
                bodyText = await request.text();
                return HttpResponse.json({
                    quoteId: 'q-num',
                    customerId: '',
                    blockchain: 'stellar',
                    quoteAssets: {
                        type: 'onramp',
                        sourceAsset: 'MXN',
                        targetAsset: 'CETES:GCRYUGD5',
                    },
                    sourceAmount: '500',
                    destinationAmount: '475',
                    exchangeRate: '0.95',
                    feeBps: null,
                    feeAmount: null,
                    destinationAmountAfterFee: null,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                    expiresAt: '2026-01-01T00:02:00Z',
                });
            }),
        );

        await client.getQuote({
            fromAsset: 'MXN',
            toAsset: 'CETES',
            // Cast through unknown to bypass the string-only type guard — this
            // mirrors what happens at runtime when `<input type="number">`
            // assigns a number to a `string`-typed binding.
            sourceAmount: 500 as unknown as string,
            stellarAddress: STELLAR_PUBKEY,
        });

        expect(bodyText).toContain('"sourceAmount":"500"');
        expect(bodyText).not.toContain('"sourceAmount":500');
    });
});

// ---------------------------------------------------------------------------
// createOnRampOrder / getOnRampOrder
// ---------------------------------------------------------------------------

describe('createOnRampOrder', () => {
    it('auto-fetches bankAccountId when omitted and maps SPEI deposit instructions', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () =>
                HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-spei',
                            customerId: 'cust-1',
                            createdAt: '2026-01-01T00:00:00Z',
                            updatedAt: '2026-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 1,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                }),
            ),
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.bankAccountId).toBe('bank-spei');
                expect(body.publicKey).toBe(STELLAR_PUBKEY);
                expect(body.quoteId).toBe('q-1');
                return HttpResponse.json({
                    onramp: {
                        orderId: 'order-1',
                        depositAmount: '1000',
                        depositClabe: '012180001234567890',
                        depositBankName: 'BBVA',
                        depositAccountHolder: 'Etherfuse SPEI',
                    },
                });
            }),
        );

        const order = await client.createOnRampOrder({
            customerId: 'cust-1',
            quoteId: 'q-1',
            publicKey: STELLAR_PUBKEY,
        });

        expect(order.id).toBe('order-1');
        expect(order.status).toBe('created');
        const deposit = order.deposit as EtherfuseSpeiDeposit | undefined;
        expect(deposit?.rail).toBe('spei');
        expect(deposit?.clabe).toBe('012180001234567890');
        expect(deposit?.bankName).toBe('BBVA');
        expect(deposit?.beneficiary).toBe('Etherfuse SPEI');
        expect(deposit?.amount).toBe('1000');
    });

    it('maps PIX deposit fields when present', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/order`, () =>
                HttpResponse.json({
                    onramp: {
                        orderId: 'order-pix',
                        depositAmount: '500',
                        depositPixKey: 'cpf@etherfuse',
                        depositPixKeyType: 'email',
                        depositPixCode: '00020126...',
                        beneficiary: 'Etherfuse BR',
                    },
                }),
            ),
        );

        const order = await client.createOnRampOrder({
            customerId: 'cust-1',
            quoteId: 'q-1',
            publicKey: STELLAR_PUBKEY,
            bankAccountId: 'bank-pix',
        });

        const deposit = order.deposit as EtherfusePixDeposit | undefined;
        expect(deposit?.rail).toBe('pix');
        expect(deposit?.pixCode).toBe('00020126...');
        expect(deposit?.pixKey).toBe('cpf@etherfuse');
        expect(deposit?.pixKeyType).toBe('email');
        expect(deposit?.beneficiary).toBe('Etherfuse BR');
    });

    it('throws NO_BANK_ACCOUNT when customer has no registered accounts and none was provided', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-empty/bank-accounts`, () =>
                HttpResponse.json({
                    items: [],
                    totalItems: 0,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 0,
                }),
            ),
        );
        await expect(
            client.createOnRampOrder({
                customerId: 'cust-empty',
                quoteId: 'q-1',
                publicKey: STELLAR_PUBKEY,
            }),
        ).rejects.toMatchObject({ code: 'NO_BANK_ACCOUNT', statusCode: 400 });
    });
});

describe('getOnRampOrder', () => {
    it('maps order response with PIX deposit and fee fields', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-1`, () =>
                HttpResponse.json({
                    orderId: 'order-1',
                    customerId: 'cust-1',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:01:00Z',
                    amountInFiat: '500',
                    amountInTokens: '1.5',
                    walletId: '',
                    bankAccountId: 'bank-pix',
                    depositPixCode: '00020126...',
                    depositPixKey: 'cpf@etherfuse',
                    depositPixKeyType: 'email',
                    orderType: 'onramp',
                    status: 'funded',
                    statusPage: 'https://etherfuse.test/orders/order-1',
                    feeBps: 20,
                    feeAmountInFiat: '1',
                }),
            ),
        );

        const order = await client.getOnRampOrder('order-1');
        expect(order).toMatchObject({
            id: 'order-1',
            status: 'funded',
            amountInFiat: '500',
            amountInTokens: '1.5',
            feeBps: 20,
            feeAmountInFiat: '1',
            statusPage: 'https://etherfuse.test/orders/order-1',
        });
        const deposit = order!.deposit as EtherfusePixDeposit;
        expect(deposit.rail).toBe('pix');
        expect(deposit.pixCode).toBe('00020126...');
    });

    it('maps SPEI deposit, bank metadata, and Stellar claim fields', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-spei`, () =>
                HttpResponse.json({
                    orderId: 'order-spei',
                    customerId: 'cust-1',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:01:00Z',
                    amountInFiat: '1000',
                    amountInTokens: '997',
                    walletId: '',
                    bankAccountId: 'bank-spei',
                    depositClabe: '012180001234567890',
                    depositBankName: 'STP',
                    depositAccountHolder: 'Etherfuse MX',
                    orderType: 'onramp',
                    status: 'completed',
                    statusPage: 'https://etherfuse.test/orders/order-spei',
                    // Returned on completed Stellar onramps to a new/trustline-less
                    // wallet — the user signs this to claim their tokens.
                    stellarClaimableBalanceId: '00000000abc123',
                    stellarClaimTransaction: 'AAAAAgAAAACCLAIM_XDR===',
                }),
            ),
        );

        const order = await client.getOnRampOrder('order-spei');
        const deposit = order!.deposit as EtherfuseSpeiDeposit;
        expect(deposit.rail).toBe('spei');
        expect(deposit.clabe).toBe('012180001234567890');
        expect(deposit.bankName).toBe('STP');
        expect(deposit.beneficiary).toBe('Etherfuse MX');
        expect(order?.stellarClaimableBalanceId).toBe('00000000abc123');
        expect(order?.stellarClaimTransaction).toBe('AAAAAgAAAACCLAIM_XDR===');
    });

    it('returns null on 404', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/missing`, () =>
                HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'no order' } },
                    { status: 404 },
                ),
            ),
        );
        expect(await client.getOnRampOrder('missing')).toBeNull();
    });

    it('passes through unmapped status strings without transformation', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-x`, () =>
                HttpResponse.json({
                    orderId: 'order-x',
                    customerId: 'cust-1',
                    createdAt: '',
                    updatedAt: '',
                    walletId: '',
                    bankAccountId: '',
                    orderType: 'onramp',
                    status: 'created',
                    statusPage: '',
                }),
            ),
        );
        const order = await client.getOnRampOrder('order-x');
        expect(order?.status).toBe('created');
    });
});

// ---------------------------------------------------------------------------
// createOffRampOrder / getOffRampOrder
// ---------------------------------------------------------------------------

describe('createOffRampOrder', () => {
    it('creates an off-ramp order with burnTransaction undefined (deferred signing)', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.bankAccountId).toBe('bank-1');
                expect(body.quoteId).toBe('q-off');
                expect(body.memo).toBe('refund-123');
                return HttpResponse.json({ offramp: { orderId: 'order-off-1' } });
            }),
        );

        const order = await client.createOffRampOrder({
            customerId: 'cust-1',
            quoteId: 'q-off',
            publicKey: STELLAR_PUBKEY,
            bankAccountId: 'bank-1',
            memo: 'refund-123',
        });

        expect(order.id).toBe('order-off-1');
        expect(order.status).toBe('created');
        expect(order.bankAccountId).toBe('bank-1');
        expect(order.burnTransaction).toBeUndefined();
    });

    it('requests anchor mode and maps the anchor payment details', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.useAnchor).toBe(true);
                return HttpResponse.json({
                    offramp: {
                        orderId: 'order-anchor',
                        withdrawAnchorAccount:
                            'GABPM7AXXSE27X3NIN5IVSFCW5AWQLF3RFGUZCW3USNFRZCHLU6CC3SN',
                        withdrawMemo: 'RkFLRU1FTU8xMjM0NTY3ODkw',
                        withdrawMemoType: 'hash',
                    },
                });
            }),
        );

        const order = await client.createOffRampOrder({
            customerId: 'cust-1',
            quoteId: 'q-off',
            publicKey: STELLAR_PUBKEY,
            bankAccountId: 'bank-1',
            useAnchor: true,
        });

        expect(order.isAnchorOrder).toBe(true);
        expect(order.anchorAccount).toBe(
            'GABPM7AXXSE27X3NIN5IVSFCW5AWQLF3RFGUZCW3USNFRZCHLU6CC3SN',
        );
        expect(order.anchorMemo).toBe('RkFLRU1FTU8xMjM0NTY3ODkw');
        expect(order.anchorMemoType).toBe('hash');
        expect(order.burnTransaction).toBeUndefined();
    });

    it('omits useAnchor from the request body for the default burn flow', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/order`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body).not.toHaveProperty('useAnchor');
                return HttpResponse.json({ offramp: { orderId: 'order-burn' } });
            }),
        );
        const order = await client.createOffRampOrder({
            customerId: 'cust-1',
            quoteId: 'q-off',
            publicKey: STELLAR_PUBKEY,
            bankAccountId: 'bank-1',
        });
        expect(order.isAnchorOrder).toBeUndefined();
    });
});

describe('getOffRampOrder', () => {
    it('returns the burnTransaction XDR once Etherfuse has prepared it', async () => {
        const client = createClient();
        const xdr = 'AAAAAgAAAACTEST_BURN_XDR===';
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-off-1`, () =>
                HttpResponse.json({
                    orderId: 'order-off-1',
                    customerId: 'cust-1',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:05:00Z',
                    amountInTokens: '50',
                    amountInFiat: '500',
                    walletId: '',
                    bankAccountId: 'bank-1',
                    burnTransaction: xdr,
                    orderType: 'offramp',
                    status: 'created',
                    statusPage: 'https://etherfuse.test/orders/order-off-1',
                    feeBps: 25,
                    feeAmountInFiat: '1.25',
                }),
            ),
        );

        const order = await client.getOffRampOrder('order-off-1');
        expect(order?.burnTransaction).toBe(xdr);
        expect(order?.amountInTokens).toBe('50');
        expect(order?.amountInFiat).toBe('500');
        expect(order?.feeBps).toBe(25);
        expect(order?.statusPage).toBe('https://etherfuse.test/orders/order-off-1');
    });

    it('maps anchor-mode payment details from an order fetch', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-anchor`, () =>
                HttpResponse.json({
                    orderId: 'order-anchor',
                    customerId: 'cust-1',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:05:00Z',
                    amountInTokens: '50',
                    amountInFiat: '500',
                    walletId: '',
                    bankAccountId: 'bank-1',
                    isAnchorOrder: true,
                    withdrawAnchorAccount:
                        'GABPM7AXXSE27X3NIN5IVSFCW5AWQLF3RFGUZCW3USNFRZCHLU6CC3SN',
                    withdrawMemo: 'RkFLRU1FTU8xMjM0NTY3ODkw',
                    withdrawMemoType: 'hash',
                    orderType: 'offramp',
                    status: 'created',
                    statusPage: '',
                }),
            ),
        );
        const order = await client.getOffRampOrder('order-anchor');
        expect(order?.isAnchorOrder).toBe(true);
        expect(order?.anchorAccount).toBe(
            'GABPM7AXXSE27X3NIN5IVSFCW5AWQLF3RFGUZCW3USNFRZCHLU6CC3SN',
        );
        expect(order?.anchorMemo).toBe('RkFLRU1FTU8xMjM0NTY3ODkw');
        expect(order?.anchorMemoType).toBe('hash');
    });

    it('passes through the terminal `finalized` status (reversal window elapsed)', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/order-final`, () =>
                HttpResponse.json({
                    orderId: 'order-final',
                    customerId: 'cust-1',
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T01:00:00Z',
                    amountInTokens: '50',
                    amountInFiat: '500',
                    walletId: '',
                    bankAccountId: 'bank-1',
                    orderType: 'offramp',
                    status: 'finalized',
                    statusPage: '',
                }),
            ),
        );
        const order = await client.getOffRampOrder('order-final');
        expect(order?.status).toBe('finalized');
    });

    it('returns null on 404', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/order/none`, () =>
                HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'no order' } },
                    { status: 404 },
                ),
            ),
        );
        expect(await client.getOffRampOrder('none')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// listBankAccounts
// ---------------------------------------------------------------------------

describe('listBankAccounts', () => {
    it('maps SPEI and PIX accounts by inspecting the response fields', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/bank-accounts`, () =>
                HttpResponse.json({
                    items: [
                        {
                            bankAccountId: 'bank-spei',
                            customerId: 'cust-1',
                            createdAt: '2026-01-01T00:00:00Z',
                            updatedAt: '2026-01-01T00:00:00Z',
                            abbrClabe: '1234...5678',
                            label: 'Alice BBVA',
                            compliant: true,
                            status: 'active',
                        },
                        {
                            bankAccountId: 'bank-pix',
                            customerId: 'cust-1',
                            createdAt: '2026-01-02T00:00:00Z',
                            updatedAt: '2026-01-02T00:00:00Z',
                            pixKey: 'cpf@etherfuse',
                            pixKeyType: 'email',
                            accountHolderName: 'Alice',
                            compliant: true,
                            status: 'active',
                        },
                    ],
                    totalItems: 2,
                    pageSize: 100,
                    pageNumber: 0,
                    totalPages: 1,
                }),
            ),
        );

        const accounts = await client.listBankAccounts('cust-1');
        expect(accounts).toHaveLength(2);

        const spei = accounts[0];
        expect(spei).toMatchObject({
            id: 'bank-spei',
            rail: 'spei',
            accountIdentifier: '1234...5678',
            // Account holder name comes from the `label` field on real accounts.
            accountHolderName: 'Alice BBVA',
            compliant: true,
            status: 'active',
        });

        const pix = accounts[1];
        expect(pix).toMatchObject({
            id: 'bank-pix',
            rail: 'pix',
            accountIdentifier: 'cpf@etherfuse',
            accountHolderName: 'Alice',
        });
    });

    it('returns an empty array on 404', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/customer/no-such/bank-accounts`, () =>
                HttpResponse.json({ error: { code: 'NOT_FOUND', message: '' } }, { status: 404 }),
            ),
        );
        expect(await client.listBankAccounts('no-such')).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

describe('getKycUrl', () => {
    it('returns the presigned URL on success', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.customerId).toBe('cust-1');
                expect(body.bankAccountId).toBe('bank-1');
                expect(body.publicKey).toBe(STELLAR_PUBKEY);
                return HttpResponse.json({ presigned_url: 'https://onboard.test/xyz' });
            }),
        );

        const url = await client.getKycUrl({
            customerId: 'cust-1',
            publicKey: STELLAR_PUBKEY,
            bankAccountId: 'bank-1',
        });
        expect(url).toBe('https://onboard.test/xyz');
    });

    it('generates a fresh bankAccountId when omitted', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/onboarding-url`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.bankAccountId).toMatch(UUID_PATTERN);
                return HttpResponse.json({ presigned_url: 'https://onboard.test/abc' });
            }),
        );
        await client.getKycUrl({ customerId: 'cust-1', publicKey: STELLAR_PUBKEY });
    });

    it('throws MISSING_PUBLIC_KEY when publicKey is empty', async () => {
        const client = createClient();
        await expect(
            client.getKycUrl({ customerId: 'cust-1', publicKey: '' }),
        ).rejects.toMatchObject({ code: 'MISSING_PUBLIC_KEY', statusCode: 400 });
    });
});

describe('getKycStatus', () => {
    it.each([
        ['not_started'],
        ['proposed'],
        ['approved'],
        ['approved_chain_deploying'],
        ['rejected'],
    ] as const)('returns the native status %s', async (status) => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1/kyc/${STELLAR_PUBKEY}`, () =>
                HttpResponse.json({
                    customerId: 'cust-1',
                    walletPublicKey: STELLAR_PUBKEY,
                    status,
                }),
            ),
        );
        expect(await client.getKycStatus({ customerId: 'cust-1', publicKey: STELLAR_PUBKEY })).toBe(
            status,
        );
    });

    it('throws MISSING_PUBLIC_KEY when publicKey is empty', async () => {
        const client = createClient();
        await expect(
            client.getKycStatus({ customerId: 'cust-1', publicKey: '' }),
        ).rejects.toMatchObject({ code: 'MISSING_PUBLIC_KEY', statusCode: 400 });
    });
});

describe('submitKycIdentity / submitKycDocuments', () => {
    it('POSTs identity to /ramp/customer/{id}/kyc', async () => {
        const client = createClient();
        const identity: EtherfuseKycIdentityRequest = {
            pubkey: STELLAR_PUBKEY,
            identity: {
                name: { givenName: 'Alice', familyName: 'Doe' },
                dateOfBirth: '1990-01-15',
                address: {
                    street: '123 Main',
                    city: 'CDMX',
                    region: 'CDMX',
                    postalCode: '06600',
                    country: 'MX',
                },
                idNumbers: [{ value: 'CURP123', type: 'CURP' }],
            },
        };
        let captured: unknown = null;
        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/kyc`, async ({ request }) => {
                captured = await request.json();
                return HttpResponse.json({ status: 'ok' });
            }),
        );

        await client.submitKycIdentity('cust-1', identity);
        expect(captured).toEqual(identity);
    });

    it('POSTs documents to /ramp/customer/{id}/kyc/documents', async () => {
        const client = createClient();
        const document: EtherfuseKycDocumentRequest = {
            pubkey: STELLAR_PUBKEY,
            documentType: 'selfie',
            images: [{ label: 'selfie', image: 'data:image/jpeg;base64,xxx' }],
        };
        let captured: unknown = null;
        server.use(
            http.post(`${BASE_URL}/ramp/customer/cust-1/kyc/documents`, async ({ request }) => {
                captured = await request.json();
                return HttpResponse.json({ status: 'ok' });
            }),
        );
        await client.submitKycDocuments('cust-1', document);
        expect(captured).toEqual(document);
    });
});

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

describe('agreements', () => {
    function setup() {
        const calls: string[] = [];
        server.use(
            http.post(`${BASE_URL}/ramp/agreements/electronic-signature`, () => {
                calls.push('electronic-signature');
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2026-01-01T00:00:00Z',
                    agreementType: 'electronic_signature',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/terms-and-conditions`, () => {
                calls.push('terms-and-conditions');
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2026-01-01T00:00:00Z',
                    agreementType: 'terms_and_conditions',
                });
            }),
            http.post(`${BASE_URL}/ramp/agreements/customer-agreement`, () => {
                calls.push('customer-agreement');
                return HttpResponse.json({
                    success: true,
                    acceptedAt: '2026-01-01T00:00:00Z',
                    agreementType: 'customer_agreement',
                });
            }),
        );
        return calls;
    }

    it('acceptAgreements calls all three endpoints in sequence', async () => {
        const client = createClient();
        const calls = setup();
        const result = await client.acceptAgreements('https://onboard.test/abc');
        expect(calls).toEqual([
            'electronic-signature',
            'terms-and-conditions',
            'customer-agreement',
        ]);
        expect(result.agreementType).toBe('customer_agreement');
    });

    it('each accept* method targets its own endpoint', async () => {
        const client = createClient();
        const calls = setup();
        await client.acceptElectronicSignature('u');
        await client.acceptTermsAndConditions('u');
        await client.acceptCustomerAgreement('u');
        expect(calls).toEqual([
            'electronic-signature',
            'terms-and-conditions',
            'customer-agreement',
        ]);
    });
});

// ---------------------------------------------------------------------------
// getAssets
// ---------------------------------------------------------------------------

describe('getAssets', () => {
    it('queries /ramp/assets with the provided blockchain/currency/wallet', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/assets`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('blockchain')).toBe('stellar');
                expect(url.searchParams.get('currency')).toBe('brl');
                expect(url.searchParams.get('wallet')).toBe(STELLAR_PUBKEY);
                return HttpResponse.json({
                    assets: [
                        {
                            symbol: 'TESOURO',
                            identifier: 'TESOURO:GC3CW7ED',
                            name: 'TESOURO',
                            currency: 'BRL',
                            balance: '0',
                            image: null,
                        },
                    ],
                });
            }),
        );

        const result = await client.getAssets({ currency: 'brl', wallet: STELLAR_PUBKEY });
        expect(result.assets).toHaveLength(1);
        expect(result.assets[0].symbol).toBe('TESOURO');
    });
});

// ---------------------------------------------------------------------------
// simulateFiatReceived
// ---------------------------------------------------------------------------

describe('simulateFiatReceived', () => {
    it('returns the HTTP status code from the Etherfuse response', async () => {
        const client = createClient();
        server.use(
            http.post(`${BASE_URL}/ramp/order/fiat_received`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.orderId).toBe('order-1');
                return new HttpResponse(null, { status: 200 });
            }),
        );
        expect(await client.simulateFiatReceived('order-1')).toBe(200);
    });

    it('returns 404 when the order is not found (no throw)', async () => {
        const client = createClient();
        server.use(
            http.post(
                `${BASE_URL}/ramp/order/fiat_received`,
                () => new HttpResponse('not found', { status: 404 }),
            ),
        );
        expect(await client.simulateFiatReceived('missing')).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('request error handling', () => {
    it('parses JSON error bodies into EtherfuseError', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-json`, () =>
                HttpResponse.json(
                    { error: { code: 'CUSTOM_CODE', message: 'something bad' } },
                    { status: 500 },
                ),
            ),
        );
        await expect(client.getCustomer('err-json')).rejects.toMatchObject({
            name: 'EtherfuseError',
            code: 'CUSTOM_CODE',
            message: 'something bad',
            statusCode: 500,
        });
    });

    it('falls back to raw text + UNKNOWN_ERROR for non-JSON error bodies', async () => {
        const client = createClient();
        server.use(
            http.get(
                `${BASE_URL}/ramp/customer/err-text`,
                () => new HttpResponse('boom', { status: 502 }),
            ),
        );
        await expect(client.getCustomer('err-text')).rejects.toMatchObject({
            name: 'EtherfuseError',
            code: 'UNKNOWN_ERROR',
            message: 'boom',
            statusCode: 502,
        });
    });

    it('falls back to UNKNOWN_ERROR when error.code is missing', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-no-code`, () =>
                HttpResponse.json({ error: { message: 'no code field' } }, { status: 400 }),
            ),
        );
        await expect(client.getCustomer('err-no-code')).rejects.toMatchObject({
            code: 'UNKNOWN_ERROR',
            message: 'no code field',
            statusCode: 400,
        });
    });

    it('handles error response with null error field (optional-chaining fallback)', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-null-error`, () =>
                HttpResponse.json({ error: null }, { status: 500 }),
            ),
        );
        await expect(client.getCustomer('err-null-error')).rejects.toMatchObject({
            code: 'UNKNOWN_ERROR',
            statusCode: 500,
        });
    });
});

// ---------------------------------------------------------------------------
// debug logging
// ---------------------------------------------------------------------------

describe('debug logging', () => {
    const customerResponse = {
        customerId: 'cust-1',
        publicKey: STELLAR_PUBKEY,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
    };

    it('is silent by default — request bodies and responses never hit the console', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1`, () => HttpResponse.json(customerResponse)),
        );
        vi.mocked(console.log).mockClear();
        await client.getCustomer('cust-1');
        expect(console.log).not.toHaveBeenCalled();
    });

    it('is silent by default on API errors too', async () => {
        const client = createClient();
        server.use(
            http.get(`${BASE_URL}/ramp/customer/err-1`, () =>
                HttpResponse.json(
                    { error: { code: 'NOT_FOUND', message: 'nope' } },
                    { status: 400 },
                ),
            ),
        );
        vi.mocked(console.error).mockClear();
        await expect(client.getCustomer('err-1')).rejects.toThrow();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('is silent by default in simulateFiatReceived', async () => {
        const client = createClient();
        server.use(http.post(`${BASE_URL}/ramp/order/fiat_received`, () => HttpResponse.json({})));
        vi.mocked(console.log).mockClear();
        await client.simulateFiatReceived('order-1');
        expect(console.log).not.toHaveBeenCalled();
    });

    it('logs requests and responses when debug is enabled', async () => {
        const client = new EtherfuseClient({ apiKey: API_KEY, baseUrl: BASE_URL, debug: true });
        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1`, () => HttpResponse.json(customerResponse)),
        );
        vi.mocked(console.log).mockClear();
        await client.getCustomer('cust-1');
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).toContain(`[Etherfuse] GET ${BASE_URL}/ramp/customer/cust-1`);
        expect(logged).toContain('cust-1');
    });

    it('never logs the API key, even with debug enabled', async () => {
        const client = new EtherfuseClient({ apiKey: API_KEY, baseUrl: BASE_URL, debug: true });
        server.use(
            http.get(`${BASE_URL}/ramp/customer/cust-1`, () => HttpResponse.json(customerResponse)),
        );
        vi.mocked(console.log).mockClear();
        await client.getCustomer('cust-1');
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).not.toContain(API_KEY);
    });
});
