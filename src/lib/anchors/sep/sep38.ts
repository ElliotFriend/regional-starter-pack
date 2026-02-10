/**
 * SEP-38: Anchor RFQ API (Quotes)
 *
 * Implements the quote/RFQ protocol for getting exchange rates from anchors.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0038.md
 */

import type {
	Sep38Info,
	Sep38Asset,
	Sep38PriceRequest,
	Sep38PriceResponse,
	Sep38QuoteRequest,
	Sep38QuoteResponse,
	SepError
} from './types';
import { SepApiError } from './types';
import { createAuthHeaders } from './sep10';

/**
 * Get the list of supported assets and their delivery methods.
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getInfo(
	quoteServer: string,
	fetchFn: typeof fetch = fetch
): Promise<Sep38Info> {
	const url = `${quoteServer}/info`;
	const response = await fetchFn(url);

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get SEP-38 info: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Get all assets supported by the anchor.
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getAssets(
	quoteServer: string,
	fetchFn: typeof fetch = fetch
): Promise<Sep38Asset[]> {
	const info = await getInfo(quoteServer, fetchFn);
	return info.assets;
}

/**
 * Get an indicative price (no commitment) for an asset pair.
 * This does not require authentication.
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param request - Price request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getPrice(
	quoteServer: string,
	request: Sep38PriceRequest,
	fetchFn: typeof fetch = fetch
): Promise<Sep38PriceResponse> {
	const url = new URL(`${quoteServer}/price`);

	// Add required parameters
	url.searchParams.set('sell_asset', request.sell_asset);
	url.searchParams.set('buy_asset', request.buy_asset);
	url.searchParams.set('context', request.context);

	// Add optional parameters
	if (request.sell_amount) {
		url.searchParams.set('sell_amount', request.sell_amount);
	}
	if (request.buy_amount) {
		url.searchParams.set('buy_amount', request.buy_amount);
	}
	if (request.sell_delivery_method) {
		url.searchParams.set('sell_delivery_method', request.sell_delivery_method);
	}
	if (request.buy_delivery_method) {
		url.searchParams.set('buy_delivery_method', request.buy_delivery_method);
	}
	if (request.country_code) {
		url.searchParams.set('country_code', request.country_code);
	}

	const response = await fetchFn(url.toString());

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get price: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Get all available prices for a sell or buy asset.
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param params - Either sell_asset or buy_asset must be specified
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getPrices(
	quoteServer: string,
	params: {
		sell_asset?: string;
		buy_asset?: string;
		sell_amount?: string;
		buy_amount?: string;
		sell_delivery_method?: string;
		buy_delivery_method?: string;
		country_code?: string;
	},
	fetchFn: typeof fetch = fetch
): Promise<{ buy_assets?: Sep38PriceResponse[]; sell_assets?: Sep38PriceResponse[] }> {
	const url = new URL(`${quoteServer}/prices`);

	Object.entries(params).forEach(([key, value]) => {
		if (value) {
			url.searchParams.set(key, value);
		}
	});

	const response = await fetchFn(url.toString());

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get prices: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Request a firm quote with a guaranteed rate.
 * This requires authentication (SEP-10 token).
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param token - SEP-10 JWT token
 * @param request - Quote request parameters
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function postQuote(
	quoteServer: string,
	token: string,
	request: Sep38QuoteRequest,
	fetchFn: typeof fetch = fetch
): Promise<Sep38QuoteResponse> {
	const url = `${quoteServer}/quote`;

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
			errorBody.error || `Failed to create quote: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

/**
 * Get an existing quote by ID.
 *
 * @param quoteServer - The SEP-38 quote server URL
 * @param token - SEP-10 JWT token
 * @param quoteId - The quote ID
 * @param fetchFn - Optional fetch function for SSR compatibility
 */
export async function getQuote(
	quoteServer: string,
	token: string,
	quoteId: string,
	fetchFn: typeof fetch = fetch
): Promise<Sep38QuoteResponse> {
	const url = `${quoteServer}/quote/${quoteId}`;

	const response = await fetchFn(url, {
		headers: createAuthHeaders(token)
	});

	if (!response.ok) {
		const errorBody = (await response.json().catch(() => ({}))) as SepError;
		throw new SepApiError(
			errorBody.error || `Failed to get quote: ${response.status}`,
			response.status,
			errorBody
		);
	}

	return response.json();
}

// =============================================================================
// Helper functions for asset identifiers
// =============================================================================

/**
 * Creates a Stellar asset identifier in SEP-38 format.
 * Format: stellar:<code>:<issuer> or stellar:native for XLM
 */
export function stellarAssetId(code: string, issuer?: string): string {
	if (code === 'XLM' || code === 'native') {
		return 'stellar:native';
	}
	if (!issuer) {
		throw new Error(`Issuer required for non-native asset ${code}`);
	}
	return `stellar:${code}:${issuer}`;
}

/**
 * Creates a fiat currency identifier in SEP-38 format.
 * Format: iso4217:<code>
 */
export function fiatAssetId(code: string): string {
	return `iso4217:${code}`;
}

/**
 * Parses a SEP-38 asset identifier.
 */
export function parseAssetId(assetId: string): {
	type: 'stellar' | 'fiat';
	code: string;
	issuer?: string;
} {
	const [scheme, code, issuer] = assetId.split(':');

	if (scheme === 'stellar') {
		if (code === 'native') {
			return { type: 'stellar', code: 'XLM' };
		}
		return { type: 'stellar', code, issuer };
	}

	if (scheme === 'iso4217') {
		return { type: 'fiat', code };
	}

	throw new Error(`Unknown asset scheme: ${scheme}`);
}
