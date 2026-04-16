import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
    it('renders the main heading', async () => {
        render(Page);

        const heading = page.getByRole('heading', { level: 1 });
        await expect.element(heading).toBeInTheDocument();
        await expect.element(heading).toHaveTextContent('Stellar Regional Starter Pack');
    });

    it('renders Browse Regions and View Anchors links', async () => {
        render(Page);

        const regionsLink = page.getByRole('link', { name: 'Browse Regions' });
        await expect.element(regionsLink).toBeInTheDocument();

        const anchorsLink = page.getByRole('link', { name: 'View Anchors' });
        await expect.element(anchorsLink).toBeInTheDocument();
    });

    it('renders the What\'s Inside section', async () => {
        render(Page);

        const heading = page.getByRole('heading', { name: "What's Inside" });
        await expect.element(heading).toBeInTheDocument();

        const items = [
            'Portable Anchor Library',
            'Three Pre-Built Integrations',
            'SEP Protocol Library',
            'Live Demos',
        ];
        for (const item of items) {
            const h3 = page.getByRole('heading', { name: item });
            await expect.element(h3).toBeInTheDocument();
        }
    });

    it('renders the How to Use It steps', async () => {
        render(Page);

        const heading = page.getByRole('heading', { name: 'How to Use It' });
        await expect.element(heading).toBeInTheDocument();

        const steps = ['Clone & Configure', 'Try the Demos', 'Copy the Library', 'Build Your Own'];
        for (const step of steps) {
            const h3 = page.getByRole('heading', { name: step });
            await expect.element(h3).toBeInTheDocument();
        }
    });
});
