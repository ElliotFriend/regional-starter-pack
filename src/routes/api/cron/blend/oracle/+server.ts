/**
 * Cron endpoint: update the Blend pool price oracle.
 *
 * Triggered hourly by Vercel Cron (schedule in `vercel.json`). Vercel invokes
 * cron paths over GET and attaches `Authorization: Bearer <CRON_SECRET>`, which
 * we verify here — the URL is otherwise publicly reachable.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$app/env/private';
import { isAuthorizedCron } from '#lib/server/cron.ts';
import { updateOracle } from '#lib/server/blend/oracle.ts';

export const GET: RequestHandler = async ({ request }) => {
    if (!isAuthorizedCron(request.headers.get('authorization'), CRON_SECRET)) {
        throw error(401, 'Unauthorized');
    }

    try {
        const result = await updateOracle();
        return Response.json({ ok: true, task: 'oracle', ...result });
    } catch (err) {
        console.error('[cron] update-oracle failed:', err);
        throw error(500, err instanceof Error ? err.message : 'update-oracle failed');
    }
};
