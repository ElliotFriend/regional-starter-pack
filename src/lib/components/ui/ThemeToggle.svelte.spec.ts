import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ThemeToggle from './ThemeToggle.svelte';

const storageKey = 'regional-starter-pack-theme';

afterEach(() => {
    localStorage.removeItem(storageKey);
    document.documentElement.classList.remove('dark');
});

describe('ThemeToggle', () => {
    it('switches the document theme and saves each explicit preference', async () => {
        localStorage.setItem(storageKey, 'light');
        document.documentElement.classList.remove('dark');

        render(ThemeToggle);
        const button = page.getByRole('button', { name: 'Toggle dark mode' });

        await button.click();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem(storageKey)).toBe('dark');

        await button.click();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(localStorage.getItem(storageKey)).toBe('light');
    });
});
