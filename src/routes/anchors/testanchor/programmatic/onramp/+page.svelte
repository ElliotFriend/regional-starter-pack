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
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import * as ta from '$lib/api/testanchor';
    import type {
        Sep6Transaction,
        Sep6DepositResponse,
        Sep12CustomerResponse,
        Sep12Field,
    } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

    const PROVIDER = 'testanchor';
    const SRT_ISSUER = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('SRT', SRT_ISSUER);

    type Step = 'connect' | 'kyc' | 'amount' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    let customer = $state<Sep12CustomerResponse | null>(null);
    let kycFields = $state<Record<string, string>>({});
    let amount = $state('');
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

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') {
            step = 'kyc';
            checkKyc();
        }
    });

    const sep10 = createSep10Session(PROVIDER, {
        getChallenge: ta.getChallenge,
        submitChallenge: ta.submitChallenge,
    });

    async function checkKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            customer = await ta.getCustomer(fetch, token);
            if (customer.status === 'ACCEPTED') {
                step = 'amount';
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to check KYC status';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        kycFields = {
            first_name: 'Test',
            last_name: 'User',
            email_address: 'test@example.com',
        };
    }

    async function submitKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            await ta.putCustomer(fetch, token, kycFields);
            customer = await ta.getCustomer(fetch, token);
            if (customer.status === 'ACCEPTED') {
                step = 'amount';
            }
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
            deposit = await ta.sep6Deposit(fetch, token, {
                asset_code: 'SRT',
                funding_method: 'bank_account',
                account: walletStore.publicKey,
                amount,
            });
            step = 'payment';
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start deposit';
        } finally {
            isWorking = false;
        }
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!deposit?.id) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await ta.getSep6Transaction(fetch, token, deposit.id);
        if (!updated) return;
        transaction = updated;
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        } else if (
            updated.status === 'refunded' ||
            updated.status === 'expired' ||
            updated.status === 'error' ||
            updated.status === 'no_market'
        ) {
            stop();
        } else if (updated.status === 'pending_customer_info_update') {
            // Need more KYC mid-flow — bring user back to KYC step
            stop();
            step = 'kyc';
            await checkKyc();
        }
    }

    function reset() {
        amount = '';
        deposit = null;
        transaction = null;
        error = null;
        step = walletStore.isConnected ? 'kyc' : 'connect';
        poller.stop();
        if (walletStore.isConnected) checkKyc();
    }

    function clearError() {
        error = null;
    }

    onMount(() => () => poller.stop());

    const fieldEntries = $derived(
        customer?.fields
            ? (Object.entries(customer.fields).filter(([, f]) => f.type !== 'binary') as [
                  string,
                  Sep12Field,
              ][])
            : [],
    );
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a
                href={resolve('/anchors/testanchor')}
                class="text-sm text-indigo-600 hover:underline"
            >
                ← Test Anchor
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SEP-6 On-Ramp (Programmatic)</h1>
            <p class="mt-1 text-sm text-gray-500">
                App-orchestrated deposit using SEP-6 + SEP-12 + SEP-10.
            </p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                Programmatic flow requires SEP-10 authentication.
            </p>
        </div>
    {/if}

    {#if step === 'kyc'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">KYC (SEP-12)</h2>
            <p class="mt-1 text-sm text-gray-500">
                Status: <span class="font-mono">{customer?.status ?? 'checking…'}</span>
            </p>
            {#if customer?.message}
                <p class="mt-2 text-sm text-amber-700">{customer.message}</p>
            {/if}

            {#if customer?.status === 'NEEDS_INFO'}
                <button
                    onclick={fillTestData}
                    class="mt-4 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                >
                    Fill test data
                </button>
                <div class="mt-4 space-y-3">
                    {#each fieldEntries as [key, field] (key)}
                        <div>
                            <label class="block text-sm font-medium text-gray-700" for={key}>
                                {field.description || key}{!field.optional ? ' *' : ''}
                            </label>
                            {#if field.choices && field.choices.length > 0}
                                <select
                                    id={key}
                                    bind:value={kycFields[key]}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                    <option value="">Select…</option>
                                    {#each field.choices as choice (choice)}
                                        <option value={choice}>{choice}</option>
                                    {/each}
                                </select>
                            {:else}
                                <input
                                    id={key}
                                    type={field.type === 'date' ? 'date' : 'text'}
                                    bind:value={kycFields[key]}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            {/if}
                        </div>
                    {/each}
                </div>
                <button
                    onclick={submitKyc}
                    disabled={isWorking}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Submitting…' : 'Submit KYC'}
                </button>
            {:else if customer?.status === 'ACCEPTED'}
                <p class="mt-4 text-sm text-green-700">KYC accepted. Proceeding…</p>
            {:else if customer?.status === 'PROCESSING'}
                <p class="mt-4 text-sm text-gray-600">KYC is being reviewed by the anchor.</p>
                <button onclick={checkKyc} class="mt-3 text-sm text-indigo-600 hover:underline">
                    Refresh status
                </button>
            {:else if customer?.status === 'REJECTED'}
                <p class="mt-4 text-sm text-red-700">KYC rejected.</p>
            {/if}
        </div>
    {/if}

    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">Enter the SRT amount to deposit.</p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount (SRT)"
                placeholder="10"
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

            {#if deposit.how}
                <p class="mt-2 text-sm text-gray-600">{deposit.how}</p>
            {/if}

            {#if deposit.instructions}
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    {#each Object.entries(deposit.instructions) as [key, instruction] (key)}
                        <div>
                            <span class="text-gray-500">{instruction.description}</span>
                            <p class="font-medium">
                                <CopyableField value={instruction.value} mono />
                            </p>
                        </div>
                    {/each}
                </div>
            {/if}

            <div class="mt-6 rounded-md bg-blue-50 p-4 text-sm text-blue-700">
                <strong>Test anchor sandbox:</strong> The anchor will auto-advance this transaction in
                a few seconds. The page polls for status.
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

    {#if step === 'complete' && transaction}
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
            <h2 class="mt-4 text-xl font-semibold text-gray-900">Deposit complete</h2>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if transaction.amount_out}
                    <p>Received: {transaction.amount_out} SRT</p>
                {/if}
                {#if transaction.stellar_transaction_id}
                    <p>
                        <a
                            href={`https://stellar.expert/explorer/${network}/tx/${transaction.stellar_transaction_id}`}
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            View on Stellar Expert ↗
                        </a>
                    </p>
                {/if}
            </div>
            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start new deposit
            </button>
        </div>
    {/if}

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={clearError} />
        </div>
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View this page source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/testanchor/programmatic/onramp/+page.svelte',
            },
            {
                text: 'View TestAnchorRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/testanchor/ramp.ts',
            },
        ]}
    />
</section>
