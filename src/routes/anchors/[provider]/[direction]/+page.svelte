<script lang="ts">
    import OffRampFlow from '$lib/components/OffRampFlow.svelte';
    import OnRampFlow from '$lib/components/OnRampFlow.svelte';
    import RampPage from '$lib/components/RampPage.svelte';
    import type { PageProps } from './$types';

    let { params }: PageProps = $props();
    const { direction } = $derived(params);
</script>

<RampPage>
    {#if direction === 'onramp'}
        <OnRampFlow />
    {:else}
        <OffRampFlow />
    {/if}
</RampPage>
