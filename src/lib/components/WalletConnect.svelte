<script lang="ts">
    import { walletStore } from '#lib/stores/wallet.svelte.ts';

    const networkBadgeColors: Record<string, string> = {
        testnet: 'bg-yellow-100 text-yellow-800',
        public: 'bg-green-100 text-green-800',
    };
</script>

<div class="relative flex flex-col items-end">
    <div class="flex items-center gap-3">
        {#if walletStore.isConnected}
            <span
                class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {networkBadgeColors[
                    walletStore.network
                ]}"
            >
                {walletStore.network}
            </span>
            <span class="font-mono text-sm text-gray-600">
                {walletStore.truncatedAddress}
            </span>
            <button
                onclick={() => walletStore.disconnect()}
                class="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
                Disconnect
            </button>
        {:else}
            <button
                onclick={() => walletStore.connect()}
                disabled={walletStore.isConnecting}
                class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {#if walletStore.isConnecting}
                    Connecting...
                {:else if walletStore.errorCode === 'NOT_INSTALLED'}
                    Retry connection
                {:else}
                    Connect Varial
                {/if}
            </button>
        {/if}
    </div>

    {#if walletStore.error}
        <div
            role="alert"
            class="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-md border border-gray-200 bg-white p-3 text-sm shadow-md"
        >
            {#if walletStore.errorCode === 'NOT_INSTALLED'}
                <p class="font-medium text-gray-900">Install Varial to connect your wallet</p>
                <p class="mt-1 text-gray-600">
                    Install and enable Varial in this browser. After setup, return here and retry
                    the connection.
                </p>
                <a
                    href="https://varialwallet.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Get Varial (opens in a new tab)"
                    class="mt-2 inline-block text-xs font-medium text-indigo-600 underline hover:text-indigo-700"
                    >Get Varial <span aria-hidden="true">↗</span></a
                >
            {:else}
                <p class="text-red-600">{walletStore.error}</p>
            {/if}
            <button
                onclick={() => walletStore.clearError()}
                class="ml-2 text-xs text-gray-500 underline hover:text-gray-700">Dismiss</button
            >
        </div>
    {/if}
</div>
