import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import { BlindPayClient } from './client';
import { AnchorError } from '../types';

const BASE_URL = 'http://blindpay.test';
const API_KEY = 'test-key';
const INSTANCE_ID = 'in_test123';

function createClient(): BlindPayClient {
    return new BlindPayClient({
        apiKey: API_KEY,
        instanceId: INSTANCE_ID,
        baseUrl: BASE_URL,
    });
}

/** Helper to build full instance-scoped API URL. */
function apiUrl(path: string): string {
    return `${BASE_URL}/v1/instances/${INSTANCE_ID}${path}`;
}

/** Helper to build full external instance-scoped API URL. */
function externalApiUrl(path: string): string {
    return `${BASE_URL}/v1/e/instances/${INSTANCE_ID}${path}`;
}

describe('BlindPayClient', () => {
    // =========================================================================
    // createCustomer
    // =========================================================================

    describe('createCustomer', () => {
        it('returns a stub Customer with empty id and not_started kycStatus', async () => {
            const client = createClient();
            const result = await client.createCustomer({
                email: 'test@example.com',
                country: 'MX',
            });

            expect(result.id).toBe('');
            expect(result.email).toBe('test@example.com');
            expect(result.kycStatus).toBe('not_started');
            expect(result.createdAt).toBeTruthy();
            expect(result.updatedAt).toBeTruthy();
        });
    });

    // =========================================================================
    // getCustomer
    // =========================================================================

    describe('getCustomer', () => {
        it('fetches a receiver by ID and maps fields correctly', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_abc'), () => {
                    return HttpResponse.json({
                        id: 're_abc',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        type: 'individual',
                        country: 'MX',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getCustomer('re_abc');

            expect(result).not.toBeNull();
            expect(result!.id).toBe('re_abc');
            expect(result!.email).toBe('user@example.com');
            expect(result!.kycStatus).toBe('approved');
            expect(result!.createdAt).toBe('2025-01-01T00:00:00Z');
            expect(result!.updatedAt).toBe('2025-01-02T00:00:00Z');
        });

        it('maps kyc_status "verifying" to "pending"', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_verifying'), () => {
                    return HttpResponse.json({
                        id: 're_verifying',
                        email: 'v@example.com',
                        kyc_status: 'verifying',
                        type: 'individual',
                        country: 'MX',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getCustomer('re_verifying');
            expect(result!.kycStatus).toBe('pending');
        });

        it('maps kyc_status "rejected" to "rejected"', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_rejected'), () => {
                    return HttpResponse.json({
                        id: 're_rejected',
                        email: 'r@example.com',
                        kyc_status: 'rejected',
                        type: 'individual',
                        country: 'MX',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getCustomer('re_rejected');
            expect(result!.kycStatus).toBe('rejected');
        });

        it('returns null on 404', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_missing'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Not found' } },
                        { status: 404 },
                    );
                }),
            );

            const client = createClient();
            const result = await client.getCustomer('re_missing');
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // getQuote (on-ramp / payin)
    // =========================================================================

    describe('getQuote (on-ramp / payin)', () => {
        it('calls POST /payin-quotes when fromCurrency is fiat (MXN)', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_001',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        commercial_quotation: 20.5,
                        blindpay_quotation: 20.0,
                        flat_fee: 500,
                        partner_fee_amount: 200,
                        billing_fee_amount: 100,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '1000.00',
                resourceId: 'bw_wallet1',
            });

            // Verify request body
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.blockchain_wallet_id).toBe('bw_wallet1');
            expect(capturedBody!.currency_type).toBe('sender');
            expect(capturedBody!.cover_fees).toBe(false);
            expect(capturedBody!.request_amount).toBe(100000); // 1000.00 in cents
            expect(capturedBody!.payment_method).toBe('spei');
            expect(capturedBody!.token).toBe('USDB');

            // Verify mapped result
            expect(result.id).toBe('pq_001');
            expect(result.fromAmount).toBe('1000.00');
            expect(result.toAmount).toBe('50.00');
            expect(result.fromCurrency).toBe('MXN');
            expect(result.toCurrency).toBe('USDB');
            expect(result.fee).toBe('8.00'); // (500 + 200 + 100) / 100
            expect(result.exchangeRate).toBe('20');
            expect(result.expiresAt).toBeTruthy();
        });
    });

    // =========================================================================
    // getQuote (off-ramp / payout)
    // =========================================================================

    describe('getQuote (off-ramp / payout)', () => {
        it('calls POST /quotes when fromCurrency is crypto (USDB)', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_001',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        commercial_quotation: 20.5,
                        blindpay_quotation: 20.0,
                        flat_fee: 500,
                        partner_fee_amount: 200,
                        billing_fee_amount: 100,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.getQuote({
                fromCurrency: 'USDB',
                toCurrency: 'MXN',
                fromAmount: '50.00',
                resourceId: 'ba_bank1',
            });

            // Verify request body
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.bank_account_id).toBe('ba_bank1');
            expect(capturedBody!.currency_type).toBe('sender');
            expect(capturedBody!.cover_fees).toBe(false);
            expect(capturedBody!.request_amount).toBe(5000); // 50.00 in cents
            expect(capturedBody!.network).toBe('stellar_testnet');
            expect(capturedBody!.token).toBe('USDB');

            // Verify mapped result (amounts converted from cents)
            expect(result.id).toBe('qu_001');
            expect(result.fromAmount).toBe('50.00');
            expect(result.toAmount).toBe('1000.00');
            expect(result.fromCurrency).toBe('USDB');
            expect(result.toCurrency).toBe('MXN');
            expect(result.fee).toBe('8.00');
            expect(result.exchangeRate).toBe('20');
        });
    });

    // =========================================================================
    // createOnRamp
    // =========================================================================

    describe('createOnRamp', () => {
        it('creates a payin and returns OnRampTransaction with payment instructions', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payins/evm'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pi_001',
                        payin_quote_id: 'pq_001',
                        status: 'waiting_for_payment',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        clabe: '012345678901234567',
                        memo_code: 'REF123',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.createOnRamp({
                customerId: 're_abc',
                quoteId: 'pq_001',
                stellarAddress: 'GABC123',
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                amount: '1000.00',
            });

            // Verify request body
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.payin_quote_id).toBe('pq_001');

            // Verify mapped result
            expect(result.id).toBe('pi_001');
            expect(result.customerId).toBe('re_abc');
            expect(result.quoteId).toBe('pq_001');
            expect(result.status).toBe('pending'); // waiting_for_payment -> pending
            expect(result.fromAmount).toBe('1000.00');
            expect(result.fromCurrency).toBe('MXN');
            expect(result.toAmount).toBe('50.00');
            expect(result.toCurrency).toBe('USDB');

            // Payment instructions
            expect(result.paymentInstructions).toBeDefined();
            expect(result.paymentInstructions!.type).toBe('spei');
            expect(result.paymentInstructions!.clabe).toBe('012345678901234567');
            expect(result.paymentInstructions!.reference).toBe('REF123');
            expect(result.paymentInstructions!.amount).toBe('1000.00');
            expect(result.paymentInstructions!.currency).toBe('MXN');
        });
    });

    // =========================================================================
    // getOnRampTransaction
    // =========================================================================

    describe('getOnRampTransaction', () => {
        it('fetches a payin by ID and maps status correctly', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_001'), () => {
                    return HttpResponse.json({
                        id: 'pi_001',
                        payin_quote_id: 'pq_001',
                        status: 'processing',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        clabe: '012345678901234567',
                        memo_code: 'REF123',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_001');

            expect(result).not.toBeNull();
            expect(result!.id).toBe('pi_001');
            expect(result!.status).toBe('processing');
            expect(result!.fromAmount).toBe('1000.00');
            expect(result!.toAmount).toBe('50.00');
        });

        it('maps payin status "pending" to "pending"', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_pending'), () => {
                    return HttpResponse.json({
                        id: 'pi_pending',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_pending');
            expect(result!.status).toBe('pending');
        });

        it('maps payin status "waiting_for_payment" to "pending"', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_waiting'), () => {
                    return HttpResponse.json({
                        id: 'pi_waiting',
                        payin_quote_id: 'pq_001',
                        status: 'waiting_for_payment',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_waiting');
            expect(result!.status).toBe('pending');
        });

        it('maps payin status "completed" to "completed"', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_done'), () => {
                    return HttpResponse.json({
                        id: 'pi_done',
                        payin_quote_id: 'pq_001',
                        status: 'completed',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_done');
            expect(result!.status).toBe('completed');
        });

        it('maps payin status "failed" to "failed"', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_failed'), () => {
                    return HttpResponse.json({
                        id: 'pi_failed',
                        payin_quote_id: 'pq_001',
                        status: 'failed',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_failed');
            expect(result!.status).toBe('failed');
        });

        it('maps payin status "refunded" to "cancelled"', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_refunded'), () => {
                    return HttpResponse.json({
                        id: 'pi_refunded',
                        payin_quote_id: 'pq_001',
                        status: 'refunded',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_refunded');
            expect(result!.status).toBe('cancelled');
        });

        it('returns null on 404', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_missing'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Not found' } },
                        { status: 404 },
                    );
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_missing');
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // registerFiatAccount
    // =========================================================================

    describe('registerFiatAccount', () => {
        it('registers a SPEI bank account with correct institution code from CLABE', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/receivers/re_abc/bank-accounts'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'ba_abc',
                        type: 'spei_bitso',
                        name: 'Juan Perez',
                        beneficiary_name: 'Juan Perez',
                        spei_clabe: '012345678901234567',
                        created_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.registerFiatAccount({
                customerId: 're_abc',
                account: {
                    type: 'spei',
                    clabe: '012345678901234567',
                    beneficiary: 'Juan Perez',
                },
            });

            // Verify request body includes derived institution code
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.type).toBe('spei_bitso');
            expect(capturedBody!.name).toBe('Juan Perez');
            expect(capturedBody!.beneficiary_name).toBe('Juan Perez');
            expect(capturedBody!.spei_protocol).toBe('clabe');
            expect(capturedBody!.spei_institution_code).toBe('40012'); // '40' + first 3 digits of CLABE
            expect(capturedBody!.spei_clabe).toBe('012345678901234567');

            // Verify mapped result
            expect(result.id).toBe('ba_abc');
            expect(result.customerId).toBe('re_abc');
            expect(result.type).toBe('spei_bitso');
            expect(result.status).toBe('active');
            expect(result.createdAt).toBe('2025-01-01T00:00:00Z');
        });
    });

    // =========================================================================
    // getFiatAccounts
    // =========================================================================

    describe('getFiatAccounts', () => {
        it('fetches bank accounts and maps fields correctly', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_abc/bank-accounts'), () => {
                    return HttpResponse.json([
                        {
                            id: 'ba_001',
                            type: 'spei_bitso',
                            name: 'Primary Account',
                            beneficiary_name: 'Juan Perez',
                            spei_clabe: '012345678901234567',
                            created_at: '2025-01-01T00:00:00Z',
                        },
                        {
                            id: 'ba_002',
                            type: 'spei_bitso',
                            name: 'Backup Account',
                            spei_clabe: '987654321098765432',
                            created_at: '2025-01-02T00:00:00Z',
                        },
                    ]);
                }),
            );

            const client = createClient();
            const result = await client.getFiatAccounts('re_abc');

            expect(result).toHaveLength(2);

            // First account: beneficiary_name present
            expect(result[0].id).toBe('ba_001');
            expect(result[0].type).toBe('spei_bitso');
            expect(result[0].accountNumber).toBe('012345678901234567');
            expect(result[0].accountHolderName).toBe('Juan Perez');
            expect(result[0].createdAt).toBe('2025-01-01T00:00:00Z');

            // Second account: no beneficiary_name, falls back to name
            expect(result[1].id).toBe('ba_002');
            expect(result[1].accountNumber).toBe('987654321098765432');
            expect(result[1].accountHolderName).toBe('Backup Account');
        });

        it('returns empty array on 404', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_missing/bank-accounts'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Not found' } },
                        { status: 404 },
                    );
                }),
            );

            const client = createClient();
            const result = await client.getFiatAccounts('re_missing');
            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // createOffRamp
    // =========================================================================

    describe('createOffRamp', () => {
        it('authorizes a Stellar payout and returns signableTransaction', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payouts/stellar/authorize'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        transaction_hash: 'XDR_ENCODED_TX',
                    });
                }),
            );

            const client = createClient();
            const result = await client.createOffRamp({
                customerId: 're_abc',
                quoteId: 'qu_001',
                stellarAddress: 'GABC123',
                fromCurrency: 'USDB',
                toCurrency: 'MXN',
                amount: '50.00',
                fiatAccountId: 'ba_abc',
            });

            // Verify request body
            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.quote_id).toBe('qu_001');
            expect(capturedBody!.sender_wallet_address).toBe('GABC123');

            // Verify mapped result
            expect(result.id).toBe('qu_001');
            expect(result.customerId).toBe('re_abc');
            expect(result.quoteId).toBe('qu_001');
            expect(result.status).toBe('pending');
            expect(result.fromAmount).toBe('50.00');
            expect(result.fromCurrency).toBe('USDB');
            expect(result.toCurrency).toBe('MXN');
            expect(result.stellarAddress).toBe('GABC123');
            expect(result.signableTransaction).toBe('XDR_ENCODED_TX');
        });
    });

    // =========================================================================
    // getOffRampTransaction
    // =========================================================================

    describe('getOffRampTransaction', () => {
        it('fetches a payout by ID and maps fields correctly', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_001'), () => {
                    return HttpResponse.json({
                        id: 'po_001',
                        quote_id: 'qu_001',
                        status: 'processing',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        blockchain_tx_hash: 'abc123hash',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-02T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_001');

            expect(result).not.toBeNull();
            expect(result!.id).toBe('po_001');
            expect(result!.quoteId).toBe('qu_001');
            expect(result!.status).toBe('processing');
            expect(result!.stellarAddress).toBe('GABC123');
            expect(result!.fromAmount).toBe('50.00');
            expect(result!.fromCurrency).toBe('USDB');
            expect(result!.toAmount).toBe('1000.00');
            expect(result!.toCurrency).toBe('MXN');
            expect(result!.stellarTxHash).toBe('abc123hash');
        });

        it('maps payout status "pending" to "pending"', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_pending'), () => {
                    return HttpResponse.json({
                        id: 'po_pending',
                        quote_id: 'qu_001',
                        status: 'pending',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_pending');
            expect(result!.status).toBe('pending');
        });

        it('maps payout status "completed" to "completed"', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_done'), () => {
                    return HttpResponse.json({
                        id: 'po_done',
                        quote_id: 'qu_001',
                        status: 'completed',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_done');
            expect(result!.status).toBe('completed');
        });

        it('maps payout status "failed" to "failed"', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_failed'), () => {
                    return HttpResponse.json({
                        id: 'po_failed',
                        quote_id: 'qu_001',
                        status: 'failed',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_failed');
            expect(result!.status).toBe('failed');
        });

        it('maps payout status "refunded" to "cancelled"', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_refunded'), () => {
                    return HttpResponse.json({
                        id: 'po_refunded',
                        quote_id: 'qu_001',
                        status: 'refunded',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_refunded');
            expect(result!.status).toBe('cancelled');
        });

        it('returns null on 404', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_missing'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Not found' } },
                        { status: 404 },
                    );
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_missing');
            expect(result).toBeNull();
        });
    });

    // =========================================================================
    // getKycUrl
    // =========================================================================

    describe('getKycUrl', () => {
        it('calls POST on external /tos path and returns the URL', async () => {
            server.use(
                http.post(externalApiUrl('/tos'), () => {
                    return HttpResponse.json({
                        url: 'https://app.blindpay.com/tos/abc',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getKycUrl!('re_abc');

            expect(result).toBe('https://app.blindpay.com/tos/abc');
        });
    });

    // =========================================================================
    // getKycStatus
    // =========================================================================

    describe('getKycStatus', () => {
        it('fetches receiver and returns mapped KYC status', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_abc'), () => {
                    return HttpResponse.json({
                        id: 're_abc',
                        email: 'user@example.com',
                        kyc_status: 'approved',
                        type: 'individual',
                        country: 'MX',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getKycStatus('re_abc');
            expect(result).toBe('approved');
        });

        it('returns "not_started" on 404', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_missing'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Not found' } },
                        { status: 404 },
                    );
                }),
            );

            const client = createClient();
            const result = await client.getKycStatus('re_missing');
            expect(result).toBe('not_started');
        });
    });

    // =========================================================================
    // error handling
    // =========================================================================

    describe('error handling', () => {
        it('throws AnchorError with message and code from JSON error response', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_bad'), () => {
                    return HttpResponse.json(
                        { error: { message: 'bad', code: 'BAD_REQUEST' } },
                        { status: 400 },
                    );
                }),
            );

            const client = createClient();

            try {
                await client.getCustomer('re_bad');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('bad');
                expect(anchorError.code).toBe('BAD_REQUEST');
                expect(anchorError.statusCode).toBe(400);
            }
        });

        it('throws AnchorError with raw text when response is not JSON', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_crash'), () => {
                    return new HttpResponse('Internal Server Error', {
                        status: 500,
                        headers: { 'Content-Type': 'text/plain' },
                    });
                }),
            );

            const client = createClient();

            try {
                await client.getCustomer('re_crash');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('Internal Server Error');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(500);
            }
        });
    });

    // =========================================================================
    // Edge case: toCents() / fromCents() via public methods
    // =========================================================================

    describe('toCents / fromCents edge cases (via getQuote)', () => {
        /** Helper: mock a payin quote endpoint that echoes request_amount back. */
        function mockPayinQuoteEcho() {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_echo',
                        sender_amount: capturedBody!.request_amount as number,
                        receiver_amount: 100,
                        blindpay_quotation: 1,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            return () => capturedBody;
        }

        it('converts zero amount "0" to 0 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '0',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(0);
        });

        it('converts zero amount "0.00" to 0 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '0.00',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(0);
        });

        it('converts negative amount "-100.50" to -10050 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '-100.50',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(-10050);
        });

        it('rounds "0.001" to 0 cents (very small decimal)', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '0.001',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(0);
        });

        it('rounds "10.555" up to 1056 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '10.555',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(1056);
        });

        it('rounds "10.554" down to 1055 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '10.554',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(1055);
        });

        it('converts very large amount "999999999.99" to 99999999999 cents', async () => {
            const getCaptured = mockPayinQuoteEcho();
            const client = createClient();

            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '999999999.99',
                resourceId: 'bw_w1',
            });

            expect(getCaptured()!.request_amount).toBe(99999999999);
        });

        it('fromCents converts cents back to decimal string (via response mapping)', async () => {
            server.use(
                http.post(apiUrl('/payin-quotes'), () => {
                    return HttpResponse.json({
                        id: 'pq_cents',
                        sender_amount: 1,
                        receiver_amount: 0,
                        blindpay_quotation: 1,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '0.01',
                resourceId: 'bw_w1',
            });

            expect(result.fromAmount).toBe('0.01');
            expect(result.toAmount).toBe('0.00');
        });
    });

    // =========================================================================
    // Edge case: request() error handling
    // =========================================================================

    describe('request() edge cases', () => {
        it('uses fallback message when errorText is empty', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_empty_error'), () => {
                    return new HttpResponse('', {
                        status: 400,
                        headers: { 'Content-Type': 'text/plain' },
                    });
                }),
            );

            const client = createClient();

            try {
                await client.getCustomer('re_empty_error');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                // Empty errorText and no error.message → falls back to status message
                expect(anchorError.message).toBe('BlindPay API error: 400');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
            }
        });

        it('uses fallback message when error field is null in JSON response', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_null_error'), () => {
                    return HttpResponse.json(
                        { error: null },
                        { status: 422 },
                    );
                }),
            );

            const client = createClient();

            try {
                await client.getCustomer('re_null_error');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                // error is null so error?.message is undefined → falls through to errorText
                expect(anchorError.message).toContain('error');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(422);
            }
        });

        it('uses UNKNOWN_ERROR when error.code is missing from JSON response', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_no_code'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Something went wrong' } },
                        { status: 400 },
                    );
                }),
            );

            const client = createClient();

            try {
                await client.getCustomer('re_no_code');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.message).toBe('Something went wrong');
                expect(anchorError.code).toBe('UNKNOWN_ERROR');
                expect(anchorError.statusCode).toBe(400);
            }
        });
    });

    // =========================================================================
    // Edge case: status mapping fallbacks for unknown values
    // =========================================================================

    describe('status mapping fallbacks', () => {
        it('mapReceiverStatus falls back to "pending" for unknown kyc_status', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_unknown'), () => {
                    return HttpResponse.json({
                        id: 're_unknown',
                        email: 'u@example.com',
                        kyc_status: 'some_unknown_status',
                        type: 'individual',
                        country: 'MX',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getCustomer('re_unknown');
            expect(result!.kycStatus).toBe('pending');
        });

        it('mapPayoutStatus falls back to "pending" for unknown payout status', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_unknown'), () => {
                    return HttpResponse.json({
                        id: 'po_unknown',
                        quote_id: 'qu_001',
                        status: 'some_unknown_payout_status',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_unknown');
            expect(result!.status).toBe('pending');
        });

        it('mapPayinStatus falls back to "pending" for unknown payin status', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_unknown'), () => {
                    return HttpResponse.json({
                        id: 'pi_unknown',
                        payin_quote_id: 'pq_001',
                        status: 'some_unknown_payin_status',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_unknown');
            expect(result!.status).toBe('pending');
        });
    });

    // =========================================================================
    // Edge case: mapPayinToOnRampTransaction
    // =========================================================================

    describe('mapPayinToOnRampTransaction edge cases', () => {
        it('customerId defaults to empty string when receiverId is empty and receiver_id is missing', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_no_receiver'), () => {
                    return HttpResponse.json({
                        id: 'pi_no_receiver',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                        // No receiver_id field
                    });
                }),
            );

            const client = createClient();
            // getOnRampTransaction passes '' as receiverId
            const result = await client.getOnRampTransaction('pi_no_receiver');
            expect(result!.customerId).toBe('');
        });

        it('defaults fromCurrency to "MXN" when response.currency is undefined', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_no_currency'), () => {
                    return HttpResponse.json({
                        id: 'pi_no_currency',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        // currency is missing
                        token: 'USDB',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_no_currency');
            expect(result!.fromCurrency).toBe('MXN');
        });

        it('defaults toCurrency to "USDB" when response.token is undefined', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_no_token'), () => {
                    return HttpResponse.json({
                        id: 'pi_no_token',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        // token is missing
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_no_token');
            expect(result!.toCurrency).toBe('USDB');
        });

        it('paymentInstructions is undefined when clabe is empty string', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_empty_clabe'), () => {
                    return HttpResponse.json({
                        id: 'pi_empty_clabe',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        clabe: '',
                        memo_code: 'REF123',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_empty_clabe');
            expect(result!.paymentInstructions).toBeUndefined();
        });

        it('reference defaults to empty string when clabe exists but memo_code is missing', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_no_memo'), () => {
                    return HttpResponse.json({
                        id: 'pi_no_memo',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        clabe: '012345678901234567',
                        // memo_code is missing
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_no_memo');
            expect(result!.paymentInstructions).toBeDefined();
            expect(result!.paymentInstructions!.reference).toBe('');
        });

        it('stellarTxHash is undefined when tracking_complete is undefined', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_no_tracking'), () => {
                    return HttpResponse.json({
                        id: 'pi_no_tracking',
                        payin_quote_id: 'pq_001',
                        status: 'pending',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        // tracking_complete is missing
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_no_tracking');
            expect(result!.stellarTxHash).toBeUndefined();
        });

        it('stellarTxHash is populated when tracking_complete has transaction_hash', async () => {
            server.use(
                http.get(apiUrl('/payins/pi_with_hash'), () => {
                    return HttpResponse.json({
                        id: 'pi_with_hash',
                        payin_quote_id: 'pq_001',
                        status: 'completed',
                        sender_amount: 100000,
                        receiver_amount: 5000,
                        currency: 'MXN',
                        token: 'USDB',
                        tracking_complete: {
                            step: 'complete',
                            transaction_hash: 'stellar_tx_hash_abc',
                        },
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOnRampTransaction('pi_with_hash');
            expect(result!.stellarTxHash).toBe('stellar_tx_hash_abc');
        });
    });

    // =========================================================================
    // Edge case: mapPayoutToOffRampTransaction
    // =========================================================================

    describe('mapPayoutToOffRampTransaction edge cases', () => {
        it('stellarTxHash is undefined when blockchain_tx_hash is missing', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_no_hash'), () => {
                    return HttpResponse.json({
                        id: 'po_no_hash',
                        quote_id: 'qu_001',
                        status: 'pending',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        // blockchain_tx_hash is missing
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_no_hash');
            expect(result!.stellarTxHash).toBeUndefined();
        });

        it('signableTransaction is undefined when not provided (via getOffRampTransaction)', async () => {
            server.use(
                http.get(apiUrl('/payouts/po_no_signable'), () => {
                    return HttpResponse.json({
                        id: 'po_no_signable',
                        quote_id: 'qu_001',
                        status: 'completed',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        blockchain_tx_hash: 'hash123',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.getOffRampTransaction('po_no_signable');
            // getOffRampTransaction does not pass signableTransaction
            expect(result!.signableTransaction).toBeUndefined();
        });
    });

    // =========================================================================
    // Edge case: getQuote
    // =========================================================================

    describe('getQuote edge cases', () => {
        it('sends 0 cents when both fromAmount and toAmount are undefined', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_zero',
                        sender_amount: 0,
                        receiver_amount: 0,
                        blindpay_quotation: 1,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                // fromAmount and toAmount both undefined
                resourceId: 'bw_w1',
            });

            expect(capturedBody!.request_amount).toBe(0);
        });

        it('sends empty string when resourceId is undefined', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_no_resource',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '100.00',
                // resourceId is undefined
            });

            expect(capturedBody!.blockchain_wallet_id).toBe('');
        });

        it('totalFee is 0 when all fee fields are undefined', async () => {
            server.use(
                http.post(apiUrl('/payin-quotes'), () => {
                    return HttpResponse.json({
                        id: 'pq_no_fees',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        // flat_fee, partner_fee_amount, billing_fee_amount all missing
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '100.00',
                resourceId: 'bw_w1',
            });

            expect(result.fee).toBe('0.00');
        });

        it('exchangeRate is "0" when both blindpay_quotation and commercial_quotation are undefined', async () => {
            server.use(
                http.post(apiUrl('/payin-quotes'), () => {
                    return HttpResponse.json({
                        id: 'pq_no_rates',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        // blindpay_quotation and commercial_quotation both missing
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                fromAmount: '100.00',
                resourceId: 'bw_w1',
            });

            expect(result.exchangeRate).toBe('0');
        });

        it('detects on-ramp for lowercase fiat currency "mxn"', async () => {
            let capturedPath = '';

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedPath = new URL(request.url).pathname;
                    return HttpResponse.json({
                        id: 'pq_lower',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'mxn',
                toCurrency: 'USDB',
                fromAmount: '100.00',
                resourceId: 'bw_w1',
            });

            // Should have hit payin-quotes endpoint (on-ramp), not /quotes (off-ramp)
            expect(capturedPath).toContain('/payin-quotes');
        });

        it('sends "USDC" token for on-ramp when toCurrency is "USDC"', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_usdc',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDC',
                fromAmount: '100.00',
                resourceId: 'bw_w1',
            });

            expect(capturedBody!.token).toBe('USDC');
        });

        it('sends "USDC" token for off-ramp when fromCurrency is "USDC"', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_usdc',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'USDC',
                toCurrency: 'MXN',
                fromAmount: '50.00',
                resourceId: 'ba_bank1',
            });

            expect(capturedBody!.token).toBe('USDC');
        });

        it('defaults to "USDB" token for off-ramp when fromCurrency is not "USDC"', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_default_token',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'USDB',
                toCurrency: 'MXN',
                fromAmount: '50.00',
                resourceId: 'ba_bank1',
            });

            expect(capturedBody!.token).toBe('USDB');
        });

        it('uses toAmount as fallback when fromAmount is undefined (on-ramp)', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_to_amount',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'MXN',
                toCurrency: 'USDB',
                toAmount: '25.00',
                resourceId: 'bw_w1',
            });

            expect(capturedBody!.request_amount).toBe(2500);
        });

        it('sends resourceId as empty string for off-ramp when undefined', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_no_resource',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.getQuote({
                fromCurrency: 'USDB',
                toCurrency: 'MXN',
                fromAmount: '50.00',
                // resourceId undefined
            });

            expect(capturedBody!.bank_account_id).toBe('');
        });
    });

    // =========================================================================
    // Edge case: registerFiatAccount
    // =========================================================================

    describe('registerFiatAccount edge cases', () => {
        it('short CLABE "01" produces institution code "4001"', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/receivers/re_abc/bank-accounts'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'ba_short',
                        type: 'spei_bitso',
                        name: 'Test',
                        created_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            await client.registerFiatAccount({
                customerId: 're_abc',
                account: {
                    type: 'spei',
                    clabe: '01',
                    beneficiary: 'Test',
                },
            });

            // slice(0, 3) on "01" = "01", so institution code = "40" + "01" = "4001"
            expect(capturedBody!.spei_institution_code).toBe('4001');
        });

        it('empty CLABE "" produces institution code "40"', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/receivers/re_abc/bank-accounts'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'ba_empty',
                        type: 'spei_bitso',
                        name: 'Test',
                        created_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            await client.registerFiatAccount({
                customerId: 're_abc',
                account: {
                    type: 'spei',
                    clabe: '',
                    beneficiary: 'Test',
                },
            });

            // slice(0, 3) on "" = "", so institution code = "40" + "" = "40"
            expect(capturedBody!.spei_institution_code).toBe('40');
        });
    });

    // =========================================================================
    // Edge case: getFiatAccounts
    // =========================================================================

    describe('getFiatAccounts edge cases', () => {
        it('returns empty array when API responds with empty array', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_no_accounts/bank-accounts'), () => {
                    return HttpResponse.json([]);
                }),
            );

            const client = createClient();
            const result = await client.getFiatAccounts('re_no_accounts');
            expect(result).toEqual([]);
        });

        it('accountHolderName is undefined when both beneficiary_name and name are undefined', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_no_names/bank-accounts'), () => {
                    return HttpResponse.json([
                        {
                            id: 'ba_no_name',
                            type: 'spei_bitso',
                            // beneficiary_name is missing, name is missing
                            spei_clabe: '012345678901234567',
                            created_at: '2025-01-01T00:00:00Z',
                        },
                    ]);
                }),
            );

            const client = createClient();
            const result = await client.getFiatAccounts('re_no_names');
            expect(result).toHaveLength(1);
            expect(result[0].accountHolderName).toBeUndefined();
        });

        it('accountNumber defaults to empty string when spei_clabe is missing', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_no_clabe/bank-accounts'), () => {
                    return HttpResponse.json([
                        {
                            id: 'ba_no_clabe',
                            type: 'spei_bitso',
                            name: 'Test Account',
                            // spei_clabe is missing
                            created_at: '2025-01-01T00:00:00Z',
                        },
                    ]);
                }),
            );

            const client = createClient();
            const result = await client.getFiatAccounts('re_no_clabe');
            expect(result).toHaveLength(1);
            expect(result[0].accountNumber).toBe('');
        });

        it('re-throws non-404 errors', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_error/bank-accounts'), () => {
                    return HttpResponse.json(
                        { error: { message: 'Server error', code: 'INTERNAL_ERROR' } },
                        { status: 500 },
                    );
                }),
            );

            const client = createClient();

            try {
                await client.getFiatAccounts('re_error');
                expect.fail('Expected AnchorError to be thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(AnchorError);
                const anchorError = error as AnchorError;
                expect(anchorError.statusCode).toBe(500);
                expect(anchorError.message).toBe('Server error');
            }
        });
    });

    // =========================================================================
    // Edge case: createOffRamp
    // =========================================================================

    describe('createOffRamp edge cases', () => {
        it('signableTransaction is undefined when response.transaction_hash is undefined', async () => {
            server.use(
                http.post(apiUrl('/payouts/stellar/authorize'), () => {
                    return HttpResponse.json({
                        // transaction_hash is missing
                    });
                }),
            );

            const client = createClient();
            const result = await client.createOffRamp({
                customerId: 're_abc',
                quoteId: 'qu_001',
                stellarAddress: 'GABC123',
                fromCurrency: 'USDB',
                toCurrency: 'MXN',
                amount: '50.00',
                fiatAccountId: 'ba_abc',
            });

            expect(result.signableTransaction).toBeUndefined();
        });
    });

    // =========================================================================
    // Edge case: generateTosUrl
    // =========================================================================

    describe('generateTosUrl edge cases', () => {
        it('returns url as-is when no redirectUrl is provided', async () => {
            server.use(
                http.post(externalApiUrl('/tos'), () => {
                    return HttpResponse.json({
                        url: 'https://app.blindpay.com/tos/abc',
                    });
                }),
            );

            const client = createClient();
            const result = await client.generateTosUrl();
            expect(result).toBe('https://app.blindpay.com/tos/abc');
        });

        it('appends redirectUrl with "?" when response URL has no query params', async () => {
            server.use(
                http.post(externalApiUrl('/tos'), () => {
                    return HttpResponse.json({
                        url: 'https://app.blindpay.com/tos/abc',
                    });
                }),
            );

            const client = createClient();
            const result = await client.generateTosUrl('https://myapp.com/callback');
            expect(result).toBe(
                'https://app.blindpay.com/tos/abc?redirect_url=https%3A%2F%2Fmyapp.com%2Fcallback',
            );
        });

        it('appends redirectUrl with "&" when response URL already has query params', async () => {
            server.use(
                http.post(externalApiUrl('/tos'), () => {
                    return HttpResponse.json({
                        url: 'https://app.blindpay.com/tos/abc?lang=en',
                    });
                }),
            );

            const client = createClient();
            const result = await client.generateTosUrl('https://myapp.com/callback');
            expect(result).toBe(
                'https://app.blindpay.com/tos/abc?lang=en&redirect_url=https%3A%2F%2Fmyapp.com%2Fcallback',
            );
        });
    });

    // =========================================================================
    // registerBlockchainWallet
    // =========================================================================

    describe('registerBlockchainWallet', () => {
        it('happy path: registers a blockchain wallet with provided name', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(
                    apiUrl('/receivers/re_abc/blockchain-wallets'),
                    async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            id: 'bw_001',
                            name: 'My Wallet',
                            network: 'stellar_testnet',
                            address: 'GABC123',
                            created_at: '2025-01-01T00:00:00Z',
                        });
                    },
                ),
            );

            const client = createClient();
            const result = await client.registerBlockchainWallet(
                're_abc',
                'GABC123',
                'My Wallet',
            );

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.name).toBe('My Wallet');
            expect(capturedBody!.network).toBe('stellar_testnet');
            expect(capturedBody!.is_account_abstraction).toBe(true);
            expect(capturedBody!.address).toBe('GABC123');

            expect(result.id).toBe('bw_001');
            expect(result.name).toBe('My Wallet');
            expect(result.network).toBe('stellar_testnet');
            expect(result.address).toBe('GABC123');
        });

        it('defaults name to "Stellar Wallet" when name is not provided', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(
                    apiUrl('/receivers/re_abc/blockchain-wallets'),
                    async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            id: 'bw_002',
                            name: 'Stellar Wallet',
                            network: 'stellar_testnet',
                            address: 'GABC123',
                            created_at: '2025-01-01T00:00:00Z',
                        });
                    },
                ),
            );

            const client = createClient();
            await client.registerBlockchainWallet('re_abc', 'GABC123');

            expect(capturedBody!.name).toBe('Stellar Wallet');
        });

        it('defaults name to "Stellar Wallet" when name is empty string', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(
                    apiUrl('/receivers/re_abc/blockchain-wallets'),
                    async ({ request }) => {
                        capturedBody = (await request.json()) as Record<string, unknown>;
                        return HttpResponse.json({
                            id: 'bw_003',
                            name: 'Stellar Wallet',
                            network: 'stellar_testnet',
                            address: 'GABC123',
                            created_at: '2025-01-01T00:00:00Z',
                        });
                    },
                ),
            );

            const client = createClient();
            await client.registerBlockchainWallet('re_abc', 'GABC123', '');

            expect(capturedBody!.name).toBe('Stellar Wallet');
        });
    });

    // =========================================================================
    // submitSignedPayout
    // =========================================================================

    describe('submitSignedPayout', () => {
        it('happy path: submits signed transaction and returns payout response', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payouts/stellar'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'po_001',
                        quote_id: 'qu_001',
                        status: 'processing',
                        sender_wallet_address: 'GABC123',
                        sender_amount: 5000,
                        sender_currency: 'USDB',
                        receiver_amount: 100000,
                        receiver_currency: 'MXN',
                        blockchain_tx_hash: 'signed_hash_123',
                        created_at: '2025-01-01T00:00:00Z',
                        updated_at: '2025-01-01T00:00:00Z',
                    });
                }),
            );

            const client = createClient();
            const result = await client.submitSignedPayout(
                'qu_001',
                'SIGNED_XDR_DATA',
                'GABC123',
            );

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.quote_id).toBe('qu_001');
            expect(capturedBody!.signed_transaction).toBe('SIGNED_XDR_DATA');
            expect(capturedBody!.sender_wallet_address).toBe('GABC123');

            expect(result.id).toBe('po_001');
            expect(result.status).toBe('processing');
            expect(result.blockchain_tx_hash).toBe('signed_hash_123');
        });
    });

    // =========================================================================
    // getBlockchainWallets
    // =========================================================================

    describe('getBlockchainWallets', () => {
        it('happy path: returns array of blockchain wallets', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_abc/blockchain-wallets'), () => {
                    return HttpResponse.json([
                        {
                            id: 'bw_001',
                            name: 'Wallet 1',
                            network: 'stellar_testnet',
                            address: 'GABC123',
                            created_at: '2025-01-01T00:00:00Z',
                        },
                        {
                            id: 'bw_002',
                            name: 'Wallet 2',
                            network: 'stellar_testnet',
                            address: 'GDEF456',
                            created_at: '2025-01-02T00:00:00Z',
                        },
                    ]);
                }),
            );

            const client = createClient();
            const result = await client.getBlockchainWallets('re_abc');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('bw_001');
            expect(result[0].address).toBe('GABC123');
            expect(result[1].id).toBe('bw_002');
            expect(result[1].address).toBe('GDEF456');
        });

        it('returns empty array when no wallets exist', async () => {
            server.use(
                http.get(apiUrl('/receivers/re_empty/blockchain-wallets'), () => {
                    return HttpResponse.json([]);
                }),
            );

            const client = createClient();
            const result = await client.getBlockchainWallets('re_empty');
            expect(result).toEqual([]);
        });
    });

    // =========================================================================
    // createPayinQuote
    // =========================================================================

    describe('createPayinQuote', () => {
        it('happy path: creates a payin quote with default USDC token', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_direct_001',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        commercial_quotation: 20.5,
                        blindpay_quotation: 20.0,
                        flat_fee: 100,
                        partner_fee_amount: 50,
                        billing_fee_amount: 25,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.createPayinQuote('bw_wallet1', 10000);

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.blockchain_wallet_id).toBe('bw_wallet1');
            expect(capturedBody!.currency_type).toBe('sender');
            expect(capturedBody!.cover_fees).toBe(false);
            expect(capturedBody!.request_amount).toBe(10000);
            expect(capturedBody!.payment_method).toBe('spei');
            expect(capturedBody!.token).toBe('USDC');

            expect(result.id).toBe('pq_direct_001');
            expect(result.sender_amount).toBe(10000);
            expect(result.receiver_amount).toBe(500);
        });

        it('uses custom token override', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/payin-quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'pq_direct_002',
                        sender_amount: 10000,
                        receiver_amount: 500,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.createPayinQuote('bw_wallet1', 10000, 'USDB');

            expect(capturedBody!.token).toBe('USDB');
        });
    });

    // =========================================================================
    // createPayoutQuote
    // =========================================================================

    describe('createPayoutQuote', () => {
        it('happy path: creates a payout quote with default USDC token', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_direct_001',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        commercial_quotation: 20.5,
                        blindpay_quotation: 20.0,
                        flat_fee: 100,
                        partner_fee_amount: 50,
                        billing_fee_amount: 25,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            const result = await client.createPayoutQuote('ba_bank1', 5000);

            expect(capturedBody).not.toBeNull();
            expect(capturedBody!.bank_account_id).toBe('ba_bank1');
            expect(capturedBody!.currency_type).toBe('sender');
            expect(capturedBody!.cover_fees).toBe(false);
            expect(capturedBody!.request_amount).toBe(5000);
            expect(capturedBody!.network).toBe('stellar_testnet');
            expect(capturedBody!.token).toBe('USDC');

            expect(result.id).toBe('qu_direct_001');
            expect(result.sender_amount).toBe(5000);
            expect(result.receiver_amount).toBe(100000);
        });

        it('uses custom token override', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_direct_002',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.createPayoutQuote('ba_bank1', 5000, undefined, 'USDB');

            expect(capturedBody!.token).toBe('USDB');
        });

        it('uses custom network when provided', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_direct_003',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.createPayoutQuote('ba_bank1', 5000, 'stellar_mainnet');

            expect(capturedBody!.network).toBe('stellar_mainnet');
        });

        it('falls back to instance network when network is undefined', async () => {
            let capturedBody: Record<string, unknown> | null = null;

            server.use(
                http.post(apiUrl('/quotes'), async ({ request }) => {
                    capturedBody = (await request.json()) as Record<string, unknown>;
                    return HttpResponse.json({
                        id: 'qu_direct_004',
                        sender_amount: 5000,
                        receiver_amount: 100000,
                        blindpay_quotation: 20,
                        flat_fee: 0,
                        partner_fee_amount: 0,
                        billing_fee_amount: 0,
                        expires_at: 1700000000000,
                    });
                }),
            );

            const client = createClient();
            await client.createPayoutQuote('ba_bank1', 5000, undefined);

            expect(capturedBody!.network).toBe('stellar_testnet');
        });
    });
});
