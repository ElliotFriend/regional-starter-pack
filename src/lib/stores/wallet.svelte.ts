/**
 * Wallet connection state store using Svelte 5 runes
 */

import { browser } from '$app/env';
import type { StellarNetwork } from '#lib/wallet/types.ts';
import {
    isVarialInstalled,
    connectVarial,
    getPublicKey,
    getVarialNetwork,
    disconnectVarial,
} from '#lib/wallet/varial.ts';
import { authStore } from '#lib/stores/auth.ts';

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

        const installed = await isVarialInstalled();
        if (!installed) return;

        const pk = await getPublicKey();
        if (pk) {
            const network = await getVarialNetwork();
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
            const pk = await connectVarial();
            const network = await getVarialNetwork();

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

    async function disconnect() {
        try {
            await disconnectVarial();
        } catch {
            // Older extension version may not support disconnect; still clear locally.
        }

        state.publicKey = null;
        state.isConnected = false;
        state.error = null;
        authStore.clear();
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
