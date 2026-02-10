<script lang="ts">
    import WalletConnect from '$lib/components/WalletConnect.svelte';
</script>

<header class="fixed inset-x-0 top-0 z-20 h-16 border-b border-gray-200 bg-white">
    <div class="flex h-full items-center justify-between px-6">
        <a href="/" class="text-xl font-bold text-indigo-600">Regional Starter Pack</a>
        <WalletConnect />
    </div>
</header>
