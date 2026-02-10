<script lang="ts">
    import { getToken } from '$lib/config/regions';

    import type { PageProps } from './$types';
    const { data }: PageProps = $props()
    const { region, tokens, anchors } = $derived(data)
</script>

{#if region}
    <div class="mx-auto max-w-4xl">
        <!-- Header -->
        <div class="mb-8">
            <div class="flex items-center gap-4">
                <span class="text-5xl">{region.flag}</span>
                <div>
                    <h1 class="text-3xl font-bold text-gray-900">{region.name}</h1>
                    <p class="mt-1 text-lg text-gray-500">
                        {region.currency} ({region.currencySymbol})
                    </p>
                </div>
            </div>
            <p class="mt-4 text-gray-600">{region.description}</p>
        </div>

        <!-- Payment Rails -->
        <section class="mb-8">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">Payment Rails</h2>
            <div class="grid gap-4 sm:grid-cols-2">
                {#each region.paymentRails as rail}
                    <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <h3 class="font-semibold text-gray-900">{rail.name}</h3>
                        <p class="mt-1 text-sm text-gray-500">{rail.description}</p>
                        <span
                            class="mt-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                        >
                            {rail.type.replace('_', ' ')}
                        </span>
                    </div>
                {/each}
            </div>
        </section>

        <!-- Available Tokens -->
        <section class="mb-8">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">Available Digital Assets</h2>
            <div class="grid gap-4 sm:grid-cols-3">
                {#each [...tokens] as tokenSymbol}
                    {@const token = getToken(tokenSymbol)}
                    {#if token}
                        <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                            <h3 class="font-semibold text-gray-900">{token.symbol}</h3>
                            <p class="text-sm text-gray-500">{token.name}</p>
                            <p class="mt-2 text-xs text-gray-400">{token.description}</p>
                        </div>
                    {/if}
                {/each}
            </div>
        </section>

        <!-- Anchors -->
        <section class="mb-8">
            <h2 class="mb-4 text-xl font-semibold text-gray-900">Available Anchors</h2>
            {#if anchors.length === 0}
                <p class="text-gray-500">No anchors currently available for this region.</p>
            {:else}
                <div class="space-y-4">
                    {#each anchors as anchor}
                        {@const capability = anchor.regions[region.id]}
                        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                            <div class="flex items-start justify-between">
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-900">
                                        {anchor.name}
                                    </h3>
                                    <p class="mt-1 text-sm text-gray-500">{anchor.description}</p>
                                </div>
                                <a
                                    href="/anchors/{anchor.id}"
                                    class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                >
                                    View Details
                                </a>
                            </div>

                            {#if capability}
                                <div class="mt-4 flex flex-wrap gap-2">
                                    {#if capability.onRamp}
                                        <span
                                            class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                                        >
                                            On-Ramp
                                        </span>
                                    {/if}
                                    {#if capability.offRamp}
                                        <span
                                            class="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                                        >
                                            Off-Ramp
                                        </span>
                                    {/if}
                                    {#if capability.kycRequired}
                                        <span
                                            class="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800"
                                        >
                                            KYC Required
                                        </span>
                                    {/if}
                                </div>

                                <div class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                                    <div>
                                        <span class="font-medium text-gray-700">Payment Rails:</span
                                        >
                                        <span class="text-gray-500">
                                            {capability.paymentRails.join(', ').toUpperCase()}
                                        </span>
                                    </div>
                                    <div>
                                        <span class="font-medium text-gray-700">Tokens:</span>
                                        <span class="text-gray-500"
                                            >{capability.tokens.join(', ')}</span
                                        >
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Back Link -->
        <div class="mt-8">
            <a href="/regions" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                &larr; Back to Regions
            </a>
        </div>
    </div>
{/if}
