<script lang="ts">
    import { onMount } from 'svelte';
    import Moon from '@lucide/svelte/icons/moon';
    import Sun from '@lucide/svelte/icons/sun';
    import { resolveTheme } from '#lib/theme.ts';

    const storageKey = 'regional-starter-pack-theme';
    let isDark = $state(false);
    let ready = $state(false);

    onMount(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');

        function synchronize() {
            let preference: string | null = null;
            try {
                preference = window.localStorage.getItem(storageKey);
            } catch {
                // The theme still works for this session if storage is blocked.
            }
            isDark = resolveTheme(preference, media.matches) === 'dark';
            document.documentElement.classList.toggle('dark', isDark);
        }

        function handleStorage(event: StorageEvent) {
            if (event.key === storageKey || event.key === null) {
                synchronize();
            }
        }

        synchronize();
        ready = true;
        media.addEventListener('change', synchronize);
        window.addEventListener('storage', handleStorage);

        return () => {
            media.removeEventListener('change', synchronize);
            window.removeEventListener('storage', handleStorage);
        };
    });

    function toggleTheme() {
        isDark = !isDark;
        document.documentElement.classList.toggle('dark', isDark);
        try {
            window.localStorage.setItem(storageKey, isDark ? 'dark' : 'light');
        } catch {
            // Still apply the change when storage is unavailable.
        }
    }
</script>

<button
    type="button"
    disabled={!ready}
    onclick={toggleTheme}
    aria-label="Toggle dark mode"
    aria-pressed={isDark}
    title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    class="inline-flex size-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
>
    {#if isDark}
        <Sun size={18} aria-hidden="true" />
    {:else}
        <Moon size={18} aria-hidden="true" />
    {/if}
</button>
