import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import {
    isComplete,
    isPendingUser,
    isPendingAnchor,
    isFailed,
    isRefunded,
    isInProgress,
    getStatusDescription,
    getInfo,
    deposit,
    withdraw,
    depositExchange,
    withdrawExchange,
    getTransaction,
    getTransactionByStellarId,
    getTransactions,
} from '$lib/anchors/sep/sep6';
import { SepApiError } from '$lib/anchors/sep/types';
import type { TransactionStatus } from '$lib/anchors/sep/types';

describe('isComplete', () => {
    it('returns true for completed', () => {
        expect(isComplete('completed')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isComplete('pending_anchor')).toBe(false);
        expect(isComplete('error')).toBe(false);
    });
});

describe('isPendingUser', () => {
    const pendingUserStatuses: TransactionStatus[] = [
        'pending_user_transfer_start',
        'pending_user',
        'pending_customer_info_update',
        'pending_transaction_info_update',
    ];

    it.each(pendingUserStatuses)('returns true for %s', (status) => {
        expect(isPendingUser(status)).toBe(true);
    });

    it('returns false for non-user-pending statuses', () => {
        expect(isPendingUser('pending_anchor')).toBe(false);
        expect(isPendingUser('completed')).toBe(false);
    });
});

describe('isPendingAnchor', () => {
    const pendingAnchorStatuses: TransactionStatus[] = [
        'pending_anchor',
        'pending_stellar',
        'pending_external',
        'pending_trust',
        'pending_user_transfer_complete',
    ];

    it.each(pendingAnchorStatuses)('returns true for %s', (status) => {
        expect(isPendingAnchor(status)).toBe(true);
    });

    it('returns false for non-anchor-pending statuses', () => {
        expect(isPendingAnchor('pending_user')).toBe(false);
        expect(isPendingAnchor('completed')).toBe(false);
    });
});

describe('isFailed', () => {
    const failedStatuses: TransactionStatus[] = ['error', 'expired', 'no_market'];

    it.each(failedStatuses)('returns true for %s', (status) => {
        expect(isFailed(status)).toBe(true);
    });

    it('returns false for non-failed statuses', () => {
        expect(isFailed('completed')).toBe(false);
        expect(isFailed('pending_anchor')).toBe(false);
    });
});

describe('isRefunded', () => {
    it('returns true for refunded', () => {
        expect(isRefunded('refunded')).toBe(true);
    });

    it('returns false for other statuses', () => {
        expect(isRefunded('completed')).toBe(false);
    });
});

describe('isInProgress', () => {
    it('returns true for in-progress statuses', () => {
        expect(isInProgress('pending_anchor')).toBe(true);
        expect(isInProgress('pending_user')).toBe(true);
        expect(isInProgress('incomplete')).toBe(true);
    });

    it('returns false for terminal statuses', () => {
        expect(isInProgress('completed')).toBe(false);
        expect(isInProgress('error')).toBe(false);
        expect(isInProgress('refunded')).toBe(false);
    });
});

describe('getStatusDescription', () => {
    const allStatuses: TransactionStatus[] = [
        'incomplete',
        'pending_user_transfer_start',
        'pending_user_transfer_complete',
        'pending_external',
        'pending_anchor',
        'pending_stellar',
        'pending_trust',
        'pending_user',
        'pending_customer_info_update',
        'pending_transaction_info_update',
        'pending_sender',
        'pending_receiver',
        'completed',
        'refunded',
        'expired',
        'error',
        'no_market',
    ];

    it.each(allStatuses)('returns a description for %s', (status) => {
        const desc = getStatusDescription(status);
        expect(desc).toBeTruthy();
        expect(typeof desc).toBe('string');
    });

    it('returns the status itself as fallback for unknown status', () => {
        const desc = getStatusDescription('unknown_status' as TransactionStatus);
        expect(desc).toBe('unknown_status');
    });
});

// =============================================================================
// HTTP Functions (MSW-based tests)
// =============================================================================

const TRANSFER_SERVER = 'https://testanchor.stellar.org/sep6';
const TOKEN = 'test-jwt-token';

describe('getInfo', () => {
    it('returns SEP-6 info on success', async () => {
        const mockInfo = {
            deposit: { USDC: { enabled: true } },
            withdraw: { USDC: { enabled: true } },
            fee: { enabled: true },
        };

        server.use(
            http.get(`${TRANSFER_SERVER}/info`, () => {
                return HttpResponse.json(mockInfo);
            }),
        );

        const result = await getInfo(TRANSFER_SERVER);
        expect(result).toEqual(mockInfo);
    });

    it('throws SepApiError on 400 with error body', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/info`, () => {
                return HttpResponse.json({ error: 'Bad request' }, { status: 400 });
            }),
        );

        await expect(getInfo(TRANSFER_SERVER)).rejects.toThrow(SepApiError);
        await expect(getInfo(TRANSFER_SERVER)).rejects.toThrow('Bad request');
    });

    it('throws SepApiError on 500 with non-JSON error body', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/info`, () => {
                return new HttpResponse('Internal Server Error', { status: 500 });
            }),
        );

        const err = await getInfo(TRANSFER_SERVER).catch((e) => e);
        expect(err).toBeInstanceOf(SepApiError);
        expect(err.status).toBe(500);
        expect(err.message).toContain('500');
    });
});

describe('deposit', () => {
    it('sends auth header and request params as query params', async () => {
        const mockResponse = {
            how: 'Make a SPEI transfer to the following account',
            id: 'dep-123',
            eta: 3600,
        };

        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.get('account')).toBe('GABC123');
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await deposit(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            account: 'GABC123',
        });
        expect(result).toEqual(mockResponse);
    });

    it('omits undefined fields from query params', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.has('memo')).toBe(false);
                expect(url.searchParams.has('email_address')).toBe(false);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                return HttpResponse.json({ how: 'instructions', id: 'dep-456' });
            }),
        );

        await deposit(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            account: 'GABC123',
            memo: undefined,
            email_address: undefined,
        });
    });

    it('throws SepApiError on error response', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, () => {
                return HttpResponse.json({ error: 'Unsupported asset' }, { status: 400 });
            }),
        );

        await expect(
            deposit(TRANSFER_SERVER, TOKEN, { asset_code: 'INVALID', account: 'GABC123' }),
        ).rejects.toThrow('Unsupported asset');
    });
});

describe('withdraw', () => {
    it('sends auth header and request params as query params', async () => {
        const mockResponse = {
            account_id: 'GANCHOR_ACCOUNT',
            memo_type: 'text' as const,
            memo: 'withdraw-123',
            id: 'wd-123',
        };

        server.use(
            http.get(`${TRANSFER_SERVER}/withdraw`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.get('type')).toBe('bank_account');
                return HttpResponse.json(mockResponse);
            }),
        );

        const result = await withdraw(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            type: 'bank_account',
        });
        expect(result).toEqual(mockResponse);
    });

    it('throws SepApiError on error response', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/withdraw`, () => {
                return HttpResponse.json({ error: 'Withdrawal not supported' }, { status: 400 });
            }),
        );

        await expect(
            withdraw(TRANSFER_SERVER, TOKEN, { asset_code: 'USDC', type: 'bank_account' }),
        ).rejects.toThrow('Withdrawal not supported');
    });
});

describe('getTransaction', () => {
    it('returns unwrapped transaction on success', async () => {
        const mockTransaction = {
            id: 'tx-123',
            kind: 'deposit',
            status: 'completed',
            amount_in: '100.00',
        };

        server.use(
            http.get(`${TRANSFER_SERVER}/transaction`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(url.searchParams.get('id')).toBe('tx-123');
                return HttpResponse.json({ transaction: mockTransaction });
            }),
        );

        const result = await getTransaction(TRANSFER_SERVER, TOKEN, 'tx-123');
        expect(result).toEqual(mockTransaction);
        expect(result.id).toBe('tx-123');
    });

    it('throws SepApiError on 404', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transaction`, () => {
                return HttpResponse.json({ error: 'Transaction not found' }, { status: 404 });
            }),
        );

        const err = await getTransaction(TRANSFER_SERVER, TOKEN, 'nonexistent').catch((e) => e);
        expect(err).toBeInstanceOf(SepApiError);
        expect(err.status).toBe(404);
        expect(err.message).toBe('Transaction not found');
    });
});

describe('getTransactionByStellarId', () => {
    it('returns unwrapped transaction on success', async () => {
        const mockTransaction = {
            id: 'tx-456',
            kind: 'withdrawal',
            status: 'pending_anchor',
        };

        server.use(
            http.get(`${TRANSFER_SERVER}/transaction`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('stellar_transaction_id')).toBe('stellar-hash-abc');
                return HttpResponse.json({ transaction: mockTransaction });
            }),
        );

        const result = await getTransactionByStellarId(TRANSFER_SERVER, TOKEN, 'stellar-hash-abc');
        expect(result).toEqual(mockTransaction);
    });

    it('throws SepApiError on error', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transaction`, () => {
                return HttpResponse.json({ error: 'Not found' }, { status: 404 });
            }),
        );

        await expect(getTransactionByStellarId(TRANSFER_SERVER, TOKEN, 'bad-id')).rejects.toThrow(
            SepApiError,
        );
    });
});

describe('getTransactions', () => {
    it('returns transactions array with query params', async () => {
        const mockTransactions = [
            { id: 'tx-1', kind: 'deposit', status: 'completed' },
            { id: 'tx-2', kind: 'deposit', status: 'pending_anchor' },
        ];

        server.use(
            http.get(`${TRANSFER_SERVER}/transactions`, ({ request }) => {
                const url = new URL(request.url);
                expect(request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.get('kind')).toBe('deposit');
                expect(url.searchParams.get('limit')).toBe('10');
                return HttpResponse.json({ transactions: mockTransactions });
            }),
        );

        const result = await getTransactions(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            kind: 'deposit',
            limit: 10,
        });
        expect(result).toEqual(mockTransactions);
        expect(result).toHaveLength(2);
    });

    it('returns empty array when no transactions', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transactions`, () => {
                return HttpResponse.json({ transactions: [] });
            }),
        );

        const result = await getTransactions(TRANSFER_SERVER, TOKEN, { asset_code: 'USDC' });
        expect(result).toEqual([]);
    });

    it('throws SepApiError on error', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transactions`, () => {
                return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }),
        );

        await expect(
            getTransactions(TRANSFER_SERVER, TOKEN, { asset_code: 'USDC' }),
        ).rejects.toThrow(SepApiError);
    });
});

// =============================================================================
// Input validation behavior
// =============================================================================

describe('input validation behavior', () => {
    it('deposit passes empty asset_code to API without validation', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('asset_code')).toBe('');
                return HttpResponse.json({ how: 'instructions', id: 'dep-empty' });
            }),
        );

        const result = await deposit(TRANSFER_SERVER, TOKEN, {
            asset_code: '',
            account: 'GABC123',
        });
        expect(result.id).toBe('dep-empty');
    });

    it('deposit excludes undefined fields from query params', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.has('memo')).toBe(false);
                expect(url.searchParams.has('type')).toBe(false);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.get('account')).toBe('GABC123');
                return HttpResponse.json({ how: 'instructions', id: 'dep-undef' });
            }),
        );

        await deposit(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            account: 'GABC123',
            memo: undefined,
            type: undefined,
        });
    });

    it('deposit converts non-string values to strings via String()', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/deposit`, ({ request }) => {
                const url = new URL(request.url);
                // Boolean value gets converted to "true"
                expect(url.searchParams.get('claimable_balance_supported')).toBe('true');
                return HttpResponse.json({ how: 'instructions', id: 'dep-conv' });
            }),
        );

        await deposit(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            account: 'GABC123',
            claimable_balance_supported: true,
        });
    });

    it('withdraw passes empty type to API without validation', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/withdraw`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('type')).toBe('');
                return HttpResponse.json({
                    account_id: 'GANCHOR',
                    id: 'wd-empty-type',
                });
            }),
        );

        const result = await withdraw(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            type: '',
        });
        expect(result.id).toBe('wd-empty-type');
    });

    it('getTransaction passes empty transactionId to URL', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transaction`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('id')).toBe('');
                return HttpResponse.json({
                    transaction: { id: '', kind: 'deposit', status: 'completed' },
                });
            }),
        );

        const result = await getTransaction(TRANSFER_SERVER, TOKEN, '');
        expect(result.id).toBe('');
    });

    it('getTransactions passes numeric limit as string in query params', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transactions`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('limit')).toBe('10');
                return HttpResponse.json({ transactions: [] });
            }),
        );

        await getTransactions(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
            limit: 10,
        });
    });

    it('getTransactions omits undefined optional params from query', async () => {
        server.use(
            http.get(`${TRANSFER_SERVER}/transactions`, ({ request }) => {
                const url = new URL(request.url);
                expect(url.searchParams.get('asset_code')).toBe('USDC');
                expect(url.searchParams.has('kind')).toBe(false);
                expect(url.searchParams.has('limit')).toBe(false);
                expect(url.searchParams.has('no_older_than')).toBe(false);
                expect(url.searchParams.has('paging_id')).toBe(false);
                expect(url.searchParams.has('lang')).toBe(false);
                expect(url.searchParams.has('account')).toBe(false);
                return HttpResponse.json({ transactions: [] });
            }),
        );

        await getTransactions(TRANSFER_SERVER, TOKEN, {
            asset_code: 'USDC',
        });
    });
});

// ---------------------------------------------------------------------------
// exchange endpoints
// ---------------------------------------------------------------------------

const EX_TRANSFER = 'https://anchor.example.com/sep6';
const EX_TOKEN = 'header.payload.sig';
const EX_ACCOUNT = 'GASAZERTFNL6EWRFIHKQV53GMYBTUQAHAUE37N4N6D6WXQE34B47Q5HH';
const EX_FULL_ASSET = 'stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

describe('depositExchange', () => {
    it('sends every parameter as a query param and returns the deposit instructions', async () => {
        let captured: URL | undefined;
        let auth: string | null = null;
        server.use(
            http.get(`${EX_TRANSFER}/deposit-exchange`, ({ request }) => {
                captured = new URL(request.url);
                auth = request.headers.get('authorization');
                return HttpResponse.json({
                    id: 'sep_1',
                    how: 'Send TRY to IBAN TR05…',
                    instructions: {
                        organization_bank_account_number: {
                            value: 'TR05…',
                            description: 'IBAN',
                        },
                    },
                });
            }),
        );

        const result = await depositExchange(EX_TRANSFER, EX_TOKEN, {
            destination_asset: EX_FULL_ASSET,
            source_asset: 'iso4217:TRY',
            amount: '1000',
            account: EX_ACCOUNT,
            quote_id: 'qt_1',
            funding_method: 'bank_account',
        });

        expect(captured!.searchParams.get('destination_asset')).toBe(EX_FULL_ASSET);
        expect(captured!.searchParams.get('source_asset')).toBe('iso4217:TRY');
        expect(captured!.searchParams.get('amount')).toBe('1000');
        expect(captured!.searchParams.get('account')).toBe(EX_ACCOUNT);
        expect(captured!.searchParams.get('quote_id')).toBe('qt_1');
        expect(captured!.searchParams.get('funding_method')).toBe('bank_account');
        expect(auth).toBe(`Bearer ${EX_TOKEN}`);
        expect(result.id).toBe('sep_1');
        expect(result.instructions!.organization_bank_account_number.value).toBe('TR05…');
    });

    it('passes asset identifiers through verbatim and never normalises them', async () => {
        let captured: URL | undefined;
        server.use(
            http.get(`${EX_TRANSFER}/deposit-exchange`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({ id: 'sep_2' });
            }),
        );

        // A bare asset code is not the spec form, but some anchors require it.
        // The shared helper must not rewrite either side of the pair.
        await depositExchange(EX_TRANSFER, EX_TOKEN, {
            destination_asset: 'USDC',
            source_asset: 'iso4217:TRY',
            amount: '1000',
            account: EX_ACCOUNT,
        });

        expect(captured!.searchParams.get('destination_asset')).toBe('USDC');
        expect(captured!.searchParams.get('source_asset')).toBe('iso4217:TRY');
    });

    it('omits undefined parameters', async () => {
        let captured: URL | undefined;
        server.use(
            http.get(`${EX_TRANSFER}/deposit-exchange`, ({ request }) => {
                captured = new URL(request.url);
                return HttpResponse.json({ id: 'sep_3' });
            }),
        );

        await depositExchange(EX_TRANSFER, EX_TOKEN, {
            destination_asset: 'USDC',
            source_asset: 'iso4217:TRY',
            amount: '1000',
            account: EX_ACCOUNT,
            quote_id: undefined,
        });

        expect(captured!.searchParams.has('quote_id')).toBe(false);
    });

    it('throws SepApiError with the anchor error message on a non-2xx', async () => {
        server.use(
            http.get(`${EX_TRANSFER}/deposit-exchange`, () =>
                HttpResponse.json({ error: 'unsupported destination_asset' }, { status: 400 }),
            ),
        );

        await expect(
            depositExchange(EX_TRANSFER, EX_TOKEN, {
                destination_asset: EX_FULL_ASSET,
                source_asset: 'iso4217:TRY',
                amount: '1000',
                account: EX_ACCOUNT,
            }),
        ).rejects.toThrow(SepApiError);
    });
});

describe('withdrawExchange', () => {
    it('sends every parameter and returns the anchor account and memo', async () => {
        let captured: URL | undefined;
        let auth: string | null = null;
        server.use(
            http.get(`${EX_TRANSFER}/withdraw-exchange`, ({ request }) => {
                captured = new URL(request.url);
                auth = request.headers.get('authorization');
                return HttpResponse.json({
                    account_id: 'GCLCZEQZ2THTEDAOFI66LACNPLY4OBKN7VKLEZFMBIHYKYQOW2W7T3Z6',
                    memo_type: 'id',
                    memo: '539516300156',
                    id: 'sep_w1',
                });
            }),
        );

        const result = await withdrawExchange(EX_TRANSFER, EX_TOKEN, {
            source_asset: 'USDC',
            destination_asset: 'iso4217:TRY',
            amount: '10',
            account: EX_ACCOUNT,
            quote_id: 'qt_2',
            funding_method: 'bank_account',
        });

        expect(captured!.searchParams.get('source_asset')).toBe('USDC');
        expect(captured!.searchParams.get('destination_asset')).toBe('iso4217:TRY');
        expect(captured!.searchParams.get('amount')).toBe('10');
        expect(captured!.searchParams.get('quote_id')).toBe('qt_2');
        expect(auth).toBe(`Bearer ${EX_TOKEN}`);
        expect(result.memo).toBe('539516300156');
        expect(result.memo_type).toBe('id');
    });

    it('throws SepApiError with the anchor error message on a non-2xx', async () => {
        server.use(
            http.get(`${EX_TRANSFER}/withdraw-exchange`, () =>
                HttpResponse.json({ error: 'amount below minimum' }, { status: 400 }),
            ),
        );

        await expect(
            withdrawExchange(EX_TRANSFER, EX_TOKEN, {
                source_asset: 'USDC',
                destination_asset: 'iso4217:TRY',
                amount: '0.1',
                account: EX_ACCOUNT,
            }),
        ).rejects.toThrow(SepApiError);
    });
});
