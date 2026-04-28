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

    it('renders the Local Currency Advantage section', async () => {
        render(Page);

        const heading = page.getByRole('heading', { name: 'The Local Currency Advantage' });
        await expect.element(heading).toBeInTheDocument();
    });

    it('renders the What We Look For section with quality criteria', async () => {
        render(Page);

        const heading = page.getByRole('heading', { name: 'What We Look For' });
        await expect.element(heading).toBeInTheDocument();
    });
});
