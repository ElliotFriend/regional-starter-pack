import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

const mockData = {
    regions: [],
    anchors: [],
    region: {
        id: 'mexico',
        name: 'Mexico',
        code: 'MX',
        currency: 'MXN',
        currencySymbol: '$',
        flag: '\u{1F1F2}\u{1F1FD}',
        description: 'Mexico has a growing crypto ecosystem with SPEI.',
        paymentRails: [
            { id: 'spei', name: 'SPEI', description: 'Mexican real-time payment system', type: 'bank_transfer' },
        ],
        anchors: ['etherfuse', 'alfredpay'],
    },
    tokens: [
        { symbol: 'USDC', name: 'USD Coin', description: 'A stablecoin pegged to the US dollar', issuer: 'GA5ZSE...' },
        { symbol: 'CETES', name: 'CETES Token', description: 'Tokenized Mexican treasury bills', issuer: 'GB3ZSE...' },
    ],
    anchors_detail: [
        {
            id: 'etherfuse',
            name: 'Etherfuse',
            description: 'Bridges TradFi and DeFi.',
            links: { website: 'https://etherfuse.com' },
            regions: {
                mexico: {
                    onRamp: true,
                    offRamp: true,
                    paymentRails: ['spei'],
                    tokens: ['CETES'],
                    kycRequired: true,
                },
            },
        },
    ],
};

// The component destructures { region, tokens, anchors } from data,
// where `anchors` comes from the server load (array of AnchorProfiles).
const props = {
    data: {
        ...mockData,
        anchors: mockData.anchors_detail,
    },
};

describe('/regions/[region]/+page.svelte', () => {
    it('renders the region name as heading', async () => {
        render(Page, props);

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Mexico');
    });

    it('displays currency info', async () => {
        render(Page, props);

        await expect.element(page.getByText('MXN ($)')).toBeInTheDocument();
    });

    it('renders the Payment Rails section', async () => {
        render(Page, props);

        await expect.element(page.getByRole('heading', { name: 'Payment Rails' })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'SPEI' })).toBeInTheDocument();
    });

    it('renders the Available Digital Assets section', async () => {
        render(Page, props);

        await expect.element(page.getByRole('heading', { name: 'Available Digital Assets' })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'USDC' })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'CETES' })).toBeInTheDocument();
    });

    it('renders the Available Anchors section', async () => {
        render(Page, props);

        await expect.element(page.getByRole('heading', { name: 'Available Anchors' })).toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'Etherfuse' })).toBeInTheDocument();
    });

    it('shows capability badges for anchors', async () => {
        render(Page, props);

        await expect.element(page.getByText('On-Ramp')).toBeInTheDocument();
        await expect.element(page.getByText('Off-Ramp')).toBeInTheDocument();
    });

    it('renders a back link to regions', async () => {
        render(Page, props);

        const backLink = page.getByRole('link', { name: /Back to Regions/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
