/**
 * Wraps fetch with the proxy's shared-secret header and translates PDAX's
 * underscored auth headers (`access_token`, `id_token`) into wrapper names
 * the proxy understands. WSGI (PEP 3333) collapses `access_token` and
 * `Access-Token` into the same env var, so a passthrough Flask proxy can't
 * preserve underscored names on its way out — PDAX then rejects the request
 * because it requires the underscored form. We send wrapper names through
 * and let the proxy re-emit the underscored headers verbatim. See /proxy/.
 */
export function createProxiedFetch(secret?: string, baseFetch: typeof fetch = fetch): typeof fetch {
    if (!secret) return baseFetch;
    return (input, init = {}) => {
        const headers = new Headers(init.headers);
        headers.set('X-Proxy-Secret', secret);
        const accessToken = headers.get('access_token');
        if (accessToken !== null) {
            headers.delete('access_token');
            headers.set('X-Pdax-Access-Token', accessToken);
        }
        const idToken = headers.get('id_token');
        if (idToken !== null) {
            headers.delete('id_token');
            headers.set('X-Pdax-Id-Token', idToken);
        }
        return baseFetch(input, { ...init, headers });
    };
}
