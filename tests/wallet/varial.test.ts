import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';

// varial.ts destructures the SDK's default export at import time (the package is a
// UMD/CommonJS bundle, so Node SSR can't see named exports). Mock the default.
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

import * as varial from '#lib/wallet/varial.ts';
import { WalletError } from '#lib/wallet/types.ts';

const ADDRESS = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
// The SDK reports failures as `{ error: { code, message } }`, not strings.
const declined = { code: -4, message: 'User declined access' };
const internal = { code: -1, message: 'The wallet encountered an internal error.' };

function installed(isAllowed = true) {
    sdk.isConnected.mockResolvedValue({ isConnected: true });
    sdk.isAllowed.mockResolvedValue({ isAllowed });
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('isVarialInstalled', () => {
    it('returns the SDK isConnected flag', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: true });
        expect(await varial.isVarialInstalled()).toBe(true);

        sdk.isConnected.mockResolvedValue({ isConnected: false });
        expect(await varial.isVarialInstalled()).toBe(false);
    });

    it('returns false when the SDK throws', async () => {
        sdk.isConnected.mockRejectedValue(new Error('boom'));
        expect(await varial.isVarialInstalled()).toBe(false);
    });
});

describe('connectVarial', () => {
    it('throws NOT_INSTALLED when the extension is missing', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: false });
        await expect(varial.connectVarial()).rejects.toMatchObject({ code: 'NOT_INSTALLED' });
    });

    it('returns the address without prompting setAllowed when already allowed', async () => {
        installed(true);
        sdk.requestAccess.mockResolvedValue({ address: ADDRESS });
        sdk.getAddress.mockResolvedValue({ address: ADDRESS });

        expect(await varial.connectVarial()).toBe(ADDRESS);
        expect(sdk.setAllowed).not.toHaveBeenCalled();
    });

    it('prompts setAllowed when the site is not yet allowed', async () => {
        installed(false);
        sdk.setAllowed.mockResolvedValue({ isAllowed: true });
        sdk.requestAccess.mockResolvedValue({ address: ADDRESS });
        sdk.getAddress.mockResolvedValue({ address: ADDRESS });

        expect(await varial.connectVarial()).toBe(ADDRESS);
        expect(sdk.setAllowed).toHaveBeenCalledOnce();
    });

    it('throws CONNECTION_REJECTED when the user declines setAllowed', async () => {
        installed(false);
        sdk.setAllowed.mockResolvedValue({ isAllowed: false, error: declined });
        await expect(varial.connectVarial()).rejects.toMatchObject({
            code: 'CONNECTION_REJECTED',
        });
    });

    it('throws CONNECTION_REJECTED when the user declines requestAccess', async () => {
        installed(true);
        sdk.requestAccess.mockResolvedValue({ address: '', error: declined });
        await expect(varial.connectVarial()).rejects.toMatchObject({
            code: 'CONNECTION_REJECTED',
        });
    });

    it('throws NO_ACCOUNT when no address comes back', async () => {
        installed(true);
        sdk.requestAccess.mockResolvedValue({ address: ADDRESS });
        sdk.getAddress.mockResolvedValue({ address: '' });
        await expect(varial.connectVarial()).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
    });
});

describe('getPublicKey', () => {
    it('returns null without reading the address when the site is not allowed', async () => {
        installed(false);
        expect(await varial.getPublicKey()).toBeNull();
        expect(sdk.getAddress).not.toHaveBeenCalled();
    });

    it('returns the address when allowed', async () => {
        installed(true);
        sdk.getAddress.mockResolvedValue({ address: ADDRESS });
        expect(await varial.getPublicKey()).toBe(ADDRESS);
    });

    it('returns null when getAddress reports an error', async () => {
        installed(true);
        sdk.getAddress.mockResolvedValue({ address: '', error: internal });
        expect(await varial.getPublicKey()).toBeNull();
    });
});

describe('getVarialNetwork', () => {
    it('maps TESTNET to testnet and anything else to public', async () => {
        sdk.getNetwork.mockResolvedValue({ network: 'TESTNET', networkPassphrase: '' });
        expect(await varial.getVarialNetwork()).toBe('testnet');

        sdk.getNetwork.mockResolvedValue({ network: 'PUBLIC', networkPassphrase: '' });
        expect(await varial.getVarialNetwork()).toBe('public');
    });

    it('throws when the SDK reports an error', async () => {
        sdk.getNetwork.mockResolvedValue({ network: '', networkPassphrase: '', error: internal });
        await expect(varial.getVarialNetwork()).rejects.toBeInstanceOf(WalletError);
    });
});

describe('signWithVarial', () => {
    it('signs with the passphrase for the requested network', async () => {
        installed();
        sdk.signTransaction.mockResolvedValue({ signedTxXdr: 'SIGNED', signerAddress: ADDRESS });

        const result = await varial.signWithVarial('XDR', 'testnet');

        expect(sdk.signTransaction).toHaveBeenCalledWith('XDR', {
            networkPassphrase: Networks.TESTNET,
        });
        expect(result).toEqual({ signedXdr: 'SIGNED', networkPassphrase: Networks.TESTNET });
    });

    it('throws NOT_INSTALLED when the extension is missing', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: false });
        await expect(varial.signWithVarial('XDR', 'testnet')).rejects.toMatchObject({
            code: 'NOT_INSTALLED',
        });
    });

    it('throws SIGNING_REJECTED when the user declines', async () => {
        installed();
        sdk.signTransaction.mockResolvedValue({
            signedTxXdr: '',
            signerAddress: '',
            error: declined,
        });
        await expect(varial.signWithVarial('XDR', 'testnet')).rejects.toMatchObject({
            name: 'WalletError',
            code: 'SIGNING_REJECTED',
        });
    });

    it("includes the SDK error's message for other failures", async () => {
        installed();
        sdk.signTransaction.mockResolvedValue({
            signedTxXdr: '',
            signerAddress: '',
            error: internal,
        });
        await expect(varial.signWithVarial('XDR', 'testnet')).rejects.toMatchObject({
            name: 'WalletError',
            code: 'UNKNOWN',
            message: `Failed to sign transaction: ${internal.message}`,
        });
    });
});

describe('disconnectVarial', () => {
    it("revokes the site's access via the SDK", async () => {
        installed();
        sdk.disconnect.mockResolvedValue({});

        await varial.disconnectVarial();

        expect(sdk.disconnect).toHaveBeenCalledOnce();
    });

    it('is a no-op when the extension is missing', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: false });

        await expect(varial.disconnectVarial()).resolves.toBeUndefined();
        expect(sdk.disconnect).not.toHaveBeenCalled();
    });

    it("throws a WalletError carrying the SDK error's message", async () => {
        installed();
        sdk.disconnect.mockResolvedValue({ error: internal });

        await expect(varial.disconnectVarial()).rejects.toMatchObject({
            name: 'WalletError',
            code: 'UNKNOWN',
            message: `Failed to disconnect: ${internal.message}`,
        });
    });
});
