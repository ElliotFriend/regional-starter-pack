import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from 'playwright/test';
import type { Browser } from 'playwright';

const baseURL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4173';
const storageKey = 'regional-starter-pack-theme';
const serverMode = process.env.TEST_SERVER_MODE ?? 'dev';
assert.ok(['dev', 'preview'].includes(serverMode), 'TEST_SERVER_MODE must be dev or preview');
let server: ChildProcess | undefined;
let browser: Browser;

before(async () => {
    if (!process.env.TEST_BASE_URL) {
        server = spawn(
            process.execPath,
            [
                'scripts/with-test-env.mjs',
                'pnpm',
                serverMode,
                '--host',
                '127.0.0.1',
                '--port',
                '4173',
                '--strictPort',
            ],
            { stdio: 'ignore', detached: true },
        );
    }
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        assert.ok(
            !server || server.exitCode === null,
            `Localhost ${serverMode} server exited with code ${server?.exitCode}`,
        );
        try {
            const response = await fetch(baseURL, { signal: AbortSignal.timeout(2000) });
            if (response.ok) {
                ready = true;
                break;
            }
        } catch {
            // Wait for the localhost server to start.
        }
        await delay(500);
    }
    assert.ok(ready, `App did not become ready at ${baseURL}`);
    browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
    if (server?.pid) process.kill(-server.pid, 'SIGTERM');
});

test('theme follows the system, persists manual choices, and synchronizes tabs', async () => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        await page.goto(baseURL);
        const root = page.locator('html');
        const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(root).toHaveClass(/dark/);
        await page.emulateMedia({ colorScheme: 'light' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');

        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), 'light');
        await page.reload();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await page.emulateMedia({ colorScheme: 'light' });
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');

        const other = await context.newPage();
        await other.goto(baseURL);
        await other.getByRole('button', { name: 'Toggle dark mode' }).click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await other.evaluate(() => localStorage.clear());
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await page.emulateMedia({ colorScheme: 'light' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
    }
});

test('saved and invalid preferences apply before hydration', async () => {
    for (const [preference, system, expected] of [
        ['dark', 'light', true],
        ['light', 'dark', false],
        ['invalid', 'dark', true],
    ] as const) {
        const context = await browser.newContext({ colorScheme: system });
        try {
            await context.addInitScript(
                ({ key, preference }) => {
                    localStorage.setItem(key, preference);
                },
                { key: storageKey, preference },
            );
            await context.route('**/*', (route) => {
                if (route.request().resourceType() === 'script') return route.abort();
                return route.continue();
            });
            const page = await context.newPage();
            await page.goto(baseURL);
            assert.equal(
                await page.evaluate(() => document.documentElement.classList.contains('dark')),
                expected,
            );
        } finally {
            await context.close();
        }
    }
});

test('theme works when storage is blocked', async () => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    try {
        await context.addInitScript(() => {
            Storage.prototype.getItem = Storage.prototype.setItem = () => {
                throw new DOMException('Storage blocked', 'SecurityError');
            };
        });
        const page = await context.newPage();
        await page.goto(baseURL);
        const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    } finally {
        await context.close();
    }
});

test('representative routes render in both themes without browser errors', async () => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        for (const path of [
            '/',
            '/regions',
            '/anchors',
            '/anchors/scorecard',
            '/anchors/etherfuse',
            '/anchors/etherfuse/onramp',
            '/anchors/testanchor/interactive/onramp',
            '/testanchor',
        ]) {
            const response = await page.goto(`${baseURL}${path}`);
            assert.equal(response?.status(), 200, path);
            const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
            await expect(toggle).toBeVisible();
            await expect(toggle).toBeEnabled();
            for (const dark of [true, false]) {
                if ((await toggle.getAttribute('aria-pressed')) !== String(dark))
                    await toggle.click();
                await expect(toggle).toHaveAttribute('aria-pressed', String(dark));
                await expect(page.locator('html')).toHaveCSS(
                    'color-scheme',
                    dark ? 'dark' : 'light',
                );
                await expect(page.getByRole('banner')).toHaveCSS(
                    'background-color',
                    dark ? 'rgb(23, 34, 53)' : 'rgb(255, 255, 255)',
                );
            }
        }
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
    }
});
