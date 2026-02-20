<script lang="ts">
    import { page } from '$app/state';
    import type { Region } from '$lib/config/regions';
    import type { AnchorProfile } from '$lib/config/anchors';

    interface Props {
        regions: Region[];
        anchors: AnchorProfile[];
    }

    let { regions, anchors }: Props = $props();
</script>

<aside
    class="fixed top-16 bottom-0 left-0 z-10 w-64 overflow-y-auto border-r border-gray-200 bg-white"
>
    <nav class="p-4">
        <!-- Home -->
        <a
            href="/"
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium {page.url
                .pathname === '/'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-700 hover:bg-gray-100'}"
        >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
            </svg>
            Home
        </a>

        <!-- Test Anchor -->
        <a
            href="/testanchor"
            class="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium {page.url.pathname.startsWith(
                '/testanchor',
            )
                ? 'bg-violet-100 text-violet-800'
                : 'text-gray-700 hover:bg-gray-100'}"
        >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            Test Anchor
        </a>

        <!-- Regions Section -->
        <div class="mt-6">
            <h3 class="px-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Regions
            </h3>
            <div class="mt-2 space-y-1">
                {#each regions as region}
                    <a
                        href="/regions/{region.id}"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium {page
                            .url.pathname === `/regions/${region.id}`
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'text-gray-700 hover:bg-gray-100'}"
                    >
                        <span class="text-base">{region.flag}</span>
                        {region.name}
                    </a>
                {/each}
            </div>
        </div>

        <!-- Anchors Section -->
        <div class="mt-6">
            <h3 class="px-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Anchors
            </h3>
            <div class="mt-2 space-y-1">
                {#each anchors as anchor}
                    <a
                        href="/anchors/{anchor.id}"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium {page.url.pathname.startsWith(
                            `/anchors/${anchor.id}`,
                        )
                            ? 'bg-indigo-50 text-indigo-600'
                            : 'text-gray-700 hover:bg-gray-100'}"
                    >
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                        </svg>
                        {anchor.name}
                    </a>
                {/each}
            </div>
        </div>
    </nav>
</aside>
