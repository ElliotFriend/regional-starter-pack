/**
 * Chipper Platform API types. Wire shapes follow `chipper.openapi.json`
 * (vendored from docs.platform.chipper.ai) and were confirmed live in sandbox.
 */

/** Constructor config for {@link ChipperClient}. */
export interface ChipperConfig {
    /** Secret API key (`sk_test_…` / `sk_live_…`). Server-side only. */
    apiKey: string;
    /** e.g. `https://sandbox-api.platform.chipper.ai`. */
    baseUrl: string;
    /** Log requests, responses, and errors (never the key). Default off. */
    debug?: boolean;
}

/** A field-level validation problem from a `validation_error`. */
export interface ChipperErrorDetail {
    field: string;
    message: string;
}

/** Any non-2xx Chipper response. Branch on `code` (the stable `error` value). */
export class ChipperError extends Error {
    code: string;
    statusCode: number;
    requestId?: string;
    details?: unknown;

    constructor(
        message: string,
        code: string,
        statusCode: number = 500,
        requestId?: string,
        details?: unknown,
    ) {
        super(message);
        this.name = 'ChipperError';
        this.code = code;
        this.statusCode = statusCode;
        this.requestId = requestId;
        this.details = details;
    }
}

/** Raw error envelope. */
export interface ChipperErrorResponse {
    error: string;
    message: string;
    details?: unknown;
    requestId?: string;
}

/** `GET /v1/organization`. */
export interface ChipperOrganization {
    id: string;
    name: string;
    country: string;
    timezone: string;
    defaultCurrency: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}
