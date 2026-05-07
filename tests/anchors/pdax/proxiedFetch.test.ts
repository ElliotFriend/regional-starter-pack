import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test-setup';
import { createProxiedFetch } from '$lib/anchors/pdax/proxiedFetch';

describe('createProxiedFetch', () => {
    it('adds X-Proxy-Secret to outbound requests when a secret is provided', async () => {
        let captured: Headers | null = null;
        server.use(
            http.get('http://upstream.test/foo', ({ request }) => {
                captured = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const proxied = createProxiedFetch('the-secret');
        await proxied('http://upstream.test/foo');

        expect(captured?.get('X-Proxy-Secret')).toBe('the-secret');
    });

    it('preserves method, body, and other headers', async () => {
        let capturedHeaders: Headers | null = null;
        let capturedMethod: string | null = null;
        let capturedBody: string | null = null;
        server.use(
            http.post('http://upstream.test/bar', async ({ request }) => {
                capturedHeaders = request.headers;
                capturedMethod = request.method;
                capturedBody = await request.text();
                return HttpResponse.json({});
            }),
        );

        const proxied = createProxiedFetch('the-secret');
        await proxied('http://upstream.test/bar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer abc',
            },
            body: JSON.stringify({ hello: 'world' }),
        });

        expect(capturedMethod).toBe('POST');
        expect(capturedHeaders?.get('Content-Type')).toBe('application/json');
        expect(capturedHeaders?.get('Authorization')).toBe('Bearer abc');
        expect(capturedHeaders?.get('X-Proxy-Secret')).toBe('the-secret');
        expect(capturedBody).toBe(JSON.stringify({ hello: 'world' }));
    });

    it('returns the injected baseFetch unchanged when no secret is provided', () => {
        const customFetch = vi.fn() as unknown as typeof fetch;
        expect(createProxiedFetch(undefined, customFetch)).toBe(customFetch);
        expect(createProxiedFetch('', customFetch)).toBe(customFetch);
    });

    it('rewrites access_token / id_token headers as wrapper names the proxy can re-emit', async () => {
        let captured: Headers | null = null;
        server.use(
            http.get('http://upstream.test/quote', ({ request }) => {
                captured = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const proxied = createProxiedFetch('the-secret');
        await proxied('http://upstream.test/quote', {
            headers: {
                access_token: 'access-jwt',
                id_token: 'id-jwt',
                'Content-Type': 'application/json',
            },
        });

        expect(captured?.get('access_token')).toBeNull();
        expect(captured?.get('id_token')).toBeNull();
        expect(captured?.get('X-Pdax-Access-Token')).toBe('access-jwt');
        expect(captured?.get('X-Pdax-Id-Token')).toBe('id-jwt');
        expect(captured?.get('Content-Type')).toBe('application/json');
    });

    it('leaves auth headers untouched when no proxy secret is configured', async () => {
        let captured: Headers | null = null;
        server.use(
            http.get('http://upstream.test/direct', ({ request }) => {
                captured = request.headers;
                return HttpResponse.json({ ok: true });
            }),
        );

        const proxied = createProxiedFetch(undefined);
        await proxied('http://upstream.test/direct', {
            headers: { access_token: 'access-jwt', id_token: 'id-jwt' },
        });

        expect(captured?.get('access_token')).toBe('access-jwt');
        expect(captured?.get('id_token')).toBe('id-jwt');
        expect(captured?.get('X-Pdax-Access-Token')).toBeNull();
    });

    it('routes outbound requests through the injected baseFetch when wrapping', async () => {
        const customFetch = vi.fn(
            async () =>
                new Response('{}', {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
        ) as unknown as typeof fetch;

        const proxied = createProxiedFetch('the-secret', customFetch);
        await proxied('http://anywhere.test/x', { method: 'POST', body: 'hi' });

        const mock = customFetch as unknown as ReturnType<typeof vi.fn>;
        expect(mock).toHaveBeenCalledTimes(1);
        const [input, init] = mock.mock.calls[0] as [string, RequestInit];
        expect(input).toBe('http://anywhere.test/x');
        expect(init.method).toBe('POST');
        expect(init.body).toBe('hi');
        const headers = new Headers(init.headers);
        expect(headers.get('X-Proxy-Secret')).toBe('the-secret');
    });
});
