<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { PUBLIC_STELLAR_NETWORK, PUBLIC_USDC_ISSUER } from '$env/static/public';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getUsdcAsset } from '$lib/wallet/stellar';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as koywe from '$lib/api/koywe';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type {
        KoywePaymentMethod,
        KoyweQuote,
        KoyweOnRampOrder,
        KoyweKycStatus,
    } from '$lib/anchors/koywe';

    // ------------------------------------------------------------------
    // Region & token derivation (Koywe Argentina — ARS → USDC on Stellar)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const fiatCurrency = 'ARS';
    const tokenSymbol = 'USDC';
    // Koywe returns no Stellar issuer; inject the network-correct USDC issuer.
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step = 'connect' | 'method' | 'amount' | 'quote' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    // KYC + onboarding
    let kycStatus = $state<KoyweKycStatus>('not_started');
    let kycChecked = $state(false);
    let kycUrlError = $state<string | null>(null);

    // Payment method (rail) selection
    let paymentMethods = $state<KoywePaymentMethod[]>([]);
    let selectedMethodId = $state<string | null>(null);

    // Ramp state
    let amount = $state('');
    let quote = $state<KoyweQuote | null>(null);
    let order = $state<KoyweOnRampOrder | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const orderPoller = createPoller({ intervalMs: 5000, maxAttempts: 60, onTick: pollOrder });

    const selectedMethod = $derived(paymentMethods.find((m) => m.id === selectedMethodId) ?? null);

    // Adapt KoyweQuote to the QuoteDisplay structural shape.
    const displayQuote = $derived(
        quote
            ? {
                  id: quote.id,
                  fromCurrency: quote.sourceAsset,
                  toCurrency: quote.targetAsset,
                  fromAmount: quote.sourceAmount,
                  toAmount: quote.destinationAmount,
                  exchangeRate: quote.exchangeRate,
                  fee: quote.fee,
                  expiresAt: quote.expiresAt,
              }
            : null,
    );

    // ------------------------------------------------------------------
    // KYC + payment-method discovery
    // ------------------------------------------------------------------

    async function startOnboarding() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            kycStatus = await koywe.getKycStatus(fetch);
            kycChecked = true;
            paymentMethods = await koywe.getPaymentProviders(fetch, fiatCurrency);
            // Default to the first rail-backed method (WIREAR), else first.
            selectedMethodId =
                paymentMethods.find((m) => m.rail)?.id ?? paymentMethods[0]?.id ?? null;
            step = 'method';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start Koywe onboarding';
        } finally {
            isWorking = false;
        }
    }

    async function openKyc() {
        kycUrlError = null;
        try {
            const url = await koywe.getKycUrl(fetch);
            window.open(url, '_blank', 'noopener');
        } catch (err) {
            // The hosted KYC endpoint is unconfirmed (501) — surface it clearly.
            kycUrlError =
                err instanceof Error
                    ? err.message
                    : 'Koywe hosted KYC is not available yet. Complete KYC in the Koywe dashboard.';
        }
    }

    // ------------------------------------------------------------------
    // Quote
    // ------------------------------------------------------------------

    async function getQuote() {
        if (!amount || !selectedMethodId) return;
        isWorking = true;
        error = null;
        try {
            quote = await koywe.getQuote(fetch, {
                ramp: 'onramp',
                fiatCurrency,
                amount,
                paymentMethodId: selectedMethodId,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isWorking = false;
        }
    }

    async function refreshQuote() {
        if (!amount || !selectedMethodId) return;
        isWorking = true;
        try {
            quote = await koywe.getQuote(fetch, {
                ramp: 'onramp',
                fiatCurrency,
                amount,
                paymentMethodId: selectedMethodId,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Order creation + polling
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            order = await koywe.createOnRampOrder(fetch, {
                quoteId: quote.id,
                stellarAddress: walletStore.publicKey,
            });
            step = 'payment';
            orderPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create order';
        } finally {
            isWorking = false;
        }
    }

    async function pollOrder({ stop }: { stop: () => void }) {
        if (!order) return;
        const updated = await koywe.getOrder(fetch, order.id);
        if (!updated) return;
        // Merge the polled status onto the order, preserving deposit instructions.
        order = { ...order, status: updated.status };
        if (updated.status === 'DELIVERED') {
            step = 'complete';
            stop();
        } else if (
            updated.status === 'REJECTED' ||
            updated.status === 'INVALID_WITHDRAWALS_DETAILS'
        ) {
            error = `Order ${updated.status.toLowerCase().replace(/_/g, ' ')}`;
            stop();
        }
    }

    // ------------------------------------------------------------------
    // Reset / lifecycle
    // ------------------------------------------------------------------

    function reset() {
        amount = '';
        quote = null;
        order = null;
        error = null;
        step = 'method';
        orderPoller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => orderPoller.stop();
    });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/koywe')} class="text-sm text-indigo-600 hover:underline">
                ← Koywe
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                On-Ramp ({fiatCurrency} → {tokenSymbol})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Buy {tokenSymbol} on Stellar with {fiatCurrency} via Koywe's local rails.
            </p>
        </div>
        <WalletConnect />
    </header>

    <!-- =================== CONNECT / ONBOARD ===================== -->
    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if !walletStore.isConnected}
                <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Koywe delivers USDC to your Stellar public key. Connect Freighter to continue.
                </p>
            {:else}
                <h2 class="text-lg font-semibold text-gray-900">Start</h2>
                <p class="mt-1 text-sm text-gray-500">
                    We'll check your Koywe KYC status and load the available Argentine payment
                    rails.
                </p>
                <button
                    onclick={startOnboarding}
                    disabled={isWorking}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Loading…' : 'Continue'}
                </button>
            {/if}
        </div>
    {/if}

    <!-- =================== PAYMENT METHOD ======================== -->
    {#if step === 'method'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if kycChecked && kycStatus !== 'approved'}
                <div class="mb-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">KYC required</p>
                    <p class="mt-1">
                        Koywe requires identity verification before delivering USDC. KYC is
                        Koywe-hosted and opens in a new tab.
                    </p>
                    <button
                        onclick={openKyc}
                        class="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                        Open KYC ↗
                    </button>
                    {#if kycUrlError}
                        <p class="mt-2 text-xs text-amber-700">{kycUrlError}</p>
                    {/if}
                </div>
            {/if}

            <h2 class="text-lg font-semibold text-gray-900">Choose a payment method</h2>
            <p class="mt-1 text-sm text-gray-500">
                Select how you'll send {fiatCurrency} to Koywe.
            </p>

            <div class="mt-4 space-y-2">
                {#each paymentMethods as method (method.id)}
                    <label
                        class="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm
                            {selectedMethodId === method.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'}"
                    >
                        <input
                            type="radio"
                            name="paymentMethod"
                            value={method.id}
                            checked={selectedMethodId === method.id}
                            onchange={() => (selectedMethodId = method.id)}
                            class="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                            <p class="font-medium">{method.label}</p>
                            <p class="text-xs text-gray-500">{method.name}</p>
                        </div>
                    </label>
                {/each}
            </div>

            <button
                onclick={() => (step = 'amount')}
                disabled={!selectedMethodId}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                Continue
            </button>
        </div>
    {/if}

    <!-- =================== AMOUNT ================================ -->
    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the {fiatCurrency} amount to convert to {tokenSymbol}.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount ({fiatCurrency})"
                placeholder="10000"
                inputPrefix="$"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={getQuote}
            />
        </div>
    {/if}

    <!-- =================== QUOTE ================================= -->
    {#if step === 'quote' && displayQuote}
        <div class="space-y-4">
            <QuoteDisplay quote={displayQuote} onRefresh={refreshQuote} isRefreshing={isWorking} />
            {#if selectedMethod}
                <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <span class="text-gray-500">Paying via</span>
                    <span class="ml-1 font-medium">{selectedMethod.label}</span>
                </div>
            {/if}
            <div class="flex gap-3">
                <button
                    onclick={() => (step = 'amount')}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onclick={confirmQuote}
                    disabled={isWorking}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Creating order…' : 'Confirm & get instructions'}
                </button>
            </div>
        </div>
    {/if}

    <!-- =================== PAYMENT =============================== -->
    {#if step === 'payment' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Send {fiatCurrency}</h2>
                <span
                    class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                >
                    {order.status}
                </span>
            </div>

            {#if order.deposit?.cvu}
                <!-- WIREAR: inline CVU bank-transfer instructions -->
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    <div>
                        <span class="text-gray-500">CVU</span>
                        <p class="font-medium">
                            <CopyableField value={order.deposit.cvu} mono />
                        </p>
                    </div>
                    {#if order.deposit.alias}
                        <div>
                            <span class="text-gray-500">Alias</span>
                            <p class="font-medium">
                                <CopyableField value={order.deposit.alias} mono />
                            </p>
                        </div>
                    {/if}
                    {#if order.deposit.bankName}
                        <div>
                            <span class="text-gray-500">Bank</span>
                            <p class="font-medium">{order.deposit.bankName}</p>
                        </div>
                    {/if}
                    <div class="border-t border-gray-200 pt-3">
                        <span class="text-gray-500">Amount</span>
                        <p class="text-xl font-bold text-indigo-600">
                            <CopyableField
                                value="{parseFloat(
                                    order.sourceAmount,
                                ).toLocaleString()} {fiatCurrency}"
                            />
                        </p>
                    </div>
                </div>
            {:else if order.interactiveUrl}
                <!-- QRI / Khipu: hosted redirect (opens in a new tab) -->
                <div class="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                    <p>
                        Complete your {fiatCurrency} payment in Koywe's hosted flow, which opens in a
                        new tab. Return here when done — we'll detect delivery automatically.
                    </p>
                    <a
                        href={order.interactiveUrl}
                        target="_blank"
                        rel="noopener"
                        class="mt-3 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Open payment ↗
                    </a>
                </div>
            {:else}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    No payment instructions were returned for this order. Order ID:
                    <CopyableField value={order.id} mono />
                </div>
            {/if}

            <div class="mt-6">
                {#if orderPoller.timedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">Still processing</p>
                        <p class="mt-1">
                            We haven't detected delivery yet. You can close this page and check back
                            later.
                        </p>
                        <div class="mt-3">
                            <span class="text-xs text-amber-600">Order ID</span>
                            <p class="mt-0.5"><CopyableField value={order.id} mono /></p>
                        </div>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        Waiting for confirmation… polling Koywe.
                    </p>
                {/if}
            </div>
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && order}
        {@const completionDetails = order.destinationAmount
            ? [{ label: 'Amount', value: `${order.destinationAmount} ${tokenSymbol}` }]
            : []}
        <CompletionStep
            title="{tokenSymbol} delivered"
            message="Koywe sent {tokenSymbol} to your Stellar wallet."
            details={completionDetails}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View this page source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/koywe/onramp/+page.svelte',
            },
            {
                text: 'View KoyweClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/koywe/client.ts',
            },
            {
                text: 'View Koywe API routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor/koywe',
            },
        ]}
    />
</section>
