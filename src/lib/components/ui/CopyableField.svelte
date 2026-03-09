<script lang="ts">
    interface Props {
        value: string;
        mono?: boolean;
    }

    let { value, mono = false }: Props = $props();

    let copied = $state(false);
    let timeout: ReturnType<typeof setTimeout> | null = null;

    function copy() {
        navigator.clipboard.writeText(value);
        copied = true;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            copied = false;
        }, 2000);
    }
</script>

<span class="inline-flex items-center gap-1.5">
    <span class={mono ? 'font-mono' : ''}>{value}</span>
    <button
        onclick={copy}
        class="inline-flex shrink-0 items-center rounded p-0.5 text-gray-400 hover:text-gray-600"
        title="Copy to clipboard"
    >
        {#if copied}
            <svg
                class="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
            >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
        {:else}
            <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
            </svg>
        {/if}
    </button>
</span>
