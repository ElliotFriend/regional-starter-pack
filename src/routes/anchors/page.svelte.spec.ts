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
            links: { website: 'https://etherfuse.com', documentation: 'https://docs.etherfuse.com' },
            regions: { mexico: { onRamp: true, offRamp: true, paymentRails: ['spei'], tokens: ['CETES'], kycRequired: true } },
        },
        {
            id: 'alfredpay',
            name: 'AlfredPay',
            description: 'On and off ramp for Mexico.',
            links: { website: 'https://alfredpay.io', documentation: 'https://docs.alfredpay.io' },
            regions: {
                mexico: { onRamp: true, offRamp: true, paymentRails: ['spei'], tokens: ['USDC'], kycRequired: true },
                brazil: { onRamp: true, offRamp: false, paymentRails: ['pix'], tokens: ['USDC'], kycRequired: true },
            },
        },
    ],
};

describe('/anchors/+page.svelte', () => {
    it('renders the page heading', async () => {
        render(Page, { data: mockData });

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Anchor Providers');
    });

    it('renders a card for each anchor', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByRole('heading', { name: 'Etherfuse' })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'AlfredPay' })).toBeInTheDocument();
    });

    it('displays anchor descriptions', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByText('Bridges traditional finance and DeFi.')).toBeInTheDocument();
    });

    it('renders View Details and Website links for each anchor', async () => {
        render(Page, { data: mockData });

        const detailLinks = page.getByRole('link', { name: 'View Details' });
        await expect.element(detailLinks.first()).toBeInTheDocument();

        const websiteLinks = page.getByRole('link', { name: 'Website' });
        await expect.element(websiteLinks.first()).toBeInTheDocument();
    });

    it('renders region badges', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByText('mexico').first()).toBeInTheDocument();
    });

    it('renders a back link to home', async () => {
        render(Page, { data: mockData });

        const backLink = page.getByRole('link', { name: /Back to Home/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
