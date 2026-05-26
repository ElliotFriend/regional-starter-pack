<!--
@component Interactive Ramp Flow Component

Drives the anchor-hosted (SEP-24-style) interactive ramp flow. The hosted UI is
opened in a popup window; this component starts the session (optionally after a
SEP-10 wallet handshake), then polls the anchor for the transaction status until
it completes.

Usage:
```html
<InteractiveRampFlow direction="onramp" />
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { page } from '$app/state';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { getStatusColor } from '$lib/utils/status';
    import { TX_STATUS } from '$lib/constants';
    import { PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import * as api from '$lib/api/anchor';
    import type { OnRampTransaction, OffRampTransaction, TokenInfo } from '$lib/anchors/types';

    let { direction }: { direction: 'onramp' | 'offramp' } = $props();

    const provider = $derived(page.data.anchor.id);
    const requiresWalletAuth = $derived(page.data.requiresWalletAuth);
    const displayName = $derived(page.data.displayName);
    const assetCode = $derived(page.data.primaryToken);
    const assetIssuer = $derived(
        page.data.supportedTokens.find((t: TokenInfo) => t.symbol === page.data.primaryToken)
            ?.issuer,
    );
    const inputPrefix = $derived(page.data.activeRegion?.currencySymbol ?? '$');

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    const isOnRamp = $derived(direction === 'onramp');

    // Steps: 'input' | 'redirecting' | 'pending' | 'complete'
    let step = $state<'input' | 'redirecting' | 'pending' | 'complete'>('input');

    let amount = $state('');
    let error = $state<string | null>(null);
    let transaction = $state<OnRampTransaction | OffRampTransaction | null>(null);

    // Session details captured when the interactive flow starts.
    let transactionId = $state<string | null>(null);
    let interactiveUrl = $state<string | null>(null);
    let authToken: string | undefined;

    // Polling state
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    const MAX_POLL_COUNT = 60; // ~5 minutes at 5s intervals
    let pollingTimedOut = $derived(pollCount >= MAX_POLL_COUNT);

    function openInteractiveWindow(url: string) {
        if (!browser) return;
        window.open(url, 'coins-interactive', 'width=500,height=800');
    }

    async function start() {
        if (!walletStore.publicKey) return;

        step = 'redirecting';
        error = null;

        try {
            let auth: string | undefined;
            if (requiresWalletAuth) {
                const challenge = await api.getAuthChallenge(
                    fetch,
                    provider,
                    walletStore.publicKey,
                );
                const { signedXdr } = await signWithFreighter(
                    challenge.transactionXdr,
                    walletStore.network,
                );
                auth = (await api.submitAuthChallenge(fetch, provider, signedXdr)).token;
            }
            authToken = auth;

            const session = await api.startInteractive(fetch, provider, {
                direction,
                assetCode,
                assetIssuer,
                account: walletStore.publicKey,
                amount: amount || undefined,
                auth,
            });

            transactionId = session.transactionId;
            interactiveUrl = session.interactiveUrl;
            openInteractiveWindow(session.interactiveUrl);

            step = 'pending';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start interactive flow';
            step = 'input';
        }
    }

    function startPolling() {
        if (refreshInterval) clearInterval(refreshInterval);
        pollCount = 0;

        refreshInterval = setInterval(async () => {
            pollCount += 1;

            if (pollingTimedOut) {
                stopPolling();
                return;
            }

            if (!transactionId) return;

            const updated = await api.getInteractiveTransaction(
                fetch,
                provider,
                direction,
                transactionId,
                authToken,
            );

            if (updated) {
                transaction = updated;

                if (updated.status === TX_STATUS.COMPLETED) {
                    step = 'complete';
                    stopPolling();
                } else if (
                    updated.status === TX_STATUS.FAILED ||
                    updated.status === TX_STATUS.EXPIRED ||
                    updated.status === TX_STATUS.CANCELLED
                ) {
                    error = `Transaction ${updated.status}.`;
                    stopPolling();
                }
            }
        }, 5000);
    }

    function stopPolling() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function reopenWindow() {
        if (interactiveUrl) openInteractiveWindow(interactiveUrl);
    }

    function reset() {
        amount = '';
        error = null;
        transaction = null;
        transactionId = null;
        interactiveUrl = null;
        authToken = undefined;
        step = 'input';
        stopPolling();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => stopPolling();
    });
</script>

<div class="mx-auto max-w-lg">
    {#if step === 'input'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">
                {isOnRamp ? 'On-Ramp' : 'Off-Ramp'}
            </h2>
            <p class="mt-1 text-sm text-gray-500">
                You'll complete this transaction in {displayName}'s secure hosted window.
            </p>

            {#if !walletStore.isConnected}
                <div class="mt-6">
                    <p class="mb-3 text-sm text-gray-500">Connect your wallet to get started.</p>
                    <WalletConnect />
                </div>
            {:else}
                <AmountInput
                    bind:amount
                    label="Amount (optional)"
                    placeholder="Leave blank to enter it in the hosted window"
                    {inputPrefix}
                    isWalletConnected={walletStore.isConnected}
                    hasTrustline={true}
                    isGettingQuote={false}
                    onSubmit={start}
                />
                <button
                    onclick={start}
                    class="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Continue to {displayName}
                </button>
            {/if}
        </div>
    {:else if step === 'redirecting'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">Starting your session…</h2>
            <p class="mt-2 text-sm text-gray-500">
                {requiresWalletAuth
                    ? 'Approve the signature request in your wallet to authenticate.'
                    : 'Preparing the hosted window.'}
            </p>
        </div>
    {:else if step === 'pending'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-gray-900">Awaiting completion</h2>
                {#if transaction}
                    <span
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
                            transaction.status,
                        )}"
                    >
                        {transaction.status}
                    </span>
                {/if}
            </div>

            <p class="mt-2 text-sm text-gray-500">
                Complete the {isOnRamp ? 'deposit' : 'withdrawal'} in the {displayName} window that opened.
                This page will update automatically once it's done.
            </p>

            <div class="mt-6">
                <button
                    onclick={reopenWindow}
                    class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Reopen window
                </button>
            </div>

            {#if transactionId}
                <div class="mt-6 rounded-md bg-gray-50 p-4">
                    <span class="text-sm text-gray-500">Transaction ID</span>
                    <p class="mt-0.5 font-medium">
                        <CopyableField value={transactionId} mono />
                    </p>
                </div>
            {/if}

            <div class="mt-6">
                {#if pollingTimedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">We haven't received confirmation yet</p>
                        <p class="mt-1">
                            Your transaction is still processing. You can close this page and check
                            back later using the transaction ID above.
                        </p>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        Waiting for confirmation… This page will update automatically.
                    </p>
                {/if}
            </div>
        </div>
    {:else if step === 'complete'}
        <CompletionStep
            title="Transaction Complete!"
            message={isOnRamp
                ? 'Your digital assets have been sent to your wallet.'
                : 'Your payout is on its way to your bank account.'}
            {transaction}
            quote={null}
            {network}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<!-- For Developers -->
<section class="mx-auto mt-8 max-w-lg">
    <DevBox
        items={[
            {
                text: 'View InteractiveRampFlow component source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/components/InteractiveRampFlow.svelte',
            },
            {
                text: 'View interactive anchor API proxy route',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor/[provider]/interactive',
            },
        ]}
    />
</section>
