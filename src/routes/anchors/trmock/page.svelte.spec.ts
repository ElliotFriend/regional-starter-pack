import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/anchors/trmock/+page.svelte', () => {
    it('renders the anchor name', async () => {
        render(Page);
        await expect.element(page.getByText('TR Mock Anchor').first()).toBeInTheDocument();
    });

    it('labels the anchor as a sandbox stand-in', async () => {
        render(Page);
        await expect.element(page.getByText('Sandbox stand-in').first()).toBeInTheDocument();
    });

    it('says plainly that BiLira does not operate it', async () => {
        render(Page);
        await expect
            .element(page.getByText('This is a mock, not a live anchor.', { exact: true }))
            .toBeInTheDocument();
        await expect.element(page.getByText(/not operated by BiLira/i).first()).toBeInTheDocument();
    });
});
