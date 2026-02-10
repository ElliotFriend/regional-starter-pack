<script lang="ts">
    import RampPage from '$lib/components/RampPage.svelte';
    import OnRampFlow from '$lib/components/OnRampFlow.svelte';

    import type { PageProps } from './$types';
    const { data }: PageProps = $props();
    const { anchor } = $derived(data);
</script>

<RampPage
    provider={anchor.id}
    title="On-Ramp with {anchor.name}"
    description="Transfer local currency via bank transfer and receive digital assets directly to your Stellar wallet."
    connectMessage="Connect your Freighter wallet to get started."
>
    <OnRampFlow provider={anchor.id} />
</RampPage>
