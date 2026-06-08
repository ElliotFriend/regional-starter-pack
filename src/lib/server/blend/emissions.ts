/**
 * Blend pool emissions maintenance (server-side only).
 *
 * Invoked weekly by the `/api/cron/blend/emissions` cron route.
 */

import { getBlendConfig } from './config';
import { rpc, Contract, Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { prepSignAndSend } from './utils';

/** Summary returned to the cron caller (shows up in the response + Vercel logs). */
export interface GulpEmissionsResult {
    /** Hash of the submitted Stellar transaction. */
    transactionHash?: string;
    /** Amount of tokens gulped by pool */
    amount: bigint;
    /** Anything else worth logging (amounts gulped, reserves touched, etc.). */
    [key: string]: unknown;
}

export async function invokeDistribution(address: string): Promise<{ amount: bigint }> {
    console.log(`[Blend] Invoking distribute for contract: ${address}`);

    const config = getBlendConfig();
    const kp = Keypair.fromSecret(config.adminSecret);
    const contract = new Contract(address);
    const server = new rpc.Server(config.rpcUrl);
    const account = await server.getAccount(kp.publicKey());

    const tx = new TransactionBuilder(account, {
        fee: '1000',
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(contract.call('distribute'))
        .setTimeout(30)
        .build();

    const res = await prepSignAndSend<bigint>(server, tx, kp);

    if (res.return === undefined) {
        throw new Error(`[Blend] Invalid distribution. return undefined`);
    }

    return { amount: res.return };
}

/**
 * Gulp (claim/accrue) emissions for the Blend pool.
 *
 * Builds a `gulp_emissions` invocation against the pool contract, signs it with
 * the maintenance keypair, submits it, and returns the transaction hash plus the
 * amount gulped. Run after {@link invokeDistribution} has distributed emissions
 * on the emitter and backstop contracts.
 */
export async function gulpEmissions(): Promise<GulpEmissionsResult> {
    console.log(`[Blend] Gulping pool emissions`);

    const config = getBlendConfig();
    const server = new rpc.Server(config.rpcUrl);
    const poolContract = new Contract(config.poolAddress);
    const kp = Keypair.fromSecret(config.adminSecret);
    const account = await server.getAccount(kp.publicKey());

    const tx = new TransactionBuilder(account, {
        fee: '1000',
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(poolContract.call('gulp_emissions'))
        .setTimeout(30)
        .build();

    const res = await prepSignAndSend<bigint>(server, tx, kp);

    if (res.return === undefined) {
        throw new Error(`[Blend] invalid gulp. return undefined`);
    }

    return {
        transactionHash: res.hash,
        amount: res.return,
    };
}
