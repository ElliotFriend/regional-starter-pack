/**
 * SEP-31: Cross-Border Payments
 *
 * Implements the direct payment protocol for cross-border transactions.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md
 */

import type {
	Sep31Info,
	Sep31AssetInfo,
	Sep31PostTransactionRequest,
	Sep31PostTransactionResponse,
	Sep31Transaction,
	TransactionStatus,
	SepError
} from './types';
import { SepApiError } from './types';
import { createAuthHeaders } from './sep10';

/**
 * Get information about the anchor's SEP-31 capabilities.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getInfo(
	directPaymentServer: string,
	fetchFn: typeof fetch = fetch
): Promise<Sep31Info> {
	const url = `${directPaymentServer}/info`;

	const response = await fetchFn(url);

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get SEP-31 info: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Get the list of supported receiving assets.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getReceiveAssets(
	directPaymentServer: string,
	fetchFn: typeof fetch = fetch
): Promise<Record<string, Sep31AssetInfo>> {
	const info = await getInfo(directPaymentServer, fetchFn);
	return info.receive;
}

/**
 * Create a new cross-border payment transaction.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param token - SEP-10 JWT token
 * @param request - Transaction request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function postTransaction(
	directPaymentServer: string,
	token: string,
	request: Sep31PostTransactionRequest,
	fetchFn: typeof fetch = fetch
): Promise<Sep31PostTransactionResponse> {
	const url = `${directPaymentServer}/transactions`;

	const response = await fetchFn(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...createAuthHeaders(token)
		},
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to create transaction: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Get a specific transaction by ID.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getTransaction(
	directPaymentServer: string,
	token: string,
	transactionId: string,
	fetchFn: typeof fetch = fetch
): Promise<Sep31Transaction> {
	const url = `${directPaymentServer}/transactions/${transactionId}`;

	const response = await fetchFn(url, {
		headers: createAuthHeaders(token)
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get transaction: ${response.status}`,
			response.status,
			errorBody
		);
	}

	const data = await response.json();
	return data.transaction;
}

/**
 * Update a transaction with additional information (PATCH).
 * Used when the anchor requires more info (pending_transaction_info_update status).
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID
 * @param fields - Fields to update
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function patchTransaction(
	directPaymentServer: string,
	token: string,
	transactionId: string,
	fields: Record<string, string>,
	fetchFn: typeof fetch = fetch
): Promise<Sep31Transaction> {
	const url = `${directPaymentServer}/transactions/${transactionId}`;

	const response = await fetchFn(url, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json',
			...createAuthHeaders(token)
		},
		body: JSON.stringify({ fields })
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to update transaction: ${response.status}`,
			response.status,
			errorBody
		);
	}

	const data = await response.json();
	return data.transaction;
}

/**
 * Send a callback URL for transaction status updates.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID
 * @param callbackUrl - The URL to receive callbacks
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function putTransactionCallback(
	directPaymentServer: string,
	token: string,
	transactionId: string,
	callbackUrl: string,
	fetchFn: typeof fetch = fetch
): Promise<void> {
	const url = `${directPaymentServer}/transactions/${transactionId}/callback`;

	const response = await fetchFn(url, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			...createAuthHeaders(token)
		},
		body: JSON.stringify({ url: callbackUrl })
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to set callback: ${response.status}`,
			response.status,
			errorBody
		);
	}
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
 * Check if the transaction needs additional info from the sender.
 */
export function needsTransactionInfo(status: TransactionStatus): boolean {
	return status === 'pending_transaction_info_update';
}

/**
 * Check if the transaction needs additional customer info.
 */
export function needsCustomerInfo(status: TransactionStatus): boolean {
	return status === 'pending_customer_info_update';
}

/**
 * Check if a transaction is pending (waiting for Stellar payment).
 */
export function isPendingPayment(status: TransactionStatus): boolean {
	return status === 'pending_sender' || status === 'pending_stellar';
}

/**
 * Check if a transaction is pending (anchor processing).
 */
export function isPendingAnchor(status: TransactionStatus): boolean {
	return status === 'pending_external' || status === 'pending_receiver';
}

/**
 * Check if a transaction has failed.
 */
export function isFailed(status: TransactionStatus): boolean {
	return status === 'error' || status === 'expired';
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
 * Get a human-readable description of a SEP-31 transaction status.
 */
export function getStatusDescription(status: TransactionStatus): string {
	const descriptions: Record<string, string> = {
		pending_sender: 'Waiting for Stellar payment from sender',
		pending_stellar: 'Stellar payment received, confirming',
		pending_customer_info_update: 'Additional customer information required',
		pending_transaction_info_update: 'Additional transaction information required',
		pending_receiver: 'Processing payment to receiver',
		pending_external: 'Waiting for external system',
		completed: 'Payment complete',
		refunded: 'Payment refunded',
		expired: 'Transaction expired',
		error: 'Transaction failed'
	};

	return descriptions[status] || status;
}

/**
 * Poll for transaction status updates.
 *
 * @param directPaymentServer - The SEP-31 direct payment server URL
 * @param token - SEP-10 JWT token
 * @param transactionId - The transaction ID to poll
 * @param options - Polling options
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function pollTransaction(
	directPaymentServer: string,
	token: string,
	transactionId: string,
	options: {
		interval?: number;
		timeout?: number;
		onStatusChange?: (transaction: Sep31Transaction) => void;
		shouldStop?: (status: TransactionStatus) => boolean;
	} = {},
	fetchFn: typeof fetch = fetch
): Promise<Sep31Transaction> {
	const {
		interval = 5000,
		timeout = 600000, // 10 minutes
		onStatusChange,
		shouldStop = (status) => isComplete(status) || isFailed(status) || isRefunded(status)
	} = options;

	const startTime = Date.now();
	let lastStatus: TransactionStatus | null = null;

	while (Date.now() - startTime < timeout) {
		const transaction = await getTransaction(directPaymentServer, token, transactionId, fetchFn);

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
