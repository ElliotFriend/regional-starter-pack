/**
 * Cron endpoint: update the Blend pool price oracle.
 *
 * Triggered hourly by Vercel Cron (schedule in `vercel.json`). Vercel invokes
 * cron paths over GET and attaches `Authorization: Bearer <CRON_SECRET>`, which
 * we verify here — the URL is otherwise publicly reachable.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { isAuthorizedCron } from '$lib/server/cron';
import { updateOracle } from '$lib/server/blend/oracle';

export const GET: RequestHandler = async ({ request }) => {
    if (!isAuthorizedCron(request.headers.get('authorization'), env.CRON_SECRET)) {
        throw error(401, { message: 'Unauthorized' });
    }

    try {
        const result = await updateOracle();
        return json({ ok: true, task: 'oracle', ...result });
    } catch (err) {
        console.error('[cron] update-oracle failed:', err);
        throw error(500, {
            message: err instanceof Error ? err.message : 'update-oracle failed',
        });
    }
};
