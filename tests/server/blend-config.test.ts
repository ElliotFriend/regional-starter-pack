import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';

// getBlendConfig reads from $env/dynamic/private at call time. Mock the module
// with a mutable `env` object the tests populate per-case.
vi.mock('$env/dynamic/private', () => ({ env: {} }));
import { env } from '$env/dynamic/private';
import { getBlendConfig } from '$lib/server/blend/config';

const REQUIRED = {
    BLEND_EMITTER_ADDRESS: 'CEMITTER',
    BLEND_BACKSTOP_ADDRESS: 'CBACKSTOP',
    BLEND_POOL_ADDRESS: 'CPOOL',
    BLEND_ORACLE_ADDRESS: 'CORACLE',
    BLEND_ADMIN_SECRET: 'SADMIN',
};

beforeEach(() => {
    // reset the mocked env between cases
    for (const key of Object.keys(env)) delete (env as Record<string, string>)[key];
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
        delete (env as Record<string, string>).BLEND_ADMIN_SECRET;

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
