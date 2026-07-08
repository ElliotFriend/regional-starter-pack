<script lang="ts">
    import { resolve } from '$app/paths';
    import { ANCHORS } from '$lib/config/anchors';
    import { getRegionsForAnchor, getRegion } from '$lib/config/regions';
    import { page } from '$app/state';
    import CriteriaScorecard from '$lib/components/CriteriaScorecard.svelte';

    const profile = ANCHORS.koywe;
    const regions = getRegionsForAnchor('koywe');

    // Koywe serves multiple regions; each links to its own ?region= flow.
    const koyweRegions = regions.filter((r) => profile.regions[r.id]);

    const requestedRegion = $derived(page.url.searchParams.get('region') ?? 'argentina');
    const activeRegionId = $derived(
        koyweRegions.some((r) => r.id === requestedRegion)
            ? requestedRegion
            : (koyweRegions[0]?.id ?? 'argentina'),
    );
    const activeRegion = $derived(getRegion(activeRegionId));
    const activeCapability = $derived(profile.regions[activeRegionId]);
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
    <header class="flex items-start gap-4">
        {#if profile.logo}
            <img src={profile.logo} alt="Koywe logo" class="h-12 w-12 rounded" />
        {/if}
        <div>
            <h1 class="text-3xl font-semibold text-gray-900">{profile.name}</h1>
            <p class="mt-1 text-gray-600">{profile.description}</p>
        </div>
    </header>

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">Regions</h2>
        <div class="mt-3 flex flex-wrap gap-2">
            {#each koyweRegions as r (r.id)}
                <a
                    href="{resolve('/anchors/koywe')}?region={r.id}"
                    class="rounded-md border px-3 py-1.5 text-sm {activeRegionId === r.id
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'}"
                >
                    {r.flag}
                    {r.name}
                </a>
            {/each}
        </div>

        {#if activeRegion && activeCapability}
            <div class="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-500">Currency</span>
                    <p class="font-medium">{activeRegion.currency}</p>
                </div>
                <div>
                    <span class="text-gray-500">Rails</span>
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
                        href="{resolve('/anchors/koywe/onramp')}?region={activeRegionId}"
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        On-Ramp ({activeRegion?.currency} → {activeCapability?.tokens[0]})
                    </a>
                {/if}
                {#if activeCapability.offRamp}
                    <a
                        href="{resolve('/anchors/koywe/offramp')}?region={activeRegionId}"
                        class="flex-1 rounded-md border border-indigo-600 px-4 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                        Off-Ramp ({activeCapability?.tokens[0]} → {activeRegion?.currency})
                    </a>
                {/if}
            </div>
        {/if}
    </section>

    {#if profile.scorecard}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">How this anchor scores</h2>
            <div class="mt-4">
                <CriteriaScorecard scorecard={profile.scorecard} detailed />
            </div>
        </section>
    {/if}

    {#if profile.integrationFlow}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Integration Flow</h2>
            <div class="mt-4 grid gap-6 md:grid-cols-2">
                <div>
                    <h3 class="text-sm font-medium text-gray-700">On-Ramp</h3>
                    <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-600">
                        {#each profile.integrationFlow.onRamp as step, i (i)}
                            <li>
                                <span class="font-medium text-gray-700">{step.title}</span> — {step.description}
                            </li>
                        {/each}
                    </ol>
                </div>
                <div>
                    <h3 class="text-sm font-medium text-gray-700">Off-Ramp</h3>
                    <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-600">
                        {#each profile.integrationFlow.offRamp as step, i (i)}
                            <li>
                                <span class="font-medium text-gray-700">{step.title}</span> — {step.description}
                            </li>
                        {/each}
                    </ol>
                </div>
            </div>
        </section>
    {/if}

    {#if profile.knownIssues && profile.knownIssues.length > 0}
        <section class="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 class="text-lg font-semibold text-amber-900">Known Issues</h2>
            <ul class="mt-3 space-y-2 text-sm text-amber-800">
                {#each profile.knownIssues as issue, i (i)}
                    <li>{issue.text}</li>
                {/each}
            </ul>
        </section>
    {/if}

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">Links</h2>
        <ul class="mt-3 space-y-1 text-sm">
            {#each Object.entries(profile.links) as [label, url] (label)}
                <li>
                    <span class="text-gray-500 capitalize">{label}:</span>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener"
                        class="text-indigo-600 hover:underline"
                    >
                        {url}
                    </a>
                </li>
            {/each}
        </ul>
    </section>
</div>
