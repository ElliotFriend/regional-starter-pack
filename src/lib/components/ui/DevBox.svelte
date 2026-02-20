<script lang="ts">
    interface DevBoxItem {
        text: string;
        link?: string;
    }
    interface Props {
        items: DevBoxItem[];
    }
    const { items }: Props = $props();
</script>

<section>
    <div class="rounded-lg bg-gray-900 p-8 text-white">
        <h2 class="text-2xl font-bold">For Developers</h2>
        <ul class="mt-4 space-y-2 text-sm text-gray-300">
            {#each items as item}
                <li class="flex items-center gap-2">
                    <svg
                        class="h-5 w-5 flex-shrink-0 text-green-400"
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
                    {#if item.link}
                        <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-indigo-400 hover:text-indigo-300">{item.text}</a
                        >
                    {:else}
                        <span>{item.text}</span>
                    {/if}
                </li>
            {/each}
        </ul>
    </div>
</section>
