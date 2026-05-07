import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { PdaxAuth } from '$lib/anchors/pdax/auth';
import { createProxiedFetch } from '$lib/anchors/pdax/proxiedFetch';
import { AnchorError } from '$lib/anchors/types';

const BASE_URL = 'http://pdax.test/api/pdax-api';
const USERNAME = 'test@pdax.example';
const PASSWORD = 'sandbox-password';

const LOGIN_PATH = `${BASE_URL}/pdax-institution/v1/login`;
const REFRESH_PATH = `${BASE_URL}/pdax-institution/v1/refresh-token`;

/**
 * Build a JWT-shaped string with the given payload. Signature segment is a
 * placeholder — PdaxAuth only decodes the payload for the `exp` claim, never
 * verifies signatures.
 */
function makeTestJwt(payload: Record<string, unknown>): string {
    const b64 = (obj: Record<string, unknown>) =>
        Buffer.from(JSON.stringify(obj)).toString('base64url');
    return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

function loginResponse(overrides: Record<string, unknown> = {}) {
    return {
        email: USERNAME,
        username: 'pdax-uuid-1',
        groups: ['insti_user'],
        token_type: 'Bearer',
        preferred_mfa: 'NOT_SET',
        expiry: 600, // 10 minutes
        access_token: 'access-token-v1',
        id_token: 'id-token-v1',
        refresh_token: 'refresh-token-v1',
        ...overrides,
    };
}

function createAuth() {
    return new PdaxAuth({ username: USERNAME, password: PASSWORD, baseUrl: BASE_URL });
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('PdaxAuth.getTokens', () => {
    it('logs in once and returns both tokens from a shared cache', async () => {
        let calls = 0;
        server.use(
            http.post(LOGIN_PATH, async ({ request }) => {
                calls += 1;
                const body = (await request.json()) as Record<string, string>;
                expect(body.username).toBe(USERNAME);
                expect(body.password).toBe(PASSWORD);
                return HttpResponse.json(loginResponse());
            }),
        );

        const auth = createAuth();
        const tokens = await auth.getTokens();
        expect(tokens.accessToken).toBe('access-token-v1');
        expect(tokens.idToken).toBe('id-token-v1');
        // Repeated calls hit the cache, no second login.
        await auth.getTokens();
        await auth.getTokens();
        expect(calls).toBe(1);
    });

    it('refreshes 5 minutes before token expiry', async () => {
        let loginCalls = 0;
        let refreshCalls = 0;
        server.use(
            http.post(LOGIN_PATH, () => {
                loginCalls += 1;
                return HttpResponse.json(loginResponse({ expiry: 600 })); // 10 min
            }),
            http.put(REFRESH_PATH, async ({ request }) => {
                refreshCalls += 1;
                const body = (await request.json()) as Record<string, string>;
                expect(body.username).toBe(USERNAME);
                expect(body.refreshToken).toBe('refresh-token-v1');
                return HttpResponse.json(
                    loginResponse({
                        access_token: 'access-token-v2',
                        id_token: 'id-token-v2',
                        refresh_token: 'refresh-token-v2',
                    }),
                );
            }),
        );

        const auth = createAuth();
        expect((await auth.getTokens()).accessToken).toBe('access-token-v1');
        expect(loginCalls).toBe(1);

        // 4 minutes in — still cached, no refresh.
        vi.advanceTimersByTime(4 * 60 * 1000);
        expect((await auth.getTokens()).accessToken).toBe('access-token-v1');
        expect(refreshCalls).toBe(0);

        // 6 minutes in (within 5-minute pre-expiry window) — should refresh.
        vi.advanceTimersByTime(2 * 60 * 1000);
        const refreshed = await auth.getTokens();
        expect(refreshed.accessToken).toBe('access-token-v2');
        expect(refreshed.idToken).toBe('id-token-v2');
        expect(refreshCalls).toBe(1);
        expect(loginCalls).toBe(1);
    });

    it('falls back to login when refresh-token returns 401', async () => {
        let loginCalls = 0;
        server.use(
            http.post(LOGIN_PATH, () => {
                loginCalls += 1;
                return HttpResponse.json(
                    loginResponse({
                        expiry: 600,
                        access_token: `access-token-v${loginCalls}`,
                        id_token: `id-token-v${loginCalls}`,
                        refresh_token: `refresh-token-v${loginCalls}`,
                    }),
                );
            }),
            http.put(REFRESH_PATH, () =>
                HttpResponse.json(
                    { status: 'error', code: 'PAP0401', message: 'Unauthorize' },
                    { status: 401 },
                ),
            ),
        );

        const auth = createAuth();
        expect((await auth.getTokens()).accessToken).toBe('access-token-v1');
        expect(loginCalls).toBe(1);

        // Trip the refresh window.
        vi.advanceTimersByTime(6 * 60 * 1000);

        expect((await auth.getTokens()).accessToken).toBe('access-token-v2');
        expect(loginCalls).toBe(2);
    });

    it('falls back to login when refresh-token returns any 4xx (not just 401)', async () => {
        let loginCalls = 0;
        server.use(
            http.post(LOGIN_PATH, () => {
                loginCalls += 1;
                return HttpResponse.json(
                    loginResponse({
                        expiry: 600,
                        access_token: `access-token-v${loginCalls}`,
                        id_token: `id-token-v${loginCalls}`,
                        refresh_token: `refresh-token-v${loginCalls}`,
                    }),
                );
            }),
            http.put(REFRESH_PATH, () =>
                HttpResponse.json(
                    { status: 'error', code: 'PAP0400', message: 'Bad refresh token' },
                    { status: 400 },
                ),
            ),
        );

        const auth = createAuth();
        expect((await auth.getTokens()).accessToken).toBe('access-token-v1');
        expect(loginCalls).toBe(1);

        // Trip the refresh window — refresh returns 400, must still fall back to login.
        vi.advanceTimersByTime(6 * 60 * 1000);

        expect((await auth.getTokens()).accessToken).toBe('access-token-v2');
        expect(loginCalls).toBe(2);
    });

    it('respects the JWT `exp` claim for cache TTL when shorter than the expiry field', async () => {
        // JWT that expires 60 seconds from "now" (vi.setSystemTime is 2026-05-01T12:00:00Z).
        const jwtExpSeconds = Math.floor(new Date('2026-05-01T12:00:00Z').getTime() / 1000) + 60;
        const shortLivedAccess = makeTestJwt({ exp: jwtExpSeconds });

        let loginCalls = 0;
        let refreshCalls = 0;
        server.use(
            http.post(LOGIN_PATH, () => {
                loginCalls += 1;
                return HttpResponse.json(
                    loginResponse({
                        // expiry says 10 minutes, but the JWT itself expires in 60s
                        expiry: 600,
                        access_token: shortLivedAccess,
                    }),
                );
            }),
            http.put(REFRESH_PATH, () => {
                refreshCalls += 1;
                return HttpResponse.json(
                    loginResponse({
                        expiry: 600,
                        access_token: 'access-token-v2',
                        id_token: 'id-token-v2',
                        refresh_token: 'refresh-token-v2',
                    }),
                );
            }),
        );

        const auth = createAuth();
        expect((await auth.getTokens()).accessToken).toBe(shortLivedAccess);
        expect(loginCalls).toBe(1);

        // The JWT only has 60s of life, so we should refresh well before the
        // 5-minute pre-expiry window suggested by the response `expiry: 600`.
        // Specifically: with exp at +60s and REFRESH_LEAD_MS=5min, every poll
        // immediately after t=0 already triggers a refresh.
        vi.advanceTimersByTime(1000);
        await auth.getTokens();
        expect(refreshCalls).toBe(1);
    });

    it('throws AnchorError when login returns an error response', async () => {
        server.use(
            http.post(LOGIN_PATH, () =>
                HttpResponse.json(
                    { status: 'error', code: 'PAP0400', message: 'Invalid credentials' },
                    { status: 400 },
                ),
            ),
        );

        const auth = createAuth();
        await expect(auth.getTokens()).rejects.toBeInstanceOf(AnchorError);
        await expect(auth.getTokens()).rejects.toMatchObject({
            code: 'PAP0400',
            statusCode: 400,
        });
    });

    it('forwards X-Proxy-Secret on login and refresh when fetchFn is wrapped', async () => {
        let loginHeader: string | null = null;
        let refreshHeader: string | null = null;
        server.use(
            http.post(LOGIN_PATH, ({ request }) => {
                loginHeader = request.headers.get('X-Proxy-Secret');
                return HttpResponse.json(loginResponse({ expiry: 600 }));
            }),
            http.put(REFRESH_PATH, ({ request }) => {
                refreshHeader = request.headers.get('X-Proxy-Secret');
                return HttpResponse.json(
                    loginResponse({
                        expiry: 600,
                        access_token: 'access-token-v2',
                        id_token: 'id-token-v2',
                        refresh_token: 'refresh-token-v2',
                    }),
                );
            }),
        );

        const auth = new PdaxAuth({
            username: USERNAME,
            password: PASSWORD,
            baseUrl: BASE_URL,
            fetchFn: createProxiedFetch('the-secret'),
        });

        await auth.getTokens();
        expect(loginHeader).toBe('the-secret');

        // Trip the refresh window to force a refresh call.
        vi.advanceTimersByTime(6 * 60 * 1000);
        await auth.getTokens();
        expect(refreshHeader).toBe('the-secret');
    });

    it('throws AnchorError when login returns an MFA challenge', async () => {
        server.use(
            http.post(LOGIN_PATH, () =>
                HttpResponse.json({
                    code: 'MFA_REQUIRED',
                    message: 'MFA required',
                    challenge_name: 'SOFTWARE_TOKEN_MFA',
                    session: 'mfa-session-id',
                }),
            ),
        );

        const auth = createAuth();
        await expect(auth.getTokens()).rejects.toBeInstanceOf(AnchorError);
        await expect(auth.getTokens()).rejects.toMatchObject({
            code: 'MFA_REQUIRED',
        });
    });
});
