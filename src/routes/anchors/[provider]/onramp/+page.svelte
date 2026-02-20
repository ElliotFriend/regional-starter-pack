<script lang="ts">
    import RampPage from '$lib/components/RampPage.svelte';
    import OnRampFlow from '$lib/components/OnRampFlow.svelte';

    import type { PageProps } from './$types';
    const { data }: PageProps = $props();
    const { anchor, fiatCurrency } = $derived(data);

    // Derive the target token from the anchor's first region config
    const toCurrency = $derived.by(() => {
        const firstRegion = Object.values(anchor.regions)[0];
        return firstRegion?.tokens[0] ?? 'USDC';
    });
</script>

<RampPage
    provider={anchor.id}
    title="On-Ramp with {anchor.name}"
    description="Transfer local currency via bank transfer and receive digital assets directly to your Stellar wallet."
    connectMessage="Connect your Freighter wallet to get started."
    capabilities={anchor.capabilities}
>
    <OnRampFlow provider={anchor.id} {toCurrency} {fiatCurrency} capabilities={anchor.capabilities} />
</RampPage>
