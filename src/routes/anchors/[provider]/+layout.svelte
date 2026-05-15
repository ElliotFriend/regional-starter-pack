<script lang="ts">
    import type { LayoutProps } from './$types';
    import BalanceChip from '$lib/components/ui/BalanceChip.svelte';

    let { data, children }: LayoutProps = $props();

    let provider = $derived(data.anchor.id);
</script>

<div class="mx-auto max-w-4xl">
    {#if provider === 'pdax'}
        <div class="mb-4 flex justify-end">
            <BalanceChip provider="pdax" />
        </div>
    {/if}
    {@render children()}
</div>
