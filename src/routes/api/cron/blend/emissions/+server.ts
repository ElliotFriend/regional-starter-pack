/**
 * Cron endpoint: gulp emissions for the Blend pool.
 *
 * Triggered weekly by Vercel Cron (schedule in `vercel.json`). Vercel invokes
 * cron paths over GET and attaches `Authorization: Bearer <CRON_SECRET>`, which
 * we verify here — the URL is otherwise publicly reachable.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { isAuthorizedCron } from '$lib/server/cron';
import { gulpEmissions, invokeDistribution } from '$lib/server/blend/emissions';
import { getBlendConfig } from '$lib/server/blend/config';

export const GET: RequestHandler = async ({ request }) => {
    if (!isAuthorizedCron(request.headers.get('authorization'), env.CRON_SECRET)) {
        throw error(401, { message: 'Unauthorized' });
    }

    try {
        const config = getBlendConfig();

        // first, distribute emissions on the emitter contract
        const firstDist = await invokeDistribution(config.emitterAddress);

        // second, distribute emissions on the backstop contract
        const secondDist = await invokeDistribution(config.backstopAddress);

        // finally, gulp emissions on the lending pool
        const gulpPool = await gulpEmissions();

        return json({
            ok: true,
            task: 'gulp-emissions',
            distributed: {
                emitter: Number(firstDist.amount),
                backstop: Number(secondDist.amount),
            },
            gulped: Number(gulpPool.amount),
        });
    } catch (err) {
        console.error('[cron] gulp-emissions failed:', err);
        throw error(500, {
            message: err instanceof Error ? err.message : 'gulp-emissions failed',
        });
    }
};
