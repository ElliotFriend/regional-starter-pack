/**
 * Developer-readiness scorecard endpoint.
 *
 * GET /api/scorecard            → JSON (default)
 * GET /api/scorecard?format=md  → Markdown
 * GET /api/scorecard with `Accept: text/markdown` → Markdown (query wins if both)
 *
 * Read-only public data, so CORS is wide open for the BD team's agents.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildReadiness, toMarkdown, resolveFormat } from '$lib/config/scorecard';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export const GET: RequestHandler = async ({ url, request }) => {
    let format: 'json' | 'md';
    try {
        format = resolveFormat(url.searchParams.get('format'), request.headers.get('accept'));
    } catch (e) {
        throw error(400, { message: e instanceof Error ? e.message : 'Unsupported format' });
    }

    const entries = buildReadiness();

    if (format === 'md') {
        return new Response(toMarkdown(entries), {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...CORS },
        });
    }
    return json(entries, { headers: CORS });
};

export const OPTIONS: RequestHandler = async () =>
    new Response(null, {
        headers: {
            ...CORS,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        },
    });
