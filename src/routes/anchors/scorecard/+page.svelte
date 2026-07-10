<script lang="ts">
    import CircleCheck from '@lucide/svelte/icons/circle-check';
    import CircleDashed from '@lucide/svelte/icons/circle-dashed';
    import CircleX from '@lucide/svelte/icons/circle-x';
    import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    type SignalStatus = 'met' | 'partial' | 'failed' | 'unverified';

    const STATUS = {
        met: { icon: CircleCheck, label: 'met', class: 'text-green-600' },
        partial: { icon: CircleDashed, label: 'partial', class: 'text-amber-500' },
        failed: { icon: CircleX, label: 'failed', class: 'text-red-600' },
        unverified: { icon: CircleQuestionMark, label: 'unverified', class: 'text-gray-500' },
    } as const satisfies Record<SignalStatus, { icon: unknown; label: string; class: string }>;

    const VERDICT = {
        ready: { label: 'Ready', class: 'bg-green-100 text-green-700' },
        partial: { label: 'Partial', class: 'bg-amber-100 text-amber-700' },
        blocked: { label: 'Blocked', class: 'bg-red-100 text-red-700' },
    } as const;
</script>

{#snippet statusIcon(status: SignalStatus)}
    {@const Icon = STATUS[status].icon}
    <Icon size={16} class="mt-0.5 flex-none {STATUS[status].class}" aria-hidden="true" />
    <span class="sr-only">{STATUS[status].label}:</span>
{/snippet}

<div class="mx-auto max-w-4xl">
    <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Anchor Developer Readiness</h1>
        <p class="mt-2 text-sm text-gray-600">
            A self-updating developer-readiness view derived from anchor config. Fees and liquidity
            are tracked separately and omitted; the verdict reflects buildability only. Local asset
            is shown for reference but does not affect the verdict.
        </p>
        <p class="mt-2 text-sm text-gray-600">
            <strong class="font-semibold text-gray-700">Required</strong> signals block readiness if
            failed; <strong class="font-semibold text-gray-700">friction</strong> signals only downgrade
            it to partial.
        </p>
        <p class="mt-3 text-xs text-gray-500">
            Raw data:
            <a href="/api/scorecard" class="text-indigo-600 hover:text-indigo-800">JSON</a>
            ·
            <a href="/api/scorecard?format=md" class="text-indigo-600 hover:text-indigo-800"
                >Markdown</a
            >
        </p>
    </div>

    <!-- Legend -->
    <div
        class="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600"
    >
        <span class="flex items-center gap-1.5">
            {@render statusIcon('met')}met
        </span>
        <span class="flex items-center gap-1.5">
            {@render statusIcon('partial')}partial
        </span>
        <span class="flex items-center gap-1.5">
            {@render statusIcon('failed')}failed
        </span>
        <span class="flex items-center gap-1.5">
            {@render statusIcon('unverified')}unverified
        </span>
    </div>

    <div class="space-y-6">
        {#each data.entries as entry (entry.id)}
            {@const verdict = VERDICT[entry.verdict]}
            <div class="rounded-lg border border-gray-200 bg-white p-6">
                <!-- Header -->
                <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <h2 class="text-lg font-semibold text-gray-900">{entry.name}</h2>
                            {#if entry.curated}
                                <span
                                    class="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-indigo-700 uppercase"
                                >
                                    Curated
                                </span>
                            {/if}
                            {#if entry.vetting}
                                <span
                                    class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-amber-700 uppercase"
                                >
                                    Under evaluation
                                </span>
                            {/if}
                        </div>
                        {#if entry.regionChips.length}
                            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {#each entry.regionChips as chip (chip.name)}
                                    <span
                                        class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                                    >
                                        {#if chip.flag}<span aria-hidden="true">{chip.flag}</span
                                            >{/if}{chip.name}
                                    </span>
                                {/each}
                            </div>
                        {/if}
                    </div>
                    <span
                        class="inline-flex flex-none items-center rounded-full px-2.5 py-0.5 text-xs font-medium {verdict.class}"
                    >
                        {verdict.label}
                    </span>
                </div>

                <!-- Signals -->
                <ul class="mt-4 space-y-2">
                    {#each entry.signals as signal (signal.id)}
                        <li class="flex items-start gap-2 text-sm">
                            {@render statusIcon(signal.status)}
                            <span>
                                <span class="text-gray-700">{signal.label}</span>
                                <span
                                    class="ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {signal.severity ===
                                    'required'
                                        ? 'bg-gray-200 text-gray-600'
                                        : 'bg-gray-100 text-gray-400'}"
                                >
                                    {signal.severity}
                                </span>
                                {#if signal.note}
                                    <span class="block text-xs text-gray-500">{signal.note}</span>
                                {/if}
                            </span>
                        </li>
                    {/each}
                </ul>

                <!-- Local asset (informational, not part of verdict) -->
                <div class="mt-4 border-t border-gray-100 pt-3">
                    <div class="flex items-start gap-2 text-sm text-gray-500">
                        {@render statusIcon(entry.localAsset.status)}
                        <span>
                            <span>Local asset:</span>
                            {#if entry.localAsset.note}
                                <span class="text-gray-500">{entry.localAsset.note}</span>
                            {/if}
                        </span>
                    </div>
                </div>
            </div>
        {/each}
    </div>

    <div class="mt-8">
        <a href="/anchors" class="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            &larr; Back to Anchors
        </a>
    </div>
</div>
