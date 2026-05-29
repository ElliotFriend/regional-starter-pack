import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { TestAnchorRampClient, TestAnchorSepUnsupportedError } from '$lib/anchors/testanchor';

// ---------------------------------------------------------------------------
// Test constants & helpers
// ---------------------------------------------------------------------------

const DOMAIN = 'testanchor.stellar.org';
const TOML_URL = `https://${DOMAIN}/.well-known/stellar.toml`;
const AUTH = 'https://testanchor.stellar.org/auth';
const TRANSFER = 'https://testanchor.stellar.org/sep6';
const TRANSFER_24 = 'https://testanchor.stellar.org/sep24';
const KYC = 'https://testanchor.stellar.org/sep12';
const QUOTE = 'https://testanchor.stellar.org/sep38';
const HORIZON = 'https://horizon-test.example.com';
const SIGNING_KEY = 'GBDYDBJKQBJK6VUSBE4L7UH4BQ65YNQERGRETFEQSXYHV2QAV7UACC5';
const USER_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const SRT_ISSUER = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';

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
    overrides: {
        sep6?: boolean;
        sep10?: boolean;
        sep12?: boolean;
        sep24?: boolean;
        sep38?: boolean;
    } = {},
): string {
    const lines: string[] = [`SIGNING_KEY="${SIGNING_KEY}"`];
    const o = { sep6: true, sep10: true, sep12: true, sep24: true, sep38: true, ...overrides };
    if (o.sep10) lines.push(`WEB_AUTH_ENDPOINT="${AUTH}"`);
    if (o.sep6) lines.push(`TRANSFER_SERVER="${TRANSFER}"`);
    if (o.sep12) lines.push(`KYC_SERVER="${KYC}"`);
    if (o.sep24) lines.push(`TRANSFER_SERVER_SEP0024="${TRANSFER_24}"`);
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

function createClient(): TestAnchorRampClient {
    return new TestAnchorRampClient({ horizonUrl: HORIZON, fetchFn: fetch });
}

// ---------------------------------------------------------------------------
// metadata
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('exposes provider identity and token catalog', () => {
        const client = createClient();
        expect(client.name).toBe('testanchor');
        expect(client.displayName).toBe('Test Anchor');
        expect(client.supportedCurrencies).toEqual(['USD']);
        expect(client.supportedRails).toEqual(['bank']);

        const srt = client.supportedTokens.find((t) => t.symbol === 'SRT');
        expect(srt).toBeDefined();
        expect(srt?.issuer).toBe(SRT_ISSUER);
        expect(client.supportedTokens.find((t) => t.symbol === 'USDC')).toBeDefined();
    });

    it('findToken is case-insensitive and strips qualifier suffix', () => {
        const client = createClient();
        expect(client.findToken('srt')?.symbol).toBe('SRT');
        expect(client.findToken(`SRT:${SRT_ISSUER}`)?.symbol).toBe('SRT');
        expect(client.findToken('NOPE')).toBeUndefined();
    });

    it('toSep38Asset returns stellar asset id for known tokens, fiat id otherwise', () => {
        const client = createClient();
        expect(client.toSep38Asset('SRT')).toBe(`stellar:SRT:${SRT_ISSUER}`);
        expect(client.toSep38Asset('USD')).toBe('iso4217:USD');
    });
});

// ---------------------------------------------------------------------------
// SEP-1 discovery & endpoint resolution
// ---------------------------------------------------------------------------

describe('SEP-1 discovery', () => {
    it('caches the stellar.toml across calls', async () => {
        let hits = 0;
        server.use(
            http.get(TOML_URL, () => {
                hits++;
                return new HttpResponse(tomlBody(), {
                    headers: { 'Content-Type': 'text/plain' },
                });
            }),
        );

        const client = createClient();
        const t1 = await client.toml();
        const t2 = await client.toml();
        expect(t1).toBe(t2);
        expect(hits).toBe(1);
    });

    it('throws TestAnchorSepUnsupportedError when the toml omits the required SEP endpoint', async () => {
        mockToml({ sep6: false });
        const client = createClient();
        await expect(client.sep6Deposit(TOKEN, { asset_code: 'SRT' })).rejects.toThrow(
            TestAnchorSepUnsupportedError,
        );
    });
});

// ---------------------------------------------------------------------------
// SEP-10 wallet auth
// ---------------------------------------------------------------------------

describe('SEP-10 wallet auth', () => {
    beforeEach(() => {
        mockToml();
    });

    it('getChallenge returns the anchor-issued challenge transaction', async () => {
        server.use(
            http.get(AUTH, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('account')).toBe(USER_PUBKEY);
                expect(url.searchParams.get('home_domain')).toBe(DOMAIN);
                return HttpResponse.json({
                    transaction: 'AAAAAGmocked',
                    network_passphrase: 'Test SDF Network ; September 2015',
                });
            }),
        );

        const client = createClient();
        const challenge = await client.getChallenge(USER_PUBKEY);
        expect(challenge.transaction).toBe('AAAAAGmocked');
    });

    it('submitChallenge exchanges a signed XDR for a JWT token', async () => {
        server.use(
            http.post(AUTH, async ({ request }) => {
                const body = (await request.json()) as { transaction: string };
                expect(body.transaction).toBe('SIGNED_XDR');
                return HttpResponse.json({ token: TOKEN });
            }),
        );

        const client = createClient();
        const { token } = await client.submitChallenge('SIGNED_XDR');
        expect(token).toBe(TOKEN);
    });

    it('throws when the anchor does not advertise SEP-10', async () => {
        mockToml({ sep10: false });
        const client = createClient();
        await expect(client.getChallenge(USER_PUBKEY)).rejects.toThrow(
            TestAnchorSepUnsupportedError,
        );
    });
});

// ---------------------------------------------------------------------------
// SEP-12 KYC
// ---------------------------------------------------------------------------

describe('SEP-12 KYC', () => {
    beforeEach(() => {
        mockToml();
    });

    it('getCustomer derives account from the token sub when not provided', async () => {
        server.use(
            http.get(`${KYC}/customer`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('account')).toBe(USER_PUBKEY);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({ id: 'cust-1', status: 'ACCEPTED' });
            }),
        );

        const client = createClient();
        const customer = await client.getCustomer(TOKEN);
        expect(customer.id).toBe('cust-1');
        expect(customer.status).toBe('ACCEPTED');
    });

    it('putCustomer derives account from the token sub when not provided', async () => {
        server.use(
            http.put(`${KYC}/customer`, async ({ request }) => {
                const body = (await request.json()) as Record<string, string>;
                expect(body.account).toBe(USER_PUBKEY);
                expect(body.first_name).toBe('Ada');
                return HttpResponse.json({ id: 'cust-1' });
            }),
        );

        const client = createClient();
        const result = await client.putCustomer(TOKEN, { first_name: 'Ada' });
        expect(result.id).toBe('cust-1');
    });
});

// ---------------------------------------------------------------------------
// SEP-38 quotes
// ---------------------------------------------------------------------------

describe('SEP-38 quotes', () => {
    beforeEach(() => {
        mockToml();
    });

    it('getPrice forwards the request to the anchor quote server', async () => {
        server.use(
            http.get(`${QUOTE}/price`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('sell_asset')).toBe('iso4217:USD');
                expect(url.searchParams.get('buy_asset')).toBe(`stellar:SRT:${SRT_ISSUER}`);
                expect(url.searchParams.get('sell_amount')).toBe('100');
                return HttpResponse.json({
                    total_price: '1.00',
                    price: '1.00',
                    sell_amount: '100',
                    buy_amount: '100',
                    fee: { total: '0', asset: 'iso4217:USD' },
                });
            }),
        );

        const client = createClient();
        const price = await client.getPrice({
            sell_asset: 'iso4217:USD',
            buy_asset: `stellar:SRT:${SRT_ISSUER}`,
            sell_amount: '100',
            context: 'sep6',
        });
        expect(price.total_price).toBe('1.00');
        expect(price.buy_amount).toBe('100');
    });
});

// ---------------------------------------------------------------------------
// SEP-6 programmatic ramps
// ---------------------------------------------------------------------------

describe('SEP-6 programmatic ramps', () => {
    beforeEach(() => {
        mockToml();
    });

    it('sep6Deposit forwards the request and returns the anchor response', async () => {
        server.use(
            http.get(`${TRANSFER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('asset_code')).toBe('SRT');
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({
                    how: 'Send funds to the bank account',
                    id: 'dep-1',
                    fee_fixed: 0,
                });
            }),
        );

        const client = createClient();
        const deposit = await client.sep6Deposit(TOKEN, { asset_code: 'SRT' });
        expect(deposit.id).toBe('dep-1');
        expect(deposit.how).toBe('Send funds to the bank account');
    });

    it('sep6Withdraw builds a signable Stellar payment XDR and surfaces it on the response', async () => {
        const destinationKey = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
        server.use(
            http.get(`${TRANSFER}/withdraw`, () =>
                HttpResponse.json({
                    id: 'wd-1',
                    account_id: destinationKey,
                    memo: '12345',
                    memo_type: 'id',
                }),
            ),
            http.get(`${HORIZON}/accounts/${USER_PUBKEY}`, () =>
                HttpResponse.json({
                    id: USER_PUBKEY,
                    account_id: USER_PUBKEY,
                    sequence: '1234567890',
                }),
            ),
        );

        const client = createClient();
        const withdrawal = await client.sep6Withdraw(
            TOKEN,
            { asset_code: 'SRT', amount: '50' },
            USER_PUBKEY,
        );
        expect(withdrawal.id).toBe('wd-1');
        expect(withdrawal.account_id).toBe(destinationKey);
        // The signable XDR is a base64-encoded TransactionEnvelope; non-empty
        // is enough to assert XDR construction happened — we don't decode it
        // here because that just retests the Stellar SDK.
        expect(typeof withdrawal.signableXdr).toBe('string');
        expect(withdrawal.signableXdr.length).toBeGreaterThan(0);
    });

    it('rejects sep6Withdraw when the source account is not a valid public key', async () => {
        server.use(
            http.get(`${TRANSFER}/withdraw`, () =>
                HttpResponse.json({
                    id: 'wd-1',
                    account_id: SRT_ISSUER,
                }),
            ),
        );

        const client = createClient();
        await expect(
            client.sep6Withdraw(TOKEN, { asset_code: 'SRT', amount: '50' }, 'not-a-key'),
        ).rejects.toThrow(/Invalid source account/);
    });

    it('getSep6Transaction returns null when the anchor returns 404', async () => {
        server.use(
            http.get(`${TRANSFER}/transaction`, () => new HttpResponse(null, { status: 404 })),
        );

        const client = createClient();
        await expect(client.getSep6Transaction(TOKEN, 'missing')).resolves.toBeNull();
    });

    it('getSep6Transaction rethrows non-404 errors', async () => {
        server.use(
            http.get(`${TRANSFER}/transaction`, () => new HttpResponse(null, { status: 500 })),
        );

        const client = createClient();
        await expect(client.getSep6Transaction(TOKEN, 'boom')).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// SEP-24 interactive ramps
// ---------------------------------------------------------------------------

describe('SEP-24 interactive ramps', () => {
    beforeEach(() => {
        mockToml();
    });

    it('sep24Deposit returns the interactive url and transaction id', async () => {
        server.use(
            http.post(`${TRANSFER_24}/transactions/deposit/interactive`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({
                    type: 'interactive_customer_info_needed',
                    url: 'https://testanchor.stellar.org/sep24/interactive?token=abc',
                    id: 'sess-1',
                });
            }),
        );

        const client = createClient();
        const session = await client.sep24Deposit(TOKEN, {
            asset_code: 'SRT',
            asset_issuer: SRT_ISSUER,
            account: USER_PUBKEY,
        });
        expect(session.id).toBe('sess-1');
        expect(session.url).toContain('/sep24/interactive');
    });

    it('sep24Withdraw returns the interactive url and transaction id', async () => {
        server.use(
            http.post(`${TRANSFER_24}/transactions/withdraw/interactive`, () =>
                HttpResponse.json({
                    type: 'interactive_customer_info_needed',
                    url: 'https://testanchor.stellar.org/sep24/interactive?token=xyz',
                    id: 'sess-2',
                }),
            ),
        );

        const client = createClient();
        const session = await client.sep24Withdraw(TOKEN, {
            asset_code: 'SRT',
            asset_issuer: SRT_ISSUER,
            account: USER_PUBKEY,
        });
        expect(session.id).toBe('sess-2');
    });

    it('getSep24Transaction returns null when the anchor returns 404', async () => {
        server.use(
            http.get(`${TRANSFER_24}/transaction`, () => new HttpResponse(null, { status: 404 })),
        );

        const client = createClient();
        await expect(client.getSep24Transaction(TOKEN, 'missing')).resolves.toBeNull();
    });
});
