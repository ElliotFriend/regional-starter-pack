import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { TrMockRampClient, TrMockError } from '$lib/anchors/trmock';

// ---------------------------------------------------------------------------
// Test constants & helpers
// ---------------------------------------------------------------------------

const DOMAIN = 'tr-mock-anchor.fly.dev';
const TOML_URL = `https://${DOMAIN}/.well-known/stellar.toml`;
const AUTH = `https://${DOMAIN}/auth`;
const TRANSFER = `https://${DOMAIN}/sep6`;
const KYC = `https://${DOMAIN}/sep12`;
const QUOTE = `https://${DOMAIN}/sep38`;
const HORIZON = 'https://horizon-test.example.com';
const SIGNING_KEY = 'GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TREASURY = 'GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6';
const USER_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';

function makeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.fakesig`;
}

const TOKEN = makeJwt({
    iss: DOMAIN,
    sub: USER_PUBKEY,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'tx-1',
});

function tomlBody(
    overrides: { sep6?: boolean; sep10?: boolean; sep12?: boolean; sep38?: boolean } = {},
): string {
    const lines: string[] = [`SIGNING_KEY="${SIGNING_KEY}"`];
    const o = { sep6: true, sep10: true, sep12: true, sep38: true, ...overrides };
    if (o.sep10) lines.push(`WEB_AUTH_ENDPOINT="${AUTH}"`);
    if (o.sep6) lines.push(`TRANSFER_SERVER="${TRANSFER}"`);
    if (o.sep12) lines.push(`KYC_SERVER="${KYC}"`);
    if (o.sep38) lines.push(`ANCHOR_QUOTE_SERVER="${QUOTE}"`);
    return lines.join('\n');
}

function mockToml(overrides: Parameters<typeof tomlBody>[0] = {}): void {
    server.use(
        http.get(
            TOML_URL,
            () =>
                new HttpResponse(tomlBody(overrides), {
                    headers: { 'Content-Type': 'text/plain' },
                }),
        ),
    );
}

function createClient(): TrMockRampClient {
    return new TrMockRampClient({ horizonUrl: HORIZON, usdcIssuer: USDC_ISSUER, fetchFn: fetch });
}

// ---------------------------------------------------------------------------
// metadata & asset identifiers
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('identifies itself as the TR mock anchor', () => {
        const client = createClient();
        expect(client.name).toBe('trmock');
        expect(client.displayName).toBe('TR Mock Anchor');
    });
});

describe('asset identifiers', () => {
    it('uses the full SEP-38 identifier for quotes', () => {
        expect(createClient().sep38AssetId()).toBe(`stellar:USDC:${USDC_ISSUER}`);
    });

    it('uses the bare asset code on the exchange endpoints', () => {
        // The mock rejects `stellar:USDC:<issuer>` there. Verified 2026-09-15.
        expect(createClient().exchangeAssetRef()).toBe('USDC');
    });

    it('uses the ISO 4217 identifier for the fiat leg', () => {
        expect(createClient().fiatAssetId()).toBe('iso4217:TRY');
    });
});

// ---------------------------------------------------------------------------
// SEP-10
// ---------------------------------------------------------------------------

describe('SEP-10 auth', () => {
    it('fetches a challenge', async () => {
        mockToml();
        server.use(
            http.get(AUTH, () =>
                HttpResponse.json({
                    transaction: 'AAAAAGmocked',
                    network_passphrase: 'Test SDF Network ; September 2015',
                }),
            ),
        );
        const result = await createClient().getChallenge(USER_PUBKEY);
        expect(result.transaction).toBe('AAAAAGmocked');
    });

    it('throws TrMockError when the toml does not advertise SEP-10', async () => {
        mockToml({ sep10: false });
        await expect(createClient().getChallenge(USER_PUBKEY)).rejects.toThrow(TrMockError);
    });
});

// ---------------------------------------------------------------------------
// SEP-12
// ---------------------------------------------------------------------------

describe('SEP-12 KYC', () => {
    it('reads the customer, defaulting the account to the token subject', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${KYC}/customer`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({ id: 'cus_1', status: 'ACCEPTED' });
            }),
        );
        const result = await createClient().getCustomer(TOKEN);
        expect(captured!.searchParams.get('account')).toBe(USER_PUBKEY);
        expect(result.status).toBe('ACCEPTED');
    });
});

// ---------------------------------------------------------------------------
// SEP-38
// ---------------------------------------------------------------------------

describe('SEP-38 quotes', () => {
    it('posts a firm quote with the full asset identifier', async () => {
        mockToml();
        let body: Record<string, unknown> = {};
        server.use(
            http.post(`${QUOTE}/quote`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    id: 'qt_1',
                    expires_at: '2026-09-15T18:00:00Z',
                    total_price: '48.8830291',
                    price: '48.639830',
                    sell_amount: '1000.00',
                    buy_amount: '20.4569974',
                    sell_asset: 'iso4217:TRY',
                    buy_asset: `stellar:USDC:${USDC_ISSUER}`,
                    fee: { total: '4.98', asset: 'iso4217:TRY' },
                });
            }),
        );

        const client = createClient();
        const quote = await client.createQuote(TOKEN, {
            sell_asset: client.fiatAssetId(),
            buy_asset: client.sep38AssetId(),
            sell_amount: '1000',
            context: 'sep6',
        });

        expect(body.buy_asset).toBe(`stellar:USDC:${USDC_ISSUER}`);
        expect(quote.id).toBe('qt_1');
        expect(quote.buy_amount).toBe('20.4569974');
    });
});

// ---------------------------------------------------------------------------
// SEP-6 exchange ramps
// ---------------------------------------------------------------------------

describe('depositExchange', () => {
    it('sends the bare asset code, the ISO fiat identifier, and the quote', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${TRANSFER}/deposit-exchange`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    id: 'sep_1',
                    how: 'Send TRY to IBAN TR05… with "TRMA-UNV5-UFKW" in the description',
                });
            }),
        );

        const result = await createClient().depositExchange(TOKEN, {
            amount: '1000',
            account: USER_PUBKEY,
            quoteId: 'qt_1',
        });

        expect(captured!.searchParams.get('destination_asset')).toBe('USDC');
        expect(captured!.searchParams.get('source_asset')).toBe('iso4217:TRY');
        expect(captured!.searchParams.get('amount')).toBe('1000');
        expect(captured!.searchParams.get('account')).toBe(USER_PUBKEY);
        expect(captured!.searchParams.get('quote_id')).toBe('qt_1');
        expect(captured!.searchParams.get('funding_method')).toBe('bank_account');
        expect(result.id).toBe('sep_1');
    });

    it('omits quote_id when no quote was locked', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${TRANSFER}/deposit-exchange`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({ id: 'sep_2' });
            }),
        );
        await createClient().depositExchange(TOKEN, { amount: '1000', account: USER_PUBKEY });
        expect(captured!.searchParams.has('quote_id')).toBe(false);
    });

    it('wraps anchor errors in TrMockError', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/deposit-exchange`, () =>
                HttpResponse.json({ error: 'amount above the limit' }, { status: 400 }),
            ),
        );
        await expect(
            createClient().depositExchange(TOKEN, { amount: '99999', account: USER_PUBKEY }),
        ).rejects.toThrow(TrMockError);
    });
});

describe('withdrawExchange', () => {
    it('returns the treasury account, memo, and a signable payment XDR', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${TRANSFER}/withdraw-exchange`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    account_id: TREASURY,
                    memo_type: 'id',
                    memo: '539516300156',
                    id: 'sep_w1',
                });
            }),
            http.get(`${HORIZON}/accounts/${USER_PUBKEY}`, () =>
                HttpResponse.json({
                    id: USER_PUBKEY,
                    account_id: USER_PUBKEY,
                    sequence: '1234567890',
                    balances: [],
                }),
            ),
        );

        const result = await createClient().withdrawExchange(TOKEN, {
            amount: '10',
            account: USER_PUBKEY,
            quoteId: 'qt_2',
        });

        expect(captured!.searchParams.get('source_asset')).toBe('USDC');
        expect(captured!.searchParams.get('destination_asset')).toBe('iso4217:TRY');
        expect(result.account_id).toBe(TREASURY);
        expect(result.memo).toBe('539516300156');
        expect(typeof result.signableXdr).toBe('string');
        expect(result.signableXdr.length).toBeGreaterThan(0);
    });
});

describe('getTransaction', () => {
    it('returns the transaction', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'sep_1', kind: 'deposit', status: 'completed' },
                }),
            ),
        );
        const tx = await createClient().getTransaction(TOKEN, 'sep_1');
        expect(tx!.status).toBe('completed');
    });

    it('returns null for an unknown id', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/transaction`, () =>
                HttpResponse.json({ error: 'not found' }, { status: 404 }),
            ),
        );
        expect(await createClient().getTransaction(TOKEN, 'nope')).toBeNull();
    });
});

describe('simulateBankTransfer', () => {
    it('posts the sandbox bank leg for a deposit', async () => {
        mockToml();
        let body: Record<string, unknown> = {};
        let auth: string | null = null;
        server.use(
            http.post(`${TRANSFER}/tx/sep_1/simulate-bank-transfer`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                auth = request.headers.get('authorization');
                return HttpResponse.json({ ok: true });
            }),
        );

        await createClient().simulateBankTransfer(TOKEN, 'sep_1', '1000');

        expect(body.amount).toBe('1000');
        expect(auth).toBe(`Bearer ${TOKEN}`);
    });

    it('wraps a sandbox failure in TrMockError', async () => {
        mockToml();
        server.use(
            http.post(`${TRANSFER}/tx/sep_1/simulate-bank-transfer`, () =>
                HttpResponse.json({ error: 'transaction not found' }, { status: 404 }),
            ),
        );
        await expect(createClient().simulateBankTransfer(TOKEN, 'sep_1', '1000')).rejects.toThrow(
            TrMockError,
        );
    });
});

// ---------------------------------------------------------------------------
// debug logging
// ---------------------------------------------------------------------------

describe('debug logging', () => {
    // toml() resolves via the SDK's StellarToml.Resolver, which has its own
    // HTTP client — only calls routed through `fetchFn` (e.g. SEP-10) log.
    function mockChallenge(): void {
        server.use(
            http.get(AUTH, () =>
                HttpResponse.json({
                    transaction: 'AAAAAGmocked',
                    network_passphrase: 'Test SDF Network ; September 2015',
                }),
            ),
        );
    }

    it('is silent by default — request URLs never hit the console', async () => {
        const client = createClient();
        mockToml();
        mockChallenge();
        vi.mocked(console.log).mockClear();
        await client.getChallenge(USER_PUBKEY);
        expect(console.log).not.toHaveBeenCalled();
    });

    it('logs request URLs and response statuses when debug is enabled', async () => {
        const client = new TrMockRampClient({
            horizonUrl: HORIZON,
            usdcIssuer: USDC_ISSUER,
            fetchFn: fetch,
            debug: true,
        });
        mockToml();
        mockChallenge();
        vi.mocked(console.log).mockClear();
        await client.getChallenge(USER_PUBKEY);
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).toContain(`[TRMock] GET ${AUTH}`);
        expect(logged).toContain('[TRMock] Response (200)');
    });

    it('never logs the SEP-10 token, even in debug', async () => {
        const client = new TrMockRampClient({
            horizonUrl: HORIZON,
            usdcIssuer: USDC_ISSUER,
            fetchFn: fetch,
            debug: true,
        });
        mockToml();
        server.use(
            http.get(`${KYC}/customer`, () =>
                HttpResponse.json({ id: 'cus_1', status: 'ACCEPTED' }),
            ),
        );
        vi.mocked(console.log).mockClear();
        await client.getCustomer(TOKEN);
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).not.toContain(TOKEN);
        expect(logged).not.toContain('Bearer');
    });
});
