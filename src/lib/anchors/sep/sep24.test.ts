import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test-setup';
import {
    getInfo,
    deposit,
    withdraw,
    getTransaction,
    getTransactionByStellarId,
    getTransactions,
    pollTransaction,
} from './sep24';
import { SepApiError } from './types';

const BASE = 'https://anchor.test/sep24';
const TOKEN = 'test-jwt-token';

// ---------------------------------------------------------------------------
// getInfo
// ---------------------------------------------------------------------------
describe('getInfo', () => {
    it('returns SEP-24 info', async () => {
        const info = {
            deposit: {
                USDC: { enabled: true, min_amount: 1, max_amount: 10000 },
            },
            withdraw: {
                USDC: { enabled: true, min_amount: 5, max_amount: 5000 },
            },
            fee: { enabled: true },
            features: { account_creation: true, claimable_balances: false },
        };

        server.use(http.get(`${BASE}/info`, () => HttpResponse.json(info)));

        const result = await getInfo(BASE, fetch);
        expect(result).toEqual(info);
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

        await expect(getInfo(BASE, fetch)).rejects.toThrow('Failed to get SEP-24 info: 502');
    });
});

// ---------------------------------------------------------------------------
// deposit
// ---------------------------------------------------------------------------
describe('deposit', () => {
    it('sends multipart form POST with auth header and returns interactive response', async () => {
        const response = {
            type: 'interactive_customer_info_needed',
            url: 'https://anchor.test/deposit?token=abc',
            id: 'txn-123',
        };

        server.use(
            http.post(`${BASE}/transactions/deposit/interactive`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toContain('multipart/form-data');
                const formData = await request.formData();
                expect(formData.get('asset_code')).toBe('USDC');
                expect(formData.get('account')).toBe('GTEST');
                return HttpResponse.json(response);
            }),
        );

        const result = await deposit(
            BASE,
            TOKEN,
            { asset_code: 'USDC', account: 'GTEST' },
            fetch,
        );
        expect(result).toEqual(response);
    });

    it('omits undefined fields from form data', async () => {
        server.use(
            http.post(`${BASE}/transactions/deposit/interactive`, async ({ request }) => {
                const formData = await request.formData();
                expect(formData.has('amount')).toBe(false);
                expect(formData.get('asset_code')).toBe('USDC');
                return HttpResponse.json({
                    type: 'interactive_customer_info_needed',
                    url: 'https://anchor.test/deposit',
                    id: 'txn-456',
                });
            }),
        );

        await deposit(BASE, TOKEN, { asset_code: 'USDC' }, fetch);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.post(`${BASE}/transactions/deposit/interactive`, () =>
                HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
            ),
        );

        await expect(
            deposit(BASE, TOKEN, { asset_code: 'USDC', account: 'GTEST' }, fetch),
        ).rejects.toThrow(SepApiError);
    });
});

// ---------------------------------------------------------------------------
// withdraw
// ---------------------------------------------------------------------------
describe('withdraw', () => {
    it('sends multipart form POST with auth header and returns interactive response', async () => {
        const response = {
            type: 'interactive_customer_info_needed',
            url: 'https://anchor.test/withdraw?token=abc',
            id: 'txn-789',
        };

        server.use(
            http.post(`${BASE}/transactions/withdraw/interactive`, async ({ request }) => {
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(request.headers.get('Content-Type')).toContain('multipart/form-data');
                const formData = await request.formData();
                expect(formData.get('asset_code')).toBe('USDC');
                return HttpResponse.json(response);
            }),
        );

        const result = await withdraw(
            BASE,
            TOKEN,
            { asset_code: 'USDC', account: 'GTEST' },
            fetch,
        );
        expect(result).toEqual(response);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.post(`${BASE}/transactions/withdraw/interactive`, () =>
                HttpResponse.json({ error: 'Invalid asset' }, { status: 400 }),
            ),
        );

        await expect(
            withdraw(BASE, TOKEN, { asset_code: 'INVALID' }, fetch),
        ).rejects.toThrow('Invalid asset');
    });
});

// ---------------------------------------------------------------------------
// getTransaction
// ---------------------------------------------------------------------------
describe('getTransaction', () => {
    it('fetches transaction by id with auth header', async () => {
        const transaction = {
            id: 'txn-123',
            kind: 'deposit',
            status: 'completed',
            amount_in: '100',
            started_at: '2025-01-01T00:00:00Z',
        };

        server.use(
            http.get(`${BASE}/transaction`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('id')).toBe('txn-123');
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({ transaction });
            }),
        );

        const result = await getTransaction(BASE, TOKEN, 'txn-123', fetch);
        expect(result).toEqual(transaction);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({ error: 'Transaction not found' }, { status: 404 }),
            ),
        );

        await expect(getTransaction(BASE, TOKEN, 'missing', fetch)).rejects.toThrow(
            'Transaction not found',
        );
    });
});

// ---------------------------------------------------------------------------
// getTransactionByStellarId
// ---------------------------------------------------------------------------
describe('getTransactionByStellarId', () => {
    it('fetches transaction by stellar_transaction_id', async () => {
        const transaction = {
            id: 'txn-123',
            kind: 'withdrawal',
            status: 'pending_anchor',
            stellar_transaction_id: 'stellar-hash-abc',
        };

        server.use(
            http.get(`${BASE}/transaction`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('stellar_transaction_id')).toBe('stellar-hash-abc');
                return HttpResponse.json({ transaction });
            }),
        );

        const result = await getTransactionByStellarId(BASE, TOKEN, 'stellar-hash-abc', fetch);
        expect(result).toEqual(transaction);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({ error: 'Not found' }, { status: 404 }),
            ),
        );

        await expect(
            getTransactionByStellarId(BASE, TOKEN, 'unknown', fetch),
        ).rejects.toThrow(SepApiError);
    });
});

// ---------------------------------------------------------------------------
// getTransactions
// ---------------------------------------------------------------------------
describe('getTransactions', () => {
    it('fetches transaction list with query params', async () => {
        const transactions = [
            { id: 'txn-1', kind: 'deposit', status: 'completed' },
            { id: 'txn-2', kind: 'deposit', status: 'pending_anchor' },
        ];

        server.use(
            http.get(`${BASE}/transactions`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.get('kind')).toBe('deposit');
                expect(url.searchParams.get('limit')).toBe('10');
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                return HttpResponse.json({ transactions });
            }),
        );

        const result = await getTransactions(
            BASE,
            TOKEN,
            { asset_code: 'USDC', kind: 'deposit', limit: 10 },
            fetch,
        );
        expect(result).toEqual(transactions);
        expect(result).toHaveLength(2);
    });

    it('omits undefined optional params', async () => {
        server.use(
            http.get(`${BASE}/transactions`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('asset_code')).toBe('SRT');
                expect(url.searchParams.has('kind')).toBe(false);
                expect(url.searchParams.has('limit')).toBe(false);
                return HttpResponse.json({ transactions: [] });
            }),
        );

        const result = await getTransactions(BASE, TOKEN, { asset_code: 'SRT' }, fetch);
        expect(result).toEqual([]);
    });

    it('throws SepApiError on failure', async () => {
        server.use(
            http.get(`${BASE}/transactions`, () =>
                HttpResponse.json({ error: 'Forbidden' }, { status: 403 }),
            ),
        );

        await expect(
            getTransactions(BASE, TOKEN, { asset_code: 'USDC' }, fetch),
        ).rejects.toThrow(SepApiError);
    });
});

// ---------------------------------------------------------------------------
// pollTransaction
// ---------------------------------------------------------------------------
describe('pollTransaction', () => {
    it('returns immediately when transaction is already in a terminal state', async () => {
        const transaction = { id: 'txn-123', kind: 'deposit', status: 'completed' };

        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({ transaction }),
            ),
        );

        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            { interval: 10 },
            fetch,
        );
        expect(result.status).toBe('completed');
    });

    it('calls onStatusChange when status changes', async () => {
        let callCount = 0;
        const statuses = ['pending_anchor', 'completed'];

        server.use(
            http.get(`${BASE}/transaction`, () => {
                const status = statuses[Math.min(callCount++, statuses.length - 1)];
                return HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status },
                });
            }),
        );

        const statusChanges: string[] = [];
        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            {
                interval: 10,
                onStatusChange: (tx) => statusChanges.push(tx.status),
            },
            fetch,
        );

        expect(result.status).toBe('completed');
        expect(statusChanges).toContain('pending_anchor');
        expect(statusChanges).toContain('completed');
    });

    it('times out when transaction never reaches terminal state', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status: 'pending_anchor' },
                }),
            ),
        );

        await expect(
            pollTransaction(
                BASE,
                TOKEN,
                'txn-123',
                { interval: 10, timeout: 50 },
                fetch,
            ),
        ).rejects.toThrow('Transaction polling timed out');
    });

    it('respects custom shouldStop predicate', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status: 'pending_user' },
                }),
            ),
        );

        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            {
                interval: 10,
                shouldStop: (status) => status === 'pending_user',
            },
            fetch,
        );
        expect(result.status).toBe('pending_user');
    });

    it('stops on error status by default', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status: 'error' },
                }),
            ),
        );

        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            { interval: 10 },
            fetch,
        );
        expect(result.status).toBe('error');
    });

    it('stops on expired status by default', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status: 'expired' },
                }),
            ),
        );

        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            { interval: 10 },
            fetch,
        );
        expect(result.status).toBe('expired');
    });

    it('stops on refunded status by default', async () => {
        server.use(
            http.get(`${BASE}/transaction`, () =>
                HttpResponse.json({
                    transaction: { id: 'txn-123', kind: 'deposit', status: 'refunded' },
                }),
            ),
        );

        const result = await pollTransaction(
            BASE,
            TOKEN,
            'txn-123',
            { interval: 10 },
            fetch,
        );
        expect(result.status).toBe('refunded');
    });
});
