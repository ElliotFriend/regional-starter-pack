<script lang="ts">
    import { resolve } from '$app/paths';
    import { ANCHORS } from '$lib/config/anchors';
    import AnchorRegionSelector from '$lib/components/AnchorRegionSelector.svelte';
    import CriteriaScorecard from '$lib/components/CriteriaScorecard.svelte';
    import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

    const profile = ANCHORS.trmock;
</script>

<div class="mx-auto max-w-3xl px-4 py-8">
    <header>
        <div class="flex items-center gap-3">
            <h1 class="text-3xl font-semibold text-gray-900">{profile.name}</h1>
            <span
                class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
            >
                Sandbox stand-in
            </span>
        </div>
        <p class="mt-2 text-gray-600">{profile.description}</p>
    </header>

    <section class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div class="flex gap-3">
            <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div class="text-sm text-amber-900">
                <p class="font-semibold">This is a mock, not a live anchor.</p>
                <p class="mt-1">
                    It is built by an independent developer to model what a Turkish TRY ramp on
                    Stellar would look like. It is <strong>not operated by BiLira</strong>, and no
                    real money moves. The bank transfer and KYC are simulated; the Stellar leg pays
                    real testnet USDC.
                </p>
            </div>
        </div>
    </section>

    <div class="mt-8 grid gap-4 md:grid-cols-2">
        <a
            href={resolve('/anchors/trmock/onramp')}
            class="rounded-lg border border-indigo-200 bg-indigo-50 p-5 hover:border-indigo-300"
        >
            <h2 class="text-base font-semibold text-indigo-900">On-Ramp — TRY to USDC</h2>
            <p class="mt-1 text-sm text-indigo-800">
                Lock a quote, get an IBAN and a reference, then play the bank to settle real testnet
                USDC.
            </p>
        </a>
        <a
            href={resolve('/anchors/trmock/offramp')}
            class="rounded-lg border border-indigo-200 bg-indigo-50 p-5 hover:border-indigo-300"
        >
            <h2 class="text-base font-semibold text-indigo-900">Off-Ramp — USDC to TRY</h2>
            <p class="mt-1 text-sm text-indigo-800">
                Lock a quote, send USDC with a memo, and watch the simulated FAST payout land.
            </p>
        </a>
    </div>

    <AnchorRegionSelector {profile} />

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">What BiLira is likely to ship</h2>
        <p class="mt-2 text-sm text-gray-600">
            This mock demonstrates the retail SEP-6 shape: the wallet's end user authenticates with
            their own Stellar account and is KYC'd by the anchor. BiLira, the Turkish partner this
            stands in for, is moving in a different direction.
        </p>
        <ul class="mt-4 space-y-2 text-sm text-gray-600">
            <li>
                BiLira has agreed to implement SEP-6 but has not shipped it and has given no date.
            </li>
            <li>
                They are moving to business-and-enterprise-only. The likely production path is KYB,
                then credentialed API access (OAuth2 client-credentials, IP-allowlisted) — not the
                open flow demonstrated here.
            </li>
            <li>
                Their ramp is composed from primitives (deposit, then an explicit swap, then a
                withdrawal) rather than being atomic.
            </li>
            <li>
                If their SEP-6 does arrive it will likely be omnibus-shaped: the integrating
                business is the SEP-12 customer, and end users are distinguished by memo.
            </li>
        </ul>
        <p class="mt-4 text-sm text-gray-600">
            What carries over is the Stellar-side mechanics — trustlines, memos, claimable balances,
            quote handling, status polling — plus the deposit-reference model. The anchor wiring is
            the part that changes.
        </p>
    </section>

    <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 class="text-lg font-semibold text-gray-900">The anchor's own documentation</h2>
        <p class="mt-2 text-sm text-gray-600">
            These are maintained by the mock's author and are the authoritative reference. We link
            rather than restate them.
        </p>
        <ul class="mt-4 space-y-2 text-sm">
            <li>
                <a class="text-indigo-600 hover:underline" href={profile.links.documentation}>
                    The SEP path — integration guide
                </a>
            </li>
            <li>
                <a class="text-indigo-600 hover:underline" href={profile.links.guide}>
                    Guide — concepts, Turkish rails, statuses, glossary
                </a>
            </li>
            <li>
                <a class="text-indigo-600 hover:underline" href={profile.links.mainnet}>
                    Mainnet — what carries over and what changes
                </a>
            </li>
            <li>
                <a class="text-indigo-600 hover:underline" href={profile.links.repository}>
                    Source repository
                </a>
            </li>
        </ul>
    </section>

    {#if profile.knownIssues?.length}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Known issues</h2>
            <ul class="mt-4 space-y-3 text-sm text-gray-600">
                {#each profile.knownIssues as issue (issue.text)}
                    <li>
                        {issue.text}
                        {#if issue.link}
                            <a class="text-indigo-600 hover:underline" href={issue.link}>More</a>
                        {/if}
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if profile.scorecard}
        <section class="mt-8 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Developer scorecard</h2>
            <div class="mt-4">
                <CriteriaScorecard scorecard={profile.scorecard} />
            </div>
        </section>
    {/if}
</div>
