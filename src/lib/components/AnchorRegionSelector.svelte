<script lang="ts">
    import { page } from '$app/state';
    import type { AnchorProfile } from '$lib/config/anchors';
    import { getRegionsForAnchor, getRegion } from '$lib/config/regions';

    let { profile }: { profile: AnchorProfile } = $props();

    // Regions this anchor actually serves. `getRegionsForAnchor` joins on the
    // region→anchors list; the filter drops any region without a capability entry.
    const regions = $derived(getRegionsForAnchor(profile.id).filter((r) => profile.regions[r.id]));
    const defaultRegionId = $derived(regions[0]?.id ?? '');

    // `?region=` selects the active market; the flow links forward it so the
    // on/off-ramp pages open in the right region.
    const activeRegionId = $derived.by(() => {
        const req = page.url.searchParams.get('region');
        return req && profile.regions[req] ? req : defaultRegionId;
    });
    const activeRegion = $derived(getRegion(activeRegionId));
    const activeCapability = $derived(profile.regions[activeRegionId]);
</script>

<section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
    <h2 class="text-lg font-semibold text-gray-900">
        {regions.length > 1 ? 'Regions' : 'Region'}
    </h2>

    {#if regions.length > 1}
        <div class="mt-3 flex flex-wrap gap-2">
            {#each regions as r (r.id)}
                <a
                    href={`?region=${r.id}`}
                    class="rounded-md border px-3 py-1.5 text-sm {r.id === activeRegionId
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'}"
                >
                    {r.flag}
                    {r.name}
                </a>
            {/each}
        </div>
    {/if}

    {#if activeRegion && activeCapability}
        <div class="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
                <span class="text-gray-500">Currency</span>
                <p class="font-medium">{activeRegion.currency}</p>
            </div>
            <div>
                <span class="text-gray-500"
                    >{activeCapability.paymentRails.length > 1 ? 'Rails' : 'Rail'}</span
                >
                <p class="font-medium uppercase">{activeCapability.paymentRails.join(', ')}</p>
            </div>
            <div>
                <span class="text-gray-500">Token</span>
                <p class="font-medium">{activeCapability.tokens.join(', ')}</p>
            </div>
            <div>
                <span class="text-gray-500">KYC</span>
                <p class="font-medium">
                    {activeCapability.kycRequired ? 'Required' : 'Not required'}
                </p>
            </div>
        </div>

        <div class="mt-6 flex gap-3">
            {#if activeCapability.onRamp}
                <a
                    href={`/anchors/${profile.id}/onramp?region=${activeRegionId}`}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                    On-Ramp ({activeRegion.currency} → {activeCapability.tokens[0]})
                </a>
            {/if}
            {#if activeCapability.offRamp}
                <a
                    href={`/anchors/${profile.id}/offramp?region=${activeRegionId}`}
                    class="flex-1 rounded-md border border-indigo-600 px-4 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                >
                    Off-Ramp ({activeCapability.tokens[0]} → {activeRegion.currency})
                </a>
            {/if}
        </div>
    {/if}
</section>
