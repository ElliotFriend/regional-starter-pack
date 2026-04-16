import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    test: {
        projects: [
            {
                extends: './vite.config.ts',
                test: {
                    name: 'client',
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        instances: [{ browser: 'chromium', headless: true }],
                    },
                    include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
                    exclude: ['src/lib/server/**'],
                },
            },

            {
                extends: './vite.config.ts',
                test: {
                    name: 'unit',
                    environment: 'node',
                    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
                    exclude: [
                        'src/**/*.svelte.{test,spec}.{js,ts}',
                        'src/**/*.integration.test.{js,ts}',
                        'tests/**/*.integration.test.{js,ts}',
                    ],
                    setupFiles: ['tests/test-setup.ts'],
                },
            },

            {
                extends: './vite.config.ts',
                test: {
                    name: 'integration',
                    environment: 'node',
                    include: [
                        'src/**/*.integration.test.{js,ts}',
                        'tests/**/*.integration.test.{js,ts}',
                    ],
                    testTimeout: 30_000,
                },
            },
        ],
    },
});
