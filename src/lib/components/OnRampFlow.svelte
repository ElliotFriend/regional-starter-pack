<script lang="ts">
    import { onMount } from 'svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import QuoteDisplay from './QuoteDisplay.svelte';
    import ErrorAlert from './ErrorAlert.svelte';
    import { getStatusColor } from '$lib/utils/status';
    import { PROVIDER, CURRENCY, TX_STATUS } from '$lib/constants';
    import * as api from '$lib/api/anchor';
    import type { Quote, OnRampTransaction } from '$lib/anchors/types';

    interface Props {
        provider?: string;
    }

    let { provider = PROVIDER.ALFREDPAY }: Props = $props();

    // Local state for this flow
    let amount = $state('');
    let quote = $state<Quote | null>(null);
    let transaction = $state<OnRampTransaction | null>(null);
    let isGettingQuote = $state(false);
    let isCreatingTransaction = $state(false);
    let error = $state<string | null>(null);
    let refreshInterval: ReturnType<typeof setInterval> | null = null;

    // Steps: 'input' | 'quote' | 'payment' | 'complete'
    let step = $state<'input' | 'quote' | 'payment' | 'complete'>('input');

    async function getQuote() {
        if (!amount || isNaN(parseFloat(amount))) return;

        isGettingQuote = true;
        error = null;

        try {
            quote = await api.getQuote(fetch, provider, {
                fromCurrency: CURRENCY.FIAT,
                toCurrency: CURRENCY.USDC,
                amount,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function refreshQuote() {
        if (!amount) return;
        isGettingQuote = true;
        try {
            quote = await api.getQuote(fetch, provider, {
                fromCurrency: CURRENCY.FIAT,
                toCurrency: CURRENCY.USDC,
                amount,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function confirmQuote() {
        const customer = customerStore.current;
        if (!quote || !walletStore.publicKey || !customer) return;

        isCreatingTransaction = true;
        error = null;

        try {
            transaction = await api.createOnRamp(fetch, provider, {
                customerId: customer.id,
                quoteId: quote.id,
                stellarAddress: walletStore.publicKey,
                fromCurrency: quote.fromCurrency,
                toCurrency: quote.toCurrency,
                amount: quote.fromAmount,
            });
            step = 'payment';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create transaction';
        } finally {
            isCreatingTransaction = false;
        }
    }

    function startPolling() {
        if (refreshInterval) clearInterval(refreshInterval);

        refreshInterval = setInterval(async () => {
            if (transaction) {
                const updated = await api.getOnRampTransaction(fetch, provider, transaction.id);

                if (updated) {
                    transaction = updated;

                    if (updated.status === TX_STATUS.COMPLETED) {
                        step = 'complete';
                        stopPolling();
                    } else if (
                        updated.status === TX_STATUS.FAILED ||
                        updated.status === TX_STATUS.EXPIRED
                    ) {
                        stopPolling();
                    }
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

    function reset() {
        amount = '';
        quote = null;
        transaction = null;
        error = null;
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
            <h2 class="text-xl font-semibold text-gray-900">On-Ramp</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the amount of local currency you want to convert to digital assets.
            </p>

            <div class="mt-6">
                <label for="amount" class="block text-sm font-medium text-gray-700"
                    >Amount (Local Currency)</label
                >
                <div class="mt-1 flex rounded-md shadow-sm">
                    <span
                        class="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm"
                    >
                        $
                    </span>
                    <input
                        type="number"
                        id="amount"
                        bind:value={amount}
                        placeholder="1000"
                        min="100"
                        step="100"
                        class="block w-full flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>
            </div>

            <button
                onclick={getQuote}
                disabled={!amount || isGettingQuote || !walletStore.isConnected}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isGettingQuote ? 'Getting Quote...' : 'Get Quote'}
            </button>

            {#if !walletStore.isConnected}
                <p class="mt-2 text-center text-sm text-gray-500">
                    Please connect your wallet first.
                </p>
            {/if}
        </div>
    {:else if step === 'quote'}
        <div class="space-y-4">
            {#if quote}
                <QuoteDisplay {quote} onRefresh={refreshQuote} isRefreshing={isGettingQuote} />
            {/if}

            <div class="flex gap-3">
                <button
                    onclick={reset}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onclick={confirmQuote}
                    disabled={isCreatingTransaction}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isCreatingTransaction ? 'Processing...' : 'Confirm & Get Payment Details'}
                </button>
            </div>
        </div>
    {:else if step === 'payment'}
        {#if transaction}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-semibold text-gray-900">Payment Instructions</h2>
                    <span
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
                            transaction.status,
                        )}"
                    >
                        {transaction.status}
                    </span>
                </div>

                <p class="mt-2 text-sm text-gray-500">
                    Transfer the following amount via bank transfer to complete your purchase.
                </p>

                {#if transaction.paymentInstructions}
                    {@const pi = transaction.paymentInstructions}
                    <div class="mt-6 space-y-4 rounded-md bg-gray-50 p-4">
                        <div>
                            <span class="text-sm text-gray-500">Bank</span>
                            <p class="font-medium">{pi.bankName}</p>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">CLABE</span>
                            <p class="font-mono font-medium">{pi.clabe}</p>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Beneficiary</span>
                            <p class="font-medium">{pi.beneficiary}</p>
                        </div>
                        <div>
                            <span class="text-sm text-gray-500">Reference</span>
                            <p class="font-mono font-medium">{pi.reference}</p>
                        </div>
                        <div class="border-t border-gray-200 pt-4">
                            <span class="text-sm text-gray-500">Amount</span>
                            <p class="text-2xl font-bold text-indigo-600">
                                {parseFloat(pi.amount).toLocaleString()}
                                {transaction.fromCurrency}
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                    <p>
                        <strong>Important:</strong> Use the exact reference number when making your transfer.
                        Your digital assets will be sent to your wallet once the payment is confirmed.
                    </p>
                </div>

                <div class="mt-6">
                    <p class="text-center text-sm text-gray-500">
                        Waiting for payment confirmation... This page will update automatically.
                    </p>
                </div>
            </div>
        {/if}
    {:else if step === 'complete'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
            >
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
                    ></path>
                </svg>
            </div>

            <h2 class="mt-4 text-xl font-semibold text-gray-900">Transaction Complete!</h2>
            <p class="mt-2 text-gray-500">Your digital assets have been sent to your wallet.</p>

            {#if transaction}
                <div class="mt-4 text-sm text-gray-600">
                    <p>Amount: {transaction.toAmount} {transaction.toCurrency}</p>
                    {#if transaction.stellarTxHash}
                        <p class="mt-1">
                            <a
                                href="https://stellar.expert/explorer/{walletStore.network}/tx/{transaction.stellarTxHash}"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-indigo-600 hover:text-indigo-800"
                            >
                                View on Stellar Expert
                            </a>
                        </p>
                    {/if}
                </div>
            {/if}

            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start New Transaction
            </button>
        </div>
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>
