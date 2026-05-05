/** Wraps fetch to add `X-Proxy-Secret` on every request when configured. See /proxy/. */
export function createProxiedFetch(secret?: string, baseFetch: typeof fetch = fetch): typeof fetch {
    if (!secret) return baseFetch;
    return (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('X-Proxy-Secret', secret);
        return baseFetch(input, { ...init, headers });
    };
}
