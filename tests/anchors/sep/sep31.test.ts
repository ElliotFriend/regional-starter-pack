import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import {
    getInfo,
    getReceiveAssets,
    postTransaction,
    getTransaction,
    patchTransaction,
    putTransactionCallback,
    pollTransaction,
    isComplete,
    needsTransactionInfo,
    needsCustomerInfo,
    isPendingPayment,
    isPendingAnchor,
    isFailed,
    isRefunded,
    isInProgress,
    getStatusDescription,
} from '$lib/anchors/sep/sep31';
import { SepApiError, type TransactionStatus } from '$lib/anchors/sep/types';

const BASE = 'https://anchor.test/sep31';
const TOKEN = 'test-jwt-token';

// ---------------------------------------------------------------------------
// getInfo
// ---------------------------------------------------------------------------
describe('getInfo', () => {
    it('returns SEP-31 info', async () => {
        const info = {
            receive: {
                USDC: {
                    enabled: true,
                    quotes_supported: true,
                    quotes_required: false,
                    fee_fixed: 1,
                    min_amount: 10,
                    max_amount: 50000,
                    sep12: {
                        sender: { types: { 'sep31-sender': { description: 'Sender info' } } },
                        receiver: { types: { 'sep31-receiver': { description: 'Receiver info' } } },
                    },
                },
            },
        };

        server.use(http.get(`${BASE}/info`, () => HttpResponse.json(info)));

        const result = await getInfo(BASE, fetch);
        expect(result).toEqual(info);
        expect(result.receive.USDC.enabled).toBe(true);
        expect(result.receive.USDC.quotes_supported).toBe(true);
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
            http.get(`${BASE}/info`, () => new HttpResponse('bad gateway', { status: 502 })),
        );

        await expect(getInfo(BASE, fetch)).rejects.toThrow('Failed to get SEP-31 info: 502');
    });
});

// ---------------------------------------------------------------------------
// getReceiveAssets
// ---------------------------------------------------------------------------
describe('getReceiveAssets', () => {
    it('returns receive assets from info', async () => {
        const receive = {
            USDC: { enabled: true, quotes_supported: true, quotes_required: false },
            SRT: { enabled: false, quotes_supported: false, quotes_required: false },
        };

        server.use(http.get(`${BASE}/info`, () => HttpResponse.json({ receive })));

        const result = await getReceiveAssets(BASE, fetch);
        expect(result).toEqual(receive);
        expect(Object.keys(result)).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// postTransaction
// ---------------------------------------------------------------------------
describe('postTransaction', () => {
    it('creates a transaction with auth header and JSON body', async () => {
        const response = {
            id: 'txn-001',
            stellar_account_id: 'GANCHOR',
            stellar_memo_type: 'hash',
            stellar_memo: 'abc123',
        };

        server.use(
            http.post(`${BASE}/transactions`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toBe('application/json');
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.amount).toBe('100');
                expect(body.asset_code).toBe('USDC');
                expect(body.sender_id).toBe('sender-1');
                expect(body.receiver_id).toBe('receiver-1');
                return HttpResponse.json(response);
            }),
        );

        const result = await postTransaction(
            BASE,
            TOKEN,
            {
                amount: '100',
                asset_code: 'USDC',
                sender_id: 'sender-1',
                receiver_id: 'receiver-1',
            },
            fetch,
        );

        expect(result.id).toBe('txn-001');
        expect(result.stellar_account_id).toBe('GANCHOR');
        expect(result.stellar_memo_type).toBe('hash');
        expect(result.stellar_memo).toBe('abc123');
    });

    it('includes optional fields when provided', async () => {
        server.use(
            http.post(`${BASE}/transactions`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.quote_id).toBe('quote-1');
                expect(body.destination_asset).toBe('iso4217:MXN');
                return HttpResponse.json({
                    id: 'txn-002',
                    stellar_account_id: 'GANCHOR',
                    stellar_memo_type: 'text',
                    stellar_memo: 'xyz',
                });
            }),
        );

        await postTransaction(
            BASE,
            TOKEN,
            {
                amount: '50',
                asset_code: 'USDC',
                sender_id: 'sender-1',
                receiver_id: 'receiver-1',
                quote_id: 'quote-1',
                destination_asset: 'iso4217:MXN',
            },
            fetch,
        );
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.post(`${BASE}/transactions`, () =>
                HttpResponse.json({ error: 'Customer info needed' }, { status: 400 }),
            ),
        );

        await expect(
            postTransaction(
                BASE,
                TOKEN,
                {
                    amount: '100',
                    asset_code: 'USDC',
                    sender_id: 'sender-1',
                    receiver_id: 'receiver-1',
                },
                fetch,
            ),
        ).rejects.toThrow('Customer info needed');
    });
});

// ---------------------------------------------------------------------------
// getTransaction
// ---------------------------------------------------------------------------
describe('getTransaction', () => {
    it('fetches transaction by id with auth header', async () => {
        const transaction = {
            id: 'txn-001',
            status: 'pending_sender',
            stellar_account_id: 'GANCHOR',
            stellar_memo_type: 'hash',
            stellar_memo: 'abc123',
            amount_in: '100',
        };

        server.use(
            http.get(`${BASE}/transactions/txn-001`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({ transaction });
            }),
        );

        const result = await getTransaction(BASE, TOKEN, 'txn-001', fetch);
        expect(result).toEqual(transaction);
    });

    it('throws SepApiError on 404', async () => {
        server.use(
            http.get(`${BASE}/transactions/missing`, () =>
                HttpResponse.json({ error: 'Transaction not found' }, { status: 404 }),
            ),
        );

        await expect(getTransaction(BASE, TOKEN, 'missing', fetch)).rejects.toThrow(
            'Transaction not found',
        );
    });
});

// ---------------------------------------------------------------------------
// patchTransaction
// ---------------------------------------------------------------------------
describe('patchTransaction', () => {
    it('sends PATCH with fields and returns updated transaction', async () => {
        const transaction = {
            id: 'txn-001',
            status: 'pending_receiver',
            stellar_account_id: 'GANCHOR',
            stellar_memo_type: 'hash',
            stellar_memo: 'abc123',
        };

        server.use(
            http.patch(`${BASE}/transactions/txn-001`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toBe('application/json');
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.fields).toEqual({ bank_account: '123456' });
                return HttpResponse.json({ transaction });
            }),
        );

        const result = await patchTransaction(
            BASE,
            TOKEN,
            'txn-001',
            { bank_account: '123456' },
            fetch,
        );
        expect(result.status).toBe('pending_receiver');
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.patch(`${BASE}/transactions/txn-001`, () =>
                HttpResponse.json({ error: 'Invalid field' }, { status: 400 }),
            ),
        );

        await expect(
            patchTransaction(BASE, TOKEN, 'txn-001', { bad: 'field' }, fetch),
        ).rejects.toThrow('Invalid field');
    });
});

// ---------------------------------------------------------------------------
// putTransactionCallback
// ---------------------------------------------------------------------------
describe('putTransactionCallback', () => {
    it('sends PUT with callback URL', async () => {
        server.use(
            http.put(`${BASE}/transactions/txn-001/callback`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.url).toBe('https://myapp.com/webhook');
                return new HttpResponse(null, { status: 204 });
            }),
        );

        await putTransactionCallback(BASE, TOKEN, 'txn-001', 'https://myapp.com/webhook', fetch);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.put(`${BASE}/transactions/txn-001/callback`, () =>
                HttpResponse.json({ error: 'Callbacks not supported' }, { status: 400 }),
            ),
        );

        await expect(
            putTransactionCallback(BASE, TOKEN, 'txn-001', 'https://myapp.com/webhook', fetch),
        ).rejects.toThrow('Callbacks not supported');
    });
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
describe('status helpers', () => {
    describe('isComplete', () => {
        it('returns true for completed', () => expect(isComplete('completed')).toBe(true));
        it('returns false for others', () => expect(isComplete('pending_sender')).toBe(false));
    });

    describe('needsTransactionInfo', () => {
        it('returns true for pending_transaction_info_update', () =>
            expect(needsTransactionInfo('pending_transaction_info_update')).toBe(true));
        it('returns false for others', () => expect(needsTransactionInfo('completed')).toBe(false));
    });

    describe('needsCustomerInfo', () => {
        it('returns true for pending_customer_info_update', () =>
            expect(needsCustomerInfo('pending_customer_info_update')).toBe(true));
        it('returns false for others', () => expect(needsCustomerInfo('completed')).toBe(false));
    });

    describe('isPendingPayment', () => {
        it('returns true for pending_sender', () =>
            expect(isPendingPayment('pending_sender')).toBe(true));
        it('returns true for pending_stellar', () =>
            expect(isPendingPayment('pending_stellar')).toBe(true));
        it('returns false for others', () => expect(isPendingPayment('completed')).toBe(false));
    });

    describe('isPendingAnchor', () => {
        it('returns true for pending_external', () =>
            expect(isPendingAnchor('pending_external')).toBe(true));
        it('returns true for pending_receiver', () =>
            expect(isPendingAnchor('pending_receiver')).toBe(true));
        it('returns false for others', () => expect(isPendingAnchor('completed')).toBe(false));
    });

    describe('isFailed', () => {
        it('returns true for error', () => expect(isFailed('error')).toBe(true));
        it('returns true for expired', () => expect(isFailed('expired')).toBe(true));
        it('returns false for others', () => expect(isFailed('completed')).toBe(false));
    });

    describe('isRefunded', () => {
        it('returns true for refunded', () => expect(isRefunded('refunded')).toBe(true));
        it('returns false for others', () => expect(isRefunded('completed')).toBe(false));
    });

    describe('isInProgress', () => {
        it('returns true for pending_sender', () =>
            expect(isInProgress('pending_sender')).toBe(true));
        it('returns true for pending_receiver', () =>
            expect(isInProgress('pending_receiver')).toBe(true));
        it('returns true for pending_customer_info_update', () =>
            expect(isInProgress('pending_customer_info_update')).toBe(true));
        it('returns false for completed', () => expect(isInProgress('completed')).toBe(false));
        it('returns false for error', () => expect(isInProgress('error')).toBe(false));
        it('returns false for refunded', () => expect(isInProgress('refunded')).toBe(false));
    });

    describe('getStatusDescription', () => {
        it.each([
            ['pending_sender', 'Waiting for Stellar payment from sender'],
            ['pending_stellar', 'Stellar payment received, confirming'],
            ['pending_customer_info_update', 'Additional customer information required'],
            ['pending_transaction_info_update', 'Additional transaction information required'],
            ['pending_receiver', 'Processing payment to receiver'],
            ['pending_external', 'Waiting for external system'],
            ['completed', 'Payment complete'],
            ['refunded', 'Payment refunded'],
            ['expired', 'Transaction expired'],
            ['error', 'Transaction failed'],
        ] as const)('returns description for %s', (status, expected) => {
            expect(getStatusDescription(status)).toBe(expected);
        });

        it('returns the raw status string for unknown values', () => {
            expect(
                getStatusDescription('some_unknown_status' as unknown as TransactionStatus),
            ).toBe('some_unknown_status');
        });
    });
});

// ---------------------------------------------------------------------------
// pollTransaction
// ---------------------------------------------------------------------------
describe('pollTransaction', () => {
    it('returns immediately when transaction is in terminal state', async () => {
        server.use(
            http.get(`${BASE}/transactions/txn-001`, () =>
                HttpResponse.json({
                    transaction: {
                        id: 'txn-001',
                        status: 'completed',
                        stellar_account_id: 'G',
                        stellar_memo_type: 'text',
                        stellar_memo: 'm',
                    },
                }),
            ),
        );

        const result = await pollTransaction(BASE, TOKEN, 'txn-001', { interval: 10 }, fetch);
        expect(result.status).toBe('completed');
    });

    it('calls onStatusChange on transitions', async () => {
        let callCount = 0;
        const statuses = ['pending_sender', 'pending_stellar', 'completed'];

        server.use(
            http.get(`${BASE}/transactions/txn-001`, () => {
                const status = statuses[Math.min(callCount++, statuses.length - 1)];
                return HttpResponse.json({
                    transaction: {
                        id: 'txn-001',
                        status,
                        stellar_account_id: 'G',
                        stellar_memo_type: 'text',
                        stellar_memo: 'm',
                    },
                });
            }),
        );

        const changes: string[] = [];
        await pollTransaction(
            BASE,
            TOKEN,
            'txn-001',
            {
                interval: 10,
                onStatusChange: (tx) => changes.push(tx.status),
            },
            fetch,
        );

        expect(changes).toContain('pending_sender');
        expect(changes).toContain('completed');
    });

    it('times out when transaction never completes', async () => {
        server.use(
            http.get(`${BASE}/transactions/txn-001`, () =>
                HttpResponse.json({
                    transaction: {
                        id: 'txn-001',
                        status: 'pending_sender',
                        stellar_account_id: 'G',
                        stellar_memo_type: 'text',
                        stellar_memo: 'm',
                    },
                }),
            ),
        );

        await expect(
            pollTransaction(BASE, TOKEN, 'txn-001', { interval: 10, timeout: 50 }, fetch),
        ).rejects.toThrow('Transaction polling timed out');
    });
});

// =============================================================================
// Input validation behavior
// =============================================================================

describe('input validation behavior', () => {
    it('postTransaction passes empty amount to API without validation', async () => {
        server.use(
            http.post(`${BASE}/transactions`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.amount).toBe('');
                return HttpResponse.json({
                    id: 'txn-empty-amt',
                    stellar_account_id: 'GANCHOR',
                    stellar_memo_type: 'text',
                    stellar_memo: 'memo',
                });
            }),
        );

        const result = await postTransaction(
            BASE,
            TOKEN,
            {
                amount: '',
                asset_code: 'USDC',
                sender_id: 'sender-1',
                receiver_id: 'receiver-1',
            },
            fetch,
        );
        expect(result.id).toBe('txn-empty-amt');
    });

    it('postTransaction passes empty sender_id and receiver_id without validation', async () => {
        server.use(
            http.post(`${BASE}/transactions`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.sender_id).toBe('');
                expect(body.receiver_id).toBe('');
                return HttpResponse.json({
                    id: 'txn-empty-ids',
                    stellar_account_id: 'GANCHOR',
                    stellar_memo_type: 'text',
                    stellar_memo: 'memo',
                });
            }),
        );

        const result = await postTransaction(
            BASE,
            TOKEN,
            {
                amount: '100',
                asset_code: 'USDC',
                sender_id: '',
                receiver_id: '',
            },
            fetch,
        );
        expect(result.id).toBe('txn-empty-ids');
    });

    it('getTransaction passes empty transactionId to URL path', async () => {
        // URL becomes /transactions/ with empty ID appended
        server.use(
            http.get(`${BASE}/transactions/`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({
                    transaction: {
                        id: '',
                        status: 'pending_sender',
                        stellar_account_id: 'G',
                        stellar_memo_type: 'text',
                        stellar_memo: 'm',
                    },
                });
            }),
        );

        const result = await getTransaction(BASE, TOKEN, '', fetch);
        expect(result.id).toBe('');
    });

    it('patchTransaction sends empty fields object', async () => {
        server.use(
            http.patch(`${BASE}/transactions/txn-001`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.fields).toEqual({});
                return HttpResponse.json({
                    transaction: {
                        id: 'txn-001',
                        status: 'pending_receiver',
                        stellar_account_id: 'G',
                        stellar_memo_type: 'text',
                        stellar_memo: 'm',
                    },
                });
            }),
        );

        const result = await patchTransaction(BASE, TOKEN, 'txn-001', {}, fetch);
        expect(result.id).toBe('txn-001');
    });

    it('putTransactionCallback passes invalid callback URL without validation', async () => {
        server.use(
            http.put(`${BASE}/transactions/txn-001/callback`, async ({ request }) => {
                const body = (await request.json()) as Record<string, unknown>;
                expect(body.url).toBe('not-a-url');
                return new HttpResponse(null, { status: 204 });
            }),
        );

        await putTransactionCallback(BASE, TOKEN, 'txn-001', 'not-a-url', fetch);
    });
});
