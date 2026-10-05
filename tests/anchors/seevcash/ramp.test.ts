import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { TransactionBuilder, Networks, Transaction } from '@stellar/stellar-sdk';
import { server } from '../../test-setup';
import { SeevcashRampClient, SeevcashError } from '#lib/anchors/seevcash/index.ts';

// ---------------------------------------------------------------------------
// Test constants & helpers
// ---------------------------------------------------------------------------

const DOMAIN = 'anchor.seevcash.com';
const TOML_URL = `https://${DOMAIN}/.well-known/stellar.toml`;
const AUTH = `https://${DOMAIN}/auth`;
const TRANSFER = `https://${DOMAIN}/sep6`;
const KYC = `https://${DOMAIN}/sep12`;
const QUOTE = `https://${DOMAIN}/sep38`;
const HORIZON = 'https://horizon-test.example.com';
const SIGNING_KEY = 'GA2E5D24D2LCGVA3SVVKDP64OTN2M2NLUWRDYINB352HW35ABZ66MPVR';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const DISTRIBUTION = 'GAK7TXAATOB34TQVA3ZHBFEVSBYKMY7B5FIFWIL6JBEOCN4JJHGOLANT';
const USER_PUBKEY = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';

function makeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.fakesig`;
}

const TOKEN = makeJwt({
    iss: `https://${DOMAIN}`,
    sub: USER_PUBKEY,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    jti: 'jti-1',
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

function mockHorizonAccount(): void {
    server.use(
        http.get(`${HORIZON}/accounts/${USER_PUBKEY}`, () =>
            HttpResponse.json({
                id: USER_PUBKEY,
                account_id: USER_PUBKEY,
                sequence: '1234567890',
                balances: [],
            }),
        ),
    );
}

function createClient(debug = false): SeevcashRampClient {
    return new SeevcashRampClient({
        horizonUrl: HORIZON,
        usdcIssuer: USDC_ISSUER,
        fetchFn: fetch,
        debug,
    });
}

// ---------------------------------------------------------------------------
// metadata & asset identifiers
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('identifies itself as SeevCash', () => {
        const client = createClient();
        expect(client.name).toBe('seevcash');
        expect(client.displayName).toBe('SeevCash');
        expect(client.supportedCurrencies).toEqual(['GHS']);
        expect(client.supportedRails).toEqual(['mobile-money']);
    });
});

describe('asset identifiers', () => {
    it('uses the full SEP-38 identifier for USDC', () => {
        expect(createClient().sep38AssetId()).toBe(`stellar:USDC:${USDC_ISSUER}`);
    });

    it('uses the ISO 4217 identifier for the off-chain GHS leg', () => {
        expect(createClient().fiatAssetId()).toBe('iso4217:GHS');
    });
});

// ---------------------------------------------------------------------------
// SEP-10
// ---------------------------------------------------------------------------

describe('SEP-10 auth', () => {
    it('fetches a challenge from the toml auth endpoint', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(AUTH, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    transaction: 'AAAAAGmocked',
                    network_passphrase: 'Test SDF Network ; September 2015',
                });
            }),
        );
        const result = await createClient().getChallenge(USER_PUBKEY);
        expect(captured!.searchParams.get('account')).toBe(USER_PUBKEY);
        expect(result.transaction).toBe('AAAAAGmocked');
    });

    it('submits the signed challenge for a token', async () => {
        mockToml();
        let body: Record<string, unknown> = {};
        server.use(
            http.post(AUTH, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ token: TOKEN });
            }),
        );
        const result = await createClient().submitChallenge('AAAAAGsigned');
        expect(body.transaction).toBe('AAAAAGsigned');
        expect(result.token).toBe(TOKEN);
    });

    it('throws SeevcashError when the toml does not advertise SEP-10', async () => {
        mockToml({ sep10: false });
        await expect(createClient().getChallenge(USER_PUBKEY)).rejects.toThrow(SeevcashError);
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

    it('puts the customer with mobile money fields, defaulting the account', async () => {
        mockToml();
        let body: Record<string, unknown> = {};
        server.use(
            http.put(`${KYC}/customer`, async ({ request }) => {
                const contentType = request.headers.get('content-type') ?? '';
                body = contentType.includes('application/json')
                    ? ((await request.json()) as Record<string, unknown>)
                    : Object.fromEntries((await request.formData()).entries());
                return HttpResponse.json({ id: 'cus_1' }, { status: 202 });
            }),
        );
        const result = await createClient().putCustomer(TOKEN, {
            first_name: 'Ama',
            last_name: 'Mensah',
            email_address: 'ama@example.com',
            birth_date: '1992-03-20',
            mobile_money_number: '+233241234567',
            mobile_money_provider: 'MTN',
        });
        expect(body.account).toBe(USER_PUBKEY);
        expect(body.birth_date).toBe('1992-03-20');
        expect(body.mobile_money_provider).toBe('MTN');
        expect(result.id).toBe('cus_1');
    });

    it('wraps a KYC failure in SeevcashError', async () => {
        mockToml();
        server.use(
            http.get(`${KYC}/customer`, () =>
                HttpResponse.json({ error: 'Authentication required' }, { status: 403 }),
            ),
        );
        const err = await createClient()
            .getCustomer(TOKEN)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SeevcashError);
        expect((err as SeevcashError).statusCode).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// SEP-38 indicative prices
// ---------------------------------------------------------------------------

describe('getPrice', () => {
    it('prices an on-ramp as GHS sold for a USDC buy amount over mobile money', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${QUOTE}/price`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    total_price: '12.086',
                    price: '11.734',
                    sell_amount: '60.43',
                    buy_amount: '5',
                    fee: { total: '1.76', asset: 'iso4217:GHS' },
                });
            }),
        );
        const price = await createClient().getPrice({ kind: 'deposit', amount: '5' });
        expect(captured!.searchParams.get('sell_asset')).toBe('iso4217:GHS');
        expect(captured!.searchParams.get('buy_asset')).toBe(`stellar:USDC:${USDC_ISSUER}`);
        expect(captured!.searchParams.get('buy_amount')).toBe('5');
        expect(captured!.searchParams.get('sell_amount')).toBeNull();
        expect(captured!.searchParams.get('context')).toBe('sep6');
        expect(captured!.searchParams.get('sell_delivery_method')).toBe('mobile_money');
        expect(price.sell_amount).toBe('60.43');
    });

    it('prices an off-ramp as a USDC sell amount for GHS over mobile money', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${QUOTE}/price`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    total_price: '0.0878',
                    price: '0.0852',
                    sell_amount: '5',
                    buy_amount: '56.90',
                    fee: { total: '0.15', asset: `stellar:USDC:${USDC_ISSUER}` },
                });
            }),
        );
        await createClient().getPrice({ kind: 'withdraw', amount: '5' });
        expect(captured!.searchParams.get('sell_asset')).toBe(`stellar:USDC:${USDC_ISSUER}`);
        expect(captured!.searchParams.get('buy_asset')).toBe('iso4217:GHS');
        expect(captured!.searchParams.get('sell_amount')).toBe('5');
        expect(captured!.searchParams.get('buy_delivery_method')).toBe('mobile_money');
    });

    it('wraps a pricing failure in SeevcashError', async () => {
        mockToml();
        server.use(
            http.get(`${QUOTE}/price`, () =>
                HttpResponse.json({ error: 'unsupported pair' }, { status: 400 }),
            ),
        );
        await expect(createClient().getPrice({ kind: 'deposit', amount: '5' })).rejects.toThrow(
            SeevcashError,
        );
    });
});

// ---------------------------------------------------------------------------
// SEP-6
// ---------------------------------------------------------------------------

describe('info', () => {
    it('reads SEP-6 info for limits', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/info`, () =>
                HttpResponse.json({
                    deposit: { USDC: { enabled: true, min_amount: 0.1, max_amount: 10000 } },
                    withdraw: { USDC: { enabled: true, min_amount: 0.1, max_amount: 10000 } },
                }),
            ),
        );
        const info = await createClient().info();
        expect(info.deposit?.USDC?.max_amount).toBe(10000);
    });
});

describe('deposit', () => {
    it('starts a mobile money deposit for USDC', async () => {
        mockToml();
        let captured: URL | undefined;
        let auth: string | null = null;
        server.use(
            http.get(`${TRANSFER}/deposit`, ({ request }) => {
                captured = new URL(request.url);
                auth = request.headers.get('authorization');
                return HttpResponse.json({
                    id: 'dep_1',
                    how: 'A mobile money collection of GHS 60.43 will be sent to +233***4567 (MTN).',
                    eta: 300,
                });
            }),
        );
        const result = await createClient().deposit(TOKEN, {
            amount: '5',
            account: USER_PUBKEY,
        });
        expect(captured!.searchParams.get('asset_code')).toBe('USDC');
        expect(captured!.searchParams.get('account')).toBe(USER_PUBKEY);
        expect(captured!.searchParams.get('amount')).toBe('5');
        expect(captured!.searchParams.get('funding_method')).toBe('mobile');
        expect(auth).toBe(`Bearer ${TOKEN}`);
        expect(result.id).toBe('dep_1');
    });

    it('wraps anchor errors in SeevcashError, preserving the status', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/deposit`, () =>
                HttpResponse.json({ error: 'customer_info_needed' }, { status: 403 }),
            ),
        );
        const err = await createClient()
            .deposit(TOKEN, { amount: '5', account: USER_PUBKEY })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SeevcashError);
        expect((err as SeevcashError).statusCode).toBe(403);
        expect((err as SeevcashError).message).toBe('customer_info_needed');
    });
});

describe('withdraw', () => {
    it('sends funding_method (required by the anchor) and returns a signable payment XDR', async () => {
        mockToml();
        mockHorizonAccount();
        let captured: URL | undefined;
        server.use(
            http.get(`${TRANSFER}/withdraw`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    id: 'wd_1',
                    account_id: DISTRIBUTION,
                    memo_type: 'text',
                    memo: 'd3d10baf2cf74c569dd171ef0495',
                    eta: 300,
                });
            }),
        );

        const result = await createClient().withdraw(TOKEN, {
            amount: '2',
            account: USER_PUBKEY,
        });

        expect(captured!.searchParams.get('asset_code')).toBe('USDC');
        expect(captured!.searchParams.get('funding_method')).toBe('mobile');
        expect(captured!.searchParams.get('amount')).toBe('2');
        expect(result.account_id).toBe(DISTRIBUTION);
        expect(result.memo).toBe('d3d10baf2cf74c569dd171ef0495');
        const tx = TransactionBuilder.fromXDR(result.signableXdr, Networks.TESTNET) as Transaction;
        expect(tx.source).toBe(USER_PUBKEY);
        expect(tx.memo.type).toBe('text');
        expect(new TextDecoder().decode(tx.memo.value as Uint8Array)).toBe(
            'd3d10baf2cf74c569dd171ef0495',
        );
        expect(tx.operations).toHaveLength(1);
        expect(tx.operations[0]).toMatchObject({
            type: 'payment',
            destination: DISTRIBUTION,
            amount: '2.0000000',
        });
    });

    it('decodes a base64 hash memo without Node Buffer (browser-safe)', async () => {
        mockToml();
        mockHorizonAccount();
        const bytes = Uint8Array.from({ length: 32 }, (_, i) => i);
        const memo = btoa(String.fromCharCode(...bytes));
        server.use(
            http.get(`${TRANSFER}/withdraw`, () =>
                HttpResponse.json({
                    id: 'wd_2',
                    account_id: DISTRIBUTION,
                    memo_type: 'hash',
                    memo,
                }),
            ),
        );
        const bufferSpy = vi.spyOn(Buffer, 'from');
        const result = await createClient().withdraw(TOKEN, { amount: '2', account: USER_PUBKEY });
        const fromClient = bufferSpy.mock.calls.some((args) => (args as unknown[])[1] === 'base64');
        bufferSpy.mockRestore();

        const tx = TransactionBuilder.fromXDR(result.signableXdr, Networks.TESTNET) as Transaction;
        expect(tx.memo.type).toBe('hash');
        expect(Array.from(tx.memo.value as Uint8Array)).toEqual(Array.from(bytes));
        expect(fromClient).toBe(false);
    });

    it('rejects an invalid source account before touching Horizon', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/withdraw`, () =>
                HttpResponse.json({ id: 'wd_1', account_id: DISTRIBUTION, memo: 'm' }),
            ),
        );
        const err = await createClient()
            .withdraw(TOKEN, { amount: '2', account: 'not-a-key' })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SeevcashError);
        expect((err as SeevcashError).statusCode).toBe(400);
    });

    it('wraps anchor errors in SeevcashError', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/withdraw`, () =>
                HttpResponse.json({ error: 'funding_method is required' }, { status: 400 }),
            ),
        );
        await expect(
            createClient().withdraw(TOKEN, { amount: '2', account: USER_PUBKEY }),
        ).rejects.toThrow(SeevcashError);
    });
});

describe('getTransaction', () => {
    it('returns the transaction', async () => {
        mockToml();
        let captured: URL | undefined;
        server.use(
            http.get(`${TRANSFER}/transaction`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({
                    transaction: { id: 'dep_1', kind: 'deposit', status: 'completed' },
                });
            }),
        );
        const tx = await createClient().getTransaction(TOKEN, 'dep_1');
        expect(captured!.searchParams.get('id')).toBe('dep_1');
        expect(tx!.status).toBe('completed');
    });

    it('returns null for an unknown id', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/transaction`, () =>
                HttpResponse.json({ error: 'Transaction not found' }, { status: 404 }),
            ),
        );
        expect(await createClient().getTransaction(TOKEN, 'nope')).toBeNull();
    });

    it('wraps other failures in SeevcashError', async () => {
        mockToml();
        server.use(
            http.get(`${TRANSFER}/transaction`, () =>
                HttpResponse.json({ error: 'boom' }, { status: 500 }),
            ),
        );
        await expect(createClient().getTransaction(TOKEN, 'dep_1')).rejects.toThrow(SeevcashError);
    });
});

// ---------------------------------------------------------------------------
// browser fetch binding
// ---------------------------------------------------------------------------

describe('default fetch', () => {
    it('calls the global fetch unbound, as browsers require', async () => {
        mockToml();
        const realFetch = globalThis.fetch;
        // Browsers throw "Illegal invocation" when window.fetch is called as a
        // method of another object; mimic that.
        const strictFetch = vi.fn(function (this: unknown, ...args: Parameters<typeof fetch>) {
            if (this !== undefined && this !== globalThis) {
                throw new TypeError('Illegal invocation');
            }
            return realFetch(...args);
        });
        vi.stubGlobal('fetch', strictFetch);
        server.use(
            http.get(AUTH, () =>
                HttpResponse.json({
                    transaction: 'AAAAAGmocked',
                    network_passphrase: 'Test SDF Network ; September 2015',
                }),
            ),
        );
        try {
            const client = new SeevcashRampClient({ usdcIssuer: USDC_ISSUER });
            await expect(client.getChallenge(USER_PUBKEY)).resolves.toMatchObject({
                transaction: 'AAAAAGmocked',
            });
            expect(strictFetch).toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
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
        const client = createClient(true);
        mockToml();
        mockChallenge();
        vi.mocked(console.log).mockClear();
        await client.getChallenge(USER_PUBKEY);
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((call) => call.join(' '))
            .join('\n');
        expect(logged).toContain(`[SeevCash] GET ${AUTH}`);
        expect(logged).toContain('[SeevCash] Response (200)');
    });

    it('never logs the SEP-10 token, even in debug', async () => {
        const client = createClient(true);
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
