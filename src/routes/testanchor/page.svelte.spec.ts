import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

// Minimal mock of the testanchor client — just enough for the component
// to render without errors. The interactive features (auth, transfers)
// are not tested here.
const mockClient = {
    initialize: async () => ({}),
    authenticate: async () => {},
    getToken: () => null,
    sep6: { getInfo: async () => null },
    sep24: { getInfo: async () => null },
    sep38: { getInfo: async () => null },
};

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
    sep6Info: Promise.resolve(null),
    sep24Info: Promise.resolve(null),
    sep38Info: Promise.resolve(null),
};

describe('/testanchor/+page.svelte', () => {
    it('renders the page heading', async () => {
        render(Page, { data: mockData });

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Test Anchor');
    });

    it('renders the step sections', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByRole('heading', { name: /Initialize/ })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: /Authenticate/ })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: /Deposit \/ Withdraw/ })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: /Explore SEP Info/ })).toBeInTheDocument();
    });

    it('shows initialized state with discovered endpoints', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByText('Initialized successfully')).toBeInTheDocument();
        await expect.element(page.getByText('https://testanchor.stellar.org/sep24')).toBeInTheDocument();
    });

    it('shows supported asset badges', async () => {
        render(Page, { data: mockData });

        // Use exact match to target the badge elements, not the prose list
        await expect.element(page.getByText('SRT', { exact: true }).first()).toBeInTheDocument();
        await expect.element(page.getByText('USDC', { exact: true }).first()).toBeInTheDocument();
    });

    it('renders the About section', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByRole('heading', { name: /About the Test Anchor/ })).toBeInTheDocument();
    });
});
