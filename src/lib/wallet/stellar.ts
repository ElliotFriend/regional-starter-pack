/**
 * Stellar SDK utilities
 * Helpers for building and submitting transactions
 */

import {
    Horizon,
    TransactionBuilder,
    Networks,
    Operation,
    Asset,
    Memo,
} from '@stellar/stellar-sdk';
import type { StellarNetwork } from './types';

/**
 * Get Horizon server instance for the given network
 */
export function getHorizonServer(network: StellarNetwork): Horizon.Server {
    const url =
        network === 'testnet'
            ? 'https://horizon-testnet.stellar.org'
            : 'https://horizon.stellar.org';
    return new Horizon.Server(url);
}

/**
 * Get network passphrase
 */
export function getNetworkPassphrase(network: StellarNetwork): string {
    return network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
}

/**
 * USDC asset on Stellar
 * Uses the standard USDC issuer
 */
export function getUsdcAsset(issuer: string): Asset {
    return new Asset('USDC', issuer);
}

/**
 * Get a Stellar Asset by code and issuer
 */
export function getStellarAsset(code: string, issuer: string): Asset {
    return new Asset(code, issuer);
}

/**
 * Build a payment transaction
 */
export async function buildPaymentTransaction(options: {
    sourcePublicKey: string;
    destinationPublicKey: string;
    asset: Asset;
    amount: string;
    memo?: string;
    network: StellarNetwork;
}): Promise<string> {
    const { sourcePublicKey, destinationPublicKey, asset, amount, memo, network } = options;

    const server = getHorizonServer(network);
    const networkPassphrase = getNetworkPassphrase(network);

    // Load the source account
    const sourceAccount = await server.loadAccount(sourcePublicKey);

    // Build the transaction
    let builder = new TransactionBuilder(sourceAccount, {
        fee: '100000', // 0.01 XLM base fee (can be adjusted)
        networkPassphrase,
    })
        .addOperation(
            Operation.payment({
                destination: destinationPublicKey,
                asset,
                amount,
            }),
        )
        .setTimeout(300); // 5 minutes

    if (memo) {
        builder = builder.addMemo(Memo.text(memo));
    }

    const transaction = builder.build();

    return transaction.toXDR();
}

/**
 * Submit a signed transaction to the network
 */
export async function submitTransaction(
    signedXdr: string,
    network: StellarNetwork,
): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    const server = getHorizonServer(network);
    const networkPassphrase = getNetworkPassphrase(network);

    const transaction = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

    return server.submitTransaction(transaction);
}

/**
 * Check if an account exists and has a trustline for an asset
 */
export async function checkTrustline(
    publicKey: string,
    asset: Asset,
    network: StellarNetwork,
): Promise<{ exists: boolean; hasTrustline: boolean; balance: string }> {
    const server = getHorizonServer(network);

    try {
        const account = await server.loadAccount(publicKey);

        // Check for trustline
        const balance = account.balances.find((b) => {
            if (b.asset_type === 'native') return false;
            if ('asset_code' in b && 'asset_issuer' in b) {
                return b.asset_code === asset.code && b.asset_issuer === asset.issuer;
            }
            return false;
        });

        if (balance && 'balance' in balance) {
            return {
                exists: true,
                hasTrustline: true,
                balance: balance.balance,
            };
        }

        return {
            exists: true,
            hasTrustline: false,
            balance: '0',
        };
    } catch (error) {
        // Account doesn't exist
        if (error instanceof Error && error.message.includes('404')) {
            return {
                exists: false,
                hasTrustline: false,
                balance: '0',
            };
        }
        throw error;
    }
}

/**
 * Build a trustline transaction for an asset
 */
export async function buildTrustlineTransaction(options: {
    sourcePublicKey: string;
    asset: Asset;
    network: StellarNetwork;
}): Promise<string> {
    const { sourcePublicKey, asset, network } = options;

    const server = getHorizonServer(network);
    const networkPassphrase = getNetworkPassphrase(network);

    const sourceAccount = await server.loadAccount(sourcePublicKey);

    const transaction = new TransactionBuilder(sourceAccount, {
        fee: '100000',
        networkPassphrase,
    })
        .addOperation(
            Operation.changeTrust({
                asset,
            }),
        )
        .setTimeout(300)
        .build();

    return transaction.toXDR();
}

