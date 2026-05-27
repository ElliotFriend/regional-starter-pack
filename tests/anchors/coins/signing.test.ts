import { describe, it, expect } from 'vitest';
import { hmacSha256Hex, canonicalString, signParams } from '$lib/anchors/coins/signing';

describe('hmacSha256Hex', () => {
    it('matches the RFC HMAC-SHA256 test vector', async () => {
        // Well-known vector: HMAC_SHA256("key", "The quick brown fox jumps over the lazy dog")
        const sig = await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog');
        expect(sig).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
    });

    it('produces lowercase 64-char hex', async () => {
        const sig = await hmacSha256Hex('secret', 'message');
        expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('canonicalString', () => {
    it('sorts params by key and joins as k=v&k=v', () => {
        expect(canonicalString({ b: '2', a: '1', c: '3' })).toBe('a=1&b=2&c=3');
    });

    it('is order-independent for the same params', () => {
        expect(canonicalString({ token: 'USDC', amount: '100' })).toBe(
            canonicalString({ amount: '100', token: 'USDC' }),
        );
    });
});

describe('signParams', () => {
    it('signs the canonical string of params + timestamp + nonce with the secret', async () => {
        const opts = {
            secretKey: 'shhh',
            params: { type: 'buy', token: 'USDC', amount: '100' },
            timestamp: '1700000000000',
            nonce: 'fixed-nonce',
        };
        const { signature, timestamp, nonce } = await signParams(opts);

        // The signature must equal an independent HMAC of the canonical string
        // (params folded together with timestamp + nonce). This locks the
        // canonicalization to the signing without hand-computing the digest.
        const expected = await hmacSha256Hex(
            'shhh',
            canonicalString({ ...opts.params, timestamp: '1700000000000', nonce: 'fixed-nonce' }),
        );
        expect(signature).toBe(expected);
        expect(timestamp).toBe('1700000000000');
        expect(nonce).toBe('fixed-nonce');
    });

    it('changes signature when any signed field changes', async () => {
        const base = {
            secretKey: 'k',
            params: { token: 'USDC' },
            timestamp: '1',
            nonce: 'n',
        };
        const a = await signParams(base);
        const b = await signParams({ ...base, params: { token: 'USDT' } });
        expect(a.signature).not.toBe(b.signature);
    });
});
