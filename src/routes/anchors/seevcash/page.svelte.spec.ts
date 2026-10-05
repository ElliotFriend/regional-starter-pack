import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/anchors/seevcash/+page.svelte', () => {
    it('renders the anchor name', async () => {
        render(Page);
        await expect
            .element(page.getByRole('heading', { level: 1, name: 'SeevCash' }))
            .toBeInTheDocument();
    });

    it('shows the SeevCash logo', async () => {
        render(Page);
        await expect
            .element(page.getByRole('img', { name: 'SeevCash logo' }))
            .toHaveAttribute('src', '/anchor-logos/seevcash.png');
    });

    it('links to the Ghana on- and off-ramp flows', async () => {
        render(Page);
        await expect
            .element(page.getByRole('link', { name: 'On-Ramp (GHS → USDC)' }))
            .toHaveAttribute('href', '/anchors/seevcash/onramp?region=ghana');
        await expect
            .element(page.getByRole('link', { name: 'Off-Ramp (USDC → GHS)' }))
            .toHaveAttribute('href', '/anchors/seevcash/offramp?region=ghana');
    });

    it('shows the known issues, including the broken SEP-24 page', async () => {
        render(Page);
        await expect
            .element(page.getByRole('heading', { name: 'Known Issues' }))
            .toBeInTheDocument();
        await expect.element(page.getByText(/SEP-24 \(interactive\)/)).toBeInTheDocument();
    });
});
