/**
 * SEP-6: Deposit and Withdrawal API
 *
 * Implements programmatic (non-interactive) deposit and withdrawal operations.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0006.md
 */

import type {
    Sep6Info,
    Sep6DepositRequest,
    Sep6DepositResponse,
    Sep6WithdrawRequest,
    Sep6WithdrawResponse,
    Sep6Transaction,
    TransactionStatus,
    SepError,
} from './types';
import { SepApiError } from './types';
import { createAuthHeaders } from './sep10';

/**
 * Get information about the anchor's SEP-6 capabilities.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getInfo(
    transferServer: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep6Info> {
    const url = `${transferServer}/info`;

    const response = await fetchFn(url);

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get SEP-6 info: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Initiate a deposit (fiat to crypto).
 * User will receive instructions on how to deposit fiat.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param token - SEP-10 JWT token
 * @param request - Deposit request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function deposit(
    transferServer: string,
    token: string,
    request: Sep6DepositRequest,
    fetchFn: typeof fetch = fetch,
): Promise<Sep6DepositResponse> {
    const url = new URL(`${transferServer}/deposit`);

    // Add all request parameters as query params
    Object.entries(request).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to initiate deposit: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Initiate a withdrawal (crypto to fiat).
 * Returns the Stellar account to send funds to.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param token - SEP-10 JWT token
 * @param request - Withdrawal request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function withdraw(
    transferServer: string,
    token: string,
    request: Sep6WithdrawRequest,
    fetchFn: typeof fetch = fetch,
): Promise<Sep6WithdrawResponse> {
    const url = new URL(`${transferServer}/withdraw`);

    // Add all request parameters as query params
    Object.entries(request).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to initiate withdrawal: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Get a specific transaction by ID.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransaction(
    transferServer: string,
    token: string,
    transactionId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep6Transaction> {
    const url = new URL(`${transferServer}/transaction`);
    url.searchParams.set('id', transactionId);

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get transaction: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    const data = await response.json();
    return data.transaction;
}

/**
 * Get a transaction by Stellar transaction ID.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param token - SEP-10 JWT token
 * @param stellarTransactionId - The Stellar transaction ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransactionByStellarId(
    transferServer: string,
    token: string,
    stellarTransactionId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep6Transaction> {
    const url = new URL(`${transferServer}/transaction`);
    url.searchParams.set('stellar_transaction_id', stellarTransactionId);

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get transaction: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    const data = await response.json();
    return data.transaction;
}

/**
 * Get a list of transactions for the authenticated user.
 *
 * @param transferServer - The SEP-6 transfer server URL
 * @param token - SEP-10 JWT token
 * @param params - Query parameters for filtering
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransactions(
    transferServer: string,
    token: string,
    params: {
        asset_code: string;
        account?: string;
        no_older_than?: string;
        limit?: number;
        kind?: 'deposit' | 'withdrawal';
        paging_id?: string;
        lang?: string;
    },
    fetchFn: typeof fetch = fetch,
): Promise<Sep6Transaction[]> {
    const url = new URL(`${transferServer}/transactions`);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.set(key, String(value));
        }
    });

    const response = await fetchFn(url.toString(), {
        headers: createAuthHeaders(token),
    });

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get transactions: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    const data = await response.json();
    return data.transactions;
}

// =============================================================================
// Transaction Status Helpers
// =============================================================================

/**
 * Check if a transaction is complete.
 */
export function isComplete(status: TransactionStatus): boolean {
    return status === 'completed';
}

/**
 * Check if a transaction is pending (user action required).
 */
export function isPendingUser(status: TransactionStatus): boolean {
    return (
        status === 'pending_user_transfer_start' ||
        status === 'pending_user' ||
        status === 'pending_customer_info_update' ||
        status === 'pending_transaction_info_update'
    );
}

/**
 * Check if a transaction is pending (anchor/external action).
 */
export function isPendingAnchor(status: TransactionStatus): boolean {
    return (
        status === 'pending_anchor' ||
        status === 'pending_stellar' ||
        status === 'pending_external' ||
        status === 'pending_trust' ||
        status === 'pending_user_transfer_complete'
    );
}

/**
 * Check if a transaction has failed or expired.
 */
export function isFailed(status: TransactionStatus): boolean {
    return status === 'error' || status === 'expired' || status === 'no_market';
}

/**
 * Check if a transaction was refunded.
 */
export function isRefunded(status: TransactionStatus): boolean {
    return status === 'refunded';
}

/**
 * Check if a transaction is in progress (not terminal).
 */
export function isInProgress(status: TransactionStatus): boolean {
    return !isComplete(status) && !isFailed(status) && !isRefunded(status);
}

/**
 * Get a human-readable description of a transaction status.
 */
export function getStatusDescription(status: TransactionStatus): string {
    const descriptions: Record<TransactionStatus, string> = {
        incomplete: 'Transaction not yet complete',
        pending_user_transfer_start: 'Waiting for you to initiate the transfer',
        pending_user_transfer_complete: 'Transfer received, processing',
        pending_external: 'Waiting for external system',
        pending_anchor: 'Anchor is processing',
        pending_stellar: 'Waiting for Stellar network confirmation',
        pending_trust: 'Waiting for trustline to be established',
        pending_user: 'Waiting for user action',
        pending_customer_info_update: 'Additional customer info required',
        pending_transaction_info_update: 'Additional transaction info required',
        pending_sender: 'Waiting for Stellar payment from sender',
        pending_receiver: 'Processing payment to receiver',
        completed: 'Transaction complete',
        refunded: 'Transaction refunded',
        expired: 'Transaction expired',
        error: 'Transaction failed',
        no_market: 'No market for this asset pair',
    };

    return descriptions[status] || status;
}
