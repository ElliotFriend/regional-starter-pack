<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { resolve } from '$app/paths';
    import { PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import KycIframe from '$lib/components/KycIframe.svelte';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getStellarAsset, submitTransaction } from '$lib/wallet/stellar';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import * as ef from '$lib/api/etherfuse';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type {
        EtherfuseCustomer,
        EtherfuseQuote,
        EtherfuseOffRampOrder,
        EtherfuseSavedBankAccount,
        EtherfuseKycStatus,
    } from '$lib/anchors/etherfuse';

    // ------------------------------------------------------------------
    // Region & token derivation
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
    const stellarAsset = $derived(getStellarAsset(tokenSymbol, tokenIssuer));

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step =
        | 'onboarding'
        | 'amount'
        | 'quote'
        | 'awaiting-xdr'
        | 'signing'
        | 'awaiting-payout'
        | 'complete';
    let step = $state<Step>('onboarding');

    // Onboarding
    let email = $state('');
    let customer = $state<EtherfuseCustomer | null>(null);
    let kycUrl = $state<string | null>(null);
    let kycStatus = $state<EtherfuseKycStatus>('not_started');
    let bankAccounts = $state<EtherfuseSavedBankAccount[]>([]);
    let selectedBankAccountId = $state<string | null>(null);

    // Ramp
    let amount = $state('');
    let quote = $state<EtherfuseQuote | null>(null);
    let order = $state<EtherfuseOffRampOrder | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);
    let kycPollTimer: ReturnType<typeof setInterval> | null = null;
    let xdrPollTimer: ReturnType<typeof setInterval> | null = null;
    let payoutPollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    const MAX_POLL_COUNT = 60;
    const pollingTimedOut = $derived(pollCount >= MAX_POLL_COUNT);

    // ------------------------------------------------------------------
    // QuoteDisplay adapter
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
    // Onboarding actions (mirrors on-ramp page)
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
            await refreshKycStatus();
            startKycPolling();
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
                stopKycPolling();
            }
        } catch (err) {
            console.warn('[Etherfuse offramp] KYC poll failed:', err);
        }
    }

    function startKycPolling() {
        stopKycPolling();
        kycPollTimer = setInterval(refreshKycStatus, 5000);
    }

    function stopKycPolling() {
        if (kycPollTimer) {
            clearInterval(kycPollTimer);
            kycPollTimer = null;
        }
    }

    async function refreshBankAccounts() {
        if (!customer) return;
        try {
            bankAccounts = await ef.listBankAccounts(fetch, customer.id);
            if (!selectedBankAccountId && bankAccounts.length > 0) {
                selectedBankAccountId = bankAccounts[0].id;
            }
        } catch (err) {
            console.warn('[Etherfuse offramp] Bank account fetch failed:', err);
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
                fromAsset: tokenSymbol,
                toAsset: fiatCurrency,
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
                fromAsset: tokenSymbol,
                toAsset: fiatCurrency,
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
    // Order creation + deferred signing
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !customer || !walletStore.publicKey || !selectedBankAccountId) return;
        isWorking = true;
        error = null;
        try {
            order = await ef.createOffRampOrder(fetch, {
                customerId: customer.id,
                quoteId: quote.id,
                publicKey: walletStore.publicKey,
                bankAccountId: selectedBankAccountId,
            });
            step = 'awaiting-xdr';
            startXdrPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create order';
        } finally {
            isWorking = false;
        }
    }

    function startXdrPolling() {
        stopXdrPolling();
        pollCount = 0;
        xdrPollTimer = setInterval(async () => {
            pollCount += 1;
            if (pollingTimedOut) {
                stopXdrPolling();
                return;
            }
            if (!order) return;
            try {
                const updated = await ef.getOffRampOrder(fetch, order.id);
                if (updated) {
                    order = updated;
                    if (updated.burnTransaction) {
                        stopXdrPolling();
                        await signAndSubmit(updated.burnTransaction);
                    } else if (
                        updated.status === 'failed' ||
                        updated.status === 'canceled' ||
                        updated.status === 'refunded'
                    ) {
                        stopXdrPolling();
                    }
                }
            } catch (err) {
                console.warn('[Etherfuse offramp] XDR poll failed:', err);
            }
        }, 5000);
    }

    function stopXdrPolling() {
        if (xdrPollTimer) {
            clearInterval(xdrPollTimer);
            xdrPollTimer = null;
        }
    }

    async function signAndSubmit(envelope: string) {
        step = 'signing';
        try {
            const signed = await signWithFreighter(envelope, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'awaiting-payout';
            startPayoutPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to sign and submit burn';
            // Allow retry — drop back to the XDR-arrived state.
            step = 'awaiting-xdr';
            if (order?.burnTransaction) {
                // XDR is still present on the order; user can click "Sign again".
            } else {
                startXdrPolling();
            }
        }
    }

    function startPayoutPolling() {
        stopPayoutPolling();
        pollCount = 0;
        payoutPollTimer = setInterval(async () => {
            pollCount += 1;
            if (pollingTimedOut) {
                stopPayoutPolling();
                return;
            }
            if (!order) return;
            try {
                const updated = await ef.getOffRampOrder(fetch, order.id);
                if (updated) {
                    order = updated;
                    if (updated.status === 'completed') {
                        step = 'complete';
                        stopPayoutPolling();
                    } else if (
                        updated.status === 'failed' ||
                        updated.status === 'canceled' ||
                        updated.status === 'refunded'
                    ) {
                        stopPayoutPolling();
                    }
                }
            } catch (err) {
                console.warn('[Etherfuse offramp] Payout poll failed:', err);
            }
        }, 5000);
    }

    function stopPayoutPolling() {
        if (payoutPollTimer) {
            clearInterval(payoutPollTimer);
            payoutPollTimer = null;
        }
    }

    function reset() {
        amount = '';
        quote = null;
        order = null;
        stellarTxHash = null;
        error = null;
        step = bankAccounts.length > 0 ? 'amount' : 'onboarding';
        stopXdrPolling();
        stopPayoutPolling();
    }

    function clearError() {
        error = null;
    }

    function retrySign() {
        if (order?.burnTransaction) {
            signAndSubmit(order.burnTransaction);
        }
    }

    onMount(() => {
        return () => {
            stopKycPolling();
            stopXdrPolling();
            stopPayoutPolling();
        };
    });

    const selectedBankAccount = $derived(
        bankAccounts.find((a) => a.id === selectedBankAccountId) ?? null,
    );
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
                Off-Ramp ({tokenSymbol} → {fiatCurrency})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Sell {tokenSymbol} on Stellar for {fiatCurrency} via {rail}.
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
                    Complete identity verification and register a bank account inside Etherfuse's
                    onboarding flow. We'll detect approval automatically.
                </p>
                <div class="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                    Status: <span class="font-mono">{kycStatus}</span>
                </div>
                <div class="mt-4">
                    <KycIframe url={kycUrl} onComplete={refreshKycStatus} />
                </div>
                <button
                    onclick={refreshKycStatus}
                    class="mt-4 text-sm text-indigo-600 hover:underline"
                >
                    Refresh status now
                </button>
            {:else if kycStatus === 'approved' || kycStatus === 'approved_chain_deploying'}
                <h2 class="text-lg font-semibold text-gray-900">Confirm payout account</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Identity verified. Choose the {rail} account that will receive your {fiatCurrency}.
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
                    <div class="mt-4 space-y-2">
                        {#each bankAccounts as account (account.id)}
                            <label
                                class="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm
                                    {selectedBankAccountId === account.id
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-gray-200 hover:border-gray-300'}"
                            >
                                <input
                                    type="radio"
                                    name="bankAccount"
                                    value={account.id}
                                    checked={selectedBankAccountId === account.id}
                                    onchange={() => (selectedBankAccountId = account.id)}
                                    class="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div>
                                    <p class="font-medium uppercase">{account.rail}</p>
                                    <p class="font-mono text-gray-600">
                                        {account.accountIdentifier}
                                    </p>
                                    {#if account.accountHolderName}
                                        <p class="text-gray-500">{account.accountHolderName}</p>
                                    {/if}
                                </div>
                            </label>
                        {/each}
                    </div>
                    <button
                        onclick={() => (step = 'amount')}
                        disabled={!selectedBankAccountId}
                        class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
                Enter the {tokenSymbol} amount to convert to {fiatCurrency}.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency={tokenSymbol}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount ({tokenSymbol})"
                placeholder="50"
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
            {#if selectedBankAccount}
                <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <span class="text-gray-500">Payout to</span>
                    <span class="ml-1 font-medium uppercase">{selectedBankAccount.rail}</span>
                    <span class="ml-1 font-mono text-gray-600">
                        {selectedBankAccount.accountIdentifier}
                    </span>
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
                    {isWorking ? 'Creating order…' : 'Confirm & create order'}
                </button>
            </div>
        </div>
    {/if}

    <!-- =================== AWAITING XDR ========================== -->
    {#if step === 'awaiting-xdr' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Preparing burn transaction</h2>
            <p class="mt-1 text-sm text-gray-500">
                Etherfuse is preparing the Stellar burn transaction. This usually takes a few
                seconds — you'll be prompted to sign with Freighter when it's ready.
            </p>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling Etherfuse…</span>
            </div>
            <div class="text-xs text-gray-400">
                Order ID: <CopyableField value={order.id} mono />
            </div>
            {#if pollingTimedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still waiting</p>
                    <p class="mt-1">
                        Etherfuse hasn't returned the burn transaction yet. You can close this page
                        and check back later.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    <!-- =================== SIGNING =============================== -->
    {#if step === 'signing'}
        <div class="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Sign in Freighter</h2>
            <p class="mt-1 text-sm text-gray-500">
                A Freighter window should be open. Confirm the burn transaction to send {tokenSymbol}
                to Etherfuse.
            </p>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Awaiting signature…</span>
            </div>
        </div>
    {/if}

    <!-- =================== AWAITING PAYOUT ======================= -->
    {#if step === 'awaiting-payout' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Awaiting fiat payout</h2>
            <p class="mt-1 text-sm text-gray-500">
                Your {tokenSymbol} burn is confirmed on Stellar. Etherfuse is sending {fiatCurrency}
                to your {rail} account.
            </p>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if stellarTxHash}
                    <p>
                        Stellar tx:
                        <a
                            href="https://stellar.expert/explorer/{network}/tx/{stellarTxHash}"
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            {stellarTxHash.slice(0, 12)}…↗
                        </a>
                    </p>
                {/if}
                <p>Order: <CopyableField value={order.id} mono /></p>
                <p>Status: <span class="font-mono">{order.status}</span></p>
            </div>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling Etherfuse…</span>
            </div>
            {#if pollingTimedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still processing</p>
                    <p class="mt-1">
                        Etherfuse hasn't confirmed the {rail} payout yet. You can close this page and
                        check back later.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
            >
                <svg
                    class="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">{fiatCurrency} sent</h2>
            <p class="mt-2 text-sm text-gray-500">
                Etherfuse sent {fiatCurrency} to your {rail} account.
            </p>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if order.amountInFiat}
                    <p>Amount: {order.amountInFiat} {fiatCurrency}</p>
                {/if}
                {#if order.feeAmountInFiat}
                    <p>
                        Fee: {order.feeAmountInFiat}
                        {fiatCurrency}
                        {#if order.feeBps}
                            <span class="text-gray-400">({order.feeBps / 100}%)</span>
                        {/if}
                    </p>
                {/if}
                {#if stellarTxHash}
                    <p class="mt-1">
                        <a
                            href="https://stellar.expert/explorer/{network}/tx/{stellarTxHash}"
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            View burn on Stellar Expert ↗
                        </a>
                    </p>
                {/if}
                {#if order.statusPage}
                    <p>
                        <a
                            href={order.statusPage}
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            View on Etherfuse ↗
                        </a>
                    </p>
                {/if}
            </div>
            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start new transaction
            </button>
        </div>
    {/if}

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={clearError} />
            {#if order?.burnTransaction && step === 'awaiting-xdr'}
                <button
                    onclick={retrySign}
                    class="mt-2 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Try signing again
                </button>
            {/if}
        </div>
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View this page source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/etherfuse/offramp/+page.svelte',
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
