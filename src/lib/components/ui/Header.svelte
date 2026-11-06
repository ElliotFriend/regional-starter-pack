<script lang="ts">
    import { resolve } from '$app/paths';
    import WalletConnect from '#lib/components/WalletConnect.svelte';
    import ThemeToggle from '#lib/components/ui/ThemeToggle.svelte';
</script>

<header class="fixed inset-x-0 top-0 z-20 h-16 border-b border-gray-200 bg-white">
    <div class="flex h-full items-center justify-between px-6">
        <a href={resolve('/')} class="text-xl font-bold text-indigo-600">Regional Starter Pack</a>
        <div class="flex items-center gap-3">
            <ThemeToggle />
            <WalletConnect />
        </div>
    </div>
</header>
