/**
 * SEP-24 Proxy Endpoint
 *
 * Proxies SEP-24 requests to testanchor.stellar.org to avoid CORS issues.
 * The browser can't make direct requests to the anchor, so we proxy through the server.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SEP24_SERVER = 'https://testanchor.stellar.org/sep24';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action, token, ...params } = body;

		if (!token) {
			return json({ error: 'Authentication token is required' }, { status: 401 });
		}

		let url: string;

		switch (action) {
			case 'deposit':
				url = `${SEP24_SERVER}/transactions/deposit/interactive`;
				break;

			case 'withdraw':
				url = `${SEP24_SERVER}/transactions/withdraw/interactive`;
				break;

			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}

		// Ensure amount is a string (SEP-24 requirement)
		const normalizedParams: Record<string, string> = {};
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				normalizedParams[key] = String(value);
			}
		}

		const requestBody = JSON.stringify(normalizedParams);
		console.log('SEP-24 proxy request:', { url, body: requestBody });

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: requestBody
		});

		const text = await response.text();
		console.log('SEP-24 proxy response:', { status: response.status, body: text });

		let data;
		try {
			data = JSON.parse(text);
		} catch {
			return json({ error: `Invalid JSON response: ${text}` }, { status: 500 });
		}

		if (!response.ok) {
			return json(data, { status: response.status });
		}

		return json(data);
	} catch (error) {
		console.error('SEP-24 proxy error:', error);
		return json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
