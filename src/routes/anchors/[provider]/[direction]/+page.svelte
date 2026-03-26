<script lang="ts">
    import OffRampFlow from '$lib/components/OffRampFlow.svelte';
    import OnRampFlow from '$lib/components/OnRampFlow.svelte';
    import RampPage from '$lib/components/RampPage.svelte';
    import SepRampPage from '$lib/components/SepRampPage.svelte';
    import Sep24RampFlow from '$lib/components/Sep24RampFlow.svelte';
    import { page } from '$app/state';
    import type { PageProps } from './$types';

    let { params }: PageProps = $props();
    const { direction } = $derived(params);

    const capabilities = $derived(page.data.capabilities);
</script>

{#if capabilities.sep24}
    <SepRampPage>
        {#snippet children(token)}
            <Sep24RampFlow direction={direction === 'onramp' ? 'deposit' : 'withdraw'} {token} />
        {/snippet}
    </SepRampPage>
{:else}
    <RampPage>
        {#if direction === 'onramp'}
            <OnRampFlow />
        {:else}
            <OffRampFlow />
        {/if}
    </RampPage>
{/if}
