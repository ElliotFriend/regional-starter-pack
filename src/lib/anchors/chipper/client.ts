/**
 * Chipper Platform API client (https://docs.platform.chipper.ai).
 *
 * Standalone and framework-agnostic: depends only on `@stellar/stellar-sdk`.
 * **Server-side only**: authenticates with a secret Bearer key.
 *
 * Chipper is partner-level: there is no end-user customer or KYC object. An
 * order collects on one rail and pays out on another in one call, which is how
 * both ramps work here (mobile money ⇄ `usdc_stellar`).
 */

import {
    ChipperError,
    type ChipperConfig,
    type ChipperErrorDetail,
    type ChipperErrorResponse,
    type ChipperOrganization,
} from './types';

/** API version pinned for every request (echoed back by Chipper). */
export const CHIPPER_API_VERSION = '2026-02-20';

export class ChipperClient {
    readonly name = 'chipper';
    readonly displayName = 'Chipper';
    private readonly config: ChipperConfig;

    constructor(config: ChipperConfig) {
        this.config = config;
    }

    /** Console-log when `config.debug` is set. Never passed credentials. */
    private debugLog(...args: unknown[]): void {
        if (this.config.debug) console.log(...args);
    }

    /** Console-error when `config.debug` is set. */
    private debugError(...args: unknown[]): void {
        if (this.config.debug) console.error(...args);
    }

    /** The organization this key belongs to; a connectivity check. */
    async getOrganization(): Promise<ChipperOrganization> {
        const res = await this.request<{ organization: ChipperOrganization }>(
            'GET',
            '/v1/organization',
        );
        return res.organization;
    }

    /** Send an authenticated JSON request, mapping the error envelope to {@link ChipperError}. */
    private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
        this.debugLog(`[Chipper] ${method} ${url}`, body ? JSON.stringify(body) : '');

        const response = await fetch(url, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
                'chipper-version': CHIPPER_API_VERSION,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const text = await response.text();
        if (!response.ok) {
            this.debugError(`[Chipper] Error ${response.status}:`, text);
            let parsed: ChipperErrorResponse | undefined;
            try {
                parsed = JSON.parse(text) as ChipperErrorResponse;
            } catch {
                // Not JSON.
            }
            throw new ChipperError(
                errorMessage(parsed, text, response.status),
                parsed?.error ?? 'CHIPPER_ERROR',
                response.status,
                parsed?.requestId ?? response.headers.get('x-request-id') ?? undefined,
                parsed?.details,
            );
        }
        this.debugLog('[Chipper] Response:', text || '(empty)');
        return (text ? JSON.parse(text) : undefined) as T;
    }
}

/** Human message for an error envelope; validation details are appended. */
function errorMessage(
    parsed: ChipperErrorResponse | undefined,
    text: string,
    status: number,
): string {
    const base = parsed?.message || text || `Chipper API error: ${status}`;
    if (Array.isArray(parsed?.details) && parsed.details.length > 0) {
        const fields = (parsed.details as ChipperErrorDetail[])
            .map((d) => `${d.field} ${d.message}`)
            .join('; ');
        return `${base}: ${fields}`;
    }
    return base;
}
