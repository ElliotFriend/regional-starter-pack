<script lang="ts">
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { ANCHORS } from '$lib/config/anchors';
    import { getRegionsForAnchor, getRegion } from '$lib/config/regions';

    const profile = ANCHORS.manteca;
    const regions = getRegionsForAnchor('manteca');

    // `?region=` selects the active market (Brazil/Argentina/Colombia); the flow
    // links forward it so the on/off-ramp pages open in the right region.
    const activeRegionId = $derived.by(() => {
        const req = page.url.searchParams.get('region');
        return req && profile.regions[req] ? req : 'brazil';
    });
    const activeRegion = $derived(getRegion(activeRegionId));
    const activeCapability = $derived(profile.regions[activeRegionId]);
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
    <header class="flex items-start gap-4">
        {#if profile.logo}
            <img src={profile.logo} alt="Manteca logo" class="h-12 w-12 rounded" />
        {/if}
        <div>
            <h1 class="text-3xl font-semibold text-gray-900">{profile.name}</h1>
            <p class="mt-1 text-gray-600">{profile.description}</p>
        </div>
    </header>

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">Region</h2>
        <div class="mt-3 flex flex-wrap gap-2">
            {#each regions as r (r.id)}
                <a
                    href={`?region=${r.id}`}
                    class="rounded-md border px-3 py-1.5 text-sm {r.id === activeRegionId
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
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
        {/if}

        <div class="mt-6 flex gap-3">
            <a
                href={`${resolve('/anchors/manteca/onramp')}?region=${activeRegionId}`}
                class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-indigo-700"
            >
                On-Ramp ({activeRegion?.currency} → {activeCapability?.tokens[0]})
            </a>
            <a
                href={`${resolve('/anchors/manteca/offramp')}?region=${activeRegionId}`}
                class="flex-1 rounded-md border border-indigo-600 px-4 py-2 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-50"
            >
                Off-Ramp ({activeCapability?.tokens[0]} → {activeRegion?.currency})
            </a>
        </div>
    </section>

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

    {#if profile.devOnboarding && profile.devOnboarding.length > 0}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Developer Onboarding</h2>
            <ol class="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-600">
                {#each profile.devOnboarding as item, i (i)}
                    <li>
                        {item.text}
                        {#if item.link}
                            <a
                                href={item.link}
                                target="_blank"
                                rel="noopener"
                                class="text-indigo-600 hover:underline"
                            >
                                ↗
                            </a>
                        {/if}
                    </li>
                {/each}
            </ol>
        </section>
    {/if}

    {#if profile.knownIssues && profile.knownIssues.length > 0}
        <section class="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 class="text-lg font-semibold text-amber-900">Known Issues</h2>
            <ul class="mt-3 space-y-2 text-sm text-amber-800">
                {#each profile.knownIssues as issue, i (i)}
                    <li>
                        {issue.text}
                        {#if issue.link}
                            <a
                                href={issue.link}
                                target="_blank"
                                rel="noopener"
                                class="text-amber-900 underline hover:no-underline"
                            >
                                ↗
                            </a>
                        {/if}
                    </li>
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
