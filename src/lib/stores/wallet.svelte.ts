/**
 * Wallet connection state store using Svelte 5 runes
 */

import { browser } from '$app/environment';
import type { StellarNetwork } from '$lib/wallet/types';
import {
    isFreighterInstalled,
    connectFreighter,
    getPublicKey,
    getFreighterNetwork,
} from '$lib/wallet/freighter';

interface WalletState {
    publicKey: string | null;
    network: StellarNetwork;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

function createWalletStore() {
    const state = $state<WalletState>({
        publicKey: null,
        network: 'testnet',
        isConnected: false,
        isConnecting: false,
        error: null,
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
        if (!browser) return;

        state.isConnecting = true;
        state.error = null;

        try {
            const pk = await connectFreighter();
            const network = await getFreighterNetwork();

            state.publicKey = pk;
            state.network = network;
            state.isConnected = true;
        } catch (err) {
            state.error = err instanceof Error ? err.message : 'Failed to connect wallet';
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
    }

    function clearError() {
        state.error = null;
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
