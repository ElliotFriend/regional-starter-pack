<!--
@component SEP Ramp Page

Wrapper for SEP-compliant anchors. Handles wallet connection and SEP-10
authentication, then renders child flow components (e.g. Sep24RampFlow).

Unlike RampPage (which handles proprietary API flows with customer creation
and KYC), this component only needs wallet connect and SEP-10 auth. KYC,
quotes, and transaction details are handled inside the anchor's interactive UI.

Usage:
```html
<SepRampPage>
    {#snippet children(token)}
        <Sep24RampFlow direction="withdraw" {token} />
    {/snippet}
</SepRampPage>
```
-->
<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { sep10 } from '$lib/anchors/sep';
    import { PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';

    interface Props {
        children: Snippet<[string]>;
    }

    let { children }: Props = $props();

    const direction = $derived<'onramp' | 'offramp'>(page.data.direction);
    const provider = $derived(page.data.anchor.id);
    const anchorName = $derived(page.data.anchor.name);
    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    // Auth state
    let token = $state<string | null>(null);
    let isAuthenticating = $state(false);
    let authError = $state<string | null>(null);

    const authStep = $derived.by(() => {
        if (!walletStore.isConnected) return 'connect';
        if (!token) return 'authenticate';
        return 'ready';
    });

    async function authenticate() {
        if (!walletStore.publicKey) return;

        isAuthenticating = true;
        authError = null;

        try {
            // 1. Fetch (possibly co-signed) challenge from our proxy
            const proxyUrl = `/api/anchor/${provider}/sep/10?account=${encodeURIComponent(walletStore.publicKey)}`;
            const challengeResponse = await fetch(proxyUrl);

            if (!challengeResponse.ok) {
                const err = await challengeResponse.json().catch(() => ({}));
                throw new Error(
                    (err as Record<string, string>).message || 'Failed to fetch SEP-10 challenge',
                );
            }

            const challengeData = (await challengeResponse.json()) as {
                transaction: string;
                network_passphrase: string;
                authEndpoint: string;
            };

            // 2. Sign the challenge with Freighter
            const signed = await signWithFreighter(challengeData.transaction, network);

            // 3. Submit signed challenge directly to anchor for JWT
            const tokenResponse = await sep10.submitChallenge(
                challengeData.authEndpoint,
                signed.signedXdr,
            );
            token = tokenResponse.token;
        } catch (err) {
            authError = err instanceof Error ? err.message : 'Authentication failed';
        } finally {
            isAuthenticating = false;
        }
    }

    function clearError() {
        authError = null;
    }
</script>

<h1 class="text-2xl font-bold text-gray-900">
    {#if direction === 'onramp'}
        On-Ramp with {anchorName}
    {:else}
        Off-Ramp with {anchorName}
    {/if}
</h1>
<p class="mt-2 text-gray-500">
    {#if direction === 'onramp'}
        Deposit local currency and receive digital assets directly to your Stellar wallet.
    {:else}
        Send digital assets from your Stellar wallet and receive local currency.
    {/if}
</p>

<div class="mt-8">
    {#if authStep === 'connect'}
        <div
            class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
        >
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100"
            >
                <svg
                    class="h-6 w-6 text-indigo-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    ></path>
                </svg>
            </div>
            <h2 class="mt-4 text-lg font-semibold text-gray-900">Connect Your Wallet</h2>
            <p class="mt-2 text-sm text-gray-500">Connect your Freighter wallet to get started.</p>
            <button
                onclick={() => walletStore.connect()}
                disabled={walletStore.isConnecting}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {walletStore.isConnecting ? 'Connecting...' : 'Connect Freighter'}
            </button>
        </div>
    {:else if authStep === 'authenticate'}
        <div
            class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
        >
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100"
            >
                <svg
                    class="h-6 w-6 text-indigo-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                </svg>
            </div>
            <h2 class="mt-4 text-lg font-semibold text-gray-900">Authenticate with {anchorName}</h2>
            <p class="mt-2 text-sm text-gray-500">
                Sign a challenge transaction to verify your identity. You'll be prompted by
                Freighter to approve the signature.
            </p>
            <p class="mt-1 text-xs text-gray-400">
                Wallet: {walletStore.publicKey?.slice(0, 8)}...{walletStore.publicKey?.slice(-4)}
            </p>
            <button
                onclick={authenticate}
                disabled={isAuthenticating}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
            </button>
        </div>
    {:else if token}
        {@render children(token)}
    {/if}

    {#if authError}
        <div class="mx-auto mt-4 max-w-lg">
            <ErrorAlert message={authError} onDismiss={clearError} />
        </div>
    {/if}
</div>
