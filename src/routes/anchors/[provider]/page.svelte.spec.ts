import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const mockData = {
    regions: [
        {
            id: 'mexico',
            name: 'Mexico',
            code: 'MX',
            currency: 'MXN',
            currencySymbol: '$',
            flag: '\u{1F1F2}\u{1F1FD}',
            description: 'Mexico crypto ecosystem.',
            paymentRails: [
                {
                    id: 'spei',
                    name: 'SPEI',
                    description: 'Mexican payments',
                    type: 'bank_transfer',
                },
            ],
            anchors: ['etherfuse'],
        },
    ],
    anchors: [],
    anchor: {
        id: 'etherfuse',
        name: 'Etherfuse',
        description: 'Bridges traditional finance and DeFi.',
        links: {
            website: 'https://www.etherfuse.com',
            documentation: 'https://docs.etherfuse.com',
        },
        regions: {
            mexico: {
                onRamp: true,
                offRamp: true,
                paymentRails: ['spei'],
                tokens: ['CETES'],
                kycRequired: true,
            },
        },
        integrationFlow: {
            onRamp: [
                { title: 'Create Customer', description: 'Register the user.' },
                { title: 'Get Quote', description: 'Request a conversion quote.' },
            ],
            offRamp: [
                { title: 'Create Customer + KYC', description: 'Register and verify.' },
                { title: 'Get Quote', description: 'Request a conversion quote.' },
            ],
        },
    },
    displayName: 'Etherfuse',
    capabilities: { kycFlow: 'iframe', sandbox: true },
    supportedTokens: [
        {
            symbol: 'CETES',
            name: 'CETES Token',
            description: 'Tokenized Mexican treasury bills',
            issuer: 'GB3ZSE...',
        },
    ],
    supportedRails: ['spei'],
    fiatCurrency: 'MXN',
    primaryToken: 'CETES',
};

describe('/anchors/[provider]/+page.svelte', () => {
    it('renders the anchor name as heading', async () => {
        render(Page, { data: mockData });

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Etherfuse');
    });

    it('renders anchor description', async () => {
        render(Page, { data: mockData });

        await expect
            .element(page.getByText('Bridges traditional finance and DeFi.'))
            .toBeInTheDocument();
    });

    it('renders external links', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByRole('link', { name: 'website' })).toBeInTheDocument();
        // 'documentation' matches both the header link and the DevBox link; target the exact one
        await expect
            .element(page.getByRole('link', { name: 'documentation', exact: true }))
            .toBeInTheDocument();
    });

    it('renders the Try section with on-ramp and off-ramp links', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByRole('link', { name: 'Try On-Ramp' })).toBeInTheDocument();
        await expect.element(page.getByRole('link', { name: 'Try Off-Ramp' })).toBeInTheDocument();
    });

    it('renders supported digital assets', async () => {
        render(Page, { data: mockData });

        await expect
            .element(page.getByRole('heading', { name: 'Supported Digital Assets' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'CETES' })).toBeInTheDocument();
    });

    it('renders the supported regions table', async () => {
        render(Page, { data: mockData });

        await expect
            .element(page.getByRole('heading', { name: 'Supported Regions' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('table')).toBeInTheDocument();
        await expect.element(page.getByText('Mexico')).toBeInTheDocument();
    });

    it('renders the integration flow section', async () => {
        render(Page, { data: mockData });

        await expect
            .element(page.getByRole('heading', { name: 'Integration Flow' }))
            .toBeInTheDocument();
        // 'Create Customer' also matches 'Create Customer + KYC'; use exact match
        await expect
            .element(page.getByText('Create Customer', { exact: true }))
            .toBeInTheDocument();
    });

    it('renders a back link to anchors', async () => {
        render(Page, { data: mockData });

        const backLink = page.getByRole('link', { name: /Back to Anchors/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
