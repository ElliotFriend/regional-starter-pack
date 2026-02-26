import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import {
    getInfo,
    getAssets,
    getPrice,
    getPrices,
    postQuote,
    getQuote,
    stellarAssetId,
    fiatAssetId,
    parseAssetId,
} from './sep38';
import { SepApiError } from './types';

const BASE = 'https://anchor.test/sep38';
const TOKEN = 'test-jwt-token';

// ---------------------------------------------------------------------------
// getInfo
// ---------------------------------------------------------------------------
describe('getInfo', () => {
    it('returns SEP-38 info with assets', async () => {
        const info = {
            assets: [
                {
                    asset: 'stellar:USDC:GBBD47',
                    sell_delivery_methods: [{ name: 'SPEI', description: 'Mexican bank transfer' }],
                    buy_delivery_methods: [{ name: 'SPEI', description: 'Mexican bank transfer' }],
                    country_codes: ['MEX'],
                },
                { asset: 'iso4217:MXN' },
            ],
        };

        server.use(http.get(`${BASE}/info`, () => HttpResponse.json(info)));

        const result = await getInfo(BASE, fetch);
        expect(result.assets).toHaveLength(2);
        expect(result.assets[0].asset).toBe('stellar:USDC:GBBD47');
        expect(result.assets[0].country_codes).toEqual(['MEX']);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/info`, () =>
                HttpResponse.json({ error: 'Service unavailable' }, { status: 503 }),
            ),
        );

        await expect(getInfo(BASE, fetch)).rejects.toThrow(SepApiError);
        await expect(getInfo(BASE, fetch)).rejects.toThrow('Service unavailable');
    });

    it('uses status text fallback when error body is not JSON', async () => {
        server.use(
            http.get(`${BASE}/info`, () => new HttpResponse('bad', { status: 500 })),
        );

        await expect(getInfo(BASE, fetch)).rejects.toThrow('Failed to get SEP-38 info: 500');
    });
});

// ---------------------------------------------------------------------------
// getAssets
// ---------------------------------------------------------------------------
describe('getAssets', () => {
    it('returns assets array from info', async () => {
        const assets = [
            { asset: 'stellar:USDC:GBBD47' },
            { asset: 'iso4217:MXN' },
        ];

        server.use(http.get(`${BASE}/info`, () => HttpResponse.json({ assets })));

        const result = await getAssets(BASE, fetch);
        expect(result).toEqual(assets);
        expect(result).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// getPrice
// ---------------------------------------------------------------------------
describe('getPrice', () => {
    it('sends required query params and returns price response', async () => {
        const priceResponse = {
            total_price: '17.20',
            price: '17.00',
            sell_amount: '100',
            buy_amount: '1720',
            fee: { total: '0.50', asset: 'stellar:USDC:GBBD47' },
        };

        server.use(
            http.get(`${BASE}/price`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('sell_asset')).toBe('stellar:USDC:GBBD47');
                expect(url.searchParams.get('buy_asset')).toBe('iso4217:MXN');
                expect(url.searchParams.get('sell_amount')).toBe('100');
                expect(url.searchParams.get('context')).toBe('sep6');
                return HttpResponse.json(priceResponse);
            }),
        );

        const result = await getPrice(
            BASE,
            {
                sell_asset: 'stellar:USDC:GBBD47',
                buy_asset: 'iso4217:MXN',
                sell_amount: '100',
                context: 'sep6',
            },
            fetch,
        );

        expect(result.total_price).toBe('17.20');
        expect(result.price).toBe('17.00');
        expect(result.sell_amount).toBe('100');
        expect(result.buy_amount).toBe('1720');
        expect(result.fee.total).toBe('0.50');
    });

    it('sends optional params when provided', async () => {
        server.use(
            http.get(`${BASE}/price`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('sell_delivery_method')).toBe('SPEI');
                expect(url.searchParams.get('buy_delivery_method')).toBe('SPEI');
                expect(url.searchParams.get('country_code')).toBe('MEX');
                expect(url.searchParams.get('buy_amount')).toBe('1000');
                return HttpResponse.json({
                    total_price: '17.20',
                    price: '17.00',
                    sell_amount: '58.82',
                    buy_amount: '1000',
                    fee: { total: '0.30', asset: 'stellar:USDC:GBBD47' },
                });
            }),
        );

        await getPrice(
            BASE,
            {
                sell_asset: 'stellar:USDC:GBBD47',
                buy_asset: 'iso4217:MXN',
                buy_amount: '1000',
                context: 'sep31',
                sell_delivery_method: 'SPEI',
                buy_delivery_method: 'SPEI',
                country_code: 'MEX',
            },
            fetch,
        );
    });

    it('omits optional params when not provided', async () => {
        server.use(
            http.get(`${BASE}/price`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.has('sell_delivery_method')).toBe(false);
                expect(url.searchParams.has('buy_delivery_method')).toBe(false);
                expect(url.searchParams.has('country_code')).toBe(false);
                expect(url.searchParams.has('buy_amount')).toBe(false);
                return HttpResponse.json({
                    total_price: '1',
                    price: '1',
                    sell_amount: '100',
                    buy_amount: '100',
                    fee: { total: '0', asset: 'a' },
                });
            }),
        );

        await getPrice(
            BASE,
            {
                sell_asset: 'stellar:USDC:GBBD47',
                buy_asset: 'iso4217:MXN',
                sell_amount: '100',
                context: 'sep6',
            },
            fetch,
        );
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/price`, () =>
                HttpResponse.json({ error: 'No market for pair' }, { status: 400 }),
            ),
        );

        await expect(
            getPrice(
                BASE,
                {
                    sell_asset: 'stellar:USDC:GBBD47',
                    buy_asset: 'iso4217:JPY',
                    sell_amount: '100',
                    context: 'sep6',
                },
                fetch,
            ),
        ).rejects.toThrow('No market for pair');
    });
});

// ---------------------------------------------------------------------------
// getPrices
// ---------------------------------------------------------------------------
describe('getPrices', () => {
    it('sends sell_asset and returns buy_assets', async () => {
        const response = {
            buy_assets: [
                {
                    total_price: '17.20',
                    price: '17.00',
                    sell_amount: '100',
                    buy_amount: '1720',
                    fee: { total: '0.50', asset: 'stellar:USDC:GBBD47' },
                },
            ],
        };

        server.use(
            http.get(`${BASE}/prices`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('sell_asset')).toBe('stellar:USDC:GBBD47');
                return HttpResponse.json(response);
            }),
        );

        const result = await getPrices(BASE, { sell_asset: 'stellar:USDC:GBBD47' }, fetch);
        expect(result.buy_assets).toHaveLength(1);
    });

    it('sends buy_asset and returns sell_assets', async () => {
        server.use(
            http.get(`${BASE}/prices`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('buy_asset')).toBe('iso4217:MXN');
                expect(url.searchParams.has('sell_asset')).toBe(false);
                return HttpResponse.json({ sell_assets: [] });
            }),
        );

        const result = await getPrices(BASE, { buy_asset: 'iso4217:MXN' }, fetch);
        expect(result.sell_assets).toEqual([]);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/prices`, () =>
                HttpResponse.json({ error: 'Bad request' }, { status: 400 }),
            ),
        );

        await expect(
            getPrices(BASE, { sell_asset: 'bad' }, fetch),
        ).rejects.toThrow(SepApiError);
    });
});

// ---------------------------------------------------------------------------
// postQuote
// ---------------------------------------------------------------------------
describe('postQuote', () => {
    it('sends authenticated POST and returns firm quote', async () => {
        const quoteResponse = {
            id: 'quote-001',
            total_price: '17.20',
            price: '17.00',
            sell_amount: '100',
            buy_amount: '1720',
            fee: { total: '0.50', asset: 'stellar:USDC:GBBD47' },
            expires_at: '2025-12-31T23:59:59Z',
        };

        server.use(
            http.post(`${BASE}/quote`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toBe('application/json');
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.sell_asset).toBe('stellar:USDC:GBBD47');
                expect(body.buy_asset).toBe('iso4217:MXN');
                expect(body.sell_amount).toBe('100');
                expect(body.context).toBe('sep31');
                return HttpResponse.json(quoteResponse);
            }),
        );

        const result = await postQuote(
            BASE,
            TOKEN,
            {
                sell_asset: 'stellar:USDC:GBBD47',
                buy_asset: 'iso4217:MXN',
                sell_amount: '100',
                context: 'sep31',
            },
            fetch,
        );

        expect(result.id).toBe('quote-001');
        expect(result.expires_at).toBe('2025-12-31T23:59:59Z');
        expect(result.total_price).toBe('17.20');
    });

    it('includes expire_after when provided', async () => {
        server.use(
            http.post(`${BASE}/quote`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.expire_after).toBe('2025-12-31T00:00:00Z');
                return HttpResponse.json({
                    id: 'quote-002',
                    total_price: '1',
                    price: '1',
                    sell_amount: '1',
                    buy_amount: '1',
                    fee: { total: '0', asset: 'a' },
                    expires_at: '2025-12-31T00:00:00Z',
                });
            }),
        );

        await postQuote(
            BASE,
            TOKEN,
            {
                sell_asset: 'stellar:USDC:GBBD47',
                buy_asset: 'iso4217:MXN',
                sell_amount: '100',
                context: 'sep6',
                expire_after: '2025-12-31T00:00:00Z',
            },
            fetch,
        );
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.post(`${BASE}/quote`, () =>
                HttpResponse.json({ error: 'Insufficient amount' }, { status: 400 }),
            ),
        );

        await expect(
            postQuote(
                BASE,
                TOKEN,
                {
                    sell_asset: 'stellar:USDC:GBBD47',
                    buy_asset: 'iso4217:MXN',
                    sell_amount: '0.01',
                    context: 'sep6',
                },
                fetch,
            ),
        ).rejects.toThrow('Insufficient amount');
    });
});

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------
describe('getQuote', () => {
    it('fetches an existing quote by id with auth header', async () => {
        const quoteResponse = {
            id: 'quote-001',
            total_price: '17.20',
            price: '17.00',
            sell_amount: '100',
            buy_amount: '1720',
            fee: { total: '0.50', asset: 'stellar:USDC:GBBD47' },
            expires_at: '2025-12-31T23:59:59Z',
        };

        server.use(
            http.get(`${BASE}/quote/quote-001`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json(quoteResponse);
            }),
        );

        const result = await getQuote(BASE, TOKEN, 'quote-001', fetch);
        expect(result.id).toBe('quote-001');
        expect(result.total_price).toBe('17.20');
    });

    it('throws SepApiError on 404', async () => {
        server.use(
            http.get(`${BASE}/quote/missing`, () =>
                HttpResponse.json({ error: 'Quote not found' }, { status: 404 }),
            ),
        );

        await expect(getQuote(BASE, TOKEN, 'missing', fetch)).rejects.toThrow('Quote not found');
    });
});

// ---------------------------------------------------------------------------
// Asset identifier helpers
// ---------------------------------------------------------------------------
describe('stellarAssetId', () => {
    it('returns stellar:native for XLM', () => {
        expect(stellarAssetId('XLM')).toBe('stellar:native');
    });

    it('returns stellar:native for native', () => {
        expect(stellarAssetId('native')).toBe('stellar:native');
    });

    it('returns stellar:CODE:ISSUER for non-native assets', () => {
        expect(stellarAssetId('USDC', 'GBBD47')).toBe('stellar:USDC:GBBD47');
    });

    it('throws when issuer is missing for non-native asset', () => {
        expect(() => stellarAssetId('USDC')).toThrow('Issuer required for non-native asset USDC');
    });
});

describe('fiatAssetId', () => {
    it('returns iso4217:CODE', () => {
        expect(fiatAssetId('MXN')).toBe('iso4217:MXN');
        expect(fiatAssetId('USD')).toBe('iso4217:USD');
    });
});

describe('parseAssetId', () => {
    it('parses stellar native asset', () => {
        expect(parseAssetId('stellar:native')).toEqual({ type: 'stellar', code: 'XLM' });
    });

    it('parses stellar non-native asset', () => {
        expect(parseAssetId('stellar:USDC:GBBD47')).toEqual({
            type: 'stellar',
            code: 'USDC',
            issuer: 'GBBD47',
        });
    });

    it('parses fiat asset', () => {
        expect(parseAssetId('iso4217:MXN')).toEqual({ type: 'fiat', code: 'MXN' });
    });

    it('throws on unknown scheme', () => {
        expect(() => parseAssetId('unknown:FOO')).toThrow('Unknown asset scheme: unknown');
    });
});
