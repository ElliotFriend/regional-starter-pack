/**
 * Blend pool maintenance configuration (server-side only).
 *
 * Reads the values the maintenance tasks need to build and submit Soroban
 * contract invocations with `@stellar/stellar-sdk` — no Blend SDK required.
 * Uses `$env/dynamic/private` (read at runtime) rather than `$env/static/private`
 * so the app still builds locally when these aren't set; they live in the Vercel
 * project's environment variables in production.
 *
 * Rename/trim these to match how you construct the invocation args.
 */

import { env } from '$env/dynamic/private';
import { Networks } from '@stellar/stellar-sdk';

export interface BlendMaintenanceConfig {
    /** Soroban RPC endpoint (e.g. https://soroban-testnet.stellar.org). */
    rpcUrl: string;
    /** Network passphrase the transactions are signed for. */
    networkPassphrase: string;
    /** Blend emitter contract address. */
    emitterAddress: string;
    /** Blend backstop contract address. */
    backstopAddress: string;
    /** Blend pool contract address. */
    poolAddress: string;
    /** Price-oracle contract address. */
    oracleAddress: string;
    /** Secret key (S...) of the account that signs the maintenance transactions. */
    adminSecret: string;
}

/**
 * Read and validate the Blend maintenance config from the environment.
 *
 * @throws {Error} If any required variable is missing — surfaced in the cron
 *   response so a misconfigured deployment fails loudly rather than silently.
 */
export function getBlendConfig(): BlendMaintenanceConfig {
    const config = {
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: Networks.TESTNET,
        emitterAddress: env.BLEND_EMITTER_ADDRESS,
        backstopAddress: env.BLEND_BACKSTOP_ADDRESS,
        poolAddress: env.BLEND_POOL_ADDRESS,
        oracleAddress: env.BLEND_ORACLE_ADDRESS,
        adminSecret: env.BLEND_ADMIN_SECRET,
    };

    const missing = Object.entries(config)
        .filter(([, value]) => !value)
        .map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Missing Blend maintenance env vars: ${missing.join(', ')}`);
    }

    return config as BlendMaintenanceConfig;
}
