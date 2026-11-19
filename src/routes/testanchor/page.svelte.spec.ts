import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Networks } from '@stellar/stellar-sdk';
import Page from './+page.svelte';
import type { TestAnchorPlaygroundClient } from '#lib/anchors/testanchor/playground.ts';
import type { Sep10SignerFn } from '#lib/anchors/sep/sep10.ts';
import { WalletError } from '#lib/wallet/types.ts';

const PUBLIC_KEY = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';

// Wallet starts disconnected; the auth tests connect it.
const wallet = vi.hoisted(() => ({
    isConnected: false,
    publicKey: null as string | null,
    network: 'testnet',
}));
vi.mock('#lib/stores/wallet.svelte.ts', () => ({ walletStore: wallet }));

const varial = vi.hoisted(() => ({ signWithVarial: vi.fn() }));
vi.mock('#lib/wallet/varial.ts', () => varial);

// Minimal mock of the testanchor playground client — just enough for
// the component to render without errors, plus a SEP-10 `authenticate`
// the auth tests can drive. Transfers are not tested here. Cast through
// `unknown` because the real TestAnchorPlaygroundClient has many additional
// methods we don't exercise.
const authenticate = vi.fn(async (_account: string, _signer: Sep10SignerFn) => '');
const mockClient = {
    initialize: async () => ({}),
    authenticate,
    getToken: () => null,
    sep6: { getInfo: async () => null },
    sep24: { getInfo: async () => null },
    sep38: { getInfo: async () => null },
} as unknown as TestAnchorPlaygroundClient;

const mockData = {
    regions: [],
    anchors: [],
    client: mockClient,
    tomlInfo: {
        sep10: 'https://testanchor.stellar.org/auth',
        sep6: 'https://testanchor.stellar.org/sep6',
        sep12: 'https://testanchor.stellar.org/sep12',
        sep24: 'https://testanchor.stellar.org/sep24',
        sep31: 'https://testanchor.stellar.org/sep31',
        sep38: 'https://testanchor.stellar.org/sep38',
        signingKey: 'GCTEST...',
        currencies: [
            { code: 'SRT', issuer: 'GTEST...' },
            { code: 'USDC', issuer: 'GTEST2...' },
        ],
    },
    // The page treats these as opaque pending/resolved promises in the
    // rendering paths exercised here; cast through unknown so the mock
    // doesn't have to fabricate full Sep6Info / Sep24Info / Sep38Info shapes.
    sep6Info: Promise.resolve(null) as unknown as ReturnType<typeof mockClient.sep6.getInfo>,
    sep24Info: Promise.resolve(null) as unknown as ReturnType<typeof mockClient.sep24.getInfo>,
    sep38Info: Promise.resolve(null) as unknown as ReturnType<typeof mockClient.sep38.getInfo>,
};

const props = {
    data: mockData,
    params: {},
    form: null,
};

describe('/testanchor/+page.svelte', () => {
    it('renders the page heading', async () => {
        render(Page, props);

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Test Anchor');
    });

    it('renders the step sections', async () => {
        render(Page, props);

        await expect.element(page.getByRole('heading', { name: /Initialize/ })).toBeInTheDocument();
        await expect
            .element(page.getByRole('heading', { name: /Authenticate/ }))
            .toBeInTheDocument();
        await expect
            .element(page.getByRole('heading', { name: /Deposit \/ Withdraw/ }))
            .toBeInTheDocument();
        await expect
            .element(page.getByRole('heading', { name: /Explore SEP Info/ }))
            .toBeInTheDocument();
    });

    it('shows initialized state with discovered endpoints', async () => {
        render(Page, props);

        await expect.element(page.getByText('Initialized successfully')).toBeInTheDocument();
        await expect
            .element(page.getByText('https://testanchor.stellar.org/sep24'))
            .toBeInTheDocument();
    });

    it('shows supported asset badges', async () => {
        render(Page, props);

        // Use exact match to target the badge elements, not the prose list
        await expect.element(page.getByText('SRT', { exact: true }).first()).toBeInTheDocument();
        await expect.element(page.getByText('USDC', { exact: true }).first()).toBeInTheDocument();
    });

    it('renders the About section', async () => {
        render(Page, props);

        await expect
            .element(page.getByRole('heading', { name: /About the Test Anchor/ }))
            .toBeInTheDocument();
    });
});

describe('/testanchor/+page.svelte SEP-10 authentication', () => {
    beforeEach(() => {
        wallet.isConnected = true;
        wallet.publicKey = PUBLIC_KEY;
        varial.signWithVarial.mockReset();
        // Drive the signer the way the real client does: hand it the challenge.
        authenticate.mockReset().mockImplementation(async (_account, signer) => {
            await signer('CHALLENGE_XDR', Networks.TESTNET);
            return 'JWT';
        });
    });

    it('signs the challenge through signWithVarial on testnet', async () => {
        varial.signWithVarial.mockResolvedValue({
            signedXdr: 'SIGNED_XDR',
            networkPassphrase: Networks.TESTNET,
        });
        let returnedToClient: string | undefined;
        authenticate.mockImplementation(async (_account, signer) => {
            returnedToClient = await signer('CHALLENGE_XDR', Networks.TESTNET);
            return 'JWT';
        });
        render(Page, props);

        await page.getByRole('button', { name: 'Authenticate with Varial' }).click();

        await expect.element(page.getByText(/Authenticated as/)).toBeInTheDocument();
        expect(authenticate).toHaveBeenCalledWith(PUBLIC_KEY, expect.any(Function));
        expect(varial.signWithVarial).toHaveBeenCalledWith('CHALLENGE_XDR', 'testnet');
        expect(returnedToClient).toBe('SIGNED_XDR');
    });

    it('shows the rejection and stays unauthenticated when the user declines', async () => {
        varial.signWithVarial.mockRejectedValue(
            new WalletError('User rejected the transaction', 'SIGNING_REJECTED'),
        );
        render(Page, props);

        await page.getByRole('button', { name: 'Authenticate with Varial' }).click();

        await expect.element(page.getByText('User rejected the transaction')).toBeInTheDocument();
        await expect
            .element(page.getByRole('button', { name: 'Authenticate with Varial' }))
            .toBeInTheDocument();
        expect(page.getByText(/Authenticated as/).query()).toBeNull();
    });
});
