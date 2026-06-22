<script lang="ts">
    /**
     * CriteriaScorecard
     *
     * Dumb, provider-agnostic renderer for a two-lens criteria scorecard.
     * Takes a flat `ScoredCriterion[]`, splits it into the Commercial and
     * Developer lenses, and renders each criterion as a status symbol + label.
     * Knows nothing about any specific anchor.
     *
     * Two modes:
     *   compact (default) — short labels, no notes; for dense listing / region pages.
     *   detailed          — full labels plus optional muted note; for an anchor's own page.
     *
     * Status → display: a Lucide icon coloured via Tailwind `text-*` (the icons
     * use `currentColor`, so they stay legible on a light background — unlike the
     * fixed-colour emoji they replaced).
     *   met        CircleCheck         green
     *   partial    CircleDashed        amber
     *   failed     CircleX             red
     *   unverified CircleQuestionMark  gray
     */
    import CircleCheck from '@lucide/svelte/icons/circle-check';
    import CircleDashed from '@lucide/svelte/icons/circle-dashed';
    import CircleX from '@lucide/svelte/icons/circle-x';
    import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
    import type { ScoredCriterion } from '$lib/config/anchors';

    let { scorecard, detailed = false }: { scorecard: ScoredCriterion[]; detailed?: boolean } =
        $props();

    const commercial = $derived(scorecard.filter((c) => c.lens === 'commercial'));
    const developer = $derived(scorecard.filter((c) => c.lens === 'developer'));

    const STATUS_DISPLAY = {
        met: { icon: CircleCheck, label: 'met', class: 'text-green-600' },
        partial: { icon: CircleDashed, label: 'partial', class: 'text-amber-500' },
        failed: { icon: CircleX, label: 'failed', class: 'text-red-600' },
        unverified: { icon: CircleQuestionMark, label: 'unverified', class: 'text-gray-500' },
    } as const;
</script>

{#snippet row(criterion: ScoredCriterion)}
    {@const Status = STATUS_DISPLAY[criterion.status]}
    {@const Icon = Status.icon}
    <li class="flex items-start gap-2 text-sm">
        <Icon class="mt-0.5 flex-none {Status.class}" size={16} aria-hidden="true" />
        <span class="sr-only">{Status.label}:</span>
        <span>
            <span class="text-gray-700">{detailed ? criterion.label : criterion.shortLabel}</span>
            {#if detailed && criterion.note}
                <span class="block text-xs text-gray-500">{criterion.note}</span>
            {/if}
        </span>
    </li>
{/snippet}

{#snippet group(title: string, criteria: ScoredCriterion[])}
    {#if criteria.length > 0}
        <div>
            <h4 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">{title}</h4>
            <ul class="mt-1.5 space-y-1.5">
                {#each criteria as criterion (criterion.id)}
                    {@render row(criterion)}
                {/each}
            </ul>
        </div>
    {/if}
{/snippet}

<div class="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
    {@render group('Commercial', commercial)}
    {@render group('Developer', developer)}
</div>
