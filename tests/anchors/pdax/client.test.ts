import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { PdaxClient } from '$lib/anchors/pdax/client';
import { createProxiedFetch } from '$lib/anchors/pdax/proxiedFetch';
import { AnchorError } from '$lib/anchors/types';
import type { IdentityFields } from '$lib/anchors/types';

const BASE_URL = 'http://pdax.test/api/pdax-api';
const USERNAME = 'test@pdax.example';
const PASSWORD = 'sandbox-password';

const LOGIN_PATH = `${BASE_URL}/pdax-institution/v1/login`;

function loginHandler() {
    return http.post(LOGIN_PATH, () =>
        HttpResponse.json({
            email: USERNAME,
            username: 'pdax-uuid-1',
            groups: ['insti_user'],
            token_type: 'Bearer',
            preferred_mfa: 'NOT_SET',
            expiry: 600,
            access_token: 'access-token-v1',
            id_token: 'id-token-v1',
            refresh_token: 'refresh-token-v1',
        }),
    );
}

function createClient() {
    return new PdaxClient({ username: USERNAME, password: PASSWORD, baseUrl: BASE_URL });
}

const VALID_IDENTITY: IdentityFields = {
    sender_first_name: 'Juan',
    sender_middle_name: 'Cruz',
    sender_last_name: 'Reyes',
    sender_country_origin: 'Philippines',
    source_of_funds: 'Compensation',
    beneficiary_first_name: 'Juan',
    beneficiary_middle_name: 'Cruz',
    beneficiary_last_name: 'Reyes',
    purpose: 'Investments/Savings',
    relationship_of_sender_to_beneficiary: 'Myself',
};

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

describe('PdaxClient metadata', () => {
    it('exposes name, displayName, and capability flags', () => {
        const client = createClient();
        expect(client.name).toBe('pdax');
        expect(client.displayName).toBe('PDAX');
        expect(client.capabilities.kycFlow).toBe('form');
        expect(client.capabilities.emailLookup).toBe(false);
        expect(client.capabilities.sandbox).toBe(true);
        expect(client.capabilities.requiresOffRampSigning).toBe(true);
        expect(client.capabilities.deferredOffRampSigning).toBe(false);
    });

    it('declares supported currencies, rails, and at least one Stellar token', () => {
        const client = createClient();
        expect(client.supportedCurrencies).toContain('PHP');
        expect(client.supportedRails).toEqual(expect.arrayContaining(['instapay', 'pesonet']));
        const symbols = client.supportedTokens.map((t) => t.symbol);
        expect(symbols).toContain('USDC');
    });
});

// ---------------------------------------------------------------------------
// Authed-call header behavior
// ---------------------------------------------------------------------------

describe('PdaxClient authed requests', () => {
    it('sends both access_token and id_token headers on every authed call', async () => {
        const client = createClient();
        let captured: Headers | null = null;
        server.use(
            loginHandler(),
            http.post(`${BASE_URL}/pdax-institution/v2/trade/quote`, ({ request }) => {
                captured = request.headers;
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        quote_id: 'q-1',
                        expires_at: '2026-05-01T12:10:00Z',
                        base_currency: 'PHP',
                        quote_currency: 'USDCXLM',
                        side: 'buy',
                        base_quantity: 17.18,
                        price: 58.2,
                        total_amount: 1000,
                    },
                });
            }),
        );

        await client.getQuote({
            fromCurrency: 'PHP',
            toCurrency: 'USDC',
            fromAmount: '1000',
        });

        expect(captured).not.toBeNull();
        expect(captured!.get('access_token')).toBe('access-token-v1');
        expect(captured!.get('id_token')).toBe('id-token-v1');
    });

    it('forwards X-Proxy-Secret on login and authed calls when fetchFn is wrapped', async () => {
        let loginHeader: string | null = null;
        let authedHeader: string | null = null;
        server.use(
            http.post(LOGIN_PATH, ({ request }) => {
                loginHeader = request.headers.get('X-Proxy-Secret');
                return HttpResponse.json({
                    email: USERNAME,
                    username: 'pdax-uuid-1',
                    groups: ['insti_user'],
                    token_type: 'Bearer',
                    preferred_mfa: 'NOT_SET',
                    expiry: 600,
                    access_token: 'access-token-v1',
                    id_token: 'id-token-v1',
                    refresh_token: 'refresh-token-v1',
                });
            }),
            http.post(`${BASE_URL}/pdax-institution/v2/trade/quote`, ({ request }) => {
                authedHeader = request.headers.get('X-Proxy-Secret');
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        quote_id: 'q-1',
                        expires_at: '2026-05-01T12:10:00Z',
                        base_currency: 'PHP',
                        quote_currency: 'USDCXLM',
                        side: 'buy',
                        base_quantity: 17.18,
                        price: 58.2,
                        total_amount: 1000,
                    },
                });
            }),
        );

        const client = new PdaxClient({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            fetchFn: createProxiedFetch('the-secret'),
        });
        await client.getQuote({
            fromCurrency: 'PHP',
            toCurrency: 'USDC',
            fromAmount: '1000',
        });

        expect(loginHeader).toBe('the-secret');
        expect(authedHeader).toBe('the-secret');
    });
});

// ---------------------------------------------------------------------------
// getQuote
// ---------------------------------------------------------------------------

describe('PdaxClient.getQuote', () => {
    it('maps a PHP→USDC on-ramp to a buy on /v2/trade/quote and returns a Quote', async () => {
        const client = createClient();
        let body: Record<string, unknown> | null = null;
        server.use(
            loginHandler(),
            http.post(`${BASE_URL}/pdax-institution/v2/trade/quote`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        quote_id: 'quote-php-buy',
                        expires_at: '2026-05-01T12:10:00Z',
                        base_currency: 'PHP',
                        quote_currency: 'USDCXLM',
                        side: 'buy',
                        base_quantity: 17.18,
                        price: 58.2,
                        total_amount: 1000,
                    },
                });
            }),
        );

        const quote = await client.getQuote({
            fromCurrency: 'PHP',
            toCurrency: 'USDC',
            fromAmount: '1000',
        });

        expect(body).toMatchObject({
            side: 'buy',
            base_currency: 'PHP',
            quote_currency: 'USDCXLM',
            currency: 'PHP',
            quantity: '1000',
        });
        expect(quote.id).toBe('quote-php-buy');
        expect(quote.fromCurrency).toBe('PHP');
        expect(quote.toCurrency).toBe('USDC');
        expect(quote.fromAmount).toBe('1000');
        expect(quote.toAmount).toBe('17.18');
        expect(quote.expiresAt).toBe('2026-05-01T12:10:00Z');
        expect(quote.exchangeRate).toBe('58.2');
    });

    it('maps a USDC→PHP off-ramp to a sell on /v2/trade/quote', async () => {
        const client = createClient();
        let body: Record<string, unknown> | null = null;
        server.use(
            loginHandler(),
            http.post(`${BASE_URL}/pdax-institution/v2/trade/quote`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        quote_id: 'quote-usdc-sell',
                        expires_at: '2026-05-01T12:10:00Z',
                        base_currency: 'PHP',
                        quote_currency: 'USDCXLM',
                        side: 'sell',
                        base_quantity: 50,
                        price: 55,
                        total_amount: 2750,
                    },
                });
            }),
        );

        const quote = await client.getQuote({
            fromCurrency: 'USDC',
            toCurrency: 'PHP',
            fromAmount: '50',
        });

        expect(body).toMatchObject({
            side: 'sell',
            base_currency: 'PHP',
            quote_currency: 'USDCXLM',
            currency: 'USDCXLM',
            quantity: '50',
        });
        expect(quote.id).toBe('quote-usdc-sell');
        expect(quote.fromCurrency).toBe('USDC');
        expect(quote.toCurrency).toBe('PHP');
        expect(quote.fromAmount).toBe('50');
        expect(quote.toAmount).toBe('2750');
    });

    it('throws AnchorError mapping the upstream error code on failure', async () => {
        const client = createClient();
        server.use(
            loginHandler(),
            http.post(`${BASE_URL}/pdax-institution/v2/trade/quote`, () =>
                HttpResponse.json(
                    { status: 'error', code: 'OT010046', message: 'Unable to fetch price' },
                    { status: 500 },
                ),
            ),
        );

        await expect(
            client.getQuote({ fromCurrency: 'PHP', toCurrency: 'USDC', fromAmount: '1000' }),
        ).rejects.toMatchObject({
            name: 'AnchorError',
            code: 'OT010046',
            statusCode: 500,
        });
    });

    it('throws AnchorError when fromAmount is missing', async () => {
        const client = createClient();
        await expect(
            client.getQuote({ fromCurrency: 'PHP', toCurrency: 'USDC' }),
        ).rejects.toBeInstanceOf(AnchorError);
    });
});

// ---------------------------------------------------------------------------
// Local-only: createCustomer / getCustomer / KYC / fiat accounts
// ---------------------------------------------------------------------------

describe('PdaxClient.createCustomer', () => {
    it('creates a local customer with a generated id and not_started kyc', async () => {
        const client = createClient();
        const customer = await client.createCustomer({ email: 'alice@example.com', country: 'PH' });
        expect(customer.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(customer.email).toBe('alice@example.com');
        expect(customer.country).toBe('PH');
        expect(customer.kycStatus).toBe('not_started');
        expect(customer.createdAt).toBeTruthy();
    });
});

describe('PdaxClient.getCustomer', () => {
    it('returns null for unknown ids (PDAX does not store customers)', async () => {
        const client = createClient();
        expect(await client.getCustomer({ customerId: 'unknown' })).toBeNull();
    });

    it('throws AnchorError when called with an email (not supported)', async () => {
        const client = createClient();
        await expect(client.getCustomer({ email: 'a@b' })).rejects.toMatchObject({
            code: 'EMAIL_LOOKUP_NOT_SUPPORTED',
        });
    });
});

describe('PdaxClient.getKycRequirements', () => {
    it('returns identity fields from both endpoints minus transactional ones', async () => {
        const client = createClient();
        const req = await client.getKycRequirements!();
        const keys = req.fields.map((f) => f.key);
        // Identity fields surface to the form
        expect(keys).toContain('sender_first_name');
        expect(keys).toContain('beneficiary_first_name');
        expect(keys).toContain('source_of_funds');
        // Transactional fields are filtered out (filled by the SDK or per-txn UI step)
        expect(keys).not.toContain('amount');
        expect(keys).not.toContain('method');
        expect(keys).not.toContain('identifier');
        expect(keys).not.toContain('beneficiary_bank_code');
        // Documents — none for PDAX (per-txn KYC, no uploads)
        expect(req.documents).toEqual([]);
    });

    it('renders enum-typed fields as select with options', async () => {
        const client = createClient();
        const req = await client.getKycRequirements!();
        const sof = req.fields.find((f) => f.key === 'source_of_funds');
        expect(sof?.type).toBe('select');
        expect(sof?.options?.length).toBeGreaterThan(0);
        const dob = req.fields.find((f) => f.key === 'sender_dob');
        expect(dob?.type).toBe('date');
    });
});

describe('PdaxClient.submitKyc / getKycStatus', () => {
    it('submitKyc rejects when required fields are missing', async () => {
        const client = createClient();
        await expect(
            client.submitKyc!('cust-1', { fields: { sender_first_name: 'Juan' }, documents: {} }),
        ).rejects.toMatchObject({ code: 'MISSING_REQUIRED_FIELD' });
    });

    it('submitKyc returns approved when all required fields are provided', async () => {
        const client = createClient();
        const result = await client.submitKyc!('cust-1', {
            fields: VALID_IDENTITY as Record<string, string>,
            documents: {},
        });
        expect(result.customerId).toBe('cust-1');
        expect(result.kycStatus).toBe('approved');
    });

    it('getKycStatus returns not_started by default', async () => {
        const client = createClient();
        expect(await client.getKycStatus('cust-anything')).toBe('not_started');
    });
});

describe('PdaxClient.registerFiatAccount / getFiatAccounts', () => {
    it('registerFiatAccount stores a local-only record with a generated id', async () => {
        const client = createClient();
        const result = await client.registerFiatAccount!({
            customerId: 'cust-1',
            account: { type: 'spei', clabe: 'na', beneficiary: 'Juan' } as never,
        });
        expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(result.customerId).toBe('cust-1');
        expect(result.status).toBe('active');
    });

    it('getFiatAccounts returns an empty array for customers with no registrations', async () => {
        const client = createClient();
        const accounts = await client.getFiatAccounts('cust-empty');
        expect(accounts).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// createOnRamp + getOnRampTransaction state machine
// ---------------------------------------------------------------------------

describe('PdaxClient.createOnRamp', () => {
    it('posts /fiat/deposit with identity + identifier and returns OnRampTransaction with paymentInstructions', async () => {
        const client = createClient();
        let body: Record<string, unknown> | null = null;
        server.use(
            loginHandler(),
            http.post(`${BASE_URL}/pdax-institution/v1/fiat/deposit`, async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    request_id: 'req-1',
                    identifier: body.identifier,
                    reference_number: 'ref-1',
                    amount: 1000,
                    method: 'instapay_upay_cashin',
                    payment_checkout_url: 'https://checkout.test/abc',
                    fee: 30,
                    status: 'PENDING',
                });
            }),
        );

        const tx = await client.createOnRamp({
            customerId: 'cust-1',
            quoteId: 'q-1',
            stellarAddress: 'GA...',
            fromCurrency: 'PHP',
            toCurrency: 'USDC',
            amount: '1000',
            identity: { ...VALID_IDENTITY, method: 'instapay_upay_cashin', amount: '1000' },
        });

        expect(body).toMatchObject({
            method: 'instapay_upay_cashin',
            amount: '1000',
            currency: 'PHP',
            sender_first_name: 'Juan',
            beneficiary_first_name: 'Juan',
        });
        expect(body!.identifier).toEqual(tx.id);
        expect(tx.customerId).toBe('cust-1');
        expect(tx.quoteId).toBe('q-1');
        expect(tx.fromCurrency).toBe('PHP');
        expect(tx.toCurrency).toBe('USDC');
        expect(tx.fromAmount).toBe('1000');
        expect(tx.status).toBe('pending');
        expect(tx.interactiveUrl).toBe('https://checkout.test/abc');
    });
});

describe('PdaxClient.getOnRampTransaction state machine', () => {
    it('returns null for an unknown transaction id', async () => {
        const client = createClient();
        expect(await client.getOnRampTransaction('does-not-exist')).toBeNull();
    });

    it('advances pending → fulfilled → trade → crypto-withdraw → completed across polls', async () => {
        const client = createClient();
        let fiatStatus = 'IN-PROGRESS';
        let cryptoStatus: string | null = null;

        server.use(
            loginHandler(),
            // initial deposit creation
            http.post(`${BASE_URL}/pdax-institution/v1/fiat/deposit`, async ({ request }) => {
                const reqBody = (await request.json()) as Record<string, unknown>;
                return HttpResponse.json({
                    request_id: 'req-1',
                    identifier: reqBody.identifier,
                    reference_number: 'ref-1',
                    amount: 1000,
                    method: 'instapay_upay_cashin',
                    payment_checkout_url: 'https://checkout.test/abc',
                    fee: 30,
                    status: 'PENDING',
                });
            }),
            // fiat polling
            http.get(`${BASE_URL}/pdax-institution/v1/fiat/transactions`, ({ request }) => {
                const url = new URL(request.url);
                const identifier = url.searchParams.get('identifier');
                return HttpResponse.json({
                    status: 'success',
                    data: [
                        {
                            request_id: 'req-1',
                            transaction_id: 'tx-fiat-1',
                            identifier,
                            amount: 1000,
                            mode: 'Cash In',
                            method: 'instapay_upay_cashin',
                            status: fiatStatus,
                            currency: 'PHP',
                        },
                    ],
                });
            }),
            // trade
            http.post(`${BASE_URL}/pdax-institution/v1/trade`, async () =>
                HttpResponse.json({
                    status: 'success',
                    data: {
                        order_id: 999,
                        status: 'successful',
                        quote_currency: 'USDCXLM',
                        base_currency: 'PHP',
                        side: 'buy',
                        base_quantity: 17.18,
                        price: 58.2,
                        total_amount: 1000,
                    },
                }),
            ),
            // crypto withdraw
            http.post(`${BASE_URL}/pdax-institution/v1/crypto/withdraw`, async ({ request }) => {
                const reqBody = (await request.json()) as Record<string, unknown>;
                cryptoStatus = 'pending';
                return HttpResponse.json({
                    identifier: reqBody.identifier,
                    transaction_id: 555,
                    amount: '17.18',
                    address: reqBody.address,
                    total: '17.18',
                    fee: '0',
                    currency: 'USDCXLM',
                    status: 'IN PROGRESS',
                    created_at: '2026-05-01T12:10:00Z',
                });
            }),
            http.get(`${BASE_URL}/pdax-institution/v1/crypto/transactions`, () =>
                HttpResponse.json({
                    status: 'success',
                    data:
                        cryptoStatus === null
                            ? []
                            : [
                                  {
                                      transaction_id: '555',
                                      type: 'crypto_out',
                                      credit_ccy: 'USDCXLM',
                                      credit_amount: '17.18',
                                      status: cryptoStatus,
                                      txn_hash: 'hash-1',
                                  },
                              ],
                }),
            ),
        );

        const tx = await client.createOnRamp({
            customerId: 'cust-1',
            quoteId: 'q-1',
            stellarAddress: 'GA-DEST',
            fromCurrency: 'PHP',
            toCurrency: 'USDC',
            amount: '1000',
            identity: { ...VALID_IDENTITY, method: 'instapay_upay_cashin', amount: '1000' },
        });

        // Stage 1 — pending: poll returns pending
        let polled = await client.getOnRampTransaction(tx.id);
        expect(polled?.status).toBe('pending');

        // Fiat completes; next poll triggers /trade then /crypto/withdraw
        fiatStatus = 'COMPLETED';
        polled = await client.getOnRampTransaction(tx.id);
        expect(polled?.status).toBe('processing');

        // Crypto withdrawal completes
        cryptoStatus = 'completed';
        polled = await client.getOnRampTransaction(tx.id);
        expect(polled?.status).toBe('completed');
        expect(polled?.stellarTxHash).toBe('hash-1');
    });
});

// ---------------------------------------------------------------------------
// createOffRamp + getOffRampTransaction
// ---------------------------------------------------------------------------

describe('PdaxClient.createOffRamp', () => {
    it('fetches a USDCXLM deposit address + memo and returns OffRampTransaction', async () => {
        const client = createClient();
        server.use(
            loginHandler(),
            http.get(`${BASE_URL}/pdax-institution/v1/crypto/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('currency')).toBe('USDCXLM');
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        currency: 'USDCXLM',
                        address: 'GPDAX-DEPOSIT',
                        tag: 'memo-1',
                    },
                });
            }),
        );

        const tx = await client.createOffRamp({
            customerId: 'cust-1',
            quoteId: 'q-2',
            stellarAddress: 'GA-USER',
            fromCurrency: 'USDC',
            toCurrency: 'PHP',
            amount: '50',
            fiatAccountId: 'local-acct-1',
            identity: {
                ...VALID_IDENTITY,
                method: 'PAY-TO-ACCOUNT-REAL-TIME',
                fee_type: 'Sender',
                beneficiary_bank_code: 'BAUBPPH',
                beneficiary_account_name: 'Juan Reyes',
                beneficiary_account_number: '1234567890',
                amount: '50',
            },
        });

        expect(tx.fromCurrency).toBe('USDC');
        expect(tx.toCurrency).toBe('PHP');
        expect(tx.fromAmount).toBe('50');
        expect(tx.memo).toBe('memo-1');
        expect(tx.status).toBe('pending');
        // PDAX off-ramp pays to a normal Stellar address, no XDR
        expect(tx.signableTransaction).toBeUndefined();
    });
});

describe('PdaxClient.getOffRampTransaction state machine', () => {
    it('returns null for an unknown transaction id', async () => {
        const client = createClient();
        expect(await client.getOffRampTransaction('nope')).toBeNull();
    });

    it('advances pending → crypto received → trade → fiat-withdraw → completed', async () => {
        const client = createClient();
        let cryptoArrived = false;
        let fiatStatus: string | null = null;

        server.use(
            loginHandler(),
            http.get(`${BASE_URL}/pdax-institution/v1/crypto/deposit`, () =>
                HttpResponse.json({
                    status: 'success',
                    data: { currency: 'USDCXLM', address: 'GPDAX-DEP', tag: 'memo-1' },
                }),
            ),
            http.get(`${BASE_URL}/pdax-institution/v1/crypto/transactions`, ({ request }) => {
                const url = new URL(request.url);
                const identifier = url.searchParams.get('identifier');
                expect(identifier).toBeTruthy();
                return HttpResponse.json({
                    status: 'success',
                    data: cryptoArrived
                        ? [
                              {
                                  transaction_id: 'tx-crypto-in-1',
                                  type: 'crypto_in',
                                  credit_ccy: 'USDCXLM',
                                  credit_amount: '50',
                                  status: 'completed',
                                  txn_hash: 'hash-in',
                              },
                          ]
                        : [],
                });
            }),
            http.post(`${BASE_URL}/pdax-institution/v1/trade`, () =>
                HttpResponse.json({
                    status: 'success',
                    data: {
                        order_id: 1234,
                        status: 'successful',
                        quote_currency: 'USDCXLM',
                        base_currency: 'PHP',
                        side: 'sell',
                        base_quantity: 50,
                        price: 55,
                        total_amount: 2750,
                    },
                }),
            ),
            http.post(`${BASE_URL}/pdax-institution/v1/fiat/withdraw`, async ({ request }) => {
                const reqBody = (await request.json()) as Record<string, unknown>;
                fiatStatus = 'IN-PROGRESS';
                return HttpResponse.json({
                    status: 'success',
                    data: {
                        request_id: 'req-fiat-out',
                        identifier: reqBody.identifier,
                        reference_number: 'ref-out',
                        amount: 2750,
                        method: 'PAY-TO-ACCOUNT-REAL-TIME',
                        status: 'PENDING',
                        fee: 0,
                    },
                });
            }),
            http.get(`${BASE_URL}/pdax-institution/v1/fiat/transactions`, ({ request }) => {
                const url = new URL(request.url);
                const identifier = url.searchParams.get('identifier');
                if (fiatStatus === null) {
                    return HttpResponse.json({ status: 'success', data: [] });
                }
                return HttpResponse.json({
                    status: 'success',
                    data: [
                        {
                            request_id: 'req-fiat-out',
                            transaction_id: 'tx-fiat-out',
                            identifier,
                            amount: 2750,
                            mode: 'Cash Out',
                            method: 'PAY-TO-ACCOUNT-REAL-TIME',
                            status: fiatStatus,
                            currency: 'PHP',
                        },
                    ],
                });
            }),
        );

        const tx = await client.createOffRamp({
            customerId: 'cust-1',
            quoteId: 'q-2',
            stellarAddress: 'GA-USER',
            fromCurrency: 'USDC',
            toCurrency: 'PHP',
            amount: '50',
            fiatAccountId: 'local-acct-1',
            identity: {
                ...VALID_IDENTITY,
                method: 'PAY-TO-ACCOUNT-REAL-TIME',
                fee_type: 'Sender',
                beneficiary_bank_code: 'BAUBPPH',
                beneficiary_account_name: 'Juan Reyes',
                beneficiary_account_number: '1234567890',
                amount: '50',
            },
        });

        // Stage 1: nothing has arrived yet
        let polled = await client.getOffRampTransaction(tx.id);
        expect(polled?.status).toBe('pending');

        // Stage 2: crypto deposit arrives → trade triggers → fiat/withdraw triggers
        cryptoArrived = true;
        polled = await client.getOffRampTransaction(tx.id);
        expect(polled?.status).toBe('processing');

        // Stage 3: fiat payout completes
        fiatStatus = 'COMPLETED';
        polled = await client.getOffRampTransaction(tx.id);
        expect(polled?.status).toBe('completed');
    });
});
