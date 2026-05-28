<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { authStore } from '$lib/stores/auth';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { getStellarAsset, submitTransaction } from '$lib/wallet/stellar';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import * as ta from '$lib/api/testanchor';
    import type {
        Sep6Transaction,
        Sep6WithdrawResponse,
        Sep12CustomerResponse,
        Sep12Field,
    } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

    const PROVIDER = 'testanchor';
    const SRT_ISSUER = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('SRT', SRT_ISSUER);

    type Step = 'connect' | 'kyc' | 'amount' | 'signing' | 'awaiting-payout' | 'complete';
    let step = $state<Step>('connect');

    let customer = $state<Sep12CustomerResponse | null>(null);
    let kycFields = $state<Record<string, string>>({});
    let amount = $state('');
    let withdraw = $state<(Sep6WithdrawResponse & { signableXdr: string }) | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let transaction = $state<Sep6Transaction | null>(null);
    let hasTrustline = $state(false);

    let isWorking = $state(false);
    let error = $state<string | null>(null);
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    const MAX_POLLS = 60;
    const pollingTimedOut = $derived(pollCount >= MAX_POLLS);

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') {
            step = 'kyc';
            checkKyc();
        }
    });

    async function ensureAuth(): Promise<string | undefined> {
        if (!walletStore.publicKey) return undefined;
        const cached = authStore.get(PROVIDER, walletStore.publicKey);
        if (cached) return cached;
        const challenge = await ta.getChallenge(fetch, walletStore.publicKey);
        const { signedXdr } = await signWithFreighter(challenge.transaction, walletStore.network);
        const { token } = await ta.submitChallenge(fetch, signedXdr);
        authStore.set(PROVIDER, walletStore.publicKey, token);
        return token;
    }

    function cachedAuth(): string | undefined {
        return walletStore.publicKey ? authStore.get(PROVIDER, walletStore.publicKey) : undefined;
    }

    async function checkKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await ensureAuth();
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
            const token = await ensureAuth();
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

    async function startWithdraw() {
        if (!walletStore.publicKey || !amount) return;
        isWorking = true;
        error = null;
        try {
            const token = await ensureAuth();
            if (!token) throw new Error('Wallet authentication failed');
            withdraw = await ta.sep6Withdraw(
                fetch,
                token,
                {
                    asset_code: 'SRT',
                    funding_method: 'bank_account',
                    account: walletStore.publicKey,
                    amount,
                },
                walletStore.publicKey,
            );
            step = 'signing';
            await signAndSubmit(withdraw.signableXdr);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start withdrawal';
            step = 'amount';
        } finally {
            isWorking = false;
        }
    }

    async function signAndSubmit(xdr: string) {
        if (!walletStore.publicKey) return;
        try {
            const signed = await signWithFreighter(xdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'awaiting-payout';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to sign and submit withdrawal';
            step = 'amount';
        }
    }

    function startPolling() {
        stopPolling();
        pollCount = 0;
        pollTimer = setInterval(async () => {
            pollCount += 1;
            if (pollingTimedOut) {
                stopPolling();
                return;
            }
            if (!withdraw?.id) return;
            const token = cachedAuth();
            if (!token) return;
            try {
                const updated = await ta.getSep6Transaction(fetch, token, withdraw.id);
                if (updated) {
                    transaction = updated;
                    if (updated.status === 'completed') {
                        step = 'complete';
                        stopPolling();
                    } else if (
                        updated.status === 'refunded' ||
                        updated.status === 'expired' ||
                        updated.status === 'error' ||
                        updated.status === 'no_market'
                    ) {
                        stopPolling();
                    }
                }
            } catch (err) {
                console.warn('[testanchor sep6 offramp] poll failed:', err);
            }
        }, 5000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function reset() {
        amount = '';
        withdraw = null;
        transaction = null;
        stellarTxHash = null;
        error = null;
        step = walletStore.isConnected ? 'kyc' : 'connect';
        stopPolling();
        if (walletStore.isConnected) checkKyc();
    }

    function clearError() {
        error = null;
    }

    onMount(() => () => stopPolling());

    const fieldEntries = $derived(
        customer?.fields
            ? (Object.entries(customer.fields).filter(
                  ([, f]) => f.type !== 'binary',
              ) as [string, Sep12Field][])
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
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SEP-6 Off-Ramp (Programmatic)</h1>
            <p class="mt-1 text-sm text-gray-500">
                App-orchestrated withdrawal with wallet-side signing.
            </p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
        </div>
    {/if}

    {#if step === 'kyc'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">KYC (SEP-12)</h2>
            <p class="mt-1 text-sm text-gray-500">
                Status: <span class="font-mono">{customer?.status ?? 'checking…'}</span>
            </p>

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
                <p class="mt-4 text-sm text-gray-600">KYC is being reviewed.</p>
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
            <p class="mt-1 text-sm text-gray-500">Enter the SRT amount to withdraw.</p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency="SRT"
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount (SRT)"
                placeholder="10"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={startWithdraw}
            />
        </div>
    {/if}

    {#if step === 'signing'}
        <div class="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Sign in Freighter</h2>
            <p class="mt-1 text-sm text-gray-500">
                A Freighter window should be open. Confirm to send SRT to the anchor.
            </p>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Awaiting signature…</span>
            </div>
        </div>
    {/if}

    {#if step === 'awaiting-payout' && withdraw}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Awaiting payout</h2>
            <p class="mt-1 text-sm text-gray-500">
                Your SRT was sent to the anchor. Waiting for fiat payout confirmation.
            </p>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if stellarTxHash}
                    <p>
                        Stellar tx:
                        <a
                            href={`https://stellar.expert/explorer/${network}/tx/${stellarTxHash}`}
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            {stellarTxHash.slice(0, 12)}…↗
                        </a>
                    </p>
                {/if}
                {#if withdraw.id}
                    <p>Order: <CopyableField value={withdraw.id} mono /></p>
                {/if}
                {#if transaction}
                    <p>Status: <span class="font-mono">{transaction.status}</span></p>
                {/if}
            </div>
            <div class="mt-4 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-6 transaction…</span>
            </div>
            {#if pollingTimedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    Still processing — check back later.
                </div>
            {/if}
        </div>
    {/if}

    {#if step === 'complete' && transaction}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
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
            <h2 class="mt-4 text-xl font-semibold text-gray-900">Withdrawal complete</h2>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if transaction.amount_in}
                    <p>Sent: {transaction.amount_in} SRT</p>
                {/if}
                {#if transaction.amount_out}
                    <p>Received: {transaction.amount_out}</p>
                {/if}
                {#if stellarTxHash}
                    <p>
                        <a
                            href={`https://stellar.expert/explorer/${network}/tx/${stellarTxHash}`}
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
                Start new withdrawal
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/testanchor/programmatic/offramp/+page.svelte',
            },
            {
                text: 'View TestAnchorRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/testanchor/ramp.ts',
            },
        ]}
    />
</section>
