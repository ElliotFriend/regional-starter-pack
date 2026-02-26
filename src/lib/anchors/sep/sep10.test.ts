import { describe, it, expect } from 'vitest';
import { decodeToken, isTokenExpired, createAuthHeaders, validateChallenge } from './sep10';
import * as StellarSdk from '@stellar/stellar-sdk';

// Helper to create a fake JWT with a given payload
function makeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.fakesig`;
}

describe('decodeToken', () => {
    it('decodes a valid JWT payload', () => {
        const payload = {
            iss: 'testanchor.stellar.org',
            sub: 'GABC123',
            iat: 1000,
            exp: 2000,
            jti: 'tx-id',
        };
        const token = makeJwt(payload);
        const decoded = decodeToken(token);

        expect(decoded.iss).toBe('testanchor.stellar.org');
        expect(decoded.sub).toBe('GABC123');
        expect(decoded.iat).toBe(1000);
        expect(decoded.exp).toBe(2000);
        expect(decoded.jti).toBe('tx-id');
    });

    it('throws on invalid token format', () => {
        expect(() => decodeToken('not-a-jwt')).toThrow('Invalid JWT token format');
        expect(() => decodeToken('only.two')).toThrow('Invalid JWT token format');
    });
});

describe('isTokenExpired', () => {
    it('returns true for expired token', () => {
        const pastExp = Math.floor(Date.now() / 1000) - 3600;
        const token = makeJwt({ exp: pastExp, iss: '', sub: '', iat: 0, jti: '' });
        expect(isTokenExpired(token)).toBe(true);
    });

    it('returns false for valid token', () => {
        const futureExp = Math.floor(Date.now() / 1000) + 3600;
        const token = makeJwt({ exp: futureExp, iss: '', sub: '', iat: 0, jti: '' });
        expect(isTokenExpired(token)).toBe(false);
    });

    it('respects bufferSeconds', () => {
        const exp = Math.floor(Date.now() / 1000) + 30;
        const token = makeJwt({ exp, iss: '', sub: '', iat: 0, jti: '' });

        // Default buffer is 60s, so 30s remaining should be expired
        expect(isTokenExpired(token)).toBe(true);
        // With 0 buffer, 30s remaining should be valid
        expect(isTokenExpired(token, 0)).toBe(false);
    });

    it('returns true for malformed token', () => {
        expect(isTokenExpired('garbage')).toBe(true);
    });
});

describe('createAuthHeaders', () => {
    it('returns Bearer authorization header', () => {
        const headers = createAuthHeaders('my-jwt-token');
        expect(headers).toEqual({ Authorization: 'Bearer my-jwt-token' });
    });
});

describe('validateChallenge', () => {
    const networkPassphrase = StellarSdk.Networks.TESTNET;
    const serverKeypair = StellarSdk.Keypair.random();
    const userKeypair = StellarSdk.Keypair.random();
    const homeDomain = 'testanchor.stellar.org';

    function buildChallenge(overrides?: {
        source?: string;
        sequence?: string;
        opType?: string;
        opName?: string;
        opSource?: string;
        maxTime?: number;
        noOps?: boolean;
    }): string {
        const source = overrides?.source ?? serverKeypair.publicKey();
        const account = new StellarSdk.Account(source, overrides?.sequence ?? '-1');

        const builder = new StellarSdk.TransactionBuilder(account, {
            fee: '100',
            networkPassphrase,
            timebounds: {
                minTime: 0,
                maxTime: overrides?.maxTime ?? Math.floor(Date.now() / 1000) + 900,
            },
        });

        if (!overrides?.noOps) {
            if (overrides?.opType === 'payment') {
                builder.addOperation(
                    StellarSdk.Operation.payment({
                        destination: userKeypair.publicKey(),
                        asset: StellarSdk.Asset.native(),
                        amount: '1',
                    }),
                );
            } else {
                builder.addOperation(
                    StellarSdk.Operation.manageData({
                        name: overrides?.opName ?? `${homeDomain} auth`,
                        value: 'challenge',
                        source: overrides?.opSource ?? userKeypair.publicKey(),
                    }),
                );
            }
        }

        const tx = builder.build();
        return tx.toXDR();
    }

    it('validates a correct challenge', () => {
        const xdr = buildChallenge();
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('rejects wrong source account', () => {
        const wrongKey = StellarSdk.Keypair.random().publicKey();
        const xdr = buildChallenge({ source: wrongKey });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('does not match server signing key');
    });

    it('rejects non-zero sequence number', () => {
        const xdr = buildChallenge({ sequence: '1' });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('sequence number must be 0');
    });

    it('rejects wrong operation type', () => {
        const xdr = buildChallenge({ opType: 'payment' });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be manage_data');
    });

    it('rejects wrong manage_data name', () => {
        const xdr = buildChallenge({ opName: 'wrong.domain auth' });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('does not match expected');
    });

    it('rejects wrong operation source', () => {
        const wrongUser = StellarSdk.Keypair.random().publicKey();
        const xdr = buildChallenge({ opSource: wrongUser });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('does not match user account');
    });

    it('rejects expired timebounds', () => {
        const xdr = buildChallenge({ maxTime: Math.floor(Date.now() / 1000) - 100 });
        const result = validateChallenge(
            xdr,
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('expired');
    });

    it('returns invalid for unparseable XDR', () => {
        const result = validateChallenge(
            'not-valid-xdr',
            serverKeypair.publicKey(),
            networkPassphrase,
            homeDomain,
            userKeypair.publicKey(),
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Failed to parse');
    });
});
