<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { getStellarAsset } from '$lib/wallet/stellar';
    import { createSep10Session } from '$lib/wallet/sep10-session';
    import { createPoller } from '$lib/utils/poll.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { PUBLIC_USDC_ISSUER } from '$env/static/public';
    import * as trmock from '$lib/api/trmock';
    import type {
        Sep6Transaction,
        Sep6DepositResponse,
        Sep12CustomerResponse,
        Sep38QuoteResponse,
    } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

    const PROVIDER = 'trmock';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('USDC', PUBLIC_USDC_ISSUER);

    // The anchor's live limits, from GET /health (verified 2026-09-15).
    const MIN_TRY = 50;
    const MAX_TRY = 3000;

    type Step = 'connect' | 'kyc' | 'amount' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    let customer = $state<Sep12CustomerResponse | null>(null);
    let kycFields = $state<Record<string, string>>({});
    let amount = $state('');
    let quote = $state<Sep38QuoteResponse | null>(null);
    let deposit = $state<Sep6DepositResponse | null>(null);
    let transaction = $state<Sep6Transaction | null>(null);
    let hasTrustline = $state(false);

    let isWorking = $state(false);
    let error = $state<string | null>(null);
    const poller = createPoller({
        intervalMs: 5000,
        maxAttempts: 60,
        onTick: pollTransaction,
    });

    // Stop polling if the user navigates away mid-deposit — parity with the
    // testanchor reference page.
    onMount(() => () => poller.stop());

    const sep10 = createSep10Session(PROVIDER, {
        getChallenge: trmock.getChallenge,
        submitChallenge: trmock.submitChallenge,
    });

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') {
            step = 'kyc';
            checkKyc();
        }
    });

    async function checkKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            customer = await trmock.getCustomer(fetch, token);
            if (customer.status === 'ACCEPTED') step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to check KYC status';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        // The anchor's SEP-12 takes SEP-9 snake_case fields and auto-approves
        // every customer — there is no way to force NEEDS_INFO or REJECTED.
        kycFields = {
            first_name: 'Ada',
            last_name: 'Yilmaz',
            email_address: 'ada@example.com',
        };
    }

    async function submitKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            await trmock.putCustomer(fetch, token, kycFields);
            customer = await trmock.getCustomer(fetch, token);
            if (customer.status === 'ACCEPTED') step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit KYC';
        } finally {
            isWorking = false;
        }
    }

    async function startDeposit() {
        if (!walletStore.publicKey || !amount) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            // Lock a firm rate first, then hand the quote to deposit-exchange
            // so the settled amount matches what the user was shown.
            quote = await trmock.createQuote(fetch, token, 'onramp', amount);
            deposit = await trmock.depositExchange(fetch, token, {
                amount,
                account: walletStore.publicKey,
                quoteId: quote.id,
            });
            step = 'payment';
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start the deposit';
        } finally {
            isWorking = false;
        }
    }

    async function playTheBank() {
        if (!deposit?.id || !amount) return;
        isWorking = true;
        error = null;
        try {
            const token = sep10.cached();
            if (!token) throw new Error('Session expired — reconnect your wallet');
            await trmock.simulateBankTransfer(fetch, token, deposit.id, amount);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to simulate the bank transfer';
        } finally {
            isWorking = false;
        }
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!deposit?.id) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await trmock.getTransaction(fetch, token, deposit.id);
        if (!updated) return;
        transaction = updated;
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        }
        if (updated.status === 'error' || updated.status === 'refunded') {
            error = updated.message || 'The anchor could not complete this deposit';
            stop();
        }
    }

    function reset() {
        poller.stop();
        quote = null;
        deposit = null;
        transaction = null;
        amount = '';
        error = null;
        step = 'amount';
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/trmock')} class="text-sm text-indigo-600 hover:underline">
                ← TR Mock Anchor
            </a>
            <div class="flex items-center gap-2">
                <h1 class="mt-1 text-2xl font-semibold text-gray-900">TR Mock Anchor — On-Ramp</h1>
                <span
                    class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                >
                    Sandbox stand-in
                </span>
            </div>
            <p class="mt-1 text-sm text-gray-500">Turkish Lira to USDC on Stellar testnet.</p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                This flow requires SEP-10 authentication before KYC and deposit can proceed.
            </p>
            <div class="mt-4">
                <WalletConnect />
            </div>
        </div>
    {/if}

    {#if step === 'kyc'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">KYC (SEP-12)</h2>
            <p class="mt-1 text-sm text-gray-500">
                Status: <span class="font-mono">{customer?.status ?? 'checking…'}</span>
            </p>

            <p class="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                This sandbox auto-approves every customer. The rejection and NEEDS_INFO paths cannot
                be exercised here.
            </p>

            {#if customer?.status === 'ACCEPTED'}
                <p class="mt-4 text-sm text-green-700">KYC accepted. Proceeding…</p>
            {:else}
                <button
                    onclick={fillTestData}
                    class="mt-4 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                >
                    Fill Test Data
                </button>

                <div class="mt-4 space-y-3">
                    <div>
                        <label for="first_name" class="block text-sm font-medium text-gray-700">
                            First name
                        </label>
                        <input
                            id="first_name"
                            type="text"
                            bind:value={kycFields.first_name}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label for="last_name" class="block text-sm font-medium text-gray-700">
                            Last name
                        </label>
                        <input
                            id="last_name"
                            type="text"
                            bind:value={kycFields.last_name}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label for="email_address" class="block text-sm font-medium text-gray-700">
                            Email address
                        </label>
                        <input
                            id="email_address"
                            type="email"
                            bind:value={kycFields.email_address}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                </div>

                <button
                    onclick={submitKyc}
                    disabled={isWorking}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Submitting…' : 'Submit KYC'}
                </button>
            {/if}
        </div>
    {/if}

    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the TRY amount to deposit. Between {MIN_TRY} and {MAX_TRY} TRY per deposit.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency="USDC"
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount (TRY)"
                placeholder="1000"
                inputPrefix="₺"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={startDeposit}
            />
        </div>
    {/if}

    {#if step === 'payment' && deposit}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Payment instructions</h2>
                {#if transaction}
                    <span
                        class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                    >
                        {transaction.status}
                    </span>
                {/if}
            </div>

            {#if quote}
                <p class="mt-2 text-sm text-gray-600">
                    {quote.sell_amount} TRY → {quote.buy_amount} USDC
                    <span class="text-gray-400">(fee {quote.fee.total})</span>
                </p>
            {/if}

            {#if deposit.instructions}
                <div class="mt-4 space-y-2 rounded-md bg-gray-50 p-4">
                    {#each Object.entries(deposit.instructions) as [key, field] (key)}
                        <p class="mt-2 text-sm text-gray-600">
                            {field.description}: <CopyableField value={field.value} mono />
                        </p>
                    {/each}
                </div>
            {:else if deposit.how}
                <p class="mt-2 text-sm text-gray-600">{deposit.how}</p>
            {/if}

            <div class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p class="text-sm font-medium text-amber-900">Sandbox: play the bank</p>
                <p class="mt-1 text-sm text-amber-800">
                    No real transfer will happen. In production the actual bank transfer moves this
                    forward and you only observe it.
                </p>
                <button
                    type="button"
                    onclick={playTheBank}
                    disabled={isWorking}
                    class="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                    Simulate the {amount} TRY transfer
                </button>
            </div>

            <div class="mt-6 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-6 transaction…</span>
            </div>

            <div class="text-xs text-gray-400">
                Transaction ID: <CopyableField value={deposit.id ?? ''} mono />
            </div>

            {#if poller.timedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    Still processing — check back later with the transaction id above.
                </div>
            {/if}
        </div>
    {/if}

    {#if step === 'complete'}
        <CompletionStep
            title="Deposit complete"
            details={[
                { label: 'Received', value: `${transaction?.amount_out ?? ''} USDC` },
                { label: 'Paid', value: `${transaction?.amount_in ?? ''} TRY` },
            ]}
            links={transaction?.stellar_transaction_id
                ? [
                      {
                          label: 'View on Stellar Expert',
                          href: `https://stellar.expert/explorer/${network}/tx/${transaction.stellar_transaction_id}`,
                      },
                  ]
                : []}
            onReset={reset}
            resetLabel="Start new deposit"
        />
    {/if}

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={() => (error = null)} />
        </div>
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View TrMockRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/trmock/ramp.ts',
            },
            {
                text: "The anchor's SEP integration guide",
                link: 'https://tr-mock-anchor.fly.dev/sep',
            },
        ]}
    />
</section>
