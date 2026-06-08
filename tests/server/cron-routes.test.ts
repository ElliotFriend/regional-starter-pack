import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock env + the blend maintenance logic so the route tests exercise only the
// auth gating and response shaping — no network, no real transactions.
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/blend/oracle', () => ({ updateOracle: vi.fn() }));
vi.mock('$lib/server/blend/emissions', () => ({
    gulpEmissions: vi.fn(),
    invokeDistribution: vi.fn(),
}));
vi.mock('$lib/server/blend/config', () => ({ getBlendConfig: vi.fn() }));

import { env } from '$env/dynamic/private';
import { GET as oracleGET } from '../../src/routes/api/cron/blend/oracle/+server';
import { GET as emissionsGET } from '../../src/routes/api/cron/blend/emissions/+server';
import { updateOracle } from '$lib/server/blend/oracle';
import { gulpEmissions, invokeDistribution } from '$lib/server/blend/emissions';
import { getBlendConfig } from '$lib/server/blend/config';

const SECRET = 'cron-secret';

/** Minimal RequestEvent stub carrying just the Authorization header the routes read. */
function call(handler: (event: never) => Response | Promise<Response>, authHeader: string | null) {
    const headers = new Headers();
    if (authHeader !== null) headers.set('authorization', authHeader);
    return handler({ request: new Request('http://localhost', { headers }) } as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(env)) delete (env as Record<string, string>)[key];
    (env as Record<string, string>).CRON_SECRET = SECRET;
});

describe('GET /api/cron/blend/oracle', () => {
    it('rejects an unauthorized request with 401 and never runs the task', async () => {
        await expect(call(oracleGET, 'Bearer wrong')).rejects.toMatchObject({ status: 401 });
        await expect(call(oracleGET, null)).rejects.toMatchObject({ status: 401 });
        expect(updateOracle).not.toHaveBeenCalled();
    });

    it('runs the task and returns its result when authorized', async () => {
        vi.mocked(updateOracle).mockResolvedValue({ transactionHash: 'abc', prices: { usd: 1 } });

        const res = await call(oracleGET, `Bearer ${SECRET}`);

        expect(updateOracle).toHaveBeenCalledOnce();
        await expect(res.json()).resolves.toEqual({
            ok: true,
            task: 'oracle',
            transactionHash: 'abc',
            prices: { usd: 1 },
        });
    });

    it('surfaces a task failure as 500', async () => {
        vi.mocked(updateOracle).mockRejectedValue(new Error('rpc down'));

        await expect(call(oracleGET, `Bearer ${SECRET}`)).rejects.toMatchObject({ status: 500 });
    });
});

describe('GET /api/cron/blend/emissions', () => {
    beforeEach(() => {
        vi.mocked(getBlendConfig).mockReturnValue({
            emitterAddress: 'CEMITTER',
            backstopAddress: 'CBACKSTOP',
        } as never);
    });

    it('rejects an unauthorized request with 401 and never runs the task', async () => {
        await expect(call(emissionsGET, 'Bearer wrong')).rejects.toMatchObject({ status: 401 });
        expect(invokeDistribution).not.toHaveBeenCalled();
        expect(gulpEmissions).not.toHaveBeenCalled();
    });

    it('distributes emitter + backstop then gulps the pool, in order', async () => {
        vi.mocked(invokeDistribution)
            .mockResolvedValueOnce({ amount: 10n })
            .mockResolvedValueOnce({ amount: 20n });
        vi.mocked(gulpEmissions).mockResolvedValue({ transactionHash: 'xyz', amount: 30n });

        const res = await call(emissionsGET, `Bearer ${SECRET}`);

        expect(invokeDistribution).toHaveBeenNthCalledWith(1, 'CEMITTER');
        expect(invokeDistribution).toHaveBeenNthCalledWith(2, 'CBACKSTOP');
        expect(gulpEmissions).toHaveBeenCalledOnce();
        await expect(res.json()).resolves.toEqual({
            ok: true,
            task: 'gulp-emissions',
            distributed: { emitter: 10, backstop: 20 },
            gulped: 30,
        });
    });

    it('surfaces a task failure as 500', async () => {
        vi.mocked(invokeDistribution).mockRejectedValue(new Error('boom'));

        await expect(call(emissionsGET, `Bearer ${SECRET}`)).rejects.toMatchObject({ status: 500 });
    });
});
