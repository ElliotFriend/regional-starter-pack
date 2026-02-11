<script lang="ts">
    import { getPaymentRail, getToken } from '$lib/config/regions';
    import type { PageProps } from './$types';

    // we use `$props()` in SvelteKit to "grab" the various data that's been
    // loaded from any relevant `+layout.ts` or `+page.ts` files in the
    // directory structure.
    const { data }: PageProps = $props();
    // pull out the pieces of data as `$derived()` state.
    const { anchor, regions, tokens } = $derived(data);
</script>

{#if anchor}
    <div class="mx-auto max-w-4xl">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900">{anchor.name}</h1>
            <p class="mt-2 text-gray-600">{anchor.description}</p>
            <div class="flex flex-row gap-6">
                <a
                    href={anchor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800"
                >
                    {anchor.website} &rarr;
                </a>
                <a
                    href={anchor.documentation}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800"
                >
                    {anchor.documentation} &rarr;
                </a>
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

        <!-- For Developers -->
        <section class="mb-8">
            <div class="rounded-lg bg-gray-900 p-8 text-white">
                <h2 class="text-2xl font-bold">For Developers</h2>
                <div class="mt-2 text-gray-300">
                    <ul class="space-y-3 text-sm">
                        <li class="flex items-start gap-2">
                            <svg
                                class="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                            <span>KYC verification required for all transactions</span>
                        </li>
                        <li class="flex items-start gap-2">
                            <svg
                                class="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                            <span
                                >Sandbox API keys available - use example keys <a
                                    class="text-indigo-400 hover:text-indigo-500"
                                    href="https://alfredpay.readme.io/reference/post_customers-create-1"
                                    target="_blank">from the docs</a
                                ></span
                            >
                        </li>
                        <li class="flex items-start gap-2">
                            <svg
                                class="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                            <span>Sandbox environment available for testing</span>
                        </li>
                        <li class="flex items-start gap-2">
                            <svg
                                class="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                            <span>Webhook support for transaction status updates</span>
                        </li>
                    </ul>
                </div>
            </div>
        </section>

        <!-- Back Link -->
        <div class="mt-8">
            <a href="/anchors" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                &larr; Back to Anchors
            </a>
        </div>
    </div>
{/if}
