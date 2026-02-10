/**
 * SEP-6 Proxy Endpoint
 *
 * Proxies SEP-6 requests to testanchor.stellar.org to avoid CORS issues.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SEP6_SERVER = 'https://testanchor.stellar.org/sep6';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, token, ...params } = body;

        if (!token) {
            return json({ error: 'Authentication token is required' }, { status: 401 });
        }

        let url: string;

        switch (action) {
            case 'deposit': {
                const searchParams = new URLSearchParams();
                Object.entries(params).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        searchParams.set(key, String(value));
                    }
                });
                url = `${SEP6_SERVER}/deposit?${searchParams.toString()}`;
                break;
            }

            case 'withdraw': {
                const searchParams = new URLSearchParams();
                Object.entries(params).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        searchParams.set(key, String(value));
                    }
                });
                url = `${SEP6_SERVER}/withdraw?${searchParams.toString()}`;
                break;
            }

            default:
                return json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        console.log('SEP-6 proxy request:', { url });

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const text = await response.text();
        console.log('SEP-6 proxy response:', { status: response.status, body: text });

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
        console.error('SEP-6 proxy error:', error);
        return json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        );
    }
};
