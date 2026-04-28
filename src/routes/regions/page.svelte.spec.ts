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
            description: 'Mexico has a growing crypto ecosystem.',
            paymentRails: [
                {
                    id: 'spei',
                    name: 'SPEI',
                    description: 'Mexican payment system',
                    type: 'bank_transfer',
                },
            ],
            anchors: ['etherfuse'],
        },
        {
            id: 'brazil',
            name: 'Brazil',
            code: 'BR',
            currency: 'BRL',
            currencySymbol: 'R$',
            flag: '\u{1F1E7}\u{1F1F7}',
            description: 'Brazil has a vibrant fintech ecosystem.',
            paymentRails: [
                {
                    id: 'pix',
                    name: 'PIX',
                    description: 'Brazilian instant payments',
                    type: 'bank_transfer',
                },
            ],
            anchors: ['etherfuse'],
        },
    ],
    anchors: [],
};

describe('/regions/+page.svelte', () => {
    it('renders the page heading', async () => {
        render(Page, { data: mockData });

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toHaveTextContent('Supported Regions');
    });

    it('renders a card for each region', async () => {
        render(Page, { data: mockData });

        const mexico = page.getByRole('heading', { name: 'Mexico' });
        await expect.element(mexico).toBeInTheDocument();

        const brazil = page.getByRole('heading', { name: 'Brazil' });
        await expect.element(brazil).toBeInTheDocument();
    });

    it('displays currency codes', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByText('MXN')).toBeInTheDocument();
        await expect.element(page.getByText('BRL')).toBeInTheDocument();
    });

    it('displays payment rail badges', async () => {
        render(Page, { data: mockData });

        await expect.element(page.getByText('SPEI')).toBeInTheDocument();
        await expect.element(page.getByText('PIX')).toBeInTheDocument();
    });

    it('renders a back link to home', async () => {
        render(Page, { data: mockData });

        const backLink = page.getByRole('link', { name: /Back to Home/i });
        await expect.element(backLink).toBeInTheDocument();
    });
});
