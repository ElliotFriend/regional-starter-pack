<script lang="ts">
    import type { PageProps } from './$types';
    const { data }: PageProps = $props();
</script>

<div class="mx-auto max-w-4xl">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-gray-900">Anchor Providers</h1>
        <p class="mt-2 text-gray-600">
            Anchors are regulated entities that bridge fiat currencies and the Stellar network. Each
            anchor operates in specific regions with different capabilities.
        </p>
    </div>

    <div class="grid gap-6 sm:grid-cols-2">
        {#each data.anchors as anchor}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">{anchor.name}</h3>
                <p class="mt-2 text-sm text-gray-600">{anchor.description}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                    {#each Object.keys(anchor.regions) as regionId}
                        <span
                            class="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800"
                        >
                            {regionId.replace('_', ' ')}
                        </span>
                    {/each}
                </div>
                <div class="mt-4 flex gap-3">
                    <a
                        href="/anchors/{anchor.id}"
                        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        View Details
                    </a>
                    <a
                        href={anchor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
                    >
                        Website
                    </a>
                </div>
            </div>
        {/each}
    </div>

    <div class="mt-8">
        <a href="/" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            &larr; Back to Home
        </a>
    </div>
</div>
