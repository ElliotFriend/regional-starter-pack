<!--
@component Trustline Status

Self-contained trustline check and "Add Trustline" button. Manages its own
loading/signing state and reports status changes to the parent via callback.

Usage:
```html
<TrustlineStatus
    {stellarAsset}
    {network}
    showBalance={false}
    onStatusChange={(s) => { hasTrustline = s.hasTrustline; }}
/>
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import type { Asset } from '@stellar/stellar-sdk';
    import type { StellarNetwork } from '$lib/wallet/types';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import {
        checkTrustline,
        buildTrustlineTransaction,
        submitTransaction,
    } from '$lib/wallet/stellar';
    import { formatAmount, displayCurrency } from '$lib/utils/currency';

    interface Props {
        stellarAsset: Asset;
        network: StellarNetwork;
        showBalance?: boolean;
        balanceCurrency?: string;
        onStatusChange: (status: { hasTrustline: boolean; balance: string }) => void;
    }

    let {
        stellarAsset,
        network,
        showBalance = false,
        balanceCurrency,
        onStatusChange,
    }: Props = $props();

    let isChecking = $state(true);
    let isSigning = $state(false);
    let hasTrustline = $state(false);
    let balance = $state('0');

    async function check() {
        if (!walletStore.publicKey) return;

        isChecking = true;
        try {
            const result = await checkTrustline(walletStore.publicKey, stellarAsset, network);
            hasTrustline = result.hasTrustline;
            balance = result.balance;
            onStatusChange({ hasTrustline, balance });
        } catch (e) {
            console.error('Failed to check trustline:', e);
        } finally {
            isChecking = false;
        }
    }

    async function addTrustline() {
        if (!walletStore.publicKey) return;

        isSigning = true;
        try {
            const xdr = await buildTrustlineTransaction({
                sourcePublicKey: walletStore.publicKey,
                asset: stellarAsset,
                network,
            });

            const signed = await signWithFreighter(xdr, network);
            await submitTransaction(signed.signedXdr, network);

            await check();
        } catch (e) {
            console.error('Failed to add trustline:', e);
        } finally {
            isSigning = false;
        }
    }

    onMount(() => {
        check();
    });
</script>

{#if walletStore.isConnected}
    <div class="mt-4 rounded-md bg-gray-50 p-3">
        <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">
                {showBalance ? 'Your Balance' : 'Trustline Status'}
            </span>
            {#if isChecking}
                <span class="text-sm text-gray-400">
                    {showBalance ? 'Loading...' : 'Checking...'}
                </span>
            {:else if hasTrustline}
                {#if showBalance}
                    <span class="font-medium">
                        {formatAmount(balance)} {displayCurrency(balanceCurrency)}
                    </span>
                {:else}
                    <span class="text-sm font-medium text-green-600">Ready</span>
                {/if}
            {:else}
                <button
                    onclick={addTrustline}
                    disabled={isSigning}
                    class="text-sm text-indigo-600 hover:text-indigo-800"
                >
                    {isSigning ? 'Adding...' : 'Add Trustline'}
                </button>
            {/if}
        </div>
    </div>
{/if}
