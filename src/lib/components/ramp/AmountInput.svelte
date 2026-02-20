<!--
@component Amount Input

Amount entry field with "Get Quote" button and wallet-not-connected message.
Supports an optional `$` prefix (on-ramp), max-amount validation (off-ramp),
and a `children` snippet slot for extra content (e.g. wallet registration spinner).

Usage:
```html
<AmountInput
    bind:amount
    label="Amount (Local Currency)"
    placeholder="1000"
    inputPrefix="$"
    isWalletConnected={walletStore.isConnected}
    {hasTrustline}
    {isGettingQuote}
    onSubmit={getQuote}
/>
```
-->
<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        amount: string;
        label: string;
        placeholder?: string;
        inputPrefix?: string;
        maxAmount?: string;
        isWalletConnected: boolean;
        hasTrustline: boolean;
        isGettingQuote: boolean;
        additionalDisabled?: boolean;
        onSubmit: () => void;
        children?: Snippet;
    }

    let {
        amount = $bindable(),
        label,
        placeholder = '',
        inputPrefix,
        maxAmount,
        isWalletConnected,
        hasTrustline,
        isGettingQuote,
        additionalDisabled = false,
        onSubmit,
        children,
    }: Props = $props();

    const exceedsMax = $derived(
        maxAmount !== undefined && parseFloat(amount) > parseFloat(maxAmount),
    );

    const isDisabled = $derived(
        !amount || isGettingQuote || !isWalletConnected || !hasTrustline || exceedsMax || additionalDisabled,
    );
</script>

<div class="mt-6">
    <label for="amount" class="block text-sm font-medium text-gray-700">{label}</label>
    {#if inputPrefix}
        <div class="mt-1 flex rounded-md shadow-sm">
            <span
                class="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-gray-500 sm:text-sm"
            >
                {inputPrefix}
            </span>
            <input
                type="number"
                id="amount"
                bind:value={amount}
                {placeholder}
                min="1"
                step="1"
                class="block w-full flex-1 rounded-none rounded-r-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>
    {:else}
        <input
            type="number"
            id="amount"
            bind:value={amount}
            {placeholder}
            min="1"
            step="1"
            max={maxAmount}
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
    {/if}

    {#if exceedsMax}
        <p class="mt-1 text-sm text-red-600">Insufficient balance</p>
    {/if}
</div>

{@render children?.()}

<button
    onclick={onSubmit}
    disabled={isDisabled}
    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
>
    {isGettingQuote ? 'Getting Quote...' : 'Get Quote'}
</button>

{#if !isWalletConnected}
    <p class="mt-2 text-center text-sm text-gray-500">Please connect your wallet first.</p>
{/if}
