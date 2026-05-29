<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { resolve } from '$app/paths';
    import { PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getStellarAsset } from '$lib/wallet/stellar';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as ef from '$lib/api/etherfuse';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type {
        EtherfuseCustomer,
        EtherfuseQuote,
        EtherfuseOnRampOrder,
        EtherfuseSavedBankAccount,
        EtherfuseKycStatus,
    } from '$lib/anchors/etherfuse';

    // ------------------------------------------------------------------
    // Region & token derivation (Etherfuse-specific, no capability flags)
    // ------------------------------------------------------------------

    const CETES_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    const TESOURO_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    const requestedRegion = $derived(page.url.searchParams.get('region') ?? 'mexico');
    const region = $derived(requestedRegion === 'brazil' ? 'brazil' : 'mexico');
    const fiatCurrency = $derived(region === 'brazil' ? 'BRL' : 'MXN');
    const tokenSymbol = $derived(region === 'brazil' ? 'TESOURO' : 'CETES');
    const tokenIssuer = $derived(region === 'brazil' ? TESOURO_ISSUER : CETES_ISSUER);
    const rail = $derived(region === 'brazil' ? 'PIX' : 'SPEI');
    const currencySymbol = $derived(region === 'brazil' ? 'R$' : '$');
    const stellarAsset = $derived(getStellarAsset(tokenSymbol, tokenIssuer));

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step = 'onboarding' | 'amount' | 'quote' | 'payment' | 'complete';
    let step = $state<Step>('onboarding');

    // Onboarding sub-state
    let email = $state('');
    let customer = $state<EtherfuseCustomer | null>(null);
    let kycUrl = $state<string | null>(null);
    let kycStatus = $state<EtherfuseKycStatus>('not_started');
    let bankAccounts = $state<EtherfuseSavedBankAccount[]>([]);

    // Ramp state
    let amount = $state('');
    let quote = $state<EtherfuseQuote | null>(null);
    let order = $state<EtherfuseOnRampOrder | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    // Polling: KYC runs until approved (capped at 10 min); order runs until
    // status is terminal (capped at 5 min).
    const kycPoller = createPoller({
        intervalMs: 5000,
        maxAttempts: 120,
        onTick: () => refreshKycStatus(),
    });
    const orderPoller = createPoller({
        intervalMs: 5000,
        maxAttempts: 60,
        onTick: pollOrder,
    });

    // Sandbox
    let isSimulatingFiat = $state(false);
    let fiatSimulated = $state(false);

    // ------------------------------------------------------------------
    // Adapt EtherfuseQuote to the QuoteDisplay primitive's structural shape
    // ------------------------------------------------------------------

    const displayQuote = $derived(
        quote
            ? {
                  id: quote.id,
                  fromCurrency: quote.sourceAsset.split(':')[0],
                  toCurrency: quote.targetAsset.split(':')[0],
                  fromAmount: quote.sourceAmount,
                  toAmount: quote.destinationAmount,
                  exchangeRate: quote.exchangeRate,
                  fee: quote.fee,
                  expiresAt: quote.expiresAt,
                  createdAt: quote.createdAt,
              }
            : null,
    );

    // ------------------------------------------------------------------
    // Onboarding actions
    // ------------------------------------------------------------------

    async function startOnboarding() {
        if (!walletStore.publicKey) return;
        if (!email) {
            error = 'Email is required';
            return;
        }
        isWorking = true;
        error = null;
        try {
            customer = await ef.createCustomer(fetch, {
                publicKey: walletStore.publicKey,
                email,
                country: region === 'brazil' ? 'BR' : 'MX',
            });
            kycUrl = await ef.getKycUrl(fetch, {
                customerId: customer.id,
                publicKey: walletStore.publicKey,
                bankAccountId: customer.bankAccountId,
            });
            // Immediately check status — a returning user (409 recovery) may
            // already be approved.
            await refreshKycStatus();
            kycPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start onboarding';
        } finally {
            isWorking = false;
        }
    }

    async function refreshKycStatus() {
        if (!customer || !walletStore.publicKey) return;
        try {
            kycStatus = await ef.getKycStatus(fetch, {
                customerId: customer.id,
                publicKey: walletStore.publicKey,
            });
            if (kycStatus === 'approved' || kycStatus === 'approved_chain_deploying') {
                await refreshBankAccounts();
                kycPoller.stop();
                if (bankAccounts.length > 0) {
                    step = 'amount';
                }
            }
        } catch (err) {
            console.warn('[Etherfuse onramp] KYC status poll failed:', err);
        }
    }

    async function refreshBankAccounts() {
        if (!customer) return;
        try {
            bankAccounts = await ef.listBankAccounts(fetch, customer.id);
        } catch (err) {
            console.warn('[Etherfuse onramp] Bank account fetch failed:', err);
        }
    }

    // ------------------------------------------------------------------
    // Quote
    // ------------------------------------------------------------------

    async function getQuote() {
        if (!amount || !customer || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            quote = await ef.getQuote(fetch, {
                fromAsset: fiatCurrency,
                toAsset: tokenSymbol,
                sourceAmount: amount,
                customerId: customer.id,
                stellarAddress: walletStore.publicKey,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isWorking = false;
        }
    }

    async function refreshQuote() {
        if (!amount || !customer || !walletStore.publicKey) return;
        isWorking = true;
        try {
            quote = await ef.getQuote(fetch, {
                fromAsset: fiatCurrency,
                toAsset: tokenSymbol,
                sourceAmount: amount,
                customerId: customer.id,
                stellarAddress: walletStore.publicKey,
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
        if (!quote || !customer || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            order = await ef.createOnRampOrder(fetch, {
                customerId: customer.id,
                quoteId: quote.id,
                publicKey: walletStore.publicKey,
                bankAccountId: bankAccounts[0]?.id ?? customer.bankAccountId,
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
        const updated = await ef.getOnRampOrder(fetch, order.id);
        if (!updated) return;
        order = updated;
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        } else if (
            updated.status === 'failed' ||
            updated.status === 'canceled' ||
            updated.status === 'refunded'
        ) {
            stop();
        }
    }

    // ------------------------------------------------------------------
    // Sandbox
    // ------------------------------------------------------------------

    async function simulateFiatReceived() {
        if (!order) return;
        isSimulatingFiat = true;
        try {
            const statusCode = await ef.simulateFiatReceived(fetch, order.id);
            if (statusCode === 200) {
                fiatSimulated = true;
            } else if (statusCode === 404) {
                error = 'Order not found';
            } else {
                error = `Simulation failed (${statusCode})`;
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to simulate fiat received';
        } finally {
            isSimulatingFiat = false;
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
        fiatSimulated = false;
        step = bankAccounts.length > 0 ? 'amount' : 'onboarding';
        orderPoller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => {
            kycPoller.stop();
            orderPoller.stop();
        };
    });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a
                href={resolve(`/anchors/etherfuse?region=${region}`)}
                class="text-sm text-indigo-600 hover:underline"
            >
                ← Etherfuse
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                On-Ramp ({fiatCurrency} → {tokenSymbol})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Buy {tokenSymbol} on Stellar with {fiatCurrency} via {rail}.
            </p>
        </div>
        <WalletConnect />
    </header>

    <!-- =================== ONBOARDING ============================ -->
    {#if step === 'onboarding'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if !walletStore.isConnected}
                <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Etherfuse ties each customer to a Stellar public key. Connect Freighter to
                    continue.
                </p>
            {:else if !customer}
                <h2 class="text-lg font-semibold text-gray-900">Onboarding</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Enter your email to register with Etherfuse. You'll complete identity
                    verification and bank registration in the next step.
                </p>
                <label class="mt-4 block text-sm font-medium text-gray-700" for="email">Email</label
                >
                <input
                    id="email"
                    type="email"
                    bind:value={email}
                    placeholder="you@example.com"
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
                <button
                    onclick={startOnboarding}
                    disabled={isWorking || !email}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Registering…' : 'Continue'}
                </button>
            {:else if kycUrl && kycStatus !== 'approved' && kycStatus !== 'approved_chain_deploying'}
                <h2 class="text-lg font-semibold text-gray-900">Complete identity verification</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Complete identity verification and register a bank account in Etherfuse's
                    onboarding flow, which opens in a new tab. Return here when you're done — we'll
                    detect approval automatically.
                </p>
                <div class="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                    Status: <span class="font-mono">{kycStatus}</span>
                </div>
                <a
                    href={kycUrl}
                    target="_blank"
                    rel="noopener"
                    class="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Open verification ↗
                </a>
                <button
                    onclick={refreshKycStatus}
                    class="mt-4 block text-sm text-indigo-600 hover:underline"
                >
                    Refresh status now
                </button>
            {:else if kycStatus === 'approved' || kycStatus === 'approved_chain_deploying'}
                <h2 class="text-lg font-semibold text-gray-900">Confirm bank account</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Identity verified. You'll receive the on-ramp payout to this {rail} account.
                </p>
                {#if bankAccounts.length === 0}
                    <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p>
                            No bank account registered yet. Reopen the onboarding flow to register a
                            {rail} account.
                        </p>
                        {#if kycUrl}
                            <a
                                href={kycUrl}
                                target="_blank"
                                rel="noopener"
                                class="mt-2 inline-block text-indigo-600 hover:underline"
                            >
                                Reopen onboarding ↗
                            </a>
                        {/if}
                        <button
                            onclick={refreshBankAccounts}
                            class="mt-2 ml-3 text-indigo-600 hover:underline"
                        >
                            Refresh accounts
                        </button>
                    </div>
                {:else}
                    <ul class="mt-4 space-y-2">
                        {#each bankAccounts as account (account.id)}
                            <li class="rounded-md border border-gray-200 p-3 text-sm">
                                <span class="font-medium uppercase">{account.rail}</span>
                                — <span class="font-mono">{account.accountIdentifier}</span>
                                {#if account.accountHolderName}
                                    · {account.accountHolderName}
                                {/if}
                            </li>
                        {/each}
                    </ul>
                    <button
                        onclick={() => (step = 'amount')}
                        class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Continue
                    </button>
                {/if}
            {/if}
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
                placeholder="1000"
                inputPrefix={currencySymbol}
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
                <h2 class="text-lg font-semibold text-gray-900">Send {fiatCurrency} via {rail}</h2>
                <span
                    class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                >
                    {order.status}
                </span>
            </div>

            {#if order.deposit && order.deposit.rail === 'spei'}
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    <div>
                        <span class="text-gray-500">Bank</span>
                        <p class="font-medium">{order.deposit.bankName || 'N/A'}</p>
                    </div>
                    <div>
                        <span class="text-gray-500">CLABE</span>
                        <p class="font-medium">
                            <CopyableField value={order.deposit.clabe} mono />
                        </p>
                    </div>
                    <div>
                        <span class="text-gray-500">Beneficiary</span>
                        <p class="font-medium">{order.deposit.beneficiary || 'N/A'}</p>
                    </div>
                    <div class="border-t border-gray-200 pt-3">
                        <span class="text-gray-500">Amount</span>
                        <p class="text-xl font-bold text-indigo-600">
                            <CopyableField
                                value="{parseFloat(order.deposit.amount).toLocaleString()} {order
                                    .deposit.currency || fiatCurrency}"
                            />
                        </p>
                    </div>
                </div>
            {:else if order.deposit && order.deposit.rail === 'pix'}
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    <div>
                        <span class="text-gray-500">PIX BR-Code (copy-paste)</span>
                        <p class="font-medium break-all">
                            <CopyableField value={order.deposit.pixCode} mono />
                        </p>
                    </div>
                    {#if order.deposit.pixKey}
                        <div>
                            <span class="text-gray-500">PIX Key</span>
                            <p class="font-medium">
                                <CopyableField value={order.deposit.pixKey} mono />
                            </p>
                        </div>
                    {/if}
                    {#if order.deposit.pixKeyType}
                        <div>
                            <span class="text-gray-500">PIX Key Type</span>
                            <p class="font-medium uppercase">{order.deposit.pixKeyType}</p>
                        </div>
                    {/if}
                    {#if order.deposit.beneficiary}
                        <div>
                            <span class="text-gray-500">Beneficiary</span>
                            <p class="font-medium">{order.deposit.beneficiary}</p>
                        </div>
                    {/if}
                    <div class="border-t border-gray-200 pt-3">
                        <span class="text-gray-500">Amount</span>
                        <p class="text-xl font-bold text-indigo-600">
                            <CopyableField
                                value="{parseFloat(order.deposit.amount).toLocaleString()} {order
                                    .deposit.currency || fiatCurrency}"
                            />
                        </p>
                    </div>
                </div>
            {/if}

            <div class="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                <strong>Important:</strong> Use the exact amount and reference. {tokenSymbol} will be
                delivered to your wallet once Etherfuse confirms receipt.
            </div>

            <!-- Sandbox helper — Etherfuse is sandbox-only in this app. -->
            <div class="mt-6 rounded-lg border border-amber-300 bg-amber-100 p-4">
                <p class="text-sm font-medium text-amber-800">Sandbox Mode</p>
                <p class="mt-1 text-xs text-amber-700">
                    Simulate Etherfuse receiving your {rail} transfer.
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
                        {isSimulatingFiat ? 'Simulating…' : 'Simulate fiat received'}
                    </button>
                {/if}
            </div>

            <div class="mt-6">
                {#if orderPoller.timedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">Still processing</p>
                        <p class="mt-1">
                            We haven't received confirmation yet. You can close this page and check
                            back later.
                        </p>
                        <div class="mt-3">
                            <span class="text-xs text-amber-600">Order ID</span>
                            <p class="mt-0.5"><CopyableField value={order.id} mono /></p>
                        </div>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        Waiting for {rail} confirmation… polling Etherfuse.
                    </p>
                {/if}
            </div>
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && order}
        {@const completionDetails = [
            ...(order.amountInTokens
                ? [{ label: 'Amount', value: `${order.amountInTokens} ${tokenSymbol}` }]
                : []),
            ...(order.feeAmountInFiat
                ? [
                      {
                          label: 'Fee',
                          value: `${order.feeAmountInFiat} ${fiatCurrency}${order.feeBps ? ` (${order.feeBps / 100}%)` : ''}`,
                      },
                  ]
                : []),
        ]}
        {@const completionLinks = [
            ...(order.confirmedTxSignature
                ? [
                      {
                          label: 'View on Stellar Expert ↗',
                          href: `https://stellar.expert/explorer/${network}/tx/${order.confirmedTxSignature}`,
                      },
                  ]
                : []),
            ...(order.statusPage ? [{ label: 'View on Etherfuse ↗', href: order.statusPage }] : []),
        ]}
        <CompletionStep
            title="{tokenSymbol} delivered"
            message="Etherfuse sent {tokenSymbol} to your Stellar wallet."
            details={completionDetails}
            links={completionLinks}
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/etherfuse/onramp/+page.svelte',
            },
            {
                text: 'View EtherfuseClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/etherfuse/client.ts',
            },
            {
                text: 'View Etherfuse API routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor/etherfuse',
            },
        ]}
    />
</section>
