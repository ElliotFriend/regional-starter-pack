/**
 * Cron endpoint: gulp emissions for the Blend pool.
 *
 * Triggered weekly by Vercel Cron (schedule in `vercel.json`). Vercel invokes
 * cron paths over GET and attaches `Authorization: Bearer <CRON_SECRET>`, which
 * we verify here — the URL is otherwise publicly reachable.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CRON_SECRET } from '$app/env/private';
import { isAuthorizedCron } from '#lib/server/cron.ts';
import { gulpEmissions, invokeDistribution } from '#lib/server/blend/emissions.ts';
import { getBlendConfig } from '#lib/server/blend/config.ts';

export const GET: RequestHandler = async ({ request }) => {
    if (!isAuthorizedCron(request.headers.get('authorization'), CRON_SECRET)) {
        throw error(401, 'Unauthorized');
    }

    try {
        const config = getBlendConfig();

        // first, distribute emissions on the emitter contract
        const firstDist = await invokeDistribution(config.emitterAddress);

        // second, distribute emissions on the backstop contract
        const secondDist = await invokeDistribution(config.backstopAddress);

        // finally, gulp emissions on the lending pool
        const gulpPool = await gulpEmissions();

        return Response.json({
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
        throw error(500, err instanceof Error ? err.message : 'gulp-emissions failed');
    }
};
