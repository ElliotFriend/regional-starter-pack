/**
 * Cron request authorization (server-side only).
 *
 * Vercel Cron Jobs invoke their target path over HTTP `GET`. When a `CRON_SECRET`
 * environment variable is set on the Vercel project, Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` to every cron invocation. The endpoint is
 * still a publicly reachable URL, so each cron route must verify that header to
 * reject anything that isn't the scheduled job.
 *
 * This module is intentionally pure (no `$env`, no framework imports) so it can be
 * unit-tested directly. Routes read `CRON_SECRET` from `$env/dynamic/private` and
 * pass it in.
 */

/**
 * Return `true` only when `authHeader` carries the expected cron secret as a
 * Bearer token. Fails closed: a missing/empty `secret` (i.e. misconfigured
 * project) always returns `false`.
 */
export function isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean {
    if (!secret) return false;
    return authHeader === `Bearer ${secret}`;
}
