# Local verification

Use Node.js 26 and the pnpm version declared in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
node scripts/with-test-env.mjs pnpm exec vitest run --project unit --project client --maxWorkers=2
node scripts/with-test-env.mjs pnpm build
TEST_SERVER_MODE=preview pnpm test:browser
```

The test environment wrapper supplies unconfigured providers and a disposable,
unfunded signing key. It does not require real credentials. Use it to start a UI
preview with `node scripts/with-test-env.mjs pnpm dev`.

Browser tests start their own localhost server and close it afterward. CI uses
`TEST_SERVER_MODE=preview` to test the production build. Without that setting,
`pnpm test:browser` uses the development server. To test an
existing server, set `TEST_BASE_URL`, for example
`TEST_BASE_URL=http://127.0.0.1:5173 pnpm test:browser`.

The browser suite covers system preferences, manual choices, reload persistence,
cross-tab synchronization, blocked storage, the theme before hydration, keyboard
activation, and light/dark rendering on eight representative routes.

CI runs type checking, linting, unit/component tests, the production build, and
browser checks against that build on pull requests and all branch pushes. Live anchor integration
tests remain separate (`pnpm test:integration --run`) because they depend on
external services. Wallet signing and real provider transactions require separate
manual testing with a configured wallet and provider credentials.
