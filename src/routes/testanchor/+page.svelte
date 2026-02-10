<script lang="ts">
    import { createTestAnchorClient } from '$lib/anchors/testanchor';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import type {
        Sep6DepositResponse,
        Sep6WithdrawResponse,
        Sep24InteractiveResponse,
    } from '$lib/anchors/sep/types';

    // Create client instance
    const client = createTestAnchorClient();

    // State
    let initialized = $state(false);
    let authenticated = $state(false);
    let loading = $state(false);
    let error = $state<string | null>(null);

    // Data
    let tomlInfo = $state<{
        sep10?: string;
        sep6?: string;
        sep12?: string;
        sep24?: string;
        sep31?: string;
        sep38?: string;
        signingKey?: string;
        currencies?: Array<{ code: string; issuer?: string }>;
    } | null>(null);

    let sep6Info = $state<unknown>(null);
    let sep24Info = $state<unknown>(null);
    let sep38Info = $state<unknown>(null);

    // Transfer form state
    let selectedAsset = $state('SRT');
    let transferAmount = $state('10');
    let transferType = $state<'deposit' | 'withdraw'>('deposit');

    // Results
    let sep6Result = $state<Sep6DepositResponse | Sep6WithdrawResponse | null>(null);
    let sep24Result = $state<Sep24InteractiveResponse | null>(null);
    let operationLoading = $state<'sep6' | 'sep24' | null>(null);

    // Initialize the client
    async function initialize() {
        loading = true;
        error = null;
        try {
            const toml = await client.initialize();
            tomlInfo = {
                sep10: toml.WEB_AUTH_ENDPOINT,
                sep6: toml.TRANSFER_SERVER,
                sep12: toml.KYC_SERVER,
                sep24: toml.TRANSFER_SERVER_SEP0024,
                sep31: toml.DIRECT_PAYMENT_SERVER,
                sep38: toml.ANCHOR_QUOTE_SERVER,
                signingKey: toml.SIGNING_KEY,
                currencies: toml.CURRENCIES?.filter((c) => c.code).map((c) => ({
                    code: c.code!,
                    issuer: c.issuer,
                })),
            };
            initialized = true;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to initialize';
        } finally {
            loading = false;
        }
    }

    // Authenticate with the anchor
    async function authenticate() {
        if (!walletStore.publicKey) {
            error = 'Please connect your wallet first';
            return;
        }

        loading = true;
        error = null;
        try {
            // Use Freighter to sign the challenge
            const { signTransaction } = await import('@stellar/freighter-api');

            await client.authenticate(walletStore.publicKey, async (xdr, networkPassphrase) => {
                const result = await signTransaction(xdr, { networkPassphrase });
                return result.signedTxXdr;
            });

            authenticated = true;
        } catch (e) {
            error = e instanceof Error ? e.message : 'Authentication failed';
        } finally {
            loading = false;
        }
    }

    // Fetch SEP-6 info
    async function fetchSep6Info() {
        loading = true;
        error = null;
        try {
            sep6Info = await client.getSep6Info();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to fetch SEP-6 info';
        } finally {
            loading = false;
        }
    }

    // Fetch SEP-24 info
    async function fetchSep24Info() {
        loading = true;
        error = null;
        try {
            sep24Info = await client.getSep24Info();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to fetch SEP-24 info';
        } finally {
            loading = false;
        }
    }

    // Fetch SEP-38 info
    async function fetchSep38Info() {
        loading = true;
        error = null;
        try {
            sep38Info = await client.getQuoteInfo();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to fetch SEP-38 info';
        } finally {
            loading = false;
        }
    }

    // SEP-6 Transfer (via server proxy to avoid CORS)
    async function handleSep6Transfer() {
        if (!walletStore.publicKey) {
            error = 'Please connect your wallet first';
            return;
        }

        const token = client.getToken();
        if (!token) {
            error = 'Please authenticate first';
            return;
        }

        operationLoading = 'sep6';
        error = null;
        sep6Result = null;

        try {
            const response = await fetch('/api/testanchor/sep6', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: transferType,
                    token,
                    asset_code: selectedAsset,
                    account: walletStore.publicKey,
                    amount: transferAmount,
                    type: transferType === 'withdraw' ? 'bank_account' : undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `SEP-6 ${transferType} failed`);
            }

            sep6Result = data;
        } catch (e) {
            error = e instanceof Error ? e.message : `SEP-6 ${transferType} failed`;
        } finally {
            operationLoading = null;
        }
    }

    // SEP-24 Transfer (via server proxy to avoid CORS)
    async function handleSep24Transfer() {
        if (!walletStore.publicKey) {
            error = 'Please connect your wallet first';
            return;
        }

        const token = client.getToken();
        if (!token) {
            error = 'Please authenticate first';
            return;
        }

        operationLoading = 'sep24';
        error = null;
        sep24Result = null;

        try {
            const response = await fetch('/api/testanchor/sep24', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: transferType,
                    token,
                    asset_code: selectedAsset,
                    amount: transferAmount,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `SEP-24 ${transferType} failed`);
            }

            sep24Result = data;
        } catch (e) {
            error = e instanceof Error ? e.message : `SEP-24 ${transferType} failed`;
        } finally {
            operationLoading = null;
        }
    }

    // Open SEP-24 interactive URL
    function openSep24Url() {
        if (sep24Result?.url) {
            window.open(sep24Result.url, '_blank', 'width=500,height=800');
        }
    }

    // Clear results
    function clearResults() {
        sep6Result = null;
        sep24Result = null;
        error = null;
    }
</script>

<svelte:head>
    <title>Test Anchor - Regional Starter Pack</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
    <div>
        <h1 class="text-3xl font-bold text-gray-900">Test Anchor</h1>
        <p class="mt-2 text-gray-600">
            Interactive testing with <code class="rounded bg-gray-100 px-1"
                >testanchor.stellar.org</code
            >
            - the Stellar reference anchor for testing SEP integrations.
        </p>
    </div>

    {#if error}
        <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <div class="flex items-start justify-between">
                <span>{error}</span>
                <button
                    onclick={() => (error = null)}
                    class="ml-4 text-red-500 hover:text-red-700"
                    aria-label="Dismiss error"
                >
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                        />
                    </svg>
                </button>
            </div>
        </div>
    {/if}

    <!-- Step 1: Initialize -->
    <section class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">1. Initialize (SEP-1)</h2>
        <p class="mb-4 text-gray-600">
            Fetch the stellar.toml file to discover the anchor's capabilities and endpoints.
        </p>

        {#if !initialized}
            <button
                onclick={initialize}
                disabled={loading}
                class="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50"
            >
                {loading ? 'Loading...' : 'Fetch stellar.toml'}
            </button>
        {:else if tomlInfo}
            <div class="space-y-3 text-sm">
                <div class="flex items-center gap-2 text-green-600">
                    <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    Initialized successfully
                </div>

                <div class="rounded-lg bg-gray-50 p-4">
                    <h3 class="mb-2 font-medium text-gray-900">Discovered Endpoints:</h3>
                    <dl class="grid gap-2 text-sm">
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-10 Auth:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep10 || 'Not supported'}</dd>
                        </div>
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-6 Transfer:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep6 || 'Not supported'}</dd>
                        </div>
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-12 KYC:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep12 || 'Not supported'}</dd>
                        </div>
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-24 Interactive:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep24 || 'Not supported'}</dd>
                        </div>
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-31 Payments:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep31 || 'Not supported'}</dd>
                        </div>
                        <div class="flex gap-2">
                            <dt class="font-medium text-gray-500">SEP-38 Quotes:</dt>
                            <dd class="text-gray-900">{tomlInfo.sep38 || 'Not supported'}</dd>
                        </div>
                    </dl>
                </div>

                {#if tomlInfo.currencies && tomlInfo.currencies.length > 0}
                    <div class="rounded-lg bg-gray-50 p-4">
                        <h3 class="mb-2 font-medium text-gray-900">Supported Assets:</h3>
                        <div class="flex flex-wrap gap-2">
                            {#each tomlInfo.currencies as currency (currency.code)}
                                <span
                                    class="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-800"
                                >
                                    {currency.code}
                                </span>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </section>

    <!-- Step 2: Authenticate -->
    <section class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">2. Authenticate (SEP-10)</h2>
        <p class="mb-4 text-gray-600">
            Sign a challenge transaction to prove ownership of your Stellar account.
        </p>

        {#if !initialized}
            <p class="text-sm text-gray-500">Initialize first to enable authentication.</p>
        {:else if !walletStore.isConnected}
            <p class="text-sm text-gray-500">Connect your wallet to authenticate.</p>
        {:else if authenticated}
            <div class="flex items-center gap-2 text-green-600">
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                    />
                </svg>
                Authenticated as {walletStore.publicKey?.slice(
                    0,
                    8,
                )}...{walletStore.publicKey?.slice(-8)}
            </div>
        {:else}
            <button
                onclick={authenticate}
                disabled={loading}
                class="rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:opacity-50"
            >
                {loading ? 'Signing...' : 'Authenticate with Freighter'}
            </button>
        {/if}
    </section>

    <!-- Step 3: Deposit/Withdraw -->
    <section class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">3. Deposit / Withdraw</h2>
        <p class="mb-4 text-gray-600">
            Transfer assets using SEP-6 (programmatic) or SEP-24 (interactive).
        </p>

        {#if !authenticated}
            <p class="text-sm text-gray-500">Authenticate first to enable transfers.</p>
        {:else}
            <!-- Transfer Configuration -->
            <div class="mb-6 space-y-4">
                <!-- Transfer Type Toggle -->
                <fieldset>
                    <legend class="mb-2 block text-sm font-medium text-gray-700"
                        >Transfer Type</legend
                    >
                    <div class="flex rounded-lg border border-gray-300 p-1" role="group">
                        <button
                            onclick={() => {
                                transferType = 'deposit';
                                clearResults();
                            }}
                            class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {transferType ===
                            'deposit'
                                ? 'bg-violet-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'}"
                        >
                            Deposit
                        </button>
                        <button
                            onclick={() => {
                                transferType = 'withdraw';
                                clearResults();
                            }}
                            class="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors {transferType ===
                            'withdraw'
                                ? 'bg-violet-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'}"
                        >
                            Withdraw
                        </button>
                    </div>
                </fieldset>

                <div class="grid gap-4 sm:grid-cols-2">
                    <!-- Asset Selection -->
                    <div>
                        <label for="asset" class="mb-2 block text-sm font-medium text-gray-700"
                            >Asset</label
                        >
                        <select
                            id="asset"
                            bind:value={selectedAsset}
                            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                        >
                            {#if tomlInfo?.currencies}
                                {#each tomlInfo.currencies as currency (currency.code)}
                                    <option value={currency.code}>{currency.code}</option>
                                {/each}
                            {:else}
                                <option value="SRT">SRT</option>
                                <option value="USDC">USDC</option>
                            {/if}
                        </select>
                    </div>

                    <!-- Amount -->
                    <div>
                        <label for="amount" class="mb-2 block text-sm font-medium text-gray-700"
                            >Amount</label
                        >
                        <input
                            id="amount"
                            type="number"
                            bind:value={transferAmount}
                            min="0"
                            step="any"
                            class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                            placeholder="10"
                        />
                    </div>
                </div>
            </div>

            <!-- SEP-6 and SEP-24 Side by Side -->
            <div class="grid gap-4 md:grid-cols-2">
                <!-- SEP-6 Card -->
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h3 class="mb-2 font-semibold text-gray-900">SEP-6: Programmatic</h3>
                    <p class="mb-4 text-sm text-gray-600">
                        API-based transfer. Returns instructions directly without a hosted UI.
                    </p>

                    <button
                        onclick={handleSep6Transfer}
                        disabled={operationLoading !== null}
                        class="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {#if operationLoading === 'sep6'}
                            Processing...
                        {:else}
                            {transferType === 'deposit' ? 'Start Deposit' : 'Start Withdrawal'}
                        {/if}
                    </button>

                    {#if sep6Result}
                        <div class="mt-4 rounded-lg bg-white p-3">
                            <h4 class="mb-2 text-sm font-medium text-gray-900">Result:</h4>
                            {#if 'how' in sep6Result && sep6Result.how}
                                <p class="mb-2 text-sm text-gray-700">
                                    <span class="font-medium">Instructions:</span>
                                    {sep6Result.how}
                                </p>
                            {/if}
                            {#if sep6Result.id}
                                <p class="text-sm text-gray-700">
                                    <span class="font-medium">Transaction ID:</span>
                                    <code class="ml-1 rounded bg-gray-100 px-1"
                                        >{sep6Result.id}</code
                                    >
                                </p>
                            {/if}
                            {#if sep6Result.eta}
                                <p class="text-sm text-gray-700">
                                    <span class="font-medium">ETA:</span>
                                    {sep6Result.eta} seconds
                                </p>
                            {/if}
                            <details class="mt-2">
                                <summary class="cursor-pointer text-xs text-gray-500"
                                    >Full response</summary
                                >
                                <pre class="mt-2 overflow-x-auto text-xs">{JSON.stringify(
                                        sep6Result,
                                        null,
                                        2,
                                    )}</pre>
                            </details>
                        </div>
                    {/if}
                </div>

                <!-- SEP-24 Card -->
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h3 class="mb-2 font-semibold text-gray-900">SEP-24: Interactive</h3>
                    <p class="mb-4 text-sm text-gray-600">
                        Opens a hosted UI where you complete the transfer in the anchor's interface.
                    </p>

                    <button
                        onclick={handleSep24Transfer}
                        disabled={operationLoading !== null}
                        class="w-full rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                        {#if operationLoading === 'sep24'}
                            Processing...
                        {:else}
                            {transferType === 'deposit' ? 'Start Deposit' : 'Start Withdrawal'}
                        {/if}
                    </button>

                    {#if sep24Result}
                        <div class="mt-4 rounded-lg bg-white p-3">
                            <h4 class="mb-2 text-sm font-medium text-gray-900">Result:</h4>
                            <p class="mb-2 text-sm text-gray-700">
                                <span class="font-medium">Transaction ID:</span>
                                <code class="ml-1 rounded bg-gray-100 px-1">{sep24Result.id}</code>
                            </p>
                            <button
                                onclick={openSep24Url}
                                class="mt-2 w-full rounded-lg border border-green-600 bg-white px-4 py-2 text-green-600 hover:bg-green-50"
                            >
                                Open Interactive UI
                            </button>
                            <p class="mt-2 text-xs text-gray-500">
                                URL: <a
                                    href={sep24Result.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-violet-600 hover:underline"
                                >
                                    {sep24Result.url.slice(0, 50)}...
                                </a>
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </section>

    <!-- Step 4: Explore SEPs -->
    <section class="rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">4. Explore SEP Info</h2>
        <p class="mb-4 text-gray-600">
            Fetch detailed information about the anchor's capabilities.
        </p>

        {#if !initialized}
            <p class="text-sm text-gray-500">Initialize first to explore SEPs.</p>
        {:else}
            <div class="flex flex-wrap gap-3">
                <button
                    onclick={fetchSep6Info}
                    disabled={loading}
                    class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Get SEP-6 Info
                </button>
                <button
                    onclick={fetchSep24Info}
                    disabled={loading}
                    class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Get SEP-24 Info
                </button>
                <button
                    onclick={fetchSep38Info}
                    disabled={loading}
                    class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Get SEP-38 Info
                </button>
            </div>

            {#if sep6Info || sep24Info || sep38Info}
                <div class="mt-4 space-y-4">
                    {#if sep6Info}
                        <div class="rounded-lg bg-gray-50 p-4">
                            <h3 class="mb-2 font-medium text-gray-900">SEP-6 Info:</h3>
                            <pre class="overflow-x-auto text-xs">{JSON.stringify(
                                    sep6Info,
                                    null,
                                    2,
                                )}</pre>
                        </div>
                    {/if}
                    {#if sep24Info}
                        <div class="rounded-lg bg-gray-50 p-4">
                            <h3 class="mb-2 font-medium text-gray-900">SEP-24 Info:</h3>
                            <pre class="overflow-x-auto text-xs">{JSON.stringify(
                                    sep24Info,
                                    null,
                                    2,
                                )}</pre>
                        </div>
                    {/if}
                    {#if sep38Info}
                        <div class="rounded-lg bg-gray-50 p-4">
                            <h3 class="mb-2 font-medium text-gray-900">SEP-38 Info:</h3>
                            <pre class="overflow-x-auto text-xs">{JSON.stringify(
                                    sep38Info,
                                    null,
                                    2,
                                )}</pre>
                        </div>
                    {/if}
                </div>
            {/if}
        {/if}
    </section>

    <!-- About the Test Anchor -->
    <section class="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">About the Test Anchor</h2>
        <p class="text-gray-600">
            The Stellar test anchor at <code class="rounded bg-gray-200 px-1"
                >testanchor.stellar.org</code
            >
            is a reference implementation maintained by the Stellar Development Foundation. It supports
            all standard SEPs and is designed for testing anchor integrations without using real assets.
        </p>
        <ul class="mt-4 list-inside list-disc space-y-1 text-gray-600">
            <li>Operates on the Stellar testnet</li>
            <li>Supports test assets (SRT, USDC)</li>
            <li>Implements SEPs 1, 6, 10, 12, 24, 31, and 38</li>
            <li>Provides instant approvals for testing workflows</li>
        </ul>
    </section>
</div>
