import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';

// getBlendConfig reads runtime env vars from $app/env/private at call time.
// Mock the module with a mutable object the tests populate per case. Unset
// runtime vars arrive as '' (see src/env.ts), so every key starts empty.
const env = vi.hoisted(() => ({
    BLEND_EMITTER_ADDRESS: '',
    BLEND_BACKSTOP_ADDRESS: '',
    BLEND_POOL_ADDRESS: '',
    BLEND_ORACLE_ADDRESS: '',
    BLEND_ADMIN_SECRET: '',
}));
vi.mock('$app/env/private', () => env);
import { getBlendConfig } from '#lib/server/blend/config.ts';

const REQUIRED = {
    BLEND_EMITTER_ADDRESS: 'CEMITTER',
    BLEND_BACKSTOP_ADDRESS: 'CBACKSTOP',
    BLEND_POOL_ADDRESS: 'CPOOL',
    BLEND_ORACLE_ADDRESS: 'CORACLE',
    BLEND_ADMIN_SECRET: 'SADMIN',
};

beforeEach(() => {
    // reset the mocked env between cases
    for (const key of Object.keys(env)) env[key as keyof typeof env] = '';
});

describe('getBlendConfig', () => {
    it('returns a fully-populated config when all env vars are set', () => {
        Object.assign(env, REQUIRED);

        const config = getBlendConfig();

        expect(config).toEqual({
            rpcUrl: 'https://soroban-testnet.stellar.org',
            networkPassphrase: Networks.TESTNET,
            emitterAddress: 'CEMITTER',
            backstopAddress: 'CBACKSTOP',
            poolAddress: 'CPOOL',
            oracleAddress: 'CORACLE',
            adminSecret: 'SADMIN',
        });
    });

    it('throws listing every missing var when none are set', () => {
        expect(() => getBlendConfig()).toThrowError(
            'Missing Blend maintenance env vars: emitterAddress, backstopAddress, poolAddress, oracleAddress, adminSecret',
        );
    });

    it('throws naming only the missing var', () => {
        Object.assign(env, REQUIRED);
        env.BLEND_ADMIN_SECRET = '';

        expect(() => getBlendConfig()).toThrowError(
            'Missing Blend maintenance env vars: adminSecret',
        );
    });

    it('treats an empty-string var as missing', () => {
        Object.assign(env, REQUIRED, { BLEND_POOL_ADDRESS: '' });

        expect(() => getBlendConfig()).toThrowError(
            'Missing Blend maintenance env vars: poolAddress',
        );
    });
});
