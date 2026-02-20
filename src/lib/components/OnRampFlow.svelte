<!--
@component On-Ramp User Flow Component

This component manages and triggers the various points in the life-cycle of a
user creating an on-ramp transaction. It will create the customer on the
anchor's platform, query and ask for any KYC information required, and submit a
request to the anchor that initiates an on-ramp transaction.

Usage:
```html
<OnRampFlow provider="etherfuse" />
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import QuoteStep from '$lib/components/ramp/QuoteStep.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import { resolveStellarAsset } from '$lib/utils/stellar-asset';
    import { getQuoteCustomerId } from '$lib/utils/quote';
    import { PUBLIC_USDC_ISSUER, PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import { getStatusColor } from '$lib/utils/status';
    import { TX_STATUS } from '$lib/constants';
    import * as api from '$lib/api/anchor';
    import type { Quote, OnRampTransaction, AnchorCapabilities } from '$lib/anchors/types';

    interface Props {
        provider?: string;
        toCurrency?: string;
        fiatCurrency?: string;
        capabilities?: AnchorCapabilities;
    }

    let {
        provider = 'etherfuse',
        toCurrency = 'USDC',
        fiatCurrency = 'MXN',
        capabilities,
    }: Props = $props();

    // Local state for this flow
    let amount = $state('');
    let quote = $state<Quote | null>(null);
    let transaction = $state<OnRampTransaction | null>(null);
    let isGettingQuote = $state(false);
    let isCreatingTransaction = $state(false);
    let error = $state<string | null>(null);
    let refreshInterval: ReturnType<typeof setInterval> | null = null;

    // Steps: 'input' | 'quote' | 'payment' | 'complete'
    let step = $state<'input' | 'quote' | 'payment' | 'complete'>('input');

    // Trustline state (updated by TrustlineStatus callback)
    let hasTrustline = $state(false);

    // Blockchain wallet registration state (BlindPay-specific)
    let isRegisteringWallet = $state(false);
    let walletRegistered = $state(false);
    let isSimulatingFiat = $state(false);
    let fiatSimulated = $state(false);

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    const stellarAsset = $derived(resolveStellarAsset(toCurrency, PUBLIC_USDC_ISSUER));

    async function getQuote() {
        if (!amount || isNaN(parseFloat(amount))) return;

        isGettingQuote = true;
        error = null;

        try {
            const customer = customerStore.current;
            quote = await api.getQuote(fetch, provider, {
                fromCurrency: fiatCurrency,
                toCurrency,
                amount,
                customerId: customer
                    ? getQuoteCustomerId(customer.id, capabilities, customer.blockchainWalletId)
                    : undefined,
                stellarAddress: walletStore.publicKey ?? undefined,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function refreshQuote() {
        if (!amount) return;
        isGettingQuote = true;
        try {
            const customer = customerStore.current;
            quote = await api.getQuote(fetch, provider, {
                fromCurrency: fiatCurrency,
                toCurrency,
                amount,
                customerId: customer
                    ? getQuoteCustomerId(customer.id, capabilities, customer.blockchainWalletId)
                    : undefined,
                stellarAddress: walletStore.publicKey ?? undefined,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function confirmQuote() {
        const customer = customerStore.current;
        if (!quote || !walletStore.publicKey || !customer) return;

        isCreatingTransaction = true;
        error = null;

        try {
            transaction = await api.createOnRamp(fetch, provider, {
                customerId: customer.id,
                quoteId: quote.id,
                stellarAddress: walletStore.publicKey,
                fromCurrency: quote.fromCurrency,
                toCurrency: quote.toCurrency,
                amount: quote.fromAmount,
            });
            step = 'payment';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create transaction';
        } finally {
            isCreatingTransaction = false;
        }
    }

    function startPolling() {
        if (refreshInterval) clearInterval(refreshInterval);

        refreshInterval = setInterval(async () => {
            if (transaction) {
                const updated = await api.getOnRampTransaction(fetch, provider, transaction.id);

                if (updated) {
                    transaction = updated;

                    if (updated.status === TX_STATUS.COMPLETED) {
                        step = 'complete';
                        stopPolling();
                    } else if (
                        updated.status === TX_STATUS.FAILED ||
                        updated.status === TX_STATUS.EXPIRED ||
                        updated.status === TX_STATUS.CANCELLED
                    ) {
                        stopPolling();
                    }
                }
            }
        }, 5000);
    }

    function stopPolling() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function reset() {
        amount = '';
        quote = null;
        transaction = null;
        error = null;
        step = 'input';
        stopPolling();
    }

    async function simulateFiatReceived() {
        if (!transaction) return;

        isSimulatingFiat = true;
        try {
            const statusCode = await api.simulateFiatReceived(fetch, provider, transaction.id);
            if (statusCode === 200) {
                fiatSimulated = true;
            } else if (statusCode === 404) {
                error = 'Order not found';
            } else {
                error = `Simulation failed (${statusCode}): order may be in the wrong status or not an on-ramp order`;
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to simulate fiat received';
        } finally {
            isSimulatingFiat = false;
        }
    }

    function clearError() {
        error = null;
    }

    async function registerBlockchainWallet() {
        const customer = customerStore.current;
        if (!customer || !customer.id || !walletStore.publicKey || customer.blockchainWalletId) {
            walletRegistered = true;
            return;
        }

        isRegisteringWallet = true;
        try {
            const result = await api.registerBlockchainWallet(
                fetch,
                provider,
                customer.id,
                walletStore.publicKey,
            );
            const walletId = (result as { id: string }).id;
            customerStore.set({ ...customer, blockchainWalletId: walletId });
            walletRegistered = true;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to register wallet';
            console.error('Wallet registration failed:', err);
        } finally {
            isRegisteringWallet = false;
        }
    }

    onMount(() => {
        if (capabilities?.requiresBlockchainWalletRegistration) {
            registerBlockchainWallet();
        } else {
            walletRegistered = true;
        }
        return () => stopPolling();
    });
</script>

<div class="mx-auto max-w-lg">
    {#if step === 'input'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">On-Ramp</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the amount of local currency you want to convert to digital assets.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => {
                    hasTrustline = s.hasTrustline;
                }}
            />

            <AmountInput
                bind:amount
                label="Amount (Local Currency)"
                placeholder="1000"
                inputPrefix="$"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                {isGettingQuote}
                additionalDisabled={!walletRegistered}
                onSubmit={getQuote}
            >
                {#if isRegisteringWallet}
                    <div class="mt-4 flex items-center justify-center rounded-md bg-gray-50 p-3">
                        <div
                            class="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                        ></div>
                        <span class="ml-2 text-sm text-gray-500">Registering wallet...</span>
                    </div>
                {/if}
            </AmountInput>
        </div>
    {:else if step === 'quote'}
        <QuoteStep
            {quote}
            isRefreshing={isGettingQuote}
            isConfirming={isCreatingTransaction}
            confirmLabel="Confirm & Get Payment Details"
            onRefresh={refreshQuote}
            onCancel={reset}
            onConfirm={confirmQuote}
        />
    {:else if step === 'payment'}
        {#if transaction}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-semibold text-gray-900">Payment Instructions</h2>
                    <span
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
                            transaction.status,
                        )}"
                    >
                        {transaction.status}
                    </span>
                </div>

                <p class="mt-2 text-sm text-gray-500">
                    Transfer the following amount via bank transfer to complete your purchase.
                </p>

                {#if transaction.paymentInstructions}
                    {@const pi = transaction.paymentInstructions}
                    <div class="mt-6 space-y-4 rounded-md bg-gray-50 p-4">
                        {#if pi.type === 'spei'}
                            <div>
                                <span class="text-sm text-gray-500">Bank</span>
                                <p class="font-medium">{pi.bankName || 'N/A'}</p>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500">CLABE</span>
                                <p class="font-mono font-medium">{pi.clabe || 'N/A'}</p>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500">Beneficiary</span>
                                <p class="font-medium">{pi.beneficiary || 'N/A'}</p>
                            </div>
                        {/if}
                        {#if pi.reference}
                            <div>
                                <span class="text-sm text-gray-500">Reference</span>
                                <p class="font-mono font-medium">{pi.reference}</p>
                            </div>
                        {/if}
                        <div class="border-t border-gray-200 pt-4">
                            <span class="text-sm text-gray-500">Amount</span>
                            <p class="text-2xl font-bold text-indigo-600">
                                {parseFloat(pi.amount).toLocaleString()}
                                {pi.currency}
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                    <p>
                        <strong>Important:</strong> Use the exact reference number when making your transfer.
                        Your digital assets will be sent to your wallet once the payment is confirmed.
                    </p>
                </div>

                {#if capabilities?.sandbox}
                    <div class="mt-6 rounded-lg border border-amber-300 bg-amber-100 p-4">
                        <p class="text-sm font-medium text-amber-800">Sandbox Mode</p>
                        <p class="mt-1 text-xs text-amber-700">
                            Simulate a bank transfer being received by the anchor.
                        </p>
                        {#if fiatSimulated}
                            <p class="mt-3 text-sm font-medium text-green-700">
                                Fiat received simulated successfully.
                            </p>
                        {:else}
                            <button
                                onclick={simulateFiatReceived}
                                disabled={isSimulatingFiat}
                                class="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                                {isSimulatingFiat
                                    ? 'Simulating...'
                                    : 'Simulate Fiat Received (Sandbox)'}
                            </button>
                        {/if}
                    </div>
                {/if}

                <div class="mt-6">
                    <p class="text-center text-sm text-gray-500">
                        Waiting for payment confirmation... This page will update automatically.
                    </p>
                </div>
            </div>
        {/if}
    {:else if step === 'complete'}
        <CompletionStep
            title="Transaction Complete!"
            message="Your digital assets have been sent to your wallet."
            {transaction}
            {quote}
            {network}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<!-- For Developers -->
<section class="mx-auto mt-8 max-w-lg">
    <DevBox
        items={[
            {
                text: 'View OnRampFlow component source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/components/OnRampFlow.svelte',
            },
            {
                text: 'View anchor API proxy routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor',
            },
        ]}
    />
</section>
