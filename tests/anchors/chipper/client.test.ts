import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { ChipperClient, ChipperError, sandboxCollectionOutcome } from '$lib/anchors/chipper';

const BASE_URL = 'https://chipper.test';
const API_KEY = 'sk_test_supersecret';

function createClient(debug = false) {
    return new ChipperClient({ apiKey: API_KEY, baseUrl: BASE_URL, debug });
}

const ORG = {
    organization: {
        id: 'org_1',
        name: 'SDF Demo',
        country: 'US',
        timezone: 'America/Chicago',
        defaultCurrency: 'USD',
        status: 'sandbox_only',
        createdAt: '2026-09-29T14:40:28.123Z',
        updatedAt: '2026-09-29T14:40:28.123Z',
    },
};

describe('ChipperClient core', () => {
    it('GETs /v1/organization with Bearer auth and the API version header', async () => {
        let auth: string | null = null;
        let version: string | null = null;
        server.use(
            http.get(`${BASE_URL}/v1/organization`, ({ request }) => {
                auth = request.headers.get('authorization');
                version = request.headers.get('chipper-version');
                return HttpResponse.json(ORG);
            }),
        );
        const org = await createClient().getOrganization();
        expect(auth).toBe(`Bearer ${API_KEY}`);
        expect(version).toBe('2026-02-20');
        expect(org.id).toBe('org_1');
        expect(org.status).toBe('sandbox_only');
    });

    it('maps the error envelope to ChipperError with code, status, and requestId', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json(
                    { error: 'unauthorized', message: 'Invalid API key', requestId: 'req_1' },
                    { status: 401 },
                ),
            ),
        );
        const err = await createClient()
            .getOrganization()
            .catch((e) => e);
        expect(err).toBeInstanceOf(ChipperError);
        expect(err).toMatchObject({ code: 'unauthorized', statusCode: 401, requestId: 'req_1' });
    });

    it('folds validation_error details into the message', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json(
                    {
                        error: 'validation_error',
                        message: 'Request validation failed',
                        details: [{ field: 'to.currency', message: 'Required' }],
                        requestId: 'req_2',
                    },
                    { status: 400 },
                ),
            ),
        );
        const err = await createClient()
            .getOrganization()
            .catch((e) => e);
        expect(err.message).toBe('Request validation failed: to.currency Required');
        expect(err.details).toEqual([{ field: 'to.currency', message: 'Required' }]);
    });
});

describe('debug logging', () => {
    it('is silent by default', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient().getOrganization();
        expect(console.log).not.toHaveBeenCalled();
    });

    it('is silent by default on API errors too', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json({ error: 'internal_error', message: 'x' }, { status: 500 }),
            ),
        );
        vi.mocked(console.error).mockClear();
        await expect(createClient().getOrganization()).rejects.toThrow();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('logs requests and responses when debug is enabled', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient(true).getOrganization();
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((c) => c.join(' '))
            .join('\n');
        expect(logged).toContain(`[Chipper] GET ${BASE_URL}/v1/organization`);
        expect(logged).toContain('sandbox_only');
    });

    it('never logs the API key, even with debug enabled', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient(true).getOrganization();
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((c) => c.join(' '))
            .join('\n');
        expect(logged).not.toContain(API_KEY);
    });
});

describe('discovery', () => {
    it('lists mobile money methods for a country', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/capabilities/GH`, () =>
                HttpResponse.json({
                    capabilities: {
                        payouts: [
                            {
                                country: { code: 'GH', name: 'Ghana' },
                                currency: { code: 'GHS', name: 'Ghanaian Cedi' },
                                methods: [
                                    {
                                        code: 'gh_mtn',
                                        name: 'MTN Mobile Money',
                                        type: 'mobile_money',
                                        status: 'operational',
                                        limits: { min: 1, max: 10000, currency: 'GHS' },
                                        estimatedSettlement: '0-5 minutes',
                                        fields: [
                                            {
                                                key: 'accountNumber',
                                                label: 'Phone Number',
                                                type: 'phone',
                                            },
                                        ],
                                    },
                                    {
                                        code: 'gh_gcb',
                                        name: 'GCB Bank',
                                        type: 'bank_transfer',
                                        status: 'operational',
                                        limits: null,
                                        fields: [],
                                    },
                                ],
                            },
                        ],
                        collections: [
                            {
                                country: { code: 'GH', name: 'Ghana' },
                                currency: { code: 'GHS', name: 'Ghanaian Cedi' },
                                methods: [
                                    {
                                        code: 'gh_mtn',
                                        name: 'MTN Mobile Money',
                                        type: 'mobile_money',
                                        status: 'operational',
                                        limits: { min: 1, max: 5000, currency: 'GHS' },
                                        fields: [],
                                    },
                                ],
                            },
                        ],
                    },
                }),
            ),
        );
        const caps = await createClient().getCapabilities('GH');
        expect(caps.collections.map((m) => m.code)).toEqual(['gh_mtn']);
        // Payouts keep mobile money and bank transfer (wallets and crypto are dropped).
        expect(caps.payouts.map((m) => m.code)).toEqual(['gh_mtn', 'gh_gcb']);
        expect(caps.collections[0].limits).toEqual({ min: 1, max: 5000, currency: 'GHS' });
    });

    it('reads the all-in rate from the path-parameter endpoint', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/rates/GHS/USDC`, () =>
                HttpResponse.json({ rate: { from: 'GHS', to: 'USDC', rate: '0.08489111' } }),
            ),
        );
        expect(await createClient().getRate('GHS', 'USDC')).toBe('0.08489111');
    });

    it('validates a mobile money destination and returns the holder name', async () => {
        let body: unknown;
        server.use(
            http.post(`${BASE_URL}/v1/validate`, async ({ request }) => {
                body = await request.json();
                return HttpResponse.json({
                    validation: { valid: true, accountName: 'Ama Mensah' },
                });
            }),
        );
        const v = await createClient().validateDestination({
            code: 'gh_mtn',
            accountNumber: '+233548909027',
        });
        expect(body).toEqual({ code: 'gh_mtn', accountNumber: '+233548909027' });
        expect(v).toEqual({ valid: true, accountName: 'Ama Mensah' });
    });
});

const STELLAR = 'GD7JWSZQ2EPAJFM7RC6NXNVIG2PRQYCEA52NU2RMDX5YRI2HYBDQDANC';
const CHIPPER_TREASURY = 'GCK2CL4BXIYKNQKUEWN6BUH4SNDHUKWOIYCOTGHHTORIDH2OGUBZDLN7';
const ONRAMP_ORDER = {
    order: {
        id: 'ord_on1',
        status: 'awaiting_funds',
        from: { code: 'gh_mtn', accountNumber: '+233548909027', amount: '200.00', currency: 'GHS' },
        to: { code: 'usdc_stellar', accountNumber: STELLAR, amount: '16.978222', currency: 'USDC' },
        fee: { amount: '1.00', currency: 'GHS' },
        rate: '0.08489111',
        instructions: {
            type: 'mobile_money',
            message: 'Approve the payment prompt on +233548909027 for GHS 201.00',
            amount: '201.00',
            currency: 'GHS',
        },
        expectedAmount: '201.00',
        receivedAmount: null,
        collectionId: 'col_1',
        payoutId: null,
        externalReference: 'ref-1',
        statusMessage: null,
        expiresAt: null,
        completedAt: null,
        createdAt: '2026-09-29T21:35:00.000Z',
        updatedAt: '2026-09-29T21:35:00.000Z',
    },
};

const ONRAMP_ARGS = {
    collectionCode: 'gh_mtn',
    phone: '+233548909027',
    fiatCurrency: 'GHS',
    fiatAmount: '200',
    stellarAddress: STELLAR,
    externalReference: 'ref-1',
};

describe('orders', () => {
    it('creates an on-ramp order: mobile money in, usdc_stellar out, amounts as strings', async () => {
        let body: Record<string, unknown> | undefined;
        server.use(
            http.post(`${BASE_URL}/v1/orders`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json(ONRAMP_ORDER, { status: 201 });
            }),
        );
        const order = await createClient().createOnRampOrder(ONRAMP_ARGS);
        expect(body).toEqual({
            from: {
                code: 'gh_mtn',
                accountNumber: '+233548909027',
                amount: '200',
                currency: 'GHS',
            },
            to: { code: 'usdc_stellar', accountNumber: STELLAR, currency: 'USDC' },
            externalReference: 'ref-1',
        });
        expect(order.id).toBe('ord_on1');
        expect(order.expectedAmount).toBe('201.00');
        expect(order.isTerminal).toBe(false);
    });

    it('omits the payer account for a bank-transfer source (Chipper issues a virtual account)', async () => {
        let body: Record<string, unknown> | undefined;
        server.use(
            http.post(`${BASE_URL}/v1/orders`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json(ONRAMP_ORDER, { status: 201 });
            }),
        );
        await createClient().createOnRampOrder({
            collectionCode: 'ke_kcb',
            fiatCurrency: 'KES',
            fiatAmount: '2000',
            stellarAddress: STELLAR,
            externalReference: 'ref-bank',
        });
        expect(body?.from).toEqual({ code: 'ke_kcb', amount: '2000', currency: 'KES' });
    });

    it('rejects an invalid Stellar address before calling the API', async () => {
        await expect(
            createClient().createOnRampOrder({ ...ONRAMP_ARGS, stellarAddress: 'not-a-key' }),
        ).rejects.toMatchObject({ code: 'INVALID_STELLAR_ADDRESS' });
    });

    it('returns the original order on an idempotent replay (200)', async () => {
        server.use(
            http.post(`${BASE_URL}/v1/orders`, () =>
                HttpResponse.json(ONRAMP_ORDER, { status: 200 }),
            ),
        );
        const order = await createClient().createOnRampOrder(ONRAMP_ARGS);
        expect(order.id).toBe('ord_on1');
    });

    it('creates an off-ramp order and surfaces the Stellar deposit address and memo', async () => {
        let body: Record<string, unknown> | undefined;
        server.use(
            http.post(`${BASE_URL}/v1/orders`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json(
                    {
                        order: {
                            ...ONRAMP_ORDER.order,
                            id: 'ord_off1',
                            from: {
                                code: 'usdc_stellar',
                                address: CHIPPER_TREASURY,
                                tag: '3303252620',
                                chain: 'Stellar',
                                amount: '4.000000',
                                currency: 'USDC',
                            },
                            to: {
                                code: 'ke_mpesa',
                                accountNumber: '+254712345678',
                                amount: '518.67',
                                currency: 'KES',
                                kyc: { accountName: 'Test User' },
                            },
                            fee: { amount: '0.020000', currency: 'USDC' },
                            instructions: {
                                type: 'crypto',
                                message: 'Send 4.020000 USDC on Stellar',
                                address: CHIPPER_TREASURY,
                                tag: '3303252620',
                                chain: 'Stellar',
                                amount: '4.020000',
                                currency: 'USDC',
                            },
                        },
                    },
                    { status: 201 },
                );
            }),
        );
        const order = await createClient().createOffRampOrder({
            payoutCode: 'ke_mpesa',
            accountNumber: '+254712345678',
            fiatCurrency: 'KES',
            usdcAmount: '4',
            externalReference: 'ref-2',
        });
        expect(body).toEqual({
            from: { code: 'usdc_stellar', amount: '4', currency: 'USDC' },
            to: { code: 'ke_mpesa', accountNumber: '+254712345678', currency: 'KES' },
            externalReference: 'ref-2',
        });
        expect(order.instructions?.tag).toBe('3303252620');
        expect(order.instructions?.amount).toBe('4.020000');
        expect(order.to.kyc?.accountName).toBe('Test User');
    });

    it.each([
        ['completed', true, false],
        ['failed', true, true],
        ['expired', true, true],
        ['underpaid', false, false],
        ['processing_payout', false, false],
    ])('maps status %s → isTerminal=%s, failed=%s', async (status, isTerminal, failed) => {
        server.use(
            http.get(`${BASE_URL}/v1/orders/ord_on1`, () =>
                HttpResponse.json({ order: { ...ONRAMP_ORDER.order, status } }),
            ),
        );
        const order = await createClient().getOrder('ord_on1');
        expect(order?.isTerminal).toBe(isTerminal);
        expect(order?.failed).toBe(failed);
    });

    it('returns null for an unknown order', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/orders/missing`, () =>
                HttpResponse.json(
                    { error: 'not_found', message: 'Order not found' },
                    { status: 404 },
                ),
            ),
        );
        expect(await createClient().getOrder('missing')).toBeNull();
    });
});

describe('sandboxCollectionOutcome', () => {
    it.each([
        ['100.50', 'delayed_completion'],
        ['100.51', 'failed'],
        ['100.52', 'customer_timeout'],
        ['100.99', 'transient_error_then_reconciled'],
        ['201.00', null],
        ['2010', null],
        ['100.5', 'delayed_completion'],
    ])('%s → %s', (amount, expected) => {
        expect(sandboxCollectionOutcome(amount)).toBe(expected);
    });
});

describe('simulateBankDeposit (sandbox)', () => {
    it("finds the order's virtual account by reference and simulates the transfer", async () => {
        let query: string | null = null;
        let body: unknown;
        server.use(
            http.get(`${BASE_URL}/v1/virtual-accounts`, ({ request }) => {
                query = new URL(request.url).searchParams.get('externalReference');
                return HttpResponse.json({
                    data: [
                        {
                            id: 'va_1',
                            status: 'active',
                            currency: 'KES',
                            bank: 'KCB Bank',
                            accountNumber: '5252184873',
                            accountName: 'Chipper/ord_bank1',
                            externalReference: 'ord_bank1',
                        },
                    ],
                    hasMore: false,
                    nextCursor: null,
                });
            }),
            http.post(`${BASE_URL}/v1/simulations/virtual-account-deposit`, async ({ request }) => {
                body = await request.json();
                return HttpResponse.json(
                    { simulation: { depositId: 'vad_1', requestedOutcome: 'completed' } },
                    { status: 201 },
                );
            }),
        );
        await createClient().simulateBankDeposit({
            orderId: 'ord_bank1',
            amount: '2010.00',
            externalReference: 'sim-1',
        });
        expect(query).toBe('ord_bank1');
        expect(body).toEqual({
            virtualAccountId: 'va_1',
            amount: '2010.00',
            externalReference: 'sim-1',
        });
    });

    it('throws VIRTUAL_ACCOUNT_NOT_FOUND when the order has no virtual account', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/virtual-accounts`, () =>
                HttpResponse.json({ data: [], hasMore: false, nextCursor: null }),
            ),
        );
        await expect(
            createClient().simulateBankDeposit({
                orderId: 'ord_none',
                amount: '1',
                externalReference: 'sim-2',
            }),
        ).rejects.toMatchObject({ code: 'VIRTUAL_ACCOUNT_NOT_FOUND', statusCode: 404 });
    });
});
