<!--
@component Quote Step

Thin wrapper that renders a `<QuoteDisplay>` alongside Cancel and Confirm buttons.

Usage:
```html
<QuoteStep
    {quote}
    isRefreshing={isGettingQuote}
    {isConfirming}
    confirmLabel="Confirm & Get Payment Details"
    onRefresh={refreshQuote}
    onCancel={reset}
    onConfirm={confirmQuote}
/>
```
-->
<script lang="ts">
    import type { Quote } from '$lib/anchors/types';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';

    interface Props {
        quote: Quote | null;
        isRefreshing: boolean;
        isConfirming: boolean;
        confirmLabel: string;
        confirmingLabel?: string;
        onRefresh: () => void;
        onCancel: () => void;
        onConfirm: () => void;
    }

    let {
        quote,
        isRefreshing,
        isConfirming,
        confirmLabel,
        confirmingLabel = 'Processing...',
        onRefresh,
        onCancel,
        onConfirm,
    }: Props = $props();
</script>

<div class="space-y-4">
    {#if quote}
        <QuoteDisplay {quote} {onRefresh} {isRefreshing} />
    {/if}

    <div class="flex gap-3">
        <button
            onclick={onCancel}
            class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
            Cancel
        </button>
        <button
            onclick={onConfirm}
            disabled={isConfirming}
            class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
            {isConfirming ? confirmingLabel : confirmLabel}
        </button>
    </div>
</div>
