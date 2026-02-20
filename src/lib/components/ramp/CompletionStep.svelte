<!--
@component Completion Step

Success view with green checkmark, title, transaction summary (amount, fee,
Stellar Explorer link, bank info), and a reset button.

Usage:
```html
<CompletionStep
    title="Transaction Complete!"
    message="Your digital assets have been sent to your wallet."
    {transaction}
    {quote}
    {network}
    onReset={reset}
/>
```
-->
<script lang="ts">
    import type { OnRampTransaction, OffRampTransaction, Quote } from '$lib/anchors/types';
    import type { StellarNetwork } from '$lib/wallet/types';
    import { displayCurrency } from '$lib/utils/currency';

    interface Props {
        title: string;
        message: string;
        transaction: OnRampTransaction | OffRampTransaction | null;
        quote: Quote | null;
        network: StellarNetwork;
        onReset: () => void;
    }

    let { title, message, transaction, quote, network, onReset }: Props = $props();

    function hasFiatAccount(
        tx: OnRampTransaction | OffRampTransaction,
    ): tx is OffRampTransaction {
        return 'fiatAccount' in tx;
    }
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
            ></path>
        </svg>
    </div>

    <h2 class="mt-4 text-xl font-semibold text-gray-900">{title}</h2>
    <p class="mt-2 text-gray-500">{message}</p>

    {#if transaction}
        <div class="mt-4 space-y-1 text-sm text-gray-600">
            <p>
                Amount: {parseFloat(
                    transaction.toAmount || quote?.toAmount || '0',
                ).toLocaleString()}
                {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
            </p>
            {#if transaction.feeAmount}
                <p>
                    Fee: {transaction.feeAmount}
                    {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
                    {#if transaction.feeBps}
                        <span class="text-gray-400">({transaction.feeBps / 100}%)</span>
                    {/if}
                </p>
            {/if}
            {#if hasFiatAccount(transaction) && transaction.fiatAccount?.bankName}
                <p>Bank: {transaction.fiatAccount.bankName}</p>
            {/if}
            {#if transaction.stellarTxHash}
                <p class="mt-1">
                    <a
                        href="https://stellar.expert/explorer/{network}/tx/{transaction.stellarTxHash}"
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
        onclick={onReset}
        class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
        Start New Transaction
    </button>
</div>
