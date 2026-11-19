import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store only talks to the wallet in the browser.
vi.mock('$app/env', () => ({ browser: true }));

const sdk = vi.hoisted(() => ({
    isConnected: vi.fn(),
    isAllowed: vi.fn(),
    setAllowed: vi.fn(),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetwork: vi.fn(),
    signTransaction: vi.fn(),
    disconnect: vi.fn(),
}));
vi.mock('@stellar/varial-sdk', () => ({ default: sdk }));

const ADDRESS = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';

function walletAllowed() {
    sdk.isConnected.mockResolvedValue({ isConnected: true });
    sdk.isAllowed.mockResolvedValue({ isAllowed: true });
    sdk.requestAccess.mockResolvedValue({ address: ADDRESS });
    sdk.getAddress.mockResolvedValue({ address: ADDRESS });
    sdk.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: '' });
    sdk.disconnect.mockResolvedValue({});
}

/**
 * Fresh store singleton per test: the store checks the connection when its
 * module loads, so re-import after the SDK mocks are primed.
 */
async function loadStores() {
    vi.resetModules();
    const { walletStore } = await import('#lib/stores/wallet.svelte.ts');
    const { authStore } = await import('#lib/stores/auth.ts');
    await walletStore.checkConnection();
    return { walletStore, authStore };
}

beforeEach(() => {
    vi.resetAllMocks();
    walletAllowed();
});

describe('walletStore connection', () => {
    it('restores an already-allowed wallet on load', async () => {
        const { walletStore } = await loadStores();

        expect(walletStore.isConnected).toBe(true);
        expect(walletStore.publicKey).toBe(ADDRESS);
        expect(walletStore.network).toBe('testnet');
    });

    it('stays disconnected on load when the site is not allowed', async () => {
        sdk.isAllowed.mockResolvedValue({ isAllowed: false });
        const { walletStore } = await loadStores();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.publicKey).toBeNull();
    });

    it('records the error when connecting fails', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: false });
        const { walletStore } = await loadStores();

        await walletStore.connect();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.error).toMatch(/not installed/);
    });
});

describe('walletStore.disconnect', () => {
    it("revokes the site's access in the wallet", async () => {
        const { walletStore } = await loadStores();

        await walletStore.disconnect();

        expect(sdk.disconnect).toHaveBeenCalledOnce();
    });

    it('clears the local session', async () => {
        const { walletStore } = await loadStores();

        await walletStore.disconnect();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.publicKey).toBeNull();
        expect(walletStore.error).toBeNull();
    });

    it('still clears the local session when the wallet reports an error', async () => {
        sdk.disconnect.mockResolvedValue({ error: { code: -1, message: 'internal' } });
        const { walletStore } = await loadStores();

        await walletStore.disconnect();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.publicKey).toBeNull();
    });

    it("still clears the local session when the wallet doesn't support disconnect", async () => {
        sdk.disconnect.mockRejectedValue(new Error('unsupported message type'));
        const { walletStore } = await loadStores();

        await walletStore.disconnect();

        expect(walletStore.isConnected).toBe(false);
        expect(walletStore.publicKey).toBeNull();
    });

    it('drops cached in-memory SEP-10 tokens', async () => {
        const { walletStore, authStore } = await loadStores();
        const clear = vi.spyOn(authStore, 'clear');

        await walletStore.disconnect();

        expect(clear).toHaveBeenCalledOnce();
    });
});
