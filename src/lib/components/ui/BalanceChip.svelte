<script lang="ts">
    import { onMount } from 'svelte';
    import { getAnchorBalances, type AnchorBalance } from '$lib/api/anchor';
    import { displayCurrency, formatCurrency } from '$lib/utils/currency';

    interface Props {
        provider: string;
    }

    let { provider }: Props = $props();

    const REFRESH_INTERVAL_MS = 300_000;

    let balances = $state<AnchorBalance[]>([]);
    let loading = $state(true);
    let refreshing = $state(false);
    let hasError = $state(false);
    let hasLoadedOnce = $state(false);

    let visibleBalances = $derived(
        balances.filter((b) => parseFloat(b.available) > 0 || parseFloat(b.hold) > 0),
    );

    async function loadBalances(isInitial: boolean) {
        if (isInitial) {
            loading = true;
        } else {
            refreshing = true;
        }
        try {
            balances = await getAnchorBalances(fetch, provider);
            hasError = false;
            hasLoadedOnce = true;
        } catch (err) {
            console.error('Failed to fetch anchor balances', err);
            hasError = true;
        } finally {
            loading = false;
            refreshing = false;
        }
    }

    onMount(() => {
        loadBalances(true);
        const interval = setInterval(() => {
            loadBalances(false);
        }, REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    });
</script>

{#if hasError}
    <!-- Errors are logged; render nothing. -->
{:else if loading && !hasLoadedOnce}
    <div
        class="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-400"
        aria-busy="true"
    >
        <span class="inline-block h-3 w-24 animate-pulse rounded bg-gray-200"></span>
    </div>
{:else if hasLoadedOnce && balances.length === 0}
    <!-- Provider doesn't support balances; render nothing. -->
{:else if visibleBalances.length > 0}
    <div
        class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 shadow-sm"
    >
        <span class="font-medium text-gray-500">PDAX wallet</span>
        {#each visibleBalances as balance (balance.currency)}
            <span class="text-gray-400">·</span>
            <span class="font-medium text-indigo-600">
                {formatCurrency(balance.available, displayCurrency(balance.currency))}
            </span>
        {/each}
        <button
            type="button"
            onclick={() => loadBalances(false)}
            disabled={refreshing}
            class="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-indigo-600 disabled:opacity-50"
            title="Refresh balances"
            aria-label="Refresh balances"
        >
            <svg
                class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
            </svg>
        </button>
    </div>
{/if}
