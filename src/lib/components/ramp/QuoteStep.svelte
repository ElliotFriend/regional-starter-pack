<!--
@component Quote Step

Thin wrapper that renders a `<QuoteDisplay>` alongside Cancel and Confirm buttons.

Set `indicative` to `true` for anchors whose upfront quote is non-binding (the
firm rate is fetched server-side at trade time, so the pre-checkout figure is
display-only). Forwarded to `<QuoteDisplay>`.

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
    indicative={capabilities?.lateFirmQuote ?? false}
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
        indicative?: boolean;
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
        indicative = false,
    }: Props = $props();
</script>

<div class="space-y-4">
    {#if quote}
        <QuoteDisplay {quote} {onRefresh} {isRefreshing} {indicative} />
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
