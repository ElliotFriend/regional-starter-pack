<script lang="ts">
    import type { Quote } from '$lib/anchors/types';
    import { onMount } from 'svelte';

    interface Props {
        quote: Quote;
        onRefresh?: () => void;
        isRefreshing?: boolean;
    }

    let { quote, onRefresh, isRefreshing = false }: Props = $props();

    // Common digital assets that should show more decimal places
    const CRYPTO_CURRENCIES = ['USDC', 'EURC', 'XLM', 'BTC', 'ETH', 'USDT', 'CETES'];

    /** Strip the issuer from a `CODE:ISSUER` asset string. */
    function displayCurrency(currency: string): string {
        return currency.split(':')[0];
    }

    function formatCurrency(amount: string, currency: string): string {
        const num = parseFloat(amount);
        const code = displayCurrency(currency);
        // For digital assets, show more decimal places
        if (CRYPTO_CURRENCIES.includes(code)) {
            return `${num.toFixed(7)} ${code}`;
        }
        // For fiat currencies, use locale formatting with 2 decimal places
        return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
    }

    function calculateExpiresIn(expiresAt: string): string {
        const expires = new Date(expiresAt);
        const now = new Date();
        const diffMs = expires.getTime() - now.getTime();

        if (diffMs <= 0) return 'Expired';

        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);

        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    }

    // Use a tick counter to force re-computation
    let tick = $state(0);

    onMount(() => {
        const interval = setInterval(() => {
            tick += 1;
        }, 1000);

        return () => clearInterval(interval);
    });

    // Derived values that depend on quote and tick
    let expiresIn = $derived.by(() => {
        // Reference tick to trigger re-computation
        void tick;
        return calculateExpiresIn(quote.expiresAt);
    });

    let isExpired = $derived.by(() => {
        void tick;
        return new Date(quote.expiresAt) <= new Date();
    });
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium text-gray-900">Quote</h3>
        {#if onRefresh}
            <button
                onclick={() => onRefresh?.()}
                disabled={isRefreshing}
                class="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
        {/if}
    </div>

    <div class="mt-4 space-y-3">
        <div class="flex justify-between">
            <span class="text-gray-500">You send</span>
            <span class="font-medium">{formatCurrency(quote.fromAmount, quote.fromCurrency)}</span>
        </div>

        <div class="flex justify-between">
            <span class="text-gray-500">You receive</span>
            <span class="font-medium text-green-600"
                >{formatCurrency(quote.toAmount, quote.toCurrency)}</span
            >
        </div>

        <div class="border-t border-gray-100 pt-3">
            <div class="flex justify-between text-sm">
                <span class="text-gray-500">Exchange rate</span>
                <span class="text-gray-700"
                    >1 {displayCurrency(quote.toCurrency)} ≈ {parseFloat(quote.exchangeRate).toFixed(7)} {displayCurrency(quote.fromCurrency)}</span
                >
            </div>

            <div class="mt-1 flex justify-between text-sm">
                <span class="text-gray-500">Fee</span>
                <span class="text-gray-700">{formatCurrency(quote.fee, quote.fromCurrency)}</span>
            </div>
        </div>

        <div class="flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
            <span class="text-gray-500">Expires in</span>
            <span class={isExpired ? 'font-medium text-red-600' : 'text-gray-700'}>
                {expiresIn}
            </span>
        </div>
    </div>

    {#if isExpired}
        <div class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            This quote has expired. Please refresh to get a new quote.
        </div>
    {/if}
</div>
