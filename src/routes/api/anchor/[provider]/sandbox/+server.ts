/**
 * Sandbox API endpoint (dynamic [provider] route)
 *
 * Currently no anchor served through this dynamic route exposes a sandbox
 * action. Etherfuse sandbox lives at `/api/anchor/etherfuse/sandbox/` (static).
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidProvider } from '$lib/server/anchorFactory';
import { AnchorError } from '$lib/anchors/types';

export const POST: RequestHandler = async ({ params, request }) => {
    const { provider } = params;

    if (!isValidProvider(provider)) {
        throw error(400, { message: `Invalid provider: ${provider}` });
    }

    try {
        const body = await request.json();
        const { action } = body;

        if (!action) {
            throw error(400, { message: 'action is required' });
        }

        throw error(400, { message: `Unknown action: ${action}` });
    } catch (err) {
        if (err instanceof AnchorError) {
            throw error(err.statusCode, { message: err.message });
        }
        throw err;
    }
};
