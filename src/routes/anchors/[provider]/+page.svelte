<script lang="ts">
    import { getPaymentRail } from '$lib/config/rails';
    import { getToken } from '$lib/config/tokens';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import type { PageProps } from './$types';

    // we use `$props()` in SvelteKit to "grab" the various data that's been
    // loaded from any relevant `+layout.ts` or `+page.ts` files in the
    // directory structure.
    const { data }: PageProps = $props();
    // pull out the pieces of data as `$derived()` state.
    const { anchor, regions, tokens } = $derived(data);

    const devBoxItems = $derived.by(() => {
        if (!anchor) return [];
        const items: { text: string; link?: string }[] = [
            { text: `View ${anchor.name} client source code`, link: `https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/${anchor.id}` },
            { text: `${anchor.name} API documentation`, link: anchor.links.documentation },
        ];
        if (anchor.capabilities.sandbox) {
            items.push({ text: 'Sandbox environment available for testing' });
        }
        if (anchor.capabilities.kycFlow) {
            items.push({ text: `KYC flow: ${anchor.capabilities.kycFlow}` });
        }
        return items;
    });
</script>

<!-- Header -->
<div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900">{anchor.name}</h1>
    <p class="mt-2 text-gray-600">{anchor.description}</p>
    <div class="mt-3 flex flex-row flex-wrap gap-2">
        {#each Object.entries(anchor.links) as [label, url]}
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium capitalize text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
                {label}
            </a>
        {/each}
    </div>
</div>

<!-- Try It Out CTA -->
<div class="mb-8 rounded-lg bg-indigo-50 p-6">
    <h2 class="text-lg font-semibold text-indigo-900">Try {anchor.name}</h2>
    <p class="mt-1 text-sm text-indigo-700">
        Experience the on-ramp and off-ramp flows with {anchor.name}'s integration. Check
        out the process your users might go through as they interact with {anchor.name} from within
        your application.
    </p>
    <div class="mt-4 flex gap-3">
        <a
            href="/anchors/{anchor.id}/onramp"
            class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
            Try On-Ramp
        </a>
        <a
            href="/anchors/{anchor.id}/offramp"
            class="rounded-md bg-white px-4 py-2 text-sm font-medium text-indigo-600 ring-1 ring-indigo-600 hover:bg-indigo-50"
        >
            Try Off-Ramp
        </a>
        <a
            href={`https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/${anchor.id}`}
            target="_blank"
            class="rounded-md bg-white px-4 py-2 text-sm font-medium text-green-600 ring-1 ring-green-600 hover:bg-green-50"
        >
            View {anchor.name} Client Code
        </a>
    </div>
</div>

<!-- Supported Tokens -->
<section class="mb-8">
    <h2 class="mb-4 text-xl font-semibold text-gray-900">Supported Digital Assets</h2>
    <div class="grid gap-4 sm:grid-cols-3">
        {#each [...tokens] as tokenSymbol}
            {@const token = getToken(tokenSymbol)}
            {#if token}
                <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <h3 class="font-semibold text-gray-900">{token.symbol}</h3>
                    <p class="text-sm text-gray-500">{token.name}</p>
                </div>
            {/if}
        {/each}
    </div>
</section>

<!-- Supported Regions -->
<section class="mb-8">
    <h2 class="mb-4 text-xl font-semibold text-gray-900">Supported Regions</h2>
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th
                        scope="col"
                        class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                    >
                        Region
                    </th>
                    <th
                        scope="col"
                        class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                    >
                        Currency
                    </th>
                    <th
                        scope="col"
                        class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                    >
                        Payment Rails
                    </th>
                    <th
                        scope="col"
                        class="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
                    >
                        Capabilities
                    </th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
                {#each regions as region}
                    {@const capability = anchor.regions[region.id]}
                    <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap">
                            <a
                                href="/regions/{region.id}"
                                class="flex items-center gap-2 text-gray-900 hover:text-indigo-600"
                            >
                                <span>{region.flag}</span>
                                <span class="font-medium">{region.name}</span>
                            </a>
                        </td>
                        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
                            {region.currency}
                        </td>
                        <td class="px-6 py-4 text-sm whitespace-nowrap text-gray-500">
                            {#if capability}
                                {#each capability.paymentRails as railId}
                                    {@const rail = getPaymentRail(railId)}
                                    {#if rail}
                                        <span
                                            class="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800"
                                        >
                                            {rail.name}
                                        </span>
                                    {/if}
                                {/each}
                            {/if}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            {#if capability}
                                <div class="flex gap-1">
                                    {#if capability.onRamp}
                                        <span
                                            class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                                        >
                                            On
                                        </span>
                                    {/if}
                                    {#if capability.offRamp}
                                        <span
                                            class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                                        >
                                            Off
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</section>

<!-- Integration Flow -->
{#if anchor.integrationFlow}
    <section class="mb-8">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">Integration Flow</h2>
        <p class="mb-2">These are the steps you (as a developer) can expect to implement as you work with {anchor.name}.</p>
        <div class="grid gap-6 md:grid-cols-2">
            <div class="rounded-lg border border-gray-200 bg-white p-6">
                <h3 class="mb-3 font-semibold text-green-700">On-Ramp (Fiat &rarr; Crypto)</h3>
                <ol class="space-y-3">
                    {#each anchor.integrationFlow.onRamp as step, i}
                        <li class="flex gap-3">
                            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">{i + 1}</span>
                            <div>
                                <p class="font-medium text-gray-900">{step.title}</p>
                                <p class="text-sm text-gray-500">{step.description}</p>
                            </div>
                        </li>
                    {/each}
                </ol>
            </div>
            <div class="rounded-lg border border-gray-200 bg-white p-6">
                <h3 class="mb-3 font-semibold text-blue-700">Off-Ramp (Crypto &rarr; Fiat)</h3>
                <ol class="space-y-3">
                    {#each anchor.integrationFlow.offRamp as step, i}
                        <li class="flex gap-3">
                            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                            <div>
                                <p class="font-medium text-gray-900">{step.title}</p>
                                <p class="text-sm text-gray-500">{step.description}</p>
                            </div>
                        </li>
                    {/each}
                </ol>
            </div>
        </div>
    </section>
{/if}

<!-- For Developers -->
<section class="mb-8">
    <DevBox items={devBoxItems} />
</section>

<!-- Back Link -->
<div class="mt-8">
    <a href="/anchors" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
        &larr; Back to Anchors
    </a>
</div>
