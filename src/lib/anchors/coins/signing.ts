/**
 * Request signing for the Coins.ph merchant integration.
 *
 * Coins.ph authenticates the merchant with an HMAC-SHA256 signature over the
 * request params, keyed by the merchant `secretKey`. Both the hosted widget URL
 * (link integration) and the REST endpoints use this scheme.
 *
 * Implemented with the Web Crypto API (`crypto.subtle`) rather than `node:crypto`
 * so this stays isomorphic and dependency-free, consistent with the rest of the
 * portable `anchors/` library.
 *
 * NOTE: the exact canonicalization Coins.ph expects (field ordering, and whether
 * the timestamp/nonce are folded into the signed string vs. sent only as headers)
 * is not pinned down in the docs we currently have. It is isolated here so it can
 * be corrected in one place once confirmed against the sandbox.
 */

const encoder = new TextEncoder();

/** Compute a lowercase hex HMAC-SHA256 of `message` keyed by `secret`. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build the canonical string to sign: params sorted by key, joined as `k=v&k=v`. */
export function canonicalString(params: Record<string, string>): string {
    return Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join('&');
}

export interface SignParamsOptions {
    secretKey: string;
    /** Business params to fold into the signature. */
    params: Record<string, string>;
    /** Milliseconds-since-epoch timestamp, as a string. */
    timestamp: string;
    /** Per-request nonce (UUID). */
    nonce: string;
}

export interface SignedRequest {
    signature: string;
    timestamp: string;
    nonce: string;
}

/**
 * Sign `params` together with `timestamp` and `nonce`. Returns the hex signature
 * plus the timestamp/nonce that were folded in, so the caller can attach all
 * three to the outgoing request.
 */
export async function signParams(opts: SignParamsOptions): Promise<SignedRequest> {
    const message = canonicalString({
        ...opts.params,
        timestamp: opts.timestamp,
        nonce: opts.nonce,
    });
    const signature = await hmacSha256Hex(opts.secretKey, message);
    return { signature, timestamp: opts.timestamp, nonce: opts.nonce };
}
