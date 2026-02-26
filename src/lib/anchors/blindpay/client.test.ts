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
});
