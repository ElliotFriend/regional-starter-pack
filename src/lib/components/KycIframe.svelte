<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        url: string;
        onComplete?: () => void;
    }

    let { url, onComplete }: Props = $props();

    let iframeRef: HTMLIFrameElement | null = $state(null);

    onMount(() => {
        // Listen for messages from the KYC iframe
        function handleMessage(event: MessageEvent) {
            // Verify origin matches the KYC URL domain
            try {
                const iframeOrigin = new URL(url).origin;
                if (event.origin !== iframeOrigin) return;

                // Handle KYC completion message
                if (event.data?.type === 'kyc_complete' || event.data?.status === 'completed') {
                    onComplete?.();
                }
            } catch {
                // Invalid URL, ignore
            }
        }

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    });
</script>

<div class="kyc-iframe-container">
    <iframe
        bind:this={iframeRef}
        src={url}
        title="KYC Verification"
        class="h-full w-full border-0"
        allow="camera; microphone"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    ></iframe>
</div>

<style>
    .kyc-iframe-container {
        width: 100%;
        height: 600px;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        overflow: hidden;
    }
</style>
