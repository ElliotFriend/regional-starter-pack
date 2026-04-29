import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const mockData = {
    regions: [],
    anchors: [
        {
            id: 'etherfuse',
            name: 'Etherfuse',
            description: 'Bridges traditional finance and DeFi.',
            links: {
                website: 'https://etherfuse.com',
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
                brazil: {
                    onRamp: true,
                    offRamp: true,
                    paymentRails: ['pix'],
                    tokens: ['TESOURO'],
                    kycRequired: true,
                    comingSoon: true,
                },
            },
        },
    ],
};

const props = {
    data: mockData,
    params: {},
    form: null,
};

describe('/anchors/+page.svelte', () => {
    it('renders the page heading', async () => {
        render(Page, props);

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Curated Anchor Providers');
    });

    it('renders a card for Etherfuse', async () => {
        render(Page, props);

        await expect.element(page.getByRole('heading', { name: 'Etherfuse' })).toBeInTheDocument();
    });

    it('displays anchor description', async () => {
        render(Page, props);

        await expect
            .element(page.getByText('Bridges traditional finance and DeFi.'))
            .toBeInTheDocument();
    });

    it('renders View Details and Website links', async () => {
        render(Page, props);

        const detailLink = page.getByRole('link', { name: 'View Details' });
        await expect.element(detailLink).toBeInTheDocument();

        const websiteLink = page.getByRole('link', { name: 'Website' });
        await expect.element(websiteLink).toBeInTheDocument();
    });

    it('renders What We Look For section', async () => {
        render(Page, props);

        const heading = page.getByRole('heading', { name: 'What We Look For' });
        await expect.element(heading).toBeInTheDocument();
    });

    it('shows coming soon badge for brazil region', async () => {
        render(Page, props);

        await expect.element(page.getByText('brazil (coming soon)')).toBeInTheDocument();
    });

    it('renders a back link to home', async () => {
        render(Page, props);

        const backLink = page.getByRole('link', { name: /Back to Home/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
