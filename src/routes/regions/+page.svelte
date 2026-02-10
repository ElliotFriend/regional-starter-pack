<script lang="ts">
    import type { PageProps } from './$types';

    // we use `$props()` in SvelteKit to "grab" the various data that's been
    // loaded from any relevant `+layout.ts` or `+page.ts` files in the
    // directory structure. The `data`, in this case is inherited from the
    // root-level `+layout.ts` load function, rather than a co-located load
    // function.
    const { data }: PageProps = $props();
</script>

<div class="mx-auto max-w-4xl">
    <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-gray-900">Supported Regions</h1>
        <p class="mt-2 text-gray-600">
            Explore available on/off ramp options by region. Each region has different payment
            rails, supported tokens, and anchor providers.
        </p>
    </div>

    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.regions as region}
            <a
                href="/regions/{region.id}"
                class="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
            >
                <div class="flex items-center gap-3">
                    <span class="text-3xl">{region.flag}</span>
                    <div>
                        <h3 class="font-semibold text-gray-900 group-hover:text-indigo-600">
                            {region.name}
                        </h3>
                        <p class="text-sm text-gray-500">{region.currency}</p>
                    </div>
                </div>
                <p class="mt-3 line-clamp-2 text-sm text-gray-600">{region.description}</p>
                <div class="mt-4 flex flex-wrap gap-1">
                    {#each region.paymentRails as rail}
                        <span
                            class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                        >
                            {rail.name}
                        </span>
                    {/each}
                </div>
            </a>
        {/each}
    </div>

    <div class="mt-8">
        <a href="/" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            &larr; Back to Home
        </a>
    </div>
</div>
