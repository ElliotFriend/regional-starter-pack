<script lang="ts">
    import { QUALITY_CRITERIA, type HonorableMention } from '$lib/config/anchors';
    import type { Region } from '$lib/config/regions';

    interface Props {
        region: Region;
        honorableMentions: HonorableMention[];
    }
    const { region, honorableMentions }: Props = $props();
</script>

<!-- Honorable Mentions -->
{#if honorableMentions.length > 0}
    <section class="mb-8">
        <h2 class="mb-4 text-xl font-semibold text-gray-900">Other Providers in This Region</h2>
        <p class="mb-4 text-sm text-gray-600">
            These providers operate in {region.name} but do not yet meet all of our quality criteria for
            a full integration.
        </p>
        <div class="space-y-4">
            {#each honorableMentions as mention (mention.id)}
                <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <div class="flex items-start justify-between">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">
                                {mention.name}
                            </h3>
                            <p class="mt-1 text-sm text-gray-500">{mention.description}</p>
                        </div>
                        <a
                            href={mention.website}
                            target="_blank"
                            rel="external noopener noreferrer"
                            class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Website
                        </a>
                    </div>

                    <!-- Criteria checklist -->
                    <div class="mt-4 space-y-1.5">
                        {#each mention.criteria as criterion (criterion.id)}
                            <div class="flex items-start gap-2 text-sm">
                                {#if criterion.met}
                                    <span class="mt-0.5 text-green-500">&#10003;</span>
                                {:else}
                                    <span class="mt-0.5 text-gray-300">&#10005;</span>
                                {/if}
                                <span
                                    class:text-gray-700={criterion.met}
                                    class:text-gray-400={!criterion.met}
                                >
                                    {criterion.label}
                                </span>
                                {#if criterion.note}
                                    <span class="text-gray-400">&mdash; {criterion.note}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>

                    <div class="mt-3 flex gap-4 text-sm text-gray-500">
                        <span>Tokens: {mention.tokens.join(', ')}</span>
                        <span>Rails: {mention.rails.join(', ').toUpperCase()}</span>
                    </div>
                </div>
            {/each}
        </div>
        <hr class="my-6 h-px border-0 bg-gray-300" />
        <!-- Link to quality criteria -->
        <div class="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <div class=" grid md:grid-cols-2">
                <div>
                    <p class="text-sm text-gray-600">
                        We evaluate anchor providers against five quality criteria:
                    </p>
                    <ul class="mt-2 list-outside list-disc space-y-1 px-4">
                        {#each QUALITY_CRITERIA as criterion (criterion.id)}
                            <li class="text-sm text-gray-500">{criterion.label}</li>
                        {/each}
                    </ul>
                </div>
                <div class="place-content-center rounded-lg bg-gray-50 p-4">
                    <p class="text-sm font-semibold text-gray-600">Looking for something else?</p>
                    <p class="mt-2 text-sm text-gray-600">
                        A previous version of this starter pack, integrated more anchors and was
                        less selective.
                    </p>
                    <p class="mt-2 text-sm text-gray-600">
                        You can view the <code class="rounded bg-gray-200 px-1 text-xs">v1</code>
                        version of this site at
                        <a
                            href="https://v1.regionalstarterpack.com"
                            class="text-indigo-400 hover:text-indigo-300"
                            target="_blank"
                            rel="external noopener noreferrer">v1.regionalstarterpack.com</a
                        >
                        and the
                        <a
                            href="https://github.com/ElliotFriend/regional-starter-pack/tree/v1"
                            class="text-indigo-400 hover:text-indigo-300"
                            target="_blank"
                            rel="external noopener noreferrer">source code on GitHub</a
                        >
                    </p>
                </div>
            </div>
        </div>
    </section>
{/if}
