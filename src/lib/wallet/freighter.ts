/**
 * Varial wallet integration
 * Client-side only - wraps the Varial browser extension API
 */

import freighterApi from '@stellar/freighter-api';
import { WalletError, type StellarNetwork, type SignedTransaction } from './types';
import { getNetworkPassphrase } from './stellar';

const {
    isConnected,
    isAllowed,
    setAllowed,
    requestAccess,
    getAddress,
    getNetwork,
    signTransaction,
} = freighterApi;

/**
 * Check if Varial extension is installed
 */
export async function isFreighterInstalled(): Promise<boolean> {
    try {
        const result = await isConnected();
        return result.isConnected;
    } catch {
        return false;
    }
}

/**
 * Check if the app has been allowed by the user
 */
export async function isFreighterAllowed(): Promise<boolean> {
    try {
        const result = await isAllowed();
        return result.isAllowed;
    } catch {
        return false;
    }
}

/**
 * Request access to connect to Varial
 * Will open Varial popup if not already allowed
 */
export async function connectFreighter(): Promise<string> {
    const installed = await isFreighterInstalled();
    if (!installed) {
        throw new WalletError('Varial extension is not installed', 'NOT_INSTALLED');
    }

    // Check if already allowed
    const allowed = await isFreighterAllowed();
    if (!allowed) {
        // Request access
        const accessResult = await setAllowed();
        if (accessResult.error) {
            throw new WalletError('User rejected connection request', 'CONNECTION_REJECTED');
        }
    }

    // Request access to get the public key
    const accessResult = await requestAccess();
    if (accessResult.error) {
        throw new WalletError('User rejected connection request', 'CONNECTION_REJECTED');
    }

    // Get the address
    const addressResult = await getAddress();
    if (addressResult.error || !addressResult.address) {
        throw new WalletError('No account found in Varial', 'NO_ACCOUNT');
    }

    return addressResult.address;
}

/**
 * Get the currently connected public key
 */
export async function getPublicKey(): Promise<string | null> {
    try {
        const allowed = await isFreighterAllowed();
        if (!allowed) {
            return null;
        }

        const result = await getAddress();
        if (result.error || !result.address) {
            return null;
        }
        return result.address;
    } catch {
        return null;
    }
}

/**
 * Get the current network from Varial
 */
export async function getFreighterNetwork(): Promise<StellarNetwork> {
    const result = await getNetwork();
    if (result.error) {
        throw new WalletError('Failed to get network from Varial', 'UNKNOWN');
    }

    // Varial returns network names like "TESTNET" or "PUBLIC"
    const network = result.network?.toLowerCase();
    if (network === 'testnet') {
        return 'testnet';
    }
    return 'public';
}

/**
 * Sign a transaction using Varial
 * @param xdr - The XDR-encoded transaction to sign
 * @param network - The network for the transaction
 */
export async function signWithFreighter(
    xdr: string,
    network: StellarNetwork,
): Promise<SignedTransaction> {
    const installed = await isFreighterInstalled();
    if (!installed) {
        throw new WalletError('Varial extension is not installed', 'NOT_INSTALLED');
    }

    const networkPassphrase = getNetworkPassphrase(network);

    const result = await signTransaction(xdr, {
        networkPassphrase,
    });

    if (result.error) {
        if (result.error.includes('User declined')) {
            throw new WalletError('User rejected the transaction', 'SIGNING_REJECTED');
        }
        throw new WalletError(`Failed to sign transaction: ${result.error}`, 'UNKNOWN');
    }

    if (!result.signedTxXdr) {
        throw new WalletError('No signed transaction returned', 'UNKNOWN');
    }

    return {
        signedXdr: result.signedTxXdr,
        networkPassphrase,
    };
}
