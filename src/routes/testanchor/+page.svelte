<script lang="ts">
    import { walletStore } from '$lib/stores/wallet.svelte';
    import {
        buildPaymentTransaction,
        submitTransaction,
        getStellarAsset,
        getNetworkPassphrase,
    } from '$lib/wallet/stellar';
    import type {
        Sep6DepositResponse,
        Sep6WithdrawResponse,
        Sep24InteractiveResponse,
        Sep24Transaction,
        TransactionStatus,
        Sep6Info,
        Sep24Info,
        Sep38Info,
    } from '$lib/anchors/sep/types';
    import type { PageProps } from './$types';
    import { browser } from '$app/environment';
    import { onDestroy } from 'svelte';

    const { data }: PageProps = $props();

    // Pre-loaded from +page.ts load function
    const client = $derived(data.client);
    const initialized = $derived(!!data.tomlInfo);
    const tomlInfo = $derived(data.tomlInfo);

    // State
    let authenticated = $state(false);
    let loading = $state(false);
    let error = $state<string | null>(null);

    let selectedSepTab = $state<'sep6' | 'sep24' | 'sep38'>('sep24');
    const sepTabs = [
        { id: 'sep6' as const, label: 'SEP-6', subtitle: 'Programmatic' },
        { id: 'sep24' as const, label: 'SEP-24', subtitle: 'Interactive' },
        { id: 'sep38' as const, label: 'SEP-38', subtitle: 'Quotes' },
    ];

    // Transfer form state
    let selectedAsset = $state('SRT');
    let transferAmount = $state('10');
    let transferType = $state<'deposit' | 'withdraw'>('deposit');

    // Get limits for current asset + transfer type (from SEP-24 details)
    async function getCurrentLimits() {
        const sep24Info = await data.sep24Info;
        if (!sep24Info) return null;
        const assets = transferType === 'deposit' ? sep24Info.deposit : sep24Info.withdraw;
        const info = assets?.[selectedAsset];
        if (!info?.enabled) return null;
        return { min: info.min_amount, max: info.max_amount };
    }

    // Results
    let sep6Result = $state<Sep6DepositResponse | Sep6WithdrawResponse | null>(null);
    let sep24Result = $state<Sep24InteractiveResponse | null>(null);
    let operationLoading = $state<'sep6' | 'sep24' | null>(null);

    // SEP-24 interactive transaction tracking
    let sep24Transaction = $state<Sep24Transaction | null>(null);
    // $inspect('sep24Transaction', sep24Transaction);
    let sep24PopupRef = $state<Window | null>(null);

    // Withdrawal payment state
    let isSendingPayment = $state(false);
    let paymentResult = $state<{ success: boolean; stellarTxId?: string; error?: string } | null>(
        null,
    );

    // Whether the withdrawal is ready for the user to send a Stellar payment
    let withdrawalReady = $derived(
        sep24Transaction?.status === 'pending_user_transfer_start' &&
            sep24Transaction?.withdraw_anchor_account &&
            transferType === 'withdraw',
    );

    // postMessage listener — only active while the interactive popup is open.
    // Scoped to the anchor's origin so we ignore messages from other sources.
    let anchorOrigin: string | null = null;

    function handlePostMessage(event: MessageEvent) {
        if (event.origin !== anchorOrigin) return;

        // Parse the message — could be a JSON string or a plain object
        let data = event.data;
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                return;
            }
        }

        // SEP-24 wraps the transaction in a { transaction: {...} } envelope
        const tx = data?.transaction;
        if (!tx?.id || !tx?.status) return;

        // Only accept updates for the transaction we initiated
        if (sep24Result && tx.id !== sep24Result.id) return;

        sep24Transaction = tx;
    }

    function startListening(interactiveUrl: string) {
        if (browser) {
            anchorOrigin = new URL(interactiveUrl).origin;
            window.addEventListener('message', handlePostMessage);
        }
    }

    function stopListening() {
        if (browser) {
            window.removeEventListener('message', handlePostMessage);
            anchorOrigin = null;
        }
    }

    onDestroy(stopListening);

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

    // Validate amount against current limits
    async function validateAmount(): Promise<boolean> {
        const currentLimits = await getCurrentLimits();
        if (!currentLimits) return true;
        const amount = parseFloat(transferAmount);
        if (isNaN(amount)) {
            error = 'Please enter a valid amount';
            return false;
        }
        if (currentLimits.max != null && amount > currentLimits.max) {
            error = `Amount exceeds maximum of ${currentLimits.max} ${selectedAsset} for ${transferType}`;
            return false;
        }
        if (currentLimits.min != null && amount < currentLimits.min) {
            error = `Amount is below minimum of ${currentLimits.min} ${selectedAsset} for ${transferType}`;
            return false;
        }
        return true;
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

        if (!(await validateAmount())) return;

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

        if (!(await validateAmount())) return;

        operationLoading = 'sep24';
        error = null;
        sep24Result = null;
        sep24Transaction = null;

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

    // Open SEP-24 interactive URL in a popup
    function openSep24Url() {
        if (sep24Result?.url) {
            // Append callback=postMessage so the anchor's interactive
            // page posts status updates back to window.opener via postMessage
            const url = new URL(sep24Result.url);
            url.searchParams.set('callback', 'postMessage');

            // Start listening for postMessages scoped to this anchor's origin
            startListening(sep24Result.url);

            const width = 500;
            const height = 800;
            const left = window.screenX + (window.innerWidth - width) / 2;
            const top = window.screenY + (window.innerHeight - height) / 2;
            sep24PopupRef = window.open(
                url.toString(),
                'stellar-anchor',
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
            );
        }
    }

    // Send the Stellar payment for a SEP-24 withdrawal
    async function sendWithdrawalPayment() {
        if (!sep24Transaction || !walletStore.publicKey) return;

        const { withdraw_anchor_account, withdraw_memo, withdraw_memo_type, amount_in } =
            sep24Transaction;

        if (!withdraw_anchor_account) {
            error = 'No anchor account in transaction — cannot send payment';
            return;
        }

        // Resolve the asset issuer from the toml currencies
        const currency = tomlInfo?.currencies?.find((c) => c.code === selectedAsset);
        if (!currency?.issuer) {
            error = `Cannot find issuer for ${selectedAsset} — check stellar.toml`;
            return;
        }

        const amount = amount_in || transferAmount;
        const asset = getStellarAsset(selectedAsset, currency.issuer);

        isSendingPayment = true;
        paymentResult = null;
        error = null;

        try {
            // Build the payment transaction
            const xdr = await buildPaymentTransaction({
                sourcePublicKey: walletStore.publicKey,
                destinationPublicKey: withdraw_anchor_account,
                asset,
                amount,
                memo: withdraw_memo,
                memoType: (withdraw_memo_type as 'text' | 'id' | 'hash') ?? 'text',
                network: 'testnet',
            });

            // Sign with Freighter
            const { signTransaction } = await import('@stellar/freighter-api');
            const networkPassphrase = getNetworkPassphrase('testnet');
            const result = await signTransaction(xdr, { networkPassphrase });

            // Submit to the network
            const submitResult = await submitTransaction(result.signedTxXdr, 'testnet');

            if ('hash' in submitResult) {
                paymentResult = { success: true, stellarTxId: submitResult.hash };
            } else {
                paymentResult = { success: true };
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            paymentResult = { success: false, error: msg };
            error = `Payment failed: ${msg}`;
        } finally {
            isSendingPayment = false;
        }
    }

    // Clear results
    function clearResults() {
        stopListening();
        sep6Result = null;
        sep24Result = null;
        sep24Transaction = null;
        sep24PopupRef = null;
        paymentResult = null;
        error = null;
    }

    // Human-readable status labels
    function formatStatus(status: TransactionStatus): string {
        const labels: Record<string, string> = {
            incomplete: 'Incomplete',
            pending_user_transfer_start: 'Waiting for your transfer',
            pending_user_transfer_complete: 'Transfer received, processing',
            pending_external: 'Waiting on external system',
            pending_anchor: 'Anchor processing',
            pending_stellar: 'Submitting to Stellar',
            pending_trust: 'Waiting for trustline',
            pending_user: 'Action required',
            pending_customer_info_update: 'KYC update needed',
            pending_transaction_info_update: 'Transaction info needed',
            completed: 'Completed',
            refunded: 'Refunded',
            expired: 'Expired',
            error: 'Error',
            no_market: 'No market',
        };
        return labels[status] ?? status;
    }

    function statusColor(status: TransactionStatus): string {
        if (status === 'completed') return 'text-green-600';
        if (status === 'error' || status === 'expired' || status === 'no_market')
            return 'text-red-600';
        if (status === 'refunded') return 'text-amber-600';
        return 'text-blue-600';
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
            The anchor's stellar.toml is fetched automatically to discover capabilities and
            endpoints.
        </p>

        {#if !initialized}
            <p class="text-sm text-gray-500">
                Failed to load anchor configuration. Please refresh the page to try again.
            </p>
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
                    {#await getCurrentLimits() then currentLimits}
                        <div>
                            <label for="amount" class="mb-2 block text-sm font-medium text-gray-700"
                                >Amount</label
                            >
                            <input
                                id="amount"
                                type="number"
                                bind:value={transferAmount}
                                min={currentLimits?.min ?? 0}
                                max={currentLimits?.max}
                                step="any"
                                class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:ring-violet-500"
                                placeholder="10"
                            />
                            {#if currentLimits}
                                <p class="mt-1 text-xs text-gray-500">
                                    {#if currentLimits.min != null && currentLimits.max != null}
                                        Range: {currentLimits.min} – {currentLimits.max}
                                        {selectedAsset}
                                    {:else if currentLimits.max != null}
                                        Max: {currentLimits.max} {selectedAsset}
                                    {:else if currentLimits.min != null}
                                        Min: {currentLimits.min} {selectedAsset}
                                    {/if}
                                </p>
                            {/if}
                        </div>
                    {/await}
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

                            {#if sep24Transaction}
                                <div class="mb-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                                    <p class="text-sm">
                                        <span class="font-medium text-gray-700">Status:</span>
                                        <span
                                            class="ml-1 font-medium {statusColor(
                                                sep24Transaction.status,
                                            )}"
                                        >
                                            {formatStatus(sep24Transaction.status)}
                                        </span>
                                    </p>
                                    {#if sep24Transaction.message}
                                        <p class="mt-1 text-xs text-gray-600">
                                            {sep24Transaction.message}
                                        </p>
                                    {/if}
                                    {#if sep24Transaction.amount_in}
                                        <p class="mt-1 text-xs text-gray-600">
                                            Amount in: {sep24Transaction.amount_in}
                                            {sep24Transaction.amount_in_asset ?? ''}
                                        </p>
                                    {/if}
                                    {#if sep24Transaction.amount_out}
                                        <p class="text-xs text-gray-600">
                                            Amount out: {sep24Transaction.amount_out}
                                            {sep24Transaction.amount_out_asset ?? ''}
                                        </p>
                                    {/if}
                                    {#if sep24Transaction.withdraw_anchor_account}
                                        <p class="mt-1 text-xs text-gray-600">
                                            <span class="font-medium">Send to:</span>
                                            <code class="ml-1 rounded bg-gray-100 px-1">
                                                {sep24Transaction.withdraw_anchor_account}
                                            </code>
                                        </p>
                                    {/if}
                                    {#if sep24Transaction.withdraw_memo}
                                        <p class="text-xs text-gray-600">
                                            <span class="font-medium"
                                                >Memo ({sep24Transaction.withdraw_memo_type ??
                                                    'text'}):</span
                                            >
                                            <code class="ml-1 rounded bg-gray-100 px-1">
                                                {sep24Transaction.withdraw_memo}
                                            </code>
                                        </p>
                                    {/if}
                                    <details class="mt-2">
                                        <summary class="cursor-pointer text-xs text-gray-500"
                                            >Full transaction</summary
                                        >
                                        <pre class="mt-1 overflow-x-auto text-xs">{JSON.stringify(
                                                sep24Transaction,
                                                null,
                                                2,
                                            )}</pre>
                                    </details>
                                </div>

                                <!-- Withdrawal: Send Payment button -->
                                {#if withdrawalReady && !paymentResult?.success}
                                    <button
                                        onclick={sendWithdrawalPayment}
                                        disabled={isSendingPayment}
                                        class="mb-3 w-full rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {#if isSendingPayment}
                                            Signing & submitting...
                                        {:else}
                                            Send {sep24Transaction.amount_in || transferAmount}
                                            {selectedAsset} to Anchor
                                        {/if}
                                    </button>
                                {/if}

                                <!-- Payment result -->
                                {#if paymentResult}
                                    {#if paymentResult.success}
                                        <div
                                            class="mb-3 rounded-md border border-green-200 bg-green-50 p-3"
                                        >
                                            <p class="text-sm font-medium text-green-700">
                                                Payment submitted
                                            </p>
                                            {#if paymentResult.stellarTxId}
                                                <p class="mt-1 text-xs text-green-600">
                                                    <a
                                                        href="https://stellar.expert/explorer/testnet/tx/{paymentResult.stellarTxId}"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        class="underline hover:no-underline"
                                                    >
                                                        View on Stellar Expert
                                                    </a>
                                                </p>
                                            {/if}
                                        </div>
                                    {:else}
                                        <div
                                            class="mb-3 rounded-md border border-red-200 bg-red-50 p-3"
                                        >
                                            <p class="text-sm font-medium text-red-700">
                                                Payment failed
                                            </p>
                                            <p class="mt-1 text-xs text-red-600">
                                                {paymentResult.error}
                                            </p>
                                        </div>
                                    {/if}
                                {/if}
                            {/if}

                            <button
                                onclick={openSep24Url}
                                class="w-full rounded-lg border border-green-600 bg-white px-4 py-2 text-green-600 hover:bg-green-50"
                            >
                                {sep24PopupRef && !sep24PopupRef.closed
                                    ? 'Refocus Interactive UI'
                                    : 'Open Interactive UI'}
                            </button>
                            <p class="mt-2 text-xs text-gray-500">
                                URL: <a
                                    href={sep24Result.url}
                                    target="_blank"
                                    rel="external noopener noreferrer"
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
            Detailed information about the anchor's capabilities, loaded automatically.
        </p>

        {#if !initialized}
            <p class="text-sm text-gray-500">Initialize first to explore SEPs.</p>
        {:else}
            <!-- Tab bar -->
            <div class="flex border-b border-gray-200" role="tablist">
                {#each sepTabs as tab (tab.id)}
                    <button
                        role="tab"
                        aria-selected={selectedSepTab === tab.id}
                        onclick={() => (selectedSepTab = tab.id)}
                        class="relative px-4 py-2.5 text-sm font-medium transition-colors
                            {selectedSepTab === tab.id
                            ? 'text-violet-700'
                            : 'text-gray-500 hover:text-gray-700'}"
                    >
                        {tab.label}
                        <span class="ml-1 text-xs font-normal text-gray-400">{tab.subtitle}</span>
                        {#if selectedSepTab === tab.id}
                            <span class="absolute inset-x-0 -bottom-px h-0.5 bg-violet-600"></span>
                        {/if}
                    </button>
                {/each}
            </div>

            <!-- Tab content -->
            <div class="mt-4">
                {#if selectedSepTab === 'sep6'}
                    {#await data.sep6Info then sep6Info}
                        {@render renderSepInfo(sep6Info)}
                    {/await}
                {:else if selectedSepTab === 'sep24'}
                    {#await data.sep24Info then sep24Info}
                        {@render renderSepInfo(sep24Info)}
                    {/await}
                {:else if selectedSepTab === 'sep38'}
                    {#await data.sep38Info then sep38Info}
                        {@render renderSepInfo(sep38Info)}
                    {/await}
                {/if}
            </div>
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

{#snippet renderSepInfo(sepInfo: Sep6Info | Sep24Info | Sep38Info | null)}
    {#if sepInfo}
        <pre class="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs">{JSON.stringify(
                sepInfo,
                null,
                2,
            )}</pre>
    {:else}
        <p class="text-sm text-gray-500">SEP info unavailable</p>
    {/if}
{/snippet}
