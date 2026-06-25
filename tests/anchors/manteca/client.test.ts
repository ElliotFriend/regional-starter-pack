import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { MantecaClient } from '$lib/anchors/manteca/client';
import { MantecaError } from '$lib/anchors/manteca/types';

const BASE_URL = 'https://sandbox.manteca.test';
const API_KEY = 'AAAA-BBBB-CCCC-DDDD';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
// A syntactically valid Stellar public key (Circle testnet USDC distributor-style).
const STELLAR_PUBKEY = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

function createClient(overrides: Partial<ConstructorParameters<typeof MantecaClient>[0]> = {}) {
    return new MantecaClient({
        apiKey: API_KEY,
        baseUrl: BASE_URL,
        usdcIssuer: USDC_ISSUER,
        defaultExchange: 'BRAZIL',
        ...overrides,
    });
}

/** Assert the request carried the static API key header (and never a bearer). */
function expectAuth(request: Request) {
    expect(request.headers.get('md-api-key')).toBe(API_KEY);
    expect(request.headers.get('authorization')).toBeNull();
}

const USER_RESPONSE = {
    id: '6762a062183af03b822f7a71',
    numberId: '10001',
    externalId: 'user-9821',
    email: 'maria@example.com',
    status: 'ONBOARDING',
    type: 'INDIVIDUAL',
    exchange: 'BRAZIL',
    addresses: {
        depositAddresses: {
            ETHEREUM: '0xaA7B65Cc73500b722FACb0722b4D3AEafE60eB68',
            STELLAR: 'GBZH3KFIFNEHIMQP264NKZKML3QODDAOTBEPJA6MLUAEJBRGHRJOYSQ',
        },
        knownAddresses: [],
    },
    banking: { accounts: [], addresses: [] },
    onboarding: {
        identityDeclaration: { required: true, status: 'NOT_DONE' },
        tycAcceptance: { required: true, status: 'NOT_DONE' },
    },
    creationTime: '2024-12-13T12:26:03.792-03:00',
    updatedAt: '2024-12-13T12:26:34.911-03:00',
};

// Shape mirrors the live sandbox ramp-on response (PIX deposit): no scalar
// depositAddress — the PIX QR lives under details.depositAddresses.PIX, and the
// fee/amount fields live on details, not in a separate quote.
const RAMP_ON_RESPONSE = {
    id: '67859d6471d5a50fd3592381',
    numberId: '43190',
    externalId: 'ramp-op-1',
    userId: '6762f8c7767750522c90b55f',
    userNumberId: '10001',
    platform: 'CRIPTO',
    status: 'STARTING',
    type: 'RAMP_OPERATION',
    details: {
        depositAddresses: {
            PIX: {
                type: 'QR',
                code: '00020126580014br.gov.bcb.pix0136afc6a1303e314550af0d2eb2063044275A',
                url: 'https://widget-qa.manteca.dev/qr?code=00020126580014br.gov.bcb.pix',
                bankId: 'afc6a130-3e31-4550-af0d-2eb202d47c69',
                expiresAt: '2026-06-26T11:10:21.649-03:00',
            },
        },
        depositAvailableNetworks: ['PIX'],
        withdrawCostInAgainst: '0.00',
        withdrawCostInAsset: '0.000003',
        effectiveWithdrawAmount: '19.04761605',
        price: '5.250',
        effectivePrice: '5.25000',
        priceExpireAt: '2026-06-25T11:31:19.916-03:00',
    },
    currentStage: 1,
    stages: {
        '1': {
            stageType: 'DEPOSIT',
            legalEntity: 'CRYPTO_GLOBAL',
            asset: 'BRL',
            thresholdAmount: '100.00',
            useOverflow: true,
            expireAt: '2026-06-25T14:40:21.653Z',
        },
        '2': {
            stageType: 'ORDER',
            legalEntity: 'CRYPTO_GLOBAL',
            side: 'BUY',
            type: 'MARKET',
            asset: 'USDC',
            against: 'BRL',
            assetAmount: '19.04761905',
            price: '5.250',
        },
        '3': {
            stageType: 'WITHDRAW',
            legalEntity: 'CRYPTO_GLOBAL',
            asset: 'USDC',
            amount: '19.04761905',
            destination: { network: 'STELLAR', address: STELLAR_PUBKEY },
        },
    },
    creationTime: '2026-06-25T11:10:21.750-03:00',
    updatedAt: '2026-06-25T11:10:21.750-03:00',
};

describe('MantecaClient', () => {
    describe('metadata', () => {
        it('exposes provider identity and Stellar USDC with the host-supplied issuer', () => {
            const client = createClient();
            expect(client.name).toBe('manteca');
            expect(client.displayName).toBe('Manteca');
            const usdc = client.supportedTokens.find((t) => t.symbol === 'USDC');
            expect(usdc).toBeDefined();
            expect(usdc?.network).toBe('STELLAR');
            expect(usdc?.issuer).toBe(USDC_ISSUER);
            expect(usdc?.decimals).toBe(7);
        });
    });

    describe('createUser', () => {
        it('POSTs to /crypto/v2/users with email + exchange and maps the response', async () => {
            let captured: Record<string, unknown> | undefined;
            server.use(
                http.post(`${BASE_URL}/crypto/v2/users`, async ({ request }) => {
                    expectAuth(request);
                    captured = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json(USER_RESPONSE, { status: 201 });
                }),
            );

            const client = createClient();
            const user = await client.createUser({
                email: 'maria@example.com',
                externalId: 'user-9821',
            });

            expect(captured).toMatchObject({
                email: 'maria@example.com',
                exchange: 'BRAZIL',
                externalId: 'user-9821',
            });
            expect(user.id).toBe('6762a062183af03b822f7a71');
            expect(user.numberId).toBe('10001');
            expect(user.status).toBe('ONBOARDING');
            expect(user.canOperate).toBe(false);
            expect(user.stellarAddress).toBe(
                'GBZH3KFIFNEHIMQP264NKZKML3QODDAOTBEPJA6MLUAEJBRGHRJOYSQ',
            );
            expect(user.depositAddresses.STELLAR).toBe(
                'GBZH3KFIFNEHIMQP264NKZKML3QODDAOTBEPJA6MLUAEJBRGHRJOYSQ',
            );
            expect(user.onboarding.tycAcceptance.status).toBe('NOT_DONE');
        });
    });

    describe('getUser', () => {
        it('GETs /crypto/v2/users/{anyId} and reports canOperate=true when ACTIVE', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/users/10001`, ({ request }) => {
                    expectAuth(request);
                    return HttpResponse.json({ ...USER_RESPONSE, status: 'ACTIVE' });
                }),
            );
            const user = await createClient().getUser('10001');
            expect(user?.canOperate).toBe(true);
        });

        it('returns null on 404 USER_NF', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/users/nope`, () =>
                    HttpResponse.json(
                        { status: 404, internalStatus: 'USER_NF', message: 'User not found' },
                        { status: 404 },
                    ),
                ),
            );
            expect(await createClient().getUser('nope')).toBeNull();
        });
    });

    describe('submitOnboarding', () => {
        it('POSTs legalId + exchange to /crypto/v2/onboarding-actions/initial (Brazil CPF)', async () => {
            let captured: Record<string, unknown> | undefined;
            server.use(
                http.post(
                    `${BASE_URL}/crypto/v2/onboarding-actions/initial`,
                    async ({ request }) => {
                        expectAuth(request);
                        captured = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({ ...USER_RESPONSE, status: 'ONBOARDING' });
                    },
                ),
            );

            const client = createClient();
            await client.submitOnboarding({ email: 'maria@example.com', legalId: '11144477735' });

            expect(captured).toMatchObject({
                email: 'maria@example.com',
                legalId: '11144477735',
                exchange: 'BRAZIL',
                legalIdNationality: 'BRAZIL',
                type: 'INDIVIDUAL',
            });
        });

        it('forwards the personalData object inline (Brazil needs more than the CPF)', async () => {
            let captured: Record<string, unknown> | undefined;
            server.use(
                http.post(
                    `${BASE_URL}/crypto/v2/onboarding-actions/initial`,
                    async ({ request }) => {
                        captured = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json(USER_RESPONSE);
                    },
                ),
            );

            await createClient().submitOnboarding({
                email: 'maria@example.com',
                legalId: '11144477735',
                personalData: {
                    surname: 'SILVA',
                    sex: 'F',
                    maritalStatus: 'Solteiro',
                    phoneNumber: '11999999999',
                    nationality: 'Brasil',
                    address: { street: 'Av Paulista' },
                },
            });

            expect(captured).toMatchObject({
                legalId: '11144477735',
                personalData: {
                    surname: 'SILVA',
                    sex: 'F',
                    address: { street: 'Av Paulista' },
                },
            });
        });

        it('unwraps the {user, person} envelope the onboarding endpoint returns', async () => {
            // /onboarding-actions/initial wraps the user fields in a `user`
            // envelope (alongside `person`); the plain user endpoints are flat.
            server.use(
                http.post(`${BASE_URL}/crypto/v2/onboarding-actions/initial`, () =>
                    HttpResponse.json({
                        user: { ...USER_RESPONSE, status: 'ONBOARDING' },
                        person: { legalId: '11144477735', personalData: { name: 'Maria' } },
                        causedConflict: false,
                    }),
                ),
            );
            const user = await createClient().submitOnboarding({
                email: 'maria@example.com',
                legalId: '11144477735',
            });
            expect(user.id).toBe('6762a062183af03b822f7a71');
            expect(user.numberId).toBe('10001');
            expect(user.status).toBe('ONBOARDING');
            expect(user.stellarAddress).toBe(
                'GBZH3KFIFNEHIMQP264NKZKML3QODDAOTBEPJA6MLUAEJBRGHRJOYSQ',
            );
        });
    });

    describe('getPrice', () => {
        it('GETs /crypto/v2/prices/direct/{ticker} and reads the nested effectivePrice', async () => {
            // Live wire nests the fee-inclusive price under `effectivePrice`
            // (plus `price`/`spread` objects) — there are NO flat effectiveBuy/Sell.
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, ({ request }) => {
                    expectAuth(request);
                    return HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        spread: { buy: '0.05', sell: '0.05' },
                        price: { buy: '5.85', sell: '5.75' },
                        effectivePrice: { buy: '5.90', sell: '5.70' },
                        timestamp: '2025-12-22T21:34:06.898-03:00',
                    });
                }),
            );
            const price = await createClient().getPrice('USDC_BRL');
            expect(price.buy).toBe('5.85');
            expect(price.sell).toBe('5.75');
            expect(price.effectiveBuy).toBe('5.90');
            expect(price.effectiveSell).toBe('5.70');
        });

        it('falls back to nominal prices when effective prices are absent', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        timestamp: 't',
                    }),
                ),
            );
            const price = await createClient().getPrice('USDC_BRL');
            expect(price.effectiveBuy).toBe('5.85');
            expect(price.effectiveSell).toBe('5.75');
        });
    });

    describe('getQuote', () => {
        // The crypto price endpoint already carries the ramp economics: the
        // user transacts at the EFFECTIVE price (spread/fee included). There is
        // no separate fee call — the broker fee endpoint is a different product.
        it('quotes the on-ramp off the effective buy price and derives the spread', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        effectiveBuy: '5.90',
                        effectiveSell: '5.70',
                        timestamp: '2025-12-22T21:34:06.898-03:00',
                    }),
                ),
            );
            const quote = await createClient().getQuote({
                ramp: 'onramp',
                asset: 'USDC',
                against: 'BRL',
            });
            expect(quote.ramp).toBe('onramp');
            expect(quote.ticker).toBe('USDC_BRL');
            expect(quote.price).toBe('5.90'); // effective buy
            expect(quote.nominalPrice).toBe('5.85');
            expect(quote.spreadFraction).toBeCloseTo((5.9 - 5.85) / 5.85, 6);
        });

        it('quotes the off-ramp off the effective sell price', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        effectiveBuy: '5.90',
                        effectiveSell: '5.70',
                        timestamp: '2025-12-22T21:34:06.898-03:00',
                    }),
                ),
            );
            const quote = await createClient().getQuote({
                ramp: 'offramp',
                asset: 'USDC',
                against: 'BRL',
            });
            expect(quote.price).toBe('5.70'); // effective sell
            expect(quote.nominalPrice).toBe('5.75');
            expect(quote.spreadFraction).toBeCloseTo((5.75 - 5.7) / 5.75, 6);
        });

        it('does NOT call the broker fee endpoint', async () => {
            let brokerHit = false;
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        effectiveBuy: '5.90',
                        effectiveSell: '5.70',
                        timestamp: 't',
                    }),
                ),
                http.get(`${BASE_URL}/broker/v1/api/price/fee/:ticker`, () => {
                    brokerHit = true;
                    return HttpResponse.json({ ticker: 'USDC_BRL', fee: 0.0026 });
                }),
            );
            await createClient().getQuote({ ramp: 'onramp', asset: 'USDC', against: 'BRL' });
            expect(brokerHit).toBe(false);
        });
    });

    describe('getMissingPersonalData', () => {
        it('GETs /crypto/v2/stats/onboarding/missing-personal-data/{anyId}', async () => {
            server.use(
                http.get(
                    `${BASE_URL}/crypto/v2/stats/onboarding/missing-personal-data/10001`,
                    ({ request }) => {
                        expectAuth(request);
                        return HttpResponse.json({ missingData: ['surname', 'address.street'] });
                    },
                ),
            );
            const missing = await createClient().getMissingPersonalData('10001');
            expect(missing).toEqual(['surname', 'address.street']);
        });

        it('tolerates a bare array response', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/stats/onboarding/missing-personal-data/10001`, () =>
                    HttpResponse.json(['phoneNumber']),
                ),
            );
            expect(await createClient().getMissingPersonalData('10001')).toEqual(['phoneNumber']);
        });
    });

    describe('createRampOn', () => {
        it('POSTs a ramp-on synthetic with a STELLAR destination and maps it', async () => {
            let captured: Record<string, unknown> | undefined;
            server.use(
                http.post(`${BASE_URL}/crypto/v2/synthetics/ramp-on`, async ({ request }) => {
                    expectAuth(request);
                    captured = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json(RAMP_ON_RESPONSE, { status: 201 });
                }),
            );

            const client = createClient();
            const synthetic = await client.createRampOn({
                userAnyId: '10001',
                asset: 'USDC',
                against: 'BRL',
                againstAmount: 58.5,
                stellarAddress: STELLAR_PUBKEY,
            });

            expect(captured).toMatchObject({
                userAnyId: '10001',
                asset: 'USDC',
                against: 'BRL',
                againstAmount: 58.5,
                destination: { address: STELLAR_PUBKEY, network: 'STELLAR' },
            });
            expect(synthetic.id).toBe('67859d6471d5a50fd3592381');
            expect(synthetic.numberId).toBe('43190');
            expect(synthetic.status).toBe('STARTING');
            expect(synthetic.isTerminal).toBe(false);
            // PIX deposit instructions live under depositAddresses.PIX, not a scalar.
            expect(synthetic.details.pix?.code).toBe(
                '00020126580014br.gov.bcb.pix0136afc6a1303e314550af0d2eb2063044275A',
            );
            expect(synthetic.details.pix?.url).toBe(
                'https://widget-qa.manteca.dev/qr?code=00020126580014br.gov.bcb.pix',
            );
            expect(synthetic.details.pix?.expiresAt).toBe('2026-06-26T11:10:21.649-03:00');
            // Fee + net-amount economics surfaced from the synthetic.
            expect(synthetic.details.withdrawCostInAsset).toBe('0.000003');
            expect(synthetic.details.withdrawCostInAgainst).toBe('0.00');
            expect(synthetic.details.effectiveWithdrawAmount).toBe('19.04761605');
            expect(synthetic.details.effectivePrice).toBe('5.25000');
            expect(synthetic.details.depositAvailableNetworks).toEqual(['PIX']);
        });

        it('rejects an invalid Stellar address before calling the API', async () => {
            const client = createClient();
            await expect(
                client.createRampOn({
                    userAnyId: '10001',
                    asset: 'USDC',
                    against: 'BRL',
                    againstAmount: 10,
                    stellarAddress: 'not-a-key',
                }),
            ).rejects.toBeInstanceOf(MantecaError);
        });
    });

    describe('createRampOff', () => {
        it('POSTs a ramp-off synthetic with the PIX key as destination.address', async () => {
            let captured: Record<string, unknown> | undefined;
            server.use(
                http.post(`${BASE_URL}/crypto/v2/synthetics/ramp-off`, async ({ request }) => {
                    expectAuth(request);
                    captured = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json(
                        {
                            ...RAMP_ON_RESPONSE,
                            details: { depositAddress: STELLAR_PUBKEY, price: '5.75' },
                            stages: {
                                '1': { stageType: 'DEPOSIT', asset: 'USDC', network: 'STELLAR' },
                                '2': {
                                    stageType: 'ORDER',
                                    side: 'SELL',
                                    asset: 'USDC',
                                    against: 'BRL',
                                },
                                '3': {
                                    stageType: 'WITHDRAW',
                                    asset: 'BRL',
                                    to: 'maria@example.com',
                                },
                            },
                        },
                        { status: 201 },
                    );
                }),
            );

            const client = createClient();
            const synthetic = await client.createRampOff({
                userAnyId: '10001',
                asset: 'USDC',
                against: 'BRL',
                assetAmount: 10,
                destinationAddress: 'maria@example.com',
            });

            expect(captured).toMatchObject({
                userAnyId: '10001',
                asset: 'USDC',
                against: 'BRL',
                assetAmount: 10,
                destination: { address: 'maria@example.com' },
            });
            // The crypto deposit address the user funds (USDC on Stellar).
            expect(synthetic.details.depositAddress).toBe(STELLAR_PUBKEY);
        });
    });

    describe('getSynthetic', () => {
        it('maps isTerminal=true for COMPLETED', async () => {
            server.use(
                http.get(
                    `${BASE_URL}/crypto/v2/synthetics/67859d6471d5a50fd3592381`,
                    ({ request }) => {
                        expectAuth(request);
                        return HttpResponse.json({ ...RAMP_ON_RESPONSE, status: 'COMPLETED' });
                    },
                ),
            );
            const synthetic = await createClient().getSynthetic('67859d6471d5a50fd3592381');
            expect(synthetic?.status).toBe('COMPLETED');
            expect(synthetic?.isTerminal).toBe(true);
        });

        it('returns null on 404', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/synthetics/missing`, () =>
                    HttpResponse.json(
                        { status: 404, internalStatus: 'SYNTHETIC_NF', message: 'Not found' },
                        { status: 404 },
                    ),
                ),
            );
            expect(await createClient().getSynthetic('missing')).toBeNull();
        });
    });

    describe('getWithdrawDestinationInfo', () => {
        it('resolves a destination from the live wire (recipientName/recipientLegalId/exchange/asset)', async () => {
            // Live wire keys recipient fields as recipientName/recipientLegalId and
            // also returns the resolving exchange + asset.
            server.use(
                http.get(
                    `${BASE_URL}/crypto/v2/info/withdraw-destination/maria%40example.com`,
                    ({ request }) => {
                        const url = new URL(request.url);
                        expect(url.searchParams.get('country')).toBe('BRAZIL');
                        return HttpResponse.json({
                            exchange: 'BRAZIL',
                            asset: 'BRL',
                            destination: 'maria@example.com',
                            recipientName: 'MARIA SILVA',
                            recipientLegalId: '***447***',
                            accountType: 'PIX',
                        });
                    },
                ),
            );
            const dest = await createClient().getWithdrawDestinationInfo(
                'maria@example.com',
                'BRAZIL',
            );
            expect(dest.valid).toBe(true);
            expect(dest.name).toBe('MARIA SILVA');
            expect(dest.legalId).toBe('***447***');
            expect(dest.accountType).toBe('PIX');
            expect(dest.exchange).toBe('BRAZIL');
            expect(dest.asset).toBe('BRL');
        });
    });

    describe('error handling', () => {
        it('maps the Manteca error envelope internalStatus → code and message', async () => {
            server.use(
                http.post(`${BASE_URL}/crypto/v2/synthetics/ramp-on`, () =>
                    HttpResponse.json(
                        {
                            status: 409,
                            internalStatus: 'USER_NOT_VALIDATED',
                            message: 'User not able to operate.',
                        },
                        { status: 409 },
                    ),
                ),
            );
            try {
                await createClient().createRampOn({
                    userAnyId: '10001',
                    asset: 'USDC',
                    against: 'BRL',
                    againstAmount: 10,
                    stellarAddress: STELLAR_PUBKEY,
                });
                expect.unreachable('should have thrown');
            } catch (err) {
                expect(err).toBeInstanceOf(MantecaError);
                expect((err as MantecaError).code).toBe('USER_NOT_VALIDATED');
                expect((err as MantecaError).statusCode).toBe(409);
                expect((err as MantecaError).message).toContain('not able to operate');
            }
        });
    });

    describe('debug logging', () => {
        it('is silent by default — requests and responses never hit the console', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        timestamp: 't',
                    }),
                ),
            );
            vi.mocked(console.log).mockClear();
            await createClient().getPrice('USDC_BRL');
            expect(console.log).not.toHaveBeenCalled();
        });

        it('is silent by default on API errors too', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json(
                        { status: 400, internalStatus: 'INVALID_PARAMS', message: 'bad' },
                        { status: 400 },
                    ),
                ),
            );
            vi.mocked(console.error).mockClear();
            await expect(createClient().getPrice('USDC_BRL')).rejects.toThrow();
            expect(console.error).not.toHaveBeenCalled();
        });

        it('logs requests and responses when debug is enabled', async () => {
            server.use(
                http.get(`${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`, () =>
                    HttpResponse.json({
                        ticker: 'USDC_BRL',
                        buy: '5.85',
                        sell: '5.75',
                        timestamp: 't',
                    }),
                ),
            );
            vi.mocked(console.log).mockClear();
            await createClient({ debug: true }).getPrice('USDC_BRL');
            const logged = vi
                .mocked(console.log)
                .mock.calls.map((c) => c.join(' '))
                .join('\n');
            expect(logged).toContain(`[Manteca] GET ${BASE_URL}/crypto/v2/prices/direct/USDC_BRL`);
            expect(logged).toContain('5.85');
        });

        it('never logs the API key, even with debug enabled', async () => {
            server.use(
                http.post(`${BASE_URL}/crypto/v2/users`, () =>
                    HttpResponse.json(USER_RESPONSE, { status: 201 }),
                ),
            );
            vi.mocked(console.log).mockClear();
            await createClient({ debug: true }).createUser({ email: 'maria@example.com' });
            const logged = vi
                .mocked(console.log)
                .mock.calls.map((c) => c.join(' '))
                .join('\n');
            expect(logged).not.toContain(API_KEY);
        });
    });
});
