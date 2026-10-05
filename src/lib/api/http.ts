/**
 * Shared HTTP helpers for the per-provider client-side API wrappers
 * (`$lib/api/etherfuse.ts`, `$lib/api/chipper.ts`, etc.).
 *
 * Per-provider wrappers create their own bound `apiRequest`/`postJson` via
 * {@link createApiRequester} so each provider keeps its own typed error class
 * while sharing the request/response plumbing.
 */

export type Fetch = typeof fetch;

/** Pre-bound HTTP helpers for one provider's API namespace. */
export interface ApiRequester {
    /** Fetch JSON; throw the provider's error class on non-2xx. */
    apiRequest<T>(fetch: Fetch, url: string, init?: RequestInit): Promise<T>;
    /** POST a JSON body; throw the provider's error class on non-2xx. */
    postJson<T>(fetch: Fetch, url: string, body: unknown): Promise<T>;
}

/**
 * Build {@link ApiRequester} helpers bound to a specific error class. The
 * factory function lets each provider's wrapper module keep its own
 * `instanceof`-able error type while sharing the request body.
 *
 * @example
 * ```ts
 * export class MyApiError extends Error {
 *     constructor(public statusCode: number, message: string) {
 *         super(message);
 *         this.name = 'MyApiError';
 *     }
 * }
 * const { apiRequest, postJson } = createApiRequester(
 *     (statusCode, message) => new MyApiError(statusCode, message),
 * );
 * ```
 */
export function createApiRequester(
    makeError: (statusCode: number, message: string) => Error,
): ApiRequester {
    async function apiRequest<T>(fetch: Fetch, url: string, init?: RequestInit): Promise<T> {
        const response = await fetch(url, init);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw makeError(
                response.status,
                data.message || data.error || `Request failed: ${response.status}`,
            );
        }
        return response.json();
    }

    async function postJson<T>(fetch: Fetch, url: string, body: unknown): Promise<T> {
        return apiRequest<T>(fetch, url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    return { apiRequest, postJson };
}
