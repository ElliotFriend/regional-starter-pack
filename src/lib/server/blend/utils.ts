import {
    Contract,
    Keypair,
    TransactionBuilder,
    Account,
    BASE_FEE,
    Networks,
    nativeToScVal,
    Transaction,
    TimeoutInfinite,
    rpc,
    scValToNative,
} from '@stellar/stellar-sdk';

/**
 * Query the Etherfuse sandbox API for the current USD price of a stablebond
 * @param tokenAddress stablebond to lookup (i think it's the Solana address?)
 * @returns the `bond_cost_in_usd` reported by etherfuse. returned as an integer, which is meant to express 7 digits of decimal precision
 */
export async function getEtherfusePrice(
    tokenAddress: string = 'AvvetPGuuB5FD5m86fpw3LtDKyQoUFT1mG9WarNQLW4q',
): Promise<number> {
    const res = await fetch(`https://api.sand.etherfuse.com/lookup/bonds/cost/${tokenAddress}`);

    if (!res.ok) {
        throw new Error(`Failed to fetch stablebond price from Etherfuse: ${tokenAddress}`);
    }

    const json = await res.json();

    const price: string | undefined = json.bond_cost_in_usd;
    if (!price) {
        throw new Error(`Undefined price fetched from Etherfuse: ${tokenAddress}`);
    }

    return Math.trunc(parseFloat(price) * 1e7);
}

/**
 * Get the Reflector price for a token
 * @param tokenSymbol short symbol of the token to get pricing for (e.g., XLM, USDC, etc.)
 * @returns price in USD of the token. returned as an integer, which is meant to express 7 digits of decimal precision
 */
export async function getReflectorPrice(tokenSymbol: string = 'XLM'): Promise<number> {
    // Use the external CEX and DEX testnet contract
    const reflectorOracle = new Contract(
        'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63',
    );

    // begin a transaction that will be used to simulate
    const tx = new TransactionBuilder(
        new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '1'),
        {
            fee: BASE_FEE,
            networkPassphrase: Networks.TESTNET,
        },
    )
        .addOperation(
            reflectorOracle.call(
                'lastprice',
                nativeToScVal([
                    nativeToScVal('Other', { type: 'symbol' }),
                    nativeToScVal(tokenSymbol, { type: 'symbol' }),
                ]),
            ),
        )
        .setTimeout(TimeoutInfinite)
        .build();

    const server = new rpc.Server('https://soroban-testnet.stellar.org');
    const sim = await server.simulateTransaction(tx);

    if (!rpc.Api.isSimulationSuccess(sim)) {
        throw new Error(`Failed to simulate reflector transaction: ${sim.error}`);
    }

    if (!sim.result?.retval) {
        throw new Error(`Reflector returned no price: ${sim.result ?? 'no result'}`);
    }

    const { price }: { price: bigint } = scValToNative(sim.result.retval);

    // do some math to normalize to 7 decimals of precision, and return as bigint
    return Math.trunc(Number(price) * (1 / 1e14) * 1e7);
}

/**
 * Simulate, prepare, sign and submit transaction, returning the result of the
 * smart contract operation
 * @param server RPC server
 * @param tx transaction including a smart contract operation
 * @param kp keypair to sign with
 */
export async function prepSignAndSend<T>(
    server: rpc.Server,
    tx: Transaction,
    kp: Keypair,
): Promise<{ return: T | undefined; hash: string }> {
    // prepare and sign the transaction
    const prepped = await server.prepareTransaction(tx);
    prepped.sign(kp);

    // send the transaction and wait for response
    const { hash } = await server.sendTransaction(prepped);
    const pollRes = await server.pollTransaction(hash);

    if (pollRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Error submitting transaction ${pollRes.txHash}: ${pollRes.status}`);
    }

    const { returnValue } = pollRes;
    return {
        return: returnValue ? (scValToNative(returnValue) as T) : undefined,
        hash: pollRes.txHash,
    };
}
