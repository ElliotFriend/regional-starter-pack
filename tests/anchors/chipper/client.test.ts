import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { ChipperClient, ChipperError } from '$lib/anchors/chipper';

const BASE_URL = 'https://chipper.test';
const API_KEY = 'sk_test_supersecret';

function createClient(debug = false) {
    return new ChipperClient({ apiKey: API_KEY, baseUrl: BASE_URL, debug });
}

const ORG = {
    organization: {
        id: 'org_1',
        name: 'SDF Demo',
        country: 'US',
        timezone: 'America/Chicago',
        defaultCurrency: 'USD',
        status: 'sandbox_only',
        createdAt: '2026-09-29T14:40:28.123Z',
        updatedAt: '2026-09-29T14:40:28.123Z',
    },
};

describe('ChipperClient core', () => {
    it('GETs /v1/organization with Bearer auth and the API version header', async () => {
        let auth: string | null = null;
        let version: string | null = null;
        server.use(
            http.get(`${BASE_URL}/v1/organization`, ({ request }) => {
                auth = request.headers.get('authorization');
                version = request.headers.get('chipper-version');
                return HttpResponse.json(ORG);
            }),
        );
        const org = await createClient().getOrganization();
        expect(auth).toBe(`Bearer ${API_KEY}`);
        expect(version).toBe('2026-02-20');
        expect(org.id).toBe('org_1');
        expect(org.status).toBe('sandbox_only');
    });

    it('maps the error envelope to ChipperError with code, status, and requestId', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json(
                    { error: 'unauthorized', message: 'Invalid API key', requestId: 'req_1' },
                    { status: 401 },
                ),
            ),
        );
        const err = await createClient()
            .getOrganization()
            .catch((e) => e);
        expect(err).toBeInstanceOf(ChipperError);
        expect(err).toMatchObject({ code: 'unauthorized', statusCode: 401, requestId: 'req_1' });
    });

    it('folds validation_error details into the message', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json(
                    {
                        error: 'validation_error',
                        message: 'Request validation failed',
                        details: [{ field: 'to.currency', message: 'Required' }],
                        requestId: 'req_2',
                    },
                    { status: 400 },
                ),
            ),
        );
        const err = await createClient()
            .getOrganization()
            .catch((e) => e);
        expect(err.message).toBe('Request validation failed: to.currency Required');
        expect(err.details).toEqual([{ field: 'to.currency', message: 'Required' }]);
    });
});

describe('debug logging', () => {
    it('is silent by default', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient().getOrganization();
        expect(console.log).not.toHaveBeenCalled();
    });

    it('is silent by default on API errors too', async () => {
        server.use(
            http.get(`${BASE_URL}/v1/organization`, () =>
                HttpResponse.json({ error: 'internal_error', message: 'x' }, { status: 500 }),
            ),
        );
        vi.mocked(console.error).mockClear();
        await expect(createClient().getOrganization()).rejects.toThrow();
        expect(console.error).not.toHaveBeenCalled();
    });

    it('logs requests and responses when debug is enabled', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient(true).getOrganization();
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((c) => c.join(' '))
            .join('\n');
        expect(logged).toContain(`[Chipper] GET ${BASE_URL}/v1/organization`);
        expect(logged).toContain('sandbox_only');
    });

    it('never logs the API key, even with debug enabled', async () => {
        server.use(http.get(`${BASE_URL}/v1/organization`, () => HttpResponse.json(ORG)));
        vi.mocked(console.log).mockClear();
        await createClient(true).getOrganization();
        const logged = vi
            .mocked(console.log)
            .mock.calls.map((c) => c.join(' '))
            .join('\n');
        expect(logged).not.toContain(API_KEY);
    });
});
