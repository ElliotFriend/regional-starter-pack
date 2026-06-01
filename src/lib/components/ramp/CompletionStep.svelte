<script lang="ts">
    interface Detail {
        label: string;
        value: string;
    }

    interface ExternalLink {
        label: string;
        href: string;
    }

    interface Props {
        title: string;
        message?: string;
        details?: Detail[];
        links?: ExternalLink[];
        onReset: () => void;
        resetLabel?: string;
    }

    let {
        title,
        message,
        details = [],
        links = [],
        onReset,
        resetLabel = 'Start new transaction',
    }: Props = $props();
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
    <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
            />
        </svg>
    </div>
    <h2 class="mt-4 text-xl font-semibold text-gray-900">{title}</h2>
    {#if message}
        <p class="mt-2 text-sm text-gray-500">{message}</p>
    {/if}
    {#if details.length > 0 || links.length > 0}
        <div class="mt-4 space-y-1 text-sm text-gray-600">
            {#each details as detail (detail.label)}
                <p>{detail.label}: {detail.value}</p>
            {/each}
            {#each links as link (link.label)}
                <p>
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noopener"
                        class="text-indigo-600 hover:underline"
                    >
                        {link.label}
                    </a>
                </p>
            {/each}
        </div>
    {/if}
    <button
        onclick={onReset}
        class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
        {resetLabel}
    </button>
</div>
