import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { KoyweClient, KoyweError, resolveFiatLimits } from '$lib/anchors/koywe';
import type { KoyweTokenCurrency } from '$lib/anchors/koywe';

const BASE_URL = 'http://koywe.test';
const CLIENT_ID = 'test-client-id';
const SECRET = 'test-secret';
const EMAIL = 'stellar-ar@koywe-test.com';
const STELLAR_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const WIREAR_ID = '655bf1159b9b8df1604fe982';

/**
 * Build a client. Email is now optional (per-user operations take it as an
 * argument), so the default client carries no baked-in identity — mirroring the
 * server singleton.
 */
function createClient(email?: string) {
    return new KoyweClient({
        clientId: CLIENT_ID,
        secret: SECRET,
        baseUrl: BASE_URL,
        usdcIssuer: USDC_ISSUER,
        ...(email ? { email } : {}),
    });
}

/**
 * Register a `POST /rest/auth` handler that returns a per-call token and records
 * the email seen on each call (`undefined` for the email-less app token).
 */
function mockAuth() {
    const calls = { count: 0, emails: [] as (string | undefined)[] };
    server.use(
        http.post(`${BASE_URL}/rest/auth`, async ({ request }) => {
            calls.count += 1;
            const body = (await request.json()) as Record<string, unknown>;
            expect(body.clientId).toBe(CLIENT_ID);
            expect(body.secret).toBe(SECRET);
            calls.emails.push(body.email as string | undefined);
            return HttpResponse.json({ token: `tok-${calls.count}` });
        }),
    );
    return calls;
}

function mockProviders() {
    server.use(
        http.get(`${BASE_URL}/rest/payment-providers`, ({ request }) => {
            const symbol = new URL(request.url).searchParams.get('symbol');
            if (symbol === 'MXN') {
                return HttpResponse.json([
                    { _id: 'm1', name: 'WIREMX', fee: 0 },
                    { _id: 'm2', name: 'STP', fee: 0 },
                ]);
            }
            if (symbol === 'COP') {
                return HttpResponse.json([
                    { _id: 'c1', name: 'PSE', fee: 0 },
                    { _id: 'c2', name: 'NEQUI', fee: 0 },
                ]);
            }
            // Default: ARS
            expect(symbol).toBe('ARS');
            return HttpResponse.json([
                { _id: WIREAR_ID, name: 'WIREAR', fee: 1 },
                { _id: 'qri1', name: 'QRI-AR', fee: 0.5 },
                { _id: 'khipu1', name: 'KHIPU', fee: 0 },
            ]);
        }),
    );
}

// ---------------------------------------------------------------------------
// metadata
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('exposes provider identity and the Stellar USDC token (issuer injected)', () => {
        const client = createClient();
        expect(client.name).toBe('koywe');
        expect(client.displayName).toBe('Koywe');
        expect(client.supportedCurrencies).toContain('ARS');
        expect(client.supportedRails).toEqual(['wirear', 'qri', 'spei', 'pse']);

        const usdc = client.supportedTokens.find((t) => t.symbol === 'USDC');
        expect(usdc).toBeDefined();
        expect(usdc?.issuer).toBe(USDC_ISSUER);
        // Koywe's own quote/order symbol for the Stellar asset.
        expect(usdc?.koyweSymbol).toBe('USDC Stellar');
    });
});

// ---------------------------------------------------------------------------
// authentication + token caching
// ---------------------------------------------------------------------------

describe('authentication', () => {
    it('caches an email-less app token and reuses it across catalogue calls', async () => {
        const client = createClient();
        const auth = mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/payment-providers`, ({ request }) => {
                expect(request.headers.get('authorization')).toBe('Bearer tok-1');
                return HttpResponse.json([{ _id: WIREAR_ID, name: 'WIREAR', fee: 1 }]);
            }),
        );

        await client.getPaymentProviders('ARS');
        await client.getPaymentProviders('ARS');
        expect(auth.count).toBe(1);
        expect(auth.emails).toEqual([undefined]);
    });

    it('signs in separately per email and caches each token independently', async () => {
        const client = createClient();
        const auth = mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/accounts/:email/check`, () =>
                HttpResponse.json({ canOperate: true, accountStatus: 'verified' }),
            ),
            http.get(`${BASE_URL}/rest/payment-providers`, () => HttpResponse.json([])),
        );

        await client.checkAccount('a@koywe-test.com');
        await client.checkAccount('a@koywe-test.com');
        await client.checkAccount('b@koywe-test.com');
        await client.getPaymentProviders('ARS'); // email-less app token

        // One auth for each distinct email + one for the app token.
        expect(auth.count).toBe(3);
        expect(auth.emails).toContain('a@koywe-test.com');
        expect(auth.emails).toContain('b@koywe-test.com');
        expect(auth.emails).toContain(undefined);
    });
});

// ---------------------------------------------------------------------------
// getTokenCurrencies
// ---------------------------------------------------------------------------

describe('getTokenCurrencies', () => {
    it('returns the raw token-currency catalogue', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/token-currencies`, () =>
                HttpResponse.json([
                    {
                        _id: 't1',
                        name: 'USD Coin Stellar',
                        symbol: 'USDC Stellar',
                        decimals: 6,
                        currencies: [
                            { _id: 'c1', symbol: 'ARS', name: 'Peso Argentino', decimals: 2 },
                        ],
                    },
                ]),
            ),
        );
        const tokens = await client.getTokenCurrencies();
        expect(tokens).toHaveLength(1);
        expect(tokens[0].symbol).toBe('USDC Stellar');
        expect(tokens[0].currencies[0].symbol).toBe('ARS');
    });
});

// ---------------------------------------------------------------------------
// resolveFiatLimits (pure helper — validate pair + read min/max)
// ---------------------------------------------------------------------------

describe('resolveFiatLimits', () => {
    const tokens: KoyweTokenCurrency[] = [
        {
            _id: 't1',
            name: 'USD Coin Stellar',
            symbol: 'USDC Stellar',
            decimals: 6,
            currencies: [
                {
                    _id: 'c1',
                    symbol: 'ARS',
                    name: 'Peso Argentino',
                    decimals: 2,
                    minimum: 1000,
                    maximum: 5000000,
                },
                {
                    _id: 'c2',
                    symbol: 'CLP',
                    name: 'Peso Chileno',
                    decimals: 0,
                    minimum: 500,
                    maximum: 8500000,
                },
            ],
        },
        {
            _id: 't2',
            name: 'USD Coin Polygon',
            symbol: 'USDC Polygon',
            decimals: 6,
            currencies: [{ _id: 'c3', symbol: 'MXN', name: 'Peso Mexicano', decimals: 2 }],
        },
    ];

    it('returns the min/max for a supported token↔fiat pair', () => {
        expect(resolveFiatLimits(tokens, 'ARS')).toEqual({ min: 1000, max: 5000000 });
    });

    it('returns null when the fiat is not offered for the token (unsupported pair)', () => {
        // MXN exists, but not under USDC Stellar.
        expect(resolveFiatLimits(tokens, 'MXN')).toBeNull();
    });

    it('returns null when the token symbol is absent', () => {
        expect(resolveFiatLimits(tokens, 'ARS', 'USDC Ethereum')).toBeNull();
    });

    it('omits limits that the API did not provide', () => {
        expect(resolveFiatLimits(tokens, 'MXN', 'USDC Polygon')).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// getPaymentProviders
// ---------------------------------------------------------------------------

describe('getPaymentProviders', () => {
    it('maps ARS providers to options with labels and rail ids', async () => {
        const client = createClient();
        mockAuth();
        mockProviders();
        const methods = await client.getPaymentProviders('ARS');
        const byName = Object.fromEntries(methods.map((m) => [m.name, m]));
        expect(byName.WIREAR.id).toBe(WIREAR_ID);
        expect(byName.WIREAR.label).toBe('Bank transfer (CVU)');
        expect(byName.WIREAR.rail).toBe('wirear');
        expect(byName['QRI-AR'].label).toBe('QR transfer');
        expect(byName['QRI-AR'].rail).toBe('qri');
        // Khipu is surfaced (the furthest-progressing rail in sandbox — it
        // confirms fiat, though no rail actually reaches DELIVERED there) but
        // has no shared local rail id.
        expect(byName.KHIPU.label).toBe('Khipu');
        expect(byName.KHIPU.rail).toBeUndefined();
    });

    it('labels and maps Mexican SPEI (WIREMX) providers', async () => {
        // MSW: respond to ?symbol=MXN with [{ _id: 'm1', name: 'WIREMX', fee: 0 }, { _id: 'm2', name: 'STP', fee: 0 }]
        const client = createClient();
        mockAuth();
        mockProviders();
        const methods = await client.getPaymentProviders('MXN');
        const spei = methods.find((m) => m.name === 'WIREMX');
        expect(spei?.label).toBe('Bank transfer (SPEI)');
        expect(spei?.rail).toBe('spei');
    });

    it('labels and maps Colombian PSE providers', async () => {
        // MSW: respond to ?symbol=COP with [{ _id: 'c1', name: 'PSE', fee: 0 }, { _id: 'c2', name: 'NEQUI', fee: 0 }]
        const client = createClient();
        mockAuth();
        mockProviders();
        const methods = await client.getPaymentProviders('COP');
        const pse = methods.find((m) => m.name === 'PSE');
        expect(pse?.label).toBe('PSE');
        expect(pse?.rail).toBe('pse');
        const nequi = methods.find((m) => m.name === 'NEQUI');
        expect(nequi?.label).toBe('Nequi');
        expect(nequi?.rail).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------

describe('getQuote', () => {
    it('maps an on-ramp ARS→USDC executable quote', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/quotes`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.symbolIn).toBe('ARS');
                expect(body.symbolOut).toBe('USDC Stellar');
                expect(body.executable).toBe(true);
                expect(body.paymentMethodId).toBe(WIREAR_ID);
                expect(body.amountIn).toBe(10000);
                return HttpResponse.json({
                    quoteId: 'quote-123',
                    amountIn: 10000,
                    amountOut: 5.59,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                    exchangeRate: 1518.6,
                    koyweFee: 1503,
                    networkFee: 5,
                    validUntil: Math.floor(Date.now() / 1000) + 120,
                });
            }),
        );

        const quote = await client.getQuote({
            ramp: 'onramp',
            fiatCurrency: 'ARS',
            amount: '10000',
            paymentMethodId: WIREAR_ID,
        });

        expect(quote.id).toBe('quote-123');
        expect(quote.ramp).toBe('onramp');
        expect(quote.sourceAsset).toBe('ARS');
        expect(quote.targetAsset).toBe('USDC');
        expect(quote.sourceAmount).toBe('10000');
        expect(quote.destinationAmount).toBe('5.59');
        expect(quote.fee).toBe('1508'); // koyweFee + networkFee
        expect(quote.expiresAt).toBeTruthy();
    });

    it('maps an off-ramp USDC→ARS quote without a payment method', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/quotes`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.symbolIn).toBe('USDC Stellar');
                expect(body.symbolOut).toBe('ARS');
                expect(body).not.toHaveProperty('paymentMethodId');
                return HttpResponse.json({
                    quoteId: 'quote-off',
                    amountIn: 10,
                    amountOut: 13103,
                    symbolIn: 'USDC Stellar',
                    symbolOut: 'ARS',
                    exchangeRate: 1455.9,
                    koyweFee: 1,
                    networkFee: 0,
                });
            }),
        );

        const quote = await client.getQuote({
            ramp: 'offramp',
            fiatCurrency: 'ARS',
            amount: '10',
        });
        expect(quote.id).toBe('quote-off');
        expect(quote.sourceAsset).toBe('USDC');
        expect(quote.targetAsset).toBe('ARS');
        expect(quote.destinationAmount).toBe('13103');
    });
});

// ---------------------------------------------------------------------------
// createOnRampOrder
// ---------------------------------------------------------------------------

describe('createOnRampOrder', () => {
    it('creates an order and parses WIREAR instructions + tracking URL', async () => {
        const client = createClient();
        const auth = mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/orders`, async ({ request }) => {
                // The order auths with — and is linked to — the per-user email.
                expect(request.headers.get('authorization')).toBe('Bearer tok-1');
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quoteId).toBe('quote-123');
                expect(body.destinationAddress).toBe(STELLAR_PUBKEY);
                expect(body.email).toBe(EMAIL);
                return HttpResponse.json({
                    orderId: 'order-9',
                    quoteId: 'quote-123',
                    amountIn: 10000,
                    amountOut: 5.59,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                    providedAddress:
                        ' CVU 0000053600000017871248 \n alias 30718280229.KOYWE1 \n Banco Coinag \n tef@koywe.com',
                    providedAction: 'https://ramp.koywe.test/tracing/order-9?success=true',
                });
            }),
        );

        const order = await client.createOnRampOrder({
            quoteId: 'quote-123',
            stellarAddress: STELLAR_PUBKEY,
            email: EMAIL,
        });
        expect(auth.emails).toContain(EMAIL);

        expect(order.id).toBe('order-9');
        expect(order.status).toBe('WAITING');
        expect(order.stellarAddress).toBe(STELLAR_PUBKEY);
        expect(order.interactiveUrl).toBe('https://ramp.koywe.test/tracing/order-9?success=true');
        expect(order.deposit).toBeDefined();
        expect(order.deposit?.cvu).toBe('0000053600000017871248');
        expect(order.deposit?.alias).toBe('30718280229.KOYWE1');
        expect(order.deposit?.bankName).toBe('Banco Coinag');
    });

    it('passes the user document number through when supplied', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/orders`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.documentNumber).toBe('95456858');
                return HttpResponse.json({
                    orderId: 'order-doc',
                    quoteId: 'q',
                    amountIn: 10000,
                    amountOut: 5,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                    providedAction: 'https://ramp.koywe.test/khipu/order-doc',
                });
            }),
        );
        const order = await client.createOnRampOrder({
            quoteId: 'q',
            stellarAddress: STELLAR_PUBKEY,
            documentNumber: '95456858',
        });
        expect(order.id).toBe('order-doc');
        expect(order.interactiveUrl).toBe('https://ramp.koywe.test/khipu/order-doc');
    });
});

// ---------------------------------------------------------------------------
// createOffRampOrder (TODO-flagged behaviour, but exercised against mock)
// ---------------------------------------------------------------------------

describe('createOffRampOrder', () => {
    it('creates an off-ramp order using the bank account id as destinationAddress', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/orders`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quoteId).toBe('quote-off');
                // Off-ramp: destinationAddress carries the bank-account id.
                expect(body.destinationAddress).toBe('ba-1');
                return HttpResponse.json({
                    orderId: 'order-off',
                    quoteId: 'quote-off',
                    amountIn: 10,
                    amountOut: 13103,
                    symbolIn: 'USDC Stellar',
                    symbolOut: 'ARS',
                    providedAddress: 'GKOYWEDEPOSITADDR000000000000000000000000000000000000000',
                });
            }),
        );
        const order = await client.createOffRampOrder({
            quoteId: 'quote-off',
            bankAccountId: 'ba-1',
        });
        expect(order.id).toBe('order-off');
        expect(order.status).toBe('WAITING');
        // The Koywe deposit address the user must send USDC to.
        expect(order.depositAddress).toBe(
            'GKOYWEDEPOSITADDR000000000000000000000000000000000000000',
        );
    });
});

// ---------------------------------------------------------------------------
// createBankAccount / getBankAccounts (off-ramp payout registration)
// ---------------------------------------------------------------------------

describe('createBankAccount', () => {
    it('registers an Argentine bank account and maps _id → id', async () => {
        const client = createClient();
        const auth = mockAuth();
        let received: Record<string, unknown> | undefined;
        server.use(
            http.post(`${BASE_URL}/rest/bank-accounts`, async ({ request }) => {
                // Registration is user-scoped — auths with the per-user token.
                expect(request.headers.get('authorization')).toBe('Bearer tok-1');
                received = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    _id: 'ba-9',
                    countryCode: 'ARG',
                    currencySymbol: 'ARS',
                    accountNumber: '0000242600000000009120',
                    bankCode: 'TESTBANK',
                    name: 'BANCO TEST',
                });
            }),
        );

        const account = await client.createBankAccount({
            email: EMAIL,
            accountNumber: '0000242600000000009120',
            currencySymbol: 'ARS',
            countryCode: 'ARG',
            documentNumber: '95456858',
        });

        // Body matches the documented bankaccounts_body shape.
        expect(auth.emails).toContain(EMAIL);
        expect(received?.accountNumber).toBe('0000242600000000009120');
        expect(received?.countryCode).toBe('ARG');
        expect(received?.currencySymbol).toBe('ARS');
        expect(received?.email).toBe(EMAIL);
        expect(received?.documentNumber).toBe('95456858');

        // The mapped `id` is exactly what an off-ramp order passes as destinationAddress.
        expect(account.id).toBe('ba-9');
        expect(account.accountNumber).toBe('0000242600000000009120');
        expect(account.bankName).toBe('BANCO TEST');
    });

    it("omits documentNumber when not supplied (already-KYC'd user)", async () => {
        const client = createClient();
        mockAuth();
        let received: Record<string, unknown> | undefined;
        server.use(
            http.post(`${BASE_URL}/rest/bank-accounts`, async ({ request }) => {
                received = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    _id: 'ba-1',
                    countryCode: 'ARG',
                    currencySymbol: 'ARS',
                    accountNumber: '0000242600000000009120',
                });
            }),
        );
        await client.createBankAccount({
            email: EMAIL,
            accountNumber: '0000242600000000009120',
            currencySymbol: 'ARS',
            countryCode: 'ARG',
        });
        expect(received).not.toHaveProperty('documentNumber');
    });
});

describe('getBankAccounts', () => {
    it('lists a user’s registered bank accounts, mapping ids', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/bank-accounts`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('countryCode')).toBe('ARG');
                expect(url.searchParams.get('currencySymbol')).toBe('ARS');
                expect(url.searchParams.get('email')).toBe(EMAIL);
                return HttpResponse.json([
                    {
                        _id: 'ba-1',
                        countryCode: 'ARG',
                        currencySymbol: 'ARS',
                        accountNumber: '0000242600000000009120',
                        name: 'BANCO TEST',
                    },
                ]);
            }),
        );
        const accounts = await client.getBankAccounts({
            email: EMAIL,
            countryCode: 'ARG',
            currencySymbol: 'ARS',
        });
        expect(accounts).toHaveLength(1);
        expect(accounts[0].id).toBe('ba-1');
        expect(accounts[0].accountNumber).toBe('0000242600000000009120');
    });
});

// ---------------------------------------------------------------------------
// submitTxHash (TODO-flagged path)
// ---------------------------------------------------------------------------

describe('submitTxHash', () => {
    it('POSTs the Stellar tx hash to the order txHash endpoint', async () => {
        const client = createClient();
        mockAuth();
        let received: string | undefined;
        server.use(
            http.post(`${BASE_URL}/rest/orders/order-off/txHash`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                received = body.txHash as string;
                return HttpResponse.json({ ok: true });
            }),
        );
        await client.submitTxHash('order-off', 'abc123hash');
        expect(received).toBe('abc123hash');
    });
});

// ---------------------------------------------------------------------------
// getOrder status mapping
// ---------------------------------------------------------------------------

describe('getOrder', () => {
    it.each([
        ['WAITING'],
        ['PENDING'],
        ['EXECUTING'],
        ['IN_PROGRESS'],
        ['DELIVERED'],
        ['REJECTED'],
        ['INVALID_WITHDRAWALS_DETAILS'],
    ])('passes through Koywe status %s and maps the display asset', async (koyweStatus) => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/orders/o1`, () =>
                HttpResponse.json({
                    orderId: 'o1',
                    status: koyweStatus,
                    amountIn: 10000,
                    amountOut: 5.59,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                }),
            ),
        );
        const order = await client.getOrder('o1');
        expect(order!.status).toBe(koyweStatus);
        // Raw "USDC Stellar" symbol is mapped to the display symbol "USDC".
        expect(order!.targetAsset).toBe('USDC');
    });

    it('returns null on 404', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/orders/missing`, () =>
                HttpResponse.json({ statusCode: 404, message: 'not found' }, { status: 404 }),
            ),
        );
        expect(await client.getOrder('missing')).toBeNull();
    });

    it('surfaces lifecycle diagnostics (dates, txHash, statusDetails)', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/orders/o-diag`, () =>
                HttpResponse.json({
                    orderId: 'o-diag',
                    status: 'EXECUTING',
                    amountIn: 10000,
                    amountOut: 5.49,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                    statusDetails: '',
                    txHash: null,
                    dates: {
                        confirmationDate: '2026-06-18T15:31:31.466Z',
                        paymentDate: '2026-06-18T15:33:45.127Z',
                        executionDate: null,
                        deliveryDate: null,
                        expiredByRetriesDate: null,
                    },
                }),
            ),
        );
        const order = await client.getOrder('o-diag');
        // The crypto-delivery leg is the diagnostic surface: payment confirmed,
        // execution never ran. These fields locate exactly where an order stalls.
        expect(order!.txHash).toBeNull();
        expect(order!.statusDetails).toBe('');
        expect(order!.dates?.paymentDate).toBe('2026-06-18T15:33:45.127Z');
        expect(order!.dates?.executionDate).toBeNull();
        expect(order!.dates?.deliveryDate).toBeNull();
        expect(order!.dates?.expiredByRetriesDate).toBeNull();
    });

    it('reports retry-expiry as a delivery failure once Koywe stops retrying', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/orders/o-expired`, () =>
                HttpResponse.json({
                    orderId: 'o-expired',
                    status: 'EXECUTING',
                    amountIn: 10000,
                    amountOut: 5.49,
                    symbolIn: 'ARS',
                    symbolOut: 'USDC Stellar',
                    dates: {
                        paymentDate: '2026-06-18T15:33:45.127Z',
                        executionDate: null,
                        deliveryDate: null,
                        expiredByRetriesDate: '2026-06-18T16:00:00.000Z',
                    },
                }),
            ),
        );
        const order = await client.getOrder('o-expired');
        // A stamped expiredByRetriesDate is terminal even though the raw status
        // is still EXECUTING — the page polls on this to stop and warn.
        expect(order!.dates?.expiredByRetriesDate).toBe('2026-06-18T16:00:00.000Z');
        expect(order!.isDeliveryExpired).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// checkAccount (GET /rest/accounts/{email}/check)
// ---------------------------------------------------------------------------

describe('checkAccount', () => {
    it('maps a verified, operable account', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/accounts/:email/check`, ({ params }) => {
                expect(decodeURIComponent(params.email as string)).toBe(EMAIL);
                return HttpResponse.json({
                    canOperate: true,
                    accountStatus: 'verified',
                    errors: [],
                    nextVerificationDate: '2026-12-01T00:00:00.000Z',
                });
            }),
        );
        const check = await client.checkAccount(EMAIL);
        expect(check.canOperate).toBe(true);
        expect(check.accountStatus).toBe('verified');
        expect(check.missing).toEqual([]);
        expect(check.nextVerificationDate).toBe('2026-12-01T00:00:00.000Z');
    });

    it('maps a pending account with the missing requirements', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/accounts/:email/check`, () =>
                HttpResponse.json({
                    canOperate: false,
                    accountStatus: 'pending',
                    errors: [
                        {
                            field: 'document.documentNumber',
                            message: 'document number is required',
                        },
                    ],
                }),
            ),
        );
        const check = await client.checkAccount(EMAIL);
        expect(check.canOperate).toBe(false);
        expect(check.accountStatus).toBe('pending');
        expect(check.missing).toEqual([
            { field: 'document.documentNumber', message: 'document number is required' },
        ]);
    });

    it('maps a 404 (no account) to a not_started, non-operable check', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/accounts/:email/check`, () =>
                HttpResponse.json(
                    { statusCode: 404, message: 'account not found' },
                    { status: 404 },
                ),
            ),
        );
        const check = await client.checkAccount(EMAIL);
        expect(check.canOperate).toBe(false);
        expect(check.accountStatus).toBe('not_started');
        expect(check.missing).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// checkAccount — requires an email (arg or config fallback)
// ---------------------------------------------------------------------------

describe('checkAccount (no email)', () => {
    it('throws when no email is provided and none is configured', async () => {
        const client = createClient();
        await expect(client.checkAccount()).rejects.toMatchObject({
            name: 'KoyweError',
            code: 'MISSING_EMAIL',
        });
    });

    it('falls back to the configured email when no argument is given', async () => {
        const client = createClient(EMAIL);
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/accounts/:email/check`, ({ params }) => {
                expect(decodeURIComponent(params.email as string)).toBe(EMAIL);
                return HttpResponse.json({ canOperate: true, accountStatus: 'verified' });
            }),
        );
        expect((await client.checkAccount()).canOperate).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// createAccount — delegated-KYC registration (POST /rest/accounts)
// ---------------------------------------------------------------------------

describe('createAccount', () => {
    it('POSTs a nested delegated-KYC body and auths with the user email', async () => {
        const client = createClient();
        const auth = mockAuth();
        type AccountBody = {
            email?: string;
            document: Record<string, unknown>;
            address: Record<string, unknown>;
            personalInfo: Record<string, unknown>;
        };
        let received: AccountBody | undefined;
        server.use(
            http.post(`${BASE_URL}/rest/accounts`, async ({ request }) => {
                expect(request.headers.get('authorization')).toBe('Bearer tok-1');
                received = (await request.json()) as AccountBody;
                return HttpResponse.json({ email: EMAIL }, { status: 201 });
            }),
        );

        await client.createAccount({
            email: EMAIL,
            document: { documentNumber: '95456858', documentType: 'DNI', country: 'ARG' },
            address: {
                country: 'ARG',
                zipCode: '1000',
                state: 'CABA',
                city: 'Buenos Aires',
                neighborhood: 'Centro',
                street: 'Av. 9 de Julio 1',
            },
            personalInfo: {
                names: 'Test',
                firstLastname: 'User',
                nationality: 'ARG',
                gender: 'O',
                dob: '1990-01-01',
                phoneNumber: '+5491100000000',
                activity: 'Engineer',
            },
        });

        expect(auth.emails).toContain(EMAIL);
        expect(received?.email).toBe(EMAIL);
        // document group, with isCompany defaulted.
        expect(received?.document.documentNumber).toBe('95456858');
        expect(received?.document.documentType).toBe('DNI');
        expect(received?.document.isCompany).toBe(false);
        // address group keeps the documented `address*` prefix.
        expect(received?.address.addressCountry).toBe('ARG');
        expect(received?.address.addressZipCode).toBe('1000');
        expect(received?.address.addressStreet).toBe('Av. 9 de Julio 1');
        expect(received?.address.addressNeighborhood).toBe('Centro');
        // personalInfo group.
        expect(received?.personalInfo.names).toBe('Test');
        expect(received?.personalInfo.dob).toBe('1990-01-01');
        expect(received?.personalInfo.firstLastname).toBe('User');
    });
});

// ---------------------------------------------------------------------------
// error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
    it('wraps a Koywe validation error (array message) in a KoyweError', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.post(`${BASE_URL}/rest/quotes`, () =>
                HttpResponse.json(
                    {
                        statusCode: 400,
                        message: ['amountIn is required'],
                        error: 'KoyweBadRequest',
                    },
                    { status: 400 },
                ),
            ),
        );
        try {
            await client.getQuote({ ramp: 'offramp', fiatCurrency: 'ARS', amount: '10' });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(KoyweError);
            const e = err as KoyweError;
            expect(e.statusCode).toBe(400);
            expect(e.code).toBe('KoyweBadRequest');
            expect(e.message).toContain('amountIn is required');
        }
    });
});

// ---------------------------------------------------------------------------
// debug logging
// ---------------------------------------------------------------------------

describe('debug logging', () => {
    function createDebugClient() {
        return new KoyweClient({
            clientId: CLIENT_ID,
            secret: SECRET,
            baseUrl: BASE_URL,
            usdcIssuer: USDC_ISSUER,
            debug: true,
        });
    }

    it('is silent by default — requests and responses never hit the console', async () => {
        const client = createClient();
        mockAuth();
        mockProviders();
        vi.mocked(console.log).mockClear();
        await client.getPaymentProviders('ARS');
        expect(console.log).not.toHaveBeenCalled();
    });

    it('is silent by default on API errors too', async () => {
        const client = createClient();
        mockAuth();
        server.use(
            http.get(`${BASE_URL}/rest/payment-providers`, () =>
                HttpResponse.json({ message: 'nope', error: 'BAD' }, { status: 400 }),
            ),
        );
        vi.mocked(console.error).mockClear();
        await expect(client.getPaymentProviders('ARS')).rejects.toThrow();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('logs requests and responses when debug is enabled', async () => {
        const client = createDebugClient();
        mockAuth();
        mockProviders();
        vi.mocked(console.log).mockClear();
        await client.getPaymentProviders('ARS');
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).toContain(`[Koywe] GET ${BASE_URL}/rest/payment-providers`);
        expect(logged).toContain('WIREAR');
    });

    it('never logs the integration secret, even with debug enabled', async () => {
        const client = createDebugClient();
        mockAuth();
        mockProviders();
        vi.mocked(console.log).mockClear();
        await client.getPaymentProviders('ARS');
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).not.toContain(SECRET);
    });
});
