<script lang="ts">
    import { resolve } from '$app/paths';
    import { COMMERCIAL_CRITERIA, DEVELOPER_CRITERIA } from '$lib/config/anchors';
    import CriteriaScorecard from '$lib/components/CriteriaScorecard.svelte';
    import type { PageProps } from './$types';
    const { data }: PageProps = $props();
</script>

<div class="mx-auto max-w-4xl">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-gray-900">Curated Anchor Providers</h1>
        <p class="mt-2 text-gray-600">
            Anchors are regulated entities that bridge fiat currencies and the Stellar network. Each
            anchor operates in specific regions with different capabilities.
        </p>
    </div>

    <!-- Quality Criteria Summary -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase">
            What We Look For
        </h2>
        <p class="mt-2 text-sm text-gray-600">
            We curate against two lenses — a commercial bar (real local value for end-users) and a
            developer bar (can you actually build on it).
        </p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
                <h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    Commercial
                </h3>
                <ul class="mt-2 list-outside list-disc space-y-1 px-6">
                    {#each COMMERCIAL_CRITERIA as criterion (criterion.id)}
                        <li class="text-sm text-gray-600">{criterion.label}</li>
                    {/each}
                </ul>
            </div>
            <div>
                <h3 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    Developer
                </h3>
                <ul class="mt-2 list-outside list-disc space-y-1 px-6">
                    {#each DEVELOPER_CRITERIA as criterion (criterion.id)}
                        <li class="text-sm text-gray-600">{criterion.label}</li>
                    {/each}
                </ul>
            </div>
        </div>
        <p class="mt-3 text-sm text-gray-500">
            Providers that don't yet meet these criteria appear as alternatives on individual
            <a href={resolve('/regions')} class="text-indigo-600 hover:text-indigo-800"
                >region pages</a
            >.
        </p>
    </div>

    <div class="grid gap-6 sm:grid-cols-2">
        {#each data.anchors as anchor (anchor.id)}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">{anchor.name}</h3>
                <p class="mt-2 text-sm text-gray-600">{anchor.description}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                    {#each Object.keys(anchor.regions) as regionId (regionId)}
                        {@const capability = anchor.regions[regionId]}
                        <span
                            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            class:bg-indigo-100={!capability.comingSoon}
                            class:text-indigo-800={!capability.comingSoon}
                            class:bg-amber-100={capability.comingSoon}
                            class:text-amber-800={capability.comingSoon}
                        >
                            {regionId.replace('_', ' ')}{capability.comingSoon
                                ? ' (coming soon)'
                                : ''}
                        </span>
                    {/each}
                </div>
                {#if anchor.scorecard}
                    <div class="mt-4">
                        <CriteriaScorecard scorecard={anchor.scorecard} />
                    </div>
                {/if}
                <div class="mt-4 flex gap-3">
                    <a
                        href={`/anchors/${anchor.id}`}
                        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        View Details
                    </a>
                    <a
                        href={anchor.links.website}
                        target="_blank"
                        rel="external noopener noreferrer"
                        class="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                    >
                        Website
                    </a>
                </div>
            </div>
        {/each}
    </div>

    <div class="mt-8">
        <a href={resolve('/')} class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            &larr; Back to Home
        </a>
    </div>
</div>
