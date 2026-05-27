import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { TestAnchorAdapter } from '$lib/anchors/testanchor/anchor';

const DOMAIN = 'anchor.test';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const ACCOUNT = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const SIGNING_KEY = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';

const AUTH = 'https://anchor.test/auth';
const SEP6 = 'https://anchor.test/sep6';
const SEP24 = 'https://anchor.test/sep24';
const KYC = 'https://anchor.test/kyc';
const SEP38 = 'https://anchor.test/sep38';

const STELLAR_TOML = `
NETWORK_PASSPHRASE="${PASSPHRASE}"
SIGNING_KEY="${SIGNING_KEY}"
WEB_AUTH_ENDPOINT="${AUTH}"
TRANSFER_SERVER="${SEP6}"
TRANSFER_SERVER_SEP0024="${SEP24}"
KYC_SERVER="${KYC}"
ANCHOR_QUOTE_SERVER="${SEP38}"
`;

/** Build a decodable (unsigned) JWT carrying `sub`, as the adapter reads it for the customer id. */
function fakeJwt(sub: string): string {
    const payload = Buffer.from(JSON.stringify({ sub, exp: 9_999_999_999 })).toString('base64url');
    return `header.${payload}.sig`;
}

/** Register the stellar.toml handler (every test needs discovery). */
function mockToml() {
    server.use(
        http.get(`https://${DOMAIN}/.well-known/stellar.toml`, () => {
            return new HttpResponse(STELLAR_TOML, {
                headers: { 'content-type': 'text/plain' },
            });
        }),
    );
}

function createAdapter() {
    return new TestAnchorAdapter({
        domain: DOMAIN,
        networkPassphrase: PASSPHRASE,
        horizonUrl: 'https://horizon.test',
    });
}

// ---------------------------------------------------------------------------
// Metadata & facets
// ---------------------------------------------------------------------------

describe('metadata', () => {
    it('exposes both facets plus wallet auth', () => {
        const a = createAdapter();
        expect(a.name).toBe('testanchor');
        expect(a.programmatic).toBeDefined();
        expect(a.interactive).toBeDefined();
        expect(a.auth).toBeDefined();
        expect(a.capabilities.flowStyles).toEqual(['interactive', 'programmatic']);
    });

    it('lists SRT and USDC with issuers', () => {
        const symbols = createAdapter().supportedTokens.map((t) => t.symbol);
        expect(symbols).toEqual(['SRT', 'USDC']);
    });
});

// ---------------------------------------------------------------------------
// Wallet auth (SEP-10)
// ---------------------------------------------------------------------------

describe('auth (SEP-10)', () => {
    it('getChallenge returns the challenge XDR and passphrase', async () => {
        mockToml();
        server.use(
            http.get(AUTH, ({ request }) => {
                const u = new URL(request.url);
                expect(u.searchParams.get('account')).toBe(ACCOUNT);
                return HttpResponse.json({
                    transaction: 'CHALLENGE_XDR',
                    network_passphrase: PASSPHRASE,
                });
            }),
        );

        const challenge = await createAdapter().auth.getChallenge(ACCOUNT);
        expect(challenge.transactionXdr).toBe('CHALLENGE_XDR');
        expect(challenge.networkPassphrase).toBe(PASSPHRASE);
    });

    it('submitChallenge exchanges a signed XDR for a token', async () => {
        mockToml();
        server.use(
            http.post(AUTH, async ({ request }) => {
                const body = (await request.json()) as { transaction: string };
                expect(body.transaction).toBe('SIGNED_XDR');
                return HttpResponse.json({ token: 'JWT123' });
            }),
        );

        const session = await createAdapter().auth.submitChallenge('SIGNED_XDR');
        expect(session.token).toBe('JWT123');
    });
});

// ---------------------------------------------------------------------------
// Interactive facet (SEP-24)
// ---------------------------------------------------------------------------

describe('interactive (SEP-24)', () => {
    it('startOnRamp returns the hosted URL and transaction id', async () => {
        mockToml();
        server.use(
            http.post(`${SEP24}/transactions/deposit/interactive`, () => {
                return HttpResponse.json({
                    type: 'interactive_customer_info_needed',
                    url: 'https://anchor.test/sep24/interactive?token=x',
                    id: 'tx-onramp-1',
                });
            }),
        );

        const session = await createAdapter().interactive.startOnRamp({
            assetCode: 'SRT',
            account: ACCOUNT,
            amount: '100',
            auth: fakeJwt(ACCOUNT),
        });
        expect(session).toEqual({
            interactiveUrl: 'https://anchor.test/sep24/interactive?token=x',
            transactionId: 'tx-onramp-1',
        });
    });

    it('startOffRamp uses the withdraw endpoint', async () => {
        mockToml();
        server.use(
            http.post(`${SEP24}/transactions/withdraw/interactive`, () => {
                return HttpResponse.json({
                    type: 'interactive_customer_info_needed',
                    url: 'https://anchor.test/sep24/w',
                    id: 'tx-off-1',
                });
            }),
        );

        const session = await createAdapter().interactive.startOffRamp({
            assetCode: 'SRT',
            account: ACCOUNT,
            auth: fakeJwt(ACCOUNT),
        });
        expect(session.transactionId).toBe('tx-off-1');
    });

    it('requires a session token', async () => {
        mockToml();
        await expect(
            createAdapter().interactive.startOnRamp({ assetCode: 'SRT', account: ACCOUNT }),
        ).rejects.toMatchObject({ code: 'AUTH_REQUIRED', statusCode: 401 });
    });

    it('getOnRampTransaction maps a SEP-24 transaction and status', async () => {
        mockToml();
        server.use(
            http.get(`${SEP24}/transaction`, () => {
                return HttpResponse.json({
                    transaction: {
                        id: 'tx-onramp-1',
                        kind: 'deposit',
                        status: 'completed',
                        amount_in: '100',
                        amount_in_asset: 'iso4217:USD',
                        amount_out: '99',
                        amount_out_asset: 'SRT',
                        more_info_url: 'https://anchor.test/more',
                        to: ACCOUNT,
                    },
                });
            }),
        );

        const tx = await createAdapter().interactive.getOnRampTransaction(
            'tx-onramp-1',
            fakeJwt(ACCOUNT),
        );
        expect(tx).not.toBeNull();
        expect(tx!.status).toBe('completed');
        expect(tx!.toAmount).toBe('99');
        expect(tx!.interactiveUrl).toBe('https://anchor.test/more');
        expect(tx!.customerId).toBe(ACCOUNT);
    });

    it('maps a pending SEP status to processing', async () => {
        mockToml();
        server.use(
            http.get(`${SEP24}/transaction`, () => {
                return HttpResponse.json({
                    transaction: { id: 't', kind: 'deposit', status: 'pending_anchor' },
                });
            }),
        );
        const tx = await createAdapter().interactive.getOnRampTransaction('t', fakeJwt(ACCOUNT));
        expect(tx!.status).toBe('processing');
    });
});

// ---------------------------------------------------------------------------
// Programmatic facet (SEP-6 / SEP-12 / SEP-38)
// ---------------------------------------------------------------------------

describe('programmatic', () => {
    it('getQuote maps a SEP-38 price', async () => {
        mockToml();
        server.use(
            http.get(`${SEP38}/price`, ({ request }) => {
                const u = new URL(request.url);
                expect(u.searchParams.get('sell_asset')).toBe('iso4217:USD');
                expect(u.searchParams.get('buy_asset')).toBe(`stellar:SRT:${SIGNING_KEY}`);
                return HttpResponse.json({
                    total_price: '1.01',
                    price: '1.0',
                    sell_amount: '100',
                    buy_amount: '99',
                    fee: { total: '1', asset: 'iso4217:USD' },
                });
            }),
        );

        const quote = await createAdapter().programmatic.getQuote({
            fromCurrency: 'USD',
            toCurrency: 'SRT',
            fromAmount: '100',
        });
        expect(quote.fromAmount).toBe('100');
        expect(quote.toAmount).toBe('99');
        expect(quote.exchangeRate).toBe('1.0');
        expect(quote.fee).toBe('1');
    });

    it('createOnRamp maps SEP-6 deposit instructions to generic instructions', async () => {
        mockToml();
        server.use(
            http.get(`${SEP6}/deposit`, ({ request }) => {
                // SEP-6 deposit requires the deposit `type`; the test anchor only
                // accepts `bank_account`.
                expect(new URL(request.url).searchParams.get('type')).toBe('bank_account');
                return HttpResponse.json({
                    id: 'sep6-onramp-1',
                    how: 'Send a bank transfer to the account below.',
                    instructions: {
                        bank_account: { value: '12345678', description: 'Account number' },
                        bank_number: { value: '021', description: 'Routing number' },
                    },
                });
            }),
        );

        const tx = await createAdapter().programmatic.createOnRamp(
            {
                customerId: ACCOUNT,
                quoteId: 'q1',
                stellarAddress: ACCOUNT,
                fromCurrency: 'USD',
                toCurrency: 'SRT',
                amount: '100',
            },
            fakeJwt(ACCOUNT),
        );

        expect(tx.id).toBe('sep6-onramp-1');
        const pi = tx.paymentInstructions;
        expect(pi?.type).toBe('generic');
        if (pi?.type === 'generic') {
            expect(pi.how).toContain('bank transfer');
            expect(pi.fields).toHaveLength(2);
            expect(pi.fields[0]).toMatchObject({ key: 'bank_account', value: '12345678' });
        }
    });

    it('createOnRamp requires a session token', async () => {
        mockToml();
        await expect(
            createAdapter().programmatic.createOnRamp({
                customerId: ACCOUNT,
                quoteId: 'q1',
                stellarAddress: ACCOUNT,
                fromCurrency: 'USD',
                toCurrency: 'SRT',
                amount: '100',
            }),
        ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });

    it.each([
        ['ACCEPTED', 'approved'],
        ['PROCESSING', 'pending'],
        ['NEEDS_INFO', 'update_required'],
        ['REJECTED', 'rejected'],
    ] as const)('getKycStatus maps SEP-12 %s -> %s', async (sep12, expected) => {
        mockToml();
        server.use(
            http.get(`${KYC}/customer`, () => {
                return HttpResponse.json({ id: 'cust-1', status: sep12 });
            }),
        );
        const status = await createAdapter().programmatic.getKycStatus(
            ACCOUNT,
            ACCOUNT,
            fakeJwt(ACCOUNT),
        );
        expect(status).toBe(expected);
    });

    it('getFiatAccounts returns empty (SEP-6 collects payout details in-flow)', async () => {
        const accounts = await createAdapter().programmatic.getFiatAccounts(ACCOUNT);
        expect(accounts).toEqual([]);
    });

    it('getKycRequirements falls back to a static SEP-9 set without a session token', async () => {
        const req = await createAdapter().programmatic.getKycRequirements!();
        expect(req.fields.map((f) => f.key)).toEqual(['first_name', 'last_name', 'email_address']);
        expect(req.documents).toEqual([]);
    });

    it('getKycRequirements discovers the fields SEP-12 reports as needed', async () => {
        mockToml();
        let queriedAccount: string | null = null;
        server.use(
            http.get(`${KYC}/customer`, ({ request }) => {
                queriedAccount = new URL(request.url).searchParams.get('account');
                return HttpResponse.json({
                    id: 'cust-1',
                    status: 'NEEDS_INFO',
                    fields: {
                        mobile_number: { type: 'string', description: 'Mobile phone number' },
                        email_address: {
                            type: 'string',
                            description: 'Email address',
                            optional: true,
                        },
                        id_type: {
                            type: 'string',
                            description: 'ID type',
                            choices: ['passport', 'drivers_license'],
                        },
                        photo_id_front: { type: 'binary', description: 'Front of your ID' },
                        photo_id_back: {
                            type: 'binary',
                            description: 'Back of your ID',
                            optional: true,
                        },
                    },
                });
            }),
        );

        const req = await createAdapter().programmatic.getKycRequirements!({
            auth: fakeJwt(ACCOUNT),
        });

        // Discovery is keyed by the authenticated account.
        expect(queriedAccount).toBe(ACCOUNT);

        const byKey = Object.fromEntries(req.fields.map((f) => [f.key, f]));
        expect(byKey.mobile_number).toMatchObject({ label: 'Mobile phone number', required: true });
        // optional in SEP-12 -> not required in our form
        expect(byKey.email_address.required).toBe(false);
        // choices -> a select with options
        expect(byKey.id_type).toMatchObject({ type: 'select' });
        expect(byKey.id_type.options?.map((o) => o.value)).toEqual(['passport', 'drivers_license']);
        // binary fields surface as documents, not text inputs
        expect(req.fields.map((f) => f.key)).not.toContain('photo_id_front');
        const docsByKey = Object.fromEntries(req.documents.map((d) => [d.key, d]));
        expect(docsByKey.photo_id_front.required).toBe(true);
        // optional binary -> optional document
        expect(docsByKey.photo_id_back.required).toBe(false);
    });

    it('submitKyc PUTs SEP-9 fields and returns the mapped status', async () => {
        mockToml();
        let putBody: Record<string, unknown> | undefined;
        server.use(
            http.put(`${KYC}/customer`, async ({ request }) => {
                putBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ id: 'cust-kyc-1' });
            }),
            http.get(`${KYC}/customer`, () => {
                return HttpResponse.json({ id: 'cust-kyc-1', status: 'ACCEPTED' });
            }),
        );

        const result = await createAdapter().programmatic.submitKyc!(
            'cust-kyc-1',
            {
                fields: { first_name: 'Ada', last_name: 'Lovelace', email_address: 'ada@x.io' },
                documents: {},
            },
            fakeJwt(ACCOUNT),
        );

        expect(result.customerId).toBe('cust-kyc-1');
        expect(result.kycStatus).toBe('approved');
        expect(putBody).toMatchObject({ account: ACCOUNT, first_name: 'Ada' });
    });

    it('submitKyc forwards a transaction_id from metadata into the SEP-12 PUT', async () => {
        mockToml();
        let putBody: Record<string, unknown> | undefined;
        server.use(
            http.put(`${KYC}/customer`, async ({ request }) => {
                putBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({ id: 'cust-kyc-1' });
            }),
            http.get(`${KYC}/customer`, () => {
                return HttpResponse.json({ id: 'cust-kyc-1', status: 'PROCESSING' });
            }),
        );

        await createAdapter().programmatic.submitKyc!(
            'cust-kyc-1',
            {
                fields: { mobile_number: '+15551234567' },
                documents: {},
                metadata: { transaction_id: 'tx-onramp-1' },
            },
            fakeJwt(ACCOUNT),
        );

        expect(putBody).toMatchObject({
            account: ACCOUNT,
            mobile_number: '+15551234567',
            transaction_id: 'tx-onramp-1',
        });
    });

    it('submitKyc requires a session token', async () => {
        mockToml();
        await expect(
            createAdapter().programmatic.submitKyc!('c', { fields: {}, documents: {} }),
        ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });

    // -----------------------------------------------------------------------
    // pending_customer_info_update enrichment
    // -----------------------------------------------------------------------

    it('getOnRampTransaction surfaces inline required_info_updates as requiredInfo', async () => {
        mockToml();
        server.use(
            http.get(`${SEP6}/transaction`, () => {
                return HttpResponse.json({
                    transaction: {
                        id: 'tx-onramp-1',
                        kind: 'deposit',
                        status: 'pending_customer_info_update',
                        message: 'Please update your info',
                        required_info_message: 'We need your phone number',
                        required_info_updates: {
                            mobile_number: { type: 'string', description: 'Mobile phone number' },
                        },
                    },
                });
            }),
        );

        const tx = await createAdapter().programmatic.getOnRampTransaction(
            'tx-onramp-1',
            fakeJwt(ACCOUNT),
        );
        expect(tx!.message).toBe('Please update your info');
        expect(tx!.requiredInfo).toBeDefined();
        expect(tx!.requiredInfo!.message).toBe('We need your phone number');
        expect(tx!.requiredInfo!.fields.map((f) => f.key)).toEqual(['mobile_number']);
    });

    it('getOnRampTransaction falls back to SEP-12 fields when the tx omits required_info_updates', async () => {
        mockToml();
        let customerTxId: string | null = null;
        server.use(
            http.get(`${SEP6}/transaction`, () => {
                return HttpResponse.json({
                    transaction: {
                        id: 'tx-onramp-1',
                        kind: 'deposit',
                        status: 'pending_customer_info_update',
                        message: 'Please update your info',
                    },
                });
            }),
            http.get(`${KYC}/customer`, ({ request }) => {
                customerTxId = new URL(request.url).searchParams.get('transaction_id');
                return HttpResponse.json({
                    id: 'cust-1',
                    status: 'NEEDS_INFO',
                    fields: {
                        mobile_number: { type: 'string', description: 'Mobile phone number' },
                    },
                });
            }),
        );

        const tx = await createAdapter().programmatic.getOnRampTransaction(
            'tx-onramp-1',
            fakeJwt(ACCOUNT),
        );
        // The SEP-12 lookup is scoped to the transaction.
        expect(customerTxId).toBe('tx-onramp-1');
        expect(tx!.requiredInfo!.fields.map((f) => f.key)).toEqual(['mobile_number']);
    });

    it('getOnRampTransaction stops surfacing requiredInfo once SEP-12 is ACCEPTED', async () => {
        // Regression: the SEP-12 `fields` map keeps listing not-yet-provided
        // OPTIONAL fields even after the customer is ACCEPTED. We must not treat
        // that as "needs info" — otherwise the info-update form loops forever.
        mockToml();
        server.use(
            http.get(`${SEP6}/transaction`, () => {
                return HttpResponse.json({
                    transaction: {
                        id: 'tx-onramp-1',
                        kind: 'deposit',
                        status: 'pending_customer_info_update',
                        message: 'Please update your info',
                    },
                });
            }),
            http.get(`${KYC}/customer`, () => {
                return HttpResponse.json({
                    id: 'cust-1',
                    status: 'ACCEPTED',
                    // Optional fields the anchor would still accept but doesn't require.
                    fields: {
                        additional_name: {
                            type: 'string',
                            description: 'Additional name',
                            optional: true,
                        },
                        city: { type: 'string', description: 'City', optional: true },
                    },
                    provided_fields: {
                        first_name: {
                            type: 'string',
                            description: 'First name',
                            optional: false,
                            status: 'ACCEPTED',
                        },
                    },
                });
            }),
        );

        const tx = await createAdapter().programmatic.getOnRampTransaction(
            'tx-onramp-1',
            fakeJwt(ACCOUNT),
        );
        expect(tx!.requiredInfo).toBeUndefined();
        // Still parked on pending_customer_info_update -> flag set so the UI can
        // offer a retry rather than spin forever.
        expect(tx!.awaitingCustomerInfo).toBe(true);
    });

    it('getOnRampTransaction leaves requiredInfo unset for normal statuses', async () => {
        mockToml();
        server.use(
            http.get(`${SEP6}/transaction`, () => {
                return HttpResponse.json({
                    transaction: {
                        id: 'tx-onramp-1',
                        kind: 'deposit',
                        status: 'pending_user_transfer_start',
                    },
                });
            }),
        );
        const tx = await createAdapter().programmatic.getOnRampTransaction(
            'tx-onramp-1',
            fakeJwt(ACCOUNT),
        );
        expect(tx!.requiredInfo).toBeUndefined();
        expect(tx!.awaitingCustomerInfo).toBe(false);
    });
});
