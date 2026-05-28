<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { authStore } from '$lib/stores/auth';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { getStellarAsset } from '$lib/wallet/stellar';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import * as ta from '$lib/api/testanchor';
    import type { Sep24Transaction } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

    const PROVIDER = 'testanchor';
    const SRT_ISSUER = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('SRT', SRT_ISSUER);

    type Step = 'connect' | 'ready' | 'hosted' | 'complete';
    let step = $state<Step>('connect');

    let amount = $state('');
    let transactionId = $state<string | null>(null);
    let transaction = $state<Sep24Transaction | null>(null);
    let interactiveUrl = $state<string | null>(null);
    let isWorking = $state(false);
    let error = $state<string | null>(null);
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    const MAX_POLLS = 120; // ~10 min @ 5s
    const pollingTimedOut = $derived(pollCount >= MAX_POLLS);

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') {
            step = 'ready';
        }
    });

    async function ensureAuth(): Promise<string | undefined> {
        if (!walletStore.publicKey) return undefined;
        const cached = authStore.get(PROVIDER, walletStore.publicKey);
        if (cached) return cached;
        const challenge = await ta.getChallenge(fetch, walletStore.publicKey);
        const { signedXdr } = await signWithFreighter(challenge.transaction, walletStore.network);
        const { token } = await ta.submitChallenge(fetch, signedXdr);
        authStore.set(PROVIDER, walletStore.publicKey, token);
        return token;
    }

    function cachedAuth(): string | undefined {
        return walletStore.publicKey ? authStore.get(PROVIDER, walletStore.publicKey) : undefined;
    }

    async function startDeposit() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await ensureAuth();
            if (!token) throw new Error('Wallet authentication failed');
            const session = await ta.sep24Deposit(fetch, token, {
                asset_code: 'SRT',
                asset_issuer: SRT_ISSUER,
                account: walletStore.publicKey,
                amount: amount || undefined,
            });
            transactionId = session.id;
            interactiveUrl = session.url;
            step = 'hosted';
            window.open(session.url, '_blank', 'noopener');
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start deposit';
        } finally {
            isWorking = false;
        }
    }

    function startPolling() {
        stopPolling();
        pollCount = 0;
        pollTimer = setInterval(async () => {
            pollCount += 1;
            if (pollingTimedOut) {
                stopPolling();
                return;
            }
            if (!transactionId) return;
            const token = cachedAuth();
            if (!token) return;
            try {
                const updated = await ta.getSep24Transaction(fetch, token, transactionId);
                if (updated) {
                    transaction = updated;
                    if (updated.status === 'completed') {
                        step = 'complete';
                        stopPolling();
                    } else if (
                        updated.status === 'refunded' ||
                        updated.status === 'expired' ||
                        updated.status === 'error' ||
                        updated.status === 'no_market'
                    ) {
                        stopPolling();
                    }
                }
            } catch (err) {
                console.warn('[testanchor sep24 onramp] poll failed:', err);
            }
        }, 5000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function reopen() {
        if (interactiveUrl) window.open(interactiveUrl, '_blank', 'noopener');
    }

    function reset() {
        amount = '';
        transactionId = null;
        transaction = null;
        interactiveUrl = null;
        error = null;
        step = walletStore.isConnected ? 'ready' : 'connect';
        stopPolling();
    }

    function clearError() {
        error = null;
    }

    onMount(() => () => stopPolling());
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a
                href={resolve('/anchors/testanchor')}
                class="text-sm text-indigo-600 hover:underline"
            >
                ← Test Anchor
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SEP-24 On-Ramp (Interactive)</h1>
            <p class="mt-1 text-sm text-gray-500">
                Deposit SRT to your Stellar testnet wallet via the anchor-hosted interactive flow.
            </p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                The interactive flow requires a SEP-10 wallet signature to authenticate.
            </p>
        </div>
    {/if}

    {#if step === 'ready'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Start interactive deposit</h2>
            <p class="mt-1 text-sm text-gray-500">
                Optionally pre-fill an amount. The anchor will collect any further details inside
                its hosted UI.
            </p>

            <TrustlineStatus {stellarAsset} {network} onStatusChange={() => {}} />

            <label class="mt-6 block text-sm font-medium text-gray-700" for="amount">
                Amount (SRT, optional)
            </label>
            <input
                id="amount"
                type="number"
                bind:value={amount}
                placeholder="10"
                min="0"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />

            <button
                onclick={startDeposit}
                disabled={isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Authenticating…' : 'Start hosted deposit'}
            </button>
            <p class="mt-3 text-xs text-gray-500">
                You'll be prompted to sign a SEP-10 challenge in Freighter, then a new tab opens
                with the anchor-hosted flow.
            </p>
        </div>
    {/if}

    {#if step === 'hosted'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Complete in hosted flow</h2>
            <p class="mt-1 text-sm text-gray-500">
                A new tab opened with the anchor's hosted UI. Finish the deposit there — this page
                polls for updates.
            </p>

            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if transactionId}
                    <p>Transaction: <CopyableField value={transactionId} mono /></p>
                {/if}
                {#if transaction}
                    <p>Status: <span class="font-mono">{transaction.status}</span></p>
                    {#if transaction.message}
                        <p>Message: {transaction.message}</p>
                    {/if}
                {/if}
            </div>

            <div class="mt-4 flex gap-3">
                <button
                    onclick={reopen}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Reopen hosted flow
                </button>
            </div>

            <div class="mt-6 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-24 transaction…</span>
            </div>

            {#if pollingTimedOut}
                <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still processing</p>
                    <p class="mt-1">
                        The deposit hasn't completed yet. You can check back later — your transaction
                        id is above.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    {#if step === 'complete' && transaction}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                    class="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">Deposit complete</h2>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if transaction.amount_out}
                    <p>Received: {transaction.amount_out} SRT</p>
                {/if}
                {#if transaction.stellar_transaction_id}
                    <p>
                        <a
                            href={`https://stellar.expert/explorer/${network}/tx/${transaction.stellar_transaction_id}`}
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            View on Stellar Expert ↗
                        </a>
                    </p>
                {/if}
                {#if transaction.more_info_url}
                    <p>
                        <a
                            href={transaction.more_info_url}
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            Anchor's transaction page ↗
                        </a>
                    </p>
                {/if}
            </div>
            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start new deposit
            </button>
        </div>
    {/if}

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={clearError} />
        </div>
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View this page source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/testanchor/interactive/onramp/+page.svelte',
            },
            {
                text: 'View TestAnchorRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/testanchor/ramp.ts',
            },
        ]}
    />
</section>
