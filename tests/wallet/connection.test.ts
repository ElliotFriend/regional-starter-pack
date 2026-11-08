import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
    isConnected: vi.fn(),
    isAllowed: vi.fn(),
    requestAccess: vi.fn(),
    getAddress: vi.fn(),
    getNetwork: vi.fn(),
    signTransaction: vi.fn(),
}));
vi.mock('@stellar/varial-sdk', () => ({ default: sdk }));

import { connectFreighter } from '#lib/wallet/freighter.ts';

describe('Varial connection', () => {
    beforeEach(() => vi.resetAllMocks());

    it('offers installation recovery without requesting access when unavailable', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: false });
        await expect(connectFreighter()).rejects.toMatchObject({
            code: 'NOT_INSTALLED',
            message: 'Install or enable Varial in this browser, then retry.',
        });
        expect(sdk.requestAccess).not.toHaveBeenCalled();
    });

    it('connects after installation using the address returned by the access prompt', async () => {
        sdk.isConnected.mockResolvedValueOnce({ isConnected: false });
        await expect(connectFreighter()).rejects.toMatchObject({ code: 'NOT_INSTALLED' });
        sdk.isConnected.mockResolvedValue({ isConnected: true });
        sdk.requestAccess.mockResolvedValue({ address: 'G_TEST_ACCOUNT' });
        await expect(connectFreighter()).resolves.toBe('G_TEST_ACCOUNT');
        expect(sdk.requestAccess).toHaveBeenCalledTimes(1);
        expect(sdk.isAllowed).not.toHaveBeenCalled();
        expect(sdk.getAddress).not.toHaveBeenCalled();
    });

    it('preserves a declined connection as an error', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: true });
        sdk.requestAccess.mockResolvedValue({ address: '', error: { message: 'User declined' } });
        await expect(connectFreighter()).rejects.toMatchObject({ code: 'CONNECTION_REJECTED' });
    });

    it('does not treat an empty account response as a connection', async () => {
        sdk.isConnected.mockResolvedValue({ isConnected: true });
        sdk.requestAccess.mockResolvedValue({ address: '' });
        await expect(connectFreighter()).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
    });
});
