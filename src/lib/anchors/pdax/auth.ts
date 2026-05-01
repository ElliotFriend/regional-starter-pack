/**
 * PDAX authentication helper.
 *
 * Owns the JWT lifecycle: login, caching, proactive refresh, and the
 * fallback-to-login path when a refresh token expires. Lives next to the
 * PDAX client so the rest of the anchor lib stays focused on transactions.
 *
 * The PDAX API protects every authenticated endpoint with two headers:
 *   - `access_token`: bearer-style JWT
 *   - `id_token`:     identity JWT
 * Both come from the same login response and are refreshed together, so
 * consumers grab them as a pair via {@link getTokens} immediately before
 * each authed request.
 */

import { AnchorError } from '../types';

/** API-path prefix shared by every endpoint. */
export const API_PREFIX = '/pdax-institution/v1';

/** Refresh tokens this many milliseconds before they expire. */
const REFRESH_LEAD_MS = 5 * 60 * 1000;

type FetchFn = typeof fetch;

interface LoginResponse {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expiry?: number;
    challenge_name?: string;
    code?: string;
    message?: string;
}

interface ErrorResponse {
    code?: string;
    message?: string;
    status?: string;
}

interface CachedSession {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    /** ms-since-epoch when the access token expires. */
    expiresAt: number;
}

export interface PdaxAuthOptions {
    username: string;
    password: string;
    baseUrl: string;
    fetchFn?: FetchFn;
}

/** Token pair required for every authenticated PDAX request. */
export interface PdaxTokens {
    accessToken: string;
    idToken: string;
}

export class PdaxAuth {
    private readonly username: string;
    private readonly password: string;
    private readonly baseUrl: string;
    private readonly fetchFn: FetchFn;

    private session: CachedSession | null = null;
    private inflight: Promise<CachedSession> | null = null;

    constructor(opts: PdaxAuthOptions) {
        this.username = opts.username;
        this.password = opts.password;
        this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
        this.fetchFn = opts.fetchFn ?? fetch;
    }

    /** Return the (access, id) token pair, refreshing or re-logging-in as needed. */
    async getTokens(): Promise<PdaxTokens> {
        const session = await this.ensureFresh();
        return { accessToken: session.accessToken, idToken: session.idToken };
    }

    /** Force a re-login on the next call. Useful when an authed request comes back 401. */
    invalidate(): void {
        this.session = null;
    }

    private async ensureFresh(): Promise<CachedSession> {
        if (this.inflight) return this.inflight;

        const now = Date.now();
        if (this.session && this.session.expiresAt - now > REFRESH_LEAD_MS) {
            return this.session;
        }

        const task = this.session ? this.refreshOrRelogin(this.session) : this.login();

        this.inflight = task.finally(() => {
            this.inflight = null;
        });
        return this.inflight;
    }

    private async refreshOrRelogin(prev: CachedSession): Promise<CachedSession> {
        try {
            return await this.refresh(prev.refreshToken);
        } catch (err) {
            if (err instanceof AnchorError && err.statusCode === 401) {
                this.session = null;
                return this.login();
            }
            throw err;
        }
    }

    private async login(): Promise<CachedSession> {
        const url = `${this.baseUrl}${API_PREFIX}/login`;
        const response = await this.fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.username, password: this.password }),
        });

        const data = await this.parseJson<LoginResponse>(response, url);

        if (data.challenge_name) {
            throw new AnchorError(
                `PDAX login requires an MFA challenge (${data.challenge_name}). ` +
                    `MFA must be disabled on the API account for this integration.`,
                'MFA_REQUIRED',
                501,
            );
        }

        return this.cache(data);
    }

    private async refresh(refreshToken: string): Promise<CachedSession> {
        const url = `${this.baseUrl}${API_PREFIX}/refresh-token`;
        // Note: request uses camelCase `refreshToken` even though the login response
        // returns snake_case `refresh_token`. This is per the PDAX spec, not a typo.
        const response = await this.fetchFn(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.username, refreshToken }),
        });

        const data = await this.parseJson<LoginResponse>(response, url);
        return this.cache(data);
    }

    private cache(data: LoginResponse): CachedSession {
        if (!data.access_token || !data.id_token || !data.refresh_token) {
            throw new AnchorError(
                'PDAX auth response missing token fields',
                'INVALID_AUTH_RESPONSE',
                500,
            );
        }
        const expirySeconds =
            typeof data.expiry === 'number' && data.expiry > 0 ? data.expiry : 600;
        const session: CachedSession = {
            accessToken: data.access_token,
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + expirySeconds * 1000,
        };
        this.session = session;
        return session;
    }

    private async parseJson<T>(response: Response, url: string): Promise<T> {
        const text = await response.text();
        let parsed: unknown = {};
        if (text) {
            try {
                parsed = JSON.parse(text);
            } catch {
                // Fall through — handled below.
            }
        }

        if (!response.ok) {
            const err = parsed as ErrorResponse;
            throw new AnchorError(
                err.message || `PDAX request failed: ${response.status} ${url}`,
                err.code || 'PDAX_AUTH_ERROR',
                response.status,
            );
        }

        return parsed as T;
    }
}
