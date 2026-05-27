<script lang="ts">
    import { untrack } from 'svelte';
    import OffRampFlow from '$lib/components/OffRampFlow.svelte';
    import OnRampFlow from '$lib/components/OnRampFlow.svelte';
    import InteractiveRampFlow from '$lib/components/InteractiveRampFlow.svelte';
    import RampPage from '$lib/components/RampPage.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    // The page load (+page.ts) guards that direction is 'onramp' | 'offramp'
    // at runtime; assert the narrowed type here for the component props.
    const direction = $derived(data.direction as 'onramp' | 'offramp');

    const hasInteractive = $derived(data.flowStyles.includes('interactive'));
    const hasProgrammatic = $derived(data.flowStyles.includes('programmatic'));

    // Default to the interactive flow when available; this is the initial
    // selection only — the user can switch via the toggle below.
    let mode = $state<'interactive' | 'programmatic'>(
        untrack(() => data.flowStyles.includes('interactive')) ? 'interactive' : 'programmatic',
    );
</script>

<RampPage gated={mode === 'programmatic'}>
    {#snippet controls()}
        {#if hasInteractive && hasProgrammatic}
            <div class="mx-auto mb-6 max-w-lg">
                <div
                    role="group"
                    aria-label="Choose ramp flow"
                    class="inline-flex w-full rounded-md border border-gray-200 bg-gray-50 p-1"
                >
                    <button
                        type="button"
                        aria-pressed={mode === 'interactive'}
                        onclick={() => (mode = 'interactive')}
                        class="flex-1 rounded px-3 py-1.5 text-sm font-medium {mode ===
                        'interactive'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'}"
                    >
                        Hosted (Interactive)
                    </button>
                    <button
                        type="button"
                        aria-pressed={mode === 'programmatic'}
                        onclick={() => (mode = 'programmatic')}
                        class="flex-1 rounded px-3 py-1.5 text-sm font-medium {mode ===
                        'programmatic'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'}"
                    >
                        Programmatic
                    </button>
                </div>
            </div>
        {/if}
    {/snippet}

    {#if mode === 'interactive'}
        <InteractiveRampFlow {direction} />
    {:else if direction === 'onramp'}
        <OnRampFlow />
    {:else}
        <OffRampFlow />
    {/if}
</RampPage>
