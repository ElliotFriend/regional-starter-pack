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
            {
                id: 'spei',
                name: 'SPEI',
                description: 'Mexican real-time payment system',
                type: 'bank_transfer' as const,
            },
        ],
        anchors: ['etherfuse'],
    },
    tokens: [
        {
            symbol: 'CETES',
            name: 'CETES Token',
            description: 'Tokenized Mexican treasury bills',
            issuer: 'GB3ZSE...',
        },
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
    honorableMentions: [
        {
            id: 'alfredpay',
            name: 'Alfred Pay',
            description: 'Fiat on/off ramp services across Latin America.',
            website: 'https://alfredpay.io',
            tokens: ['USDC'],
            rails: ['spei'],
            regions: ['mexico'],
            criteria: [
                {
                    id: 'local-asset',
                    label: 'Locally denominated asset',
                    met: false,
                    note: 'USDC only',
                },
                { id: 'local-rails', label: 'Local payment rails', met: true },
                { id: 'competitive-rates', label: 'Competitive rates', met: false },
                { id: 'open-access', label: 'Open access', met: true },
                { id: 'deep-liquidity', label: 'Deep liquidity', met: false },
            ],
        },
    ],
};

const props = {
    data: {
        ...mockData,
        anchors: mockData.anchors_detail,
    },
    params: { region: 'mexico' },
    form: null,
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

        await expect
            .element(page.getByRole('heading', { name: 'Payment Rails' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'SPEI' })).toBeInTheDocument();
    });

    it('renders the Available Digital Assets section', async () => {
        render(Page, props);

        await expect
            .element(page.getByRole('heading', { name: 'Available Digital Assets' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'CETES' })).toBeInTheDocument();
    });

    it('renders the About the Local Asset section', async () => {
        render(Page, props);

        await expect
            .element(page.getByRole('heading', { name: 'About the Local Asset' }))
            .toBeInTheDocument();
    });

    it('renders the Available Anchors section', async () => {
        render(Page, props);

        await expect
            .element(page.getByRole('heading', { name: 'Available Anchors' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'Etherfuse' })).toBeInTheDocument();
    });

    it('shows capability badges for anchors', async () => {
        render(Page, props);

        await expect.element(page.getByText('On-Ramp').first()).toBeInTheDocument();
        await expect.element(page.getByText('Off-Ramp').first()).toBeInTheDocument();
    });

    it('renders the honorable mentions section', async () => {
        render(Page, props);

        await expect
            .element(page.getByRole('heading', { name: 'Other Providers in This Region' }))
            .toBeInTheDocument();
        await expect.element(page.getByRole('heading', { name: 'Alfred Pay' })).toBeInTheDocument();
    });

    it('renders a back link to regions', async () => {
        render(Page, props);

        const backLink = page.getByRole('link', { name: /Back to Regions/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
