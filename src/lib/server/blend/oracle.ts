/**
 * Blend pool price-oracle maintenance (server-side only).
 *
 * Invoked hourly by the `/api/cron/blend/oracle` cron route.
 */

import { Contract, Keypair, nativeToScVal, rpc, TransactionBuilder } from '@stellar/stellar-sdk';
import { getBlendConfig } from './config';
import { getEtherfusePrice, getReflectorPrice, prepSignAndSend } from './utils';

/** Summary returned to the cron caller (shows up in the response + Vercel logs). */
export interface OracleUpdateResult {
    /** Hash of the submitted Stellar transaction. */
    transactionHash?: string;
    /** Anything else worth logging (prices written, ledger, etc.). */
    [key: string]: unknown;
}

/**
 * Update the price oracle for the Blend pool.
 *
 * Fetches current prices (CETES + TESOURO from Etherfuse, XLM from Reflector),
 * builds a `set_price` invocation against the mock oracle contract, then signs
 * and submits it with the maintenance keypair. Returns the transaction hash and
 * the prices written for logging.
 */
export async function updateOracle(): Promise<OracleUpdateResult> {
    console.log('[Blend] Setting mock oracle prices');

    const config = getBlendConfig();
    const server = new rpc.Server(config.rpcUrl);
    const oracleContract = new Contract(config.oracleAddress);
    const kp = Keypair.fromSecret(config.adminSecret);

    const [etherfuseCetesPrice, etherfuseTesouroPrice, reflectorXlmPrice, account] =
        await Promise.all([
            getEtherfusePrice(),
            getEtherfusePrice('EyvBnTz9QDVc2oaBVeu77kndynmD5njrWjZghYh5xpUk'),
            getReflectorPrice(),
            server.getAccount(kp.publicKey()),
        ]);

    if (!etherfuseCetesPrice || !etherfuseTesouroPrice || !reflectorXlmPrice) {
        throw new Error(
            `[Blend] invalid pricing: cetes ${etherfuseCetesPrice}, tesouro ${etherfuseTesouroPrice}, xlm ${reflectorXlmPrice}`,
        );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const tx = new TransactionBuilder(account, {
        fee: '1000',
        networkPassphrase: config.networkPassphrase,
    })
        .addOperation(
            oracleContract.call(
                'set_price',
                nativeToScVal(
                    [
                        BigInt(1e7), // asset 0: USD
                        BigInt(reflectorXlmPrice), // asset 1: XLM
                        BigInt(etherfuseCetesPrice), // asset 2: CETES
                        BigInt(etherfuseTesouroPrice), // asset 3: TESOURO
                    ],
                    { type: 'i128' },
                ),
                nativeToScVal(timestamp, { type: 'u64' }),
            ),
        )
        .setTimeout(30)
        .build();

    const { hash } = await prepSignAndSend<void>(server, tx, kp);

    return {
        transactionHash: hash,
        timestamp,
        prices: {
            usd: 1,
            xlm: reflectorXlmPrice,
            cetes: etherfuseCetesPrice,
            tesouro: etherfuseTesouroPrice,
        },
    };
}
