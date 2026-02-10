/**
 * SEP-24: Interactive Deposit and Withdrawal
 *
 * Implements interactive (hosted UI) deposit and withdrawal operations.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
 */

import type {
    Sep24Info,
    Sep24DepositRequest,
    Sep24WithdrawRequest,
    Sep24InteractiveResponse,
    Sep24Transaction,
    TransactionStatus,
    SepError,
} from './types';
import { SepApiError } from './types';
import { createAuthHeaders } from './sep10';

/**
 * Get information about the anchor's SEP-24 capabilities.
 *
 * @param transferServer - The SEP-24 transfer server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getInfo(
    transferServer: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep24Info> {
    const url = `${transferServer}/info`;

    const response = await fetchFn(url);

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as SepError;
        throw new SepApiError(
            errorBody.error || `Failed to get SEP-24 info: ${response.status}`,
            response.status,
            errorBody,
        );
    }

    return response.json();
}

/**
 * Initiate an interactive deposit (fiat to crypto).
 * Returns a URL to the anchor's hosted deposit UI.
 *
 * @param transferServer - The SEP-24 transfer server URL
 * @param token - SEP-10 JWT token
 * @param request - Deposit request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function deposit(
    transferServer: string,
    token: string,
    request: Sep24DepositRequest,
    fetchFn: typeof fetch = fetch,
): Promise<Sep24InteractiveResponse> {
    const url = `${transferServer}/transactions/deposit/interactive`;

    // Build form data
    const formData = new URLSearchParams();
    Object.entries(request).forEach(([key, value]) => {
        if (value !== undefined) {
            formData.set(key, String(value));
        }
    });

    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...createAuthHeaders(token),
        },
        body: formData.toString(),
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
 * Initiate an interactive withdrawal (crypto to fiat).
 * Returns a URL to the anchor's hosted withdrawal UI.
 *
 * @param transferServer - The SEP-24 transfer server URL
 * @param token - SEP-10 JWT token
 * @param request - Withdrawal request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function withdraw(
    transferServer: string,
    token: string,
    request: Sep24WithdrawRequest,
    fetchFn: typeof fetch = fetch,
): Promise<Sep24InteractiveResponse> {
    const url = `${transferServer}/transactions/withdraw/interactive`;

    // Build form data
    const formData = new URLSearchParams();
    Object.entries(request).forEach(([key, value]) => {
        if (value !== undefined) {
            formData.set(key, String(value));
        }
    });

    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...createAuthHeaders(token),
        },
        body: formData.toString(),
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
 * @param transferServer - The SEP-24 transfer server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransaction(
    transferServer: string,
    token: string,
    transactionId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep24Transaction> {
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
 * @param transferServer - The SEP-24 transfer server URL
 * @param token - SEP-10 JWT token
 * @param stellarTransactionId - The Stellar transaction ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransactionByStellarId(
    transferServer: string,
    token: string,
    stellarTransactionId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Sep24Transaction> {
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
 * @param transferServer - The SEP-24 transfer server URL
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
): Promise<Sep24Transaction[]> {
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
// Interactive URL Helpers
// =============================================================================

/**
 * Opens the interactive URL in a new popup window.
 *
 * @param url - The interactive URL from deposit/withdraw response
 * @param options - Window options
 */
export function openPopup(
    url: string,
    options: {
        width?: number;
        height?: number;
        name?: string;
    } = {},
): Window | null {
    const { width = 500, height = 800, name = 'stellar-anchor' } = options;

    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    return window.open(
        url,
        name,
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );
}

/**
 * Creates an iframe element for the interactive URL.
 *
 * @param url - The interactive URL from deposit/withdraw response
 * @param container - Container element to append the iframe to
 * @param options - Iframe options
 */
export function createIframe(
    url: string,
    container: HTMLElement,
    options: {
        width?: string;
        height?: string;
        className?: string;
    } = {},
): HTMLIFrameElement {
    const { width = '100%', height = '600px', className = '' } = options;

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.width = width;
    iframe.height = height;
    iframe.className = className;
    iframe.style.border = 'none';
    iframe.allow = 'camera; microphone'; // For KYC document capture if needed

    container.appendChild(iframe);
    return iframe;
}

/**
 * Poll for transaction status updates.
 *
 * @param transferServer - The SEP-24 transfer server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID to poll
 * @param options - Polling options
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function pollTransaction(
    transferServer: string,
    token: string,
    transactionId: string,
    options: {
        interval?: number;
        timeout?: number;
        onStatusChange?: (transaction: Sep24Transaction) => void;
        shouldStop?: (status: TransactionStatus) => boolean;
    } = {},
    fetchFn: typeof fetch = fetch,
): Promise<Sep24Transaction> {
    const {
        interval = 5000,
        timeout = 600000, // 10 minutes
        onStatusChange,
        shouldStop = (status) =>
            status === 'completed' ||
            status === 'error' ||
            status === 'expired' ||
            status === 'refunded',
    } = options;

    const startTime = Date.now();
    let lastStatus: TransactionStatus | null = null;

    while (Date.now() - startTime < timeout) {
        const transaction = await getTransaction(transferServer, token, transactionId, fetchFn);

        if (transaction.status !== lastStatus) {
            lastStatus = transaction.status;
            onStatusChange?.(transaction);
        }

        if (shouldStop(transaction.status)) {
            return transaction;
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(`Transaction polling timed out after ${timeout}ms`);
}

// Re-export status helpers from SEP-6 since they're the same
export {
    isComplete,
    isPendingUser,
    isPendingAnchor,
    isFailed,
    isRefunded,
    isInProgress,
    getStatusDescription,
} from './sep6';
