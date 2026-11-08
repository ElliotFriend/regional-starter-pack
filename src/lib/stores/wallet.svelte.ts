/**
 * Wallet connection state store using Svelte 5 runes
 */

import { browser } from '$app/env';
import { WalletError, type WalletErrorCode, type StellarNetwork } from '#lib/wallet/types.ts';
import {
    isFreighterInstalled,
    connectFreighter,
    getPublicKey,
    getFreighterNetwork,
} from '#lib/wallet/freighter.ts';

interface WalletState {
    publicKey: string | null;
    network: StellarNetwork;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    errorCode: WalletErrorCode | null;
}

function createWalletStore() {
    const state = $state<WalletState>({
        publicKey: null,
        network: 'testnet',
        isConnected: false,
        isConnecting: false,
        error: null,
        errorCode: null,
    });

    async function checkConnection() {
        if (!browser) return;

        const installed = await isFreighterInstalled();
        if (!installed) return;

        const pk = await getPublicKey();
        if (pk) {
            const network = await getFreighterNetwork();
            state.publicKey = pk;
            state.network = network;
            state.isConnected = true;
        }
    }

    async function connect() {
        if (!browser || state.isConnecting) return;

        state.isConnecting = true;
        state.error = null;
        state.errorCode = null;

        try {
            const pk = await connectFreighter();
            const network = await getFreighterNetwork();

            state.publicKey = pk;
            state.network = network;
            state.isConnected = true;
        } catch (err) {
            state.error = err instanceof Error ? err.message : 'Failed to connect wallet';
            state.errorCode = err instanceof WalletError ? err.code : 'UNKNOWN';
            state.isConnected = false;
            state.publicKey = null;
        } finally {
            state.isConnecting = false;
        }
    }

    function disconnect() {
        state.publicKey = null;
        state.isConnected = false;
        state.error = null;
        state.errorCode = null;
    }

    function clearError() {
        state.error = null;
        state.errorCode = null;
    }

    // Check connection on init (client-side only)
    if (browser) {
        checkConnection();
    }

    return {
        get publicKey() {
            return state.publicKey;
        },
        get network() {
            return state.network;
        },
        get isConnected() {
            return state.isConnected;
        },
        get isConnecting() {
            return state.isConnecting;
        },
        get error() {
            return state.error;
        },
        get errorCode() {
            return state.errorCode;
        },
        get truncatedAddress() {
            if (!state.publicKey) return null;
            return `${state.publicKey.slice(0, 4)}...${state.publicKey.slice(-4)}`;
        },
        connect,
        disconnect,
        clearError,
        checkConnection,
    };
}

export const walletStore = createWalletStore();
