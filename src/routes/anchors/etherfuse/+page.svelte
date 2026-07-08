<script lang="ts">
    import { ANCHORS } from '$lib/config/anchors';
    import CriteriaScorecard from '$lib/components/CriteriaScorecard.svelte';
    import AnchorRegionSelector from '$lib/components/AnchorRegionSelector.svelte';

    const profile = ANCHORS.etherfuse;
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
    <header class="flex items-start gap-4">
        {#if profile.logo}
            <img src={profile.logo} alt="Etherfuse logo" class="h-12 w-12 rounded" />
        {/if}
        <div>
            <h1 class="text-3xl font-semibold text-gray-900">{profile.name}</h1>
            <p class="mt-1 text-gray-600">{profile.description}</p>
        </div>
    </header>

    <AnchorRegionSelector {profile} />

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
