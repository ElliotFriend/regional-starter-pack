<script lang="ts">
    import { resolve } from '$app/paths';
    import { ANCHORS } from '$lib/config/anchors';
    import { getRegionsForAnchor } from '$lib/config/regions';

    const profile = ANCHORS.testanchor;
    const regions = getRegionsForAnchor('testanchor');
    const region = regions[0];
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
    <header class="flex items-start gap-4">
        {#if profile.logo}
            <img src={profile.logo} alt="Test anchor logo" class="h-12 w-12 rounded" />
        {/if}
        <div>
            <h1 class="text-3xl font-semibold text-gray-900">{profile.name}</h1>
            <p class="mt-1 text-gray-600">{profile.description}</p>
        </div>
    </header>

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">Two ramp archetypes, one provider</h2>
        <p class="mt-2 text-sm text-gray-600">
            testanchor.stellar.org implements both SEP-6 (programmatic, partner-orchestrated) and
            SEP-24 (interactive, anchor-hosted) — pick the flow you want to demo.
        </p>

        <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div class="rounded-lg border border-indigo-200 bg-indigo-50 p-5">
                <h3 class="text-base font-semibold text-indigo-900">SEP-24 Interactive</h3>
                <p class="mt-1 text-sm text-indigo-800">
                    Anchor-hosted UI for KYC, amount, and payment. Your app just opens the URL and
                    polls.
                </p>
                <div class="mt-4 flex gap-2">
                    <a
                        href={resolve('/anchors/testanchor/interactive/onramp')}
                        class="flex-1 rounded-md bg-indigo-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        On-Ramp
                    </a>
                    <a
                        href={resolve('/anchors/testanchor/interactive/offramp')}
                        class="flex-1 rounded-md border border-indigo-600 px-3 py-1.5 text-center text-sm font-medium text-indigo-600 hover:bg-indigo-100"
                    >
                        Off-Ramp
                    </a>
                </div>
            </div>

            <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <h3 class="text-base font-semibold text-emerald-900">SEP-6 Programmatic</h3>
                <p class="mt-1 text-sm text-emerald-800">
                    Your app collects KYC + amount + handles payment details directly via API.
                </p>
                <div class="mt-4 flex gap-2">
                    <a
                        href={resolve('/anchors/testanchor/programmatic/onramp')}
                        class="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
                    >
                        On-Ramp
                    </a>
                    <a
                        href={resolve('/anchors/testanchor/programmatic/offramp')}
                        class="flex-1 rounded-md border border-emerald-600 px-3 py-1.5 text-center text-sm font-medium text-emerald-600 hover:bg-emerald-100"
                    >
                        Off-Ramp
                    </a>
                </div>
            </div>
        </div>
    </section>

    {#if region}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Configuration</h2>
            <div class="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-500">Network</span>
                    <p class="font-medium">{region.name}</p>
                </div>
                <div>
                    <span class="text-gray-500">Home domain</span>
                    <p class="font-mono">testanchor.stellar.org</p>
                </div>
                <div>
                    <span class="text-gray-500">Currency</span>
                    <p class="font-medium">{region.currency}</p>
                </div>
                <div>
                    <span class="text-gray-500">Tokens</span>
                    <p class="font-medium">SRT, USDC (testnet)</p>
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
