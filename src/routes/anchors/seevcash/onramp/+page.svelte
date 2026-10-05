<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { dev } from '$app/env';
    import { walletStore } from '#lib/stores/wallet.svelte.ts';
    import { getStellarAsset } from '#lib/wallet/stellar.ts';
    import { createSep10Session } from '#lib/wallet/sep10-session.ts';
    import { createPoller } from '#lib/utils/poll.svelte.ts';
    import WalletConnect from '#lib/components/WalletConnect.svelte';
    import TrustlineStatus from '#lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '#lib/components/ramp/AmountInput.svelte';
    import CompletionStep from '#lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '#lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '#lib/components/ui/CopyableField.svelte';
    import DevBox from '#lib/components/ui/DevBox.svelte';
    import { PUBLIC_USDC_ISSUER } from '$app/env/public';
    import { SeevcashRampClient } from '#lib/anchors/seevcash/index.ts';
    import type {
        Sep6Transaction,
        Sep6DepositResponse,
        Sep12CustomerResponse,
        Sep38PriceResponse,
    } from '#lib/anchors/sep/types.ts';
    import type { StellarNetwork } from '#lib/wallet/types.ts';

    // No proxy routes: SeevCash holds no secrets and serves CORS on every SEP
    // endpoint, so the page talks to the anchor directly. The SEP-10 token
    // never leaves the browser.
    const anchor = new SeevcashRampClient({ usdcIssuer: PUBLIC_USDC_ISSUER, debug: dev });

    const PROVIDER = 'seevcash';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('USDC', PUBLIC_USDC_ISSUER);

    // From GET /sep6/info (verified 2026-10-05).
    const MIN_USDC = 0.1;
    const MAX_USDC = 10000;

    const PROVIDERS = ['MTN', 'TELECEL', 'AIRTELTIGO'] as const;

    type Step = 'connect' | 'kyc' | 'amount' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    let customer = $state<Sep12CustomerResponse | null>(null);
    let kycFields = $state<Record<string, string>>({ mobile_money_provider: 'MTN' });
    let amount = $state('');
    let price = $state<Sep38PriceResponse | null>(null);
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

    // Stop polling if the user navigates away mid-deposit.
    onMount(() => () => poller.stop());

    const sep10 = createSep10Session(PROVIDER, {
        getChallenge: (_fetch, account) => anchor.getChallenge(account),
        submitChallenge: (_fetch, signedXdr) => anchor.submitChallenge(signedXdr),
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
            customer = await anchor.getCustomer(token);
            if (customer.status === 'ACCEPTED') step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to check KYC status';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        // SEP-9 names. The anchor reports ACCEPTED for any key, so a typo here
        // fails silently; `birth_date` is the recognised name, not the docs'
        // `date_of_birth`. Testnet approves immediately.
        kycFields = {
            first_name: 'Ama',
            last_name: 'Mensah',
            email_address: 'ama.mensah@example.com',
            birth_date: '1992-03-20',
            mobile_money_number: '+233241234567',
            mobile_money_provider: 'MTN',
        };
    }

    async function submitKyc() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            await anchor.putCustomer(token, kycFields);
            customer = await anchor.getCustomer(token);
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
            // Indicative only: plain SEP-6 deposit converts at the anchor's
            // rate when the mobile money collection lands.
            price = await anchor.getPrice({ kind: 'deposit', amount });
            deposit = await anchor.deposit(token, { amount, account: walletStore.publicKey });
            step = 'payment';
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start the deposit';
        } finally {
            isWorking = false;
        }
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!deposit?.id) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await anchor.getTransaction(token, deposit.id);
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
        price = null;
        deposit = null;
        transaction = null;
        amount = '';
        error = null;
        step = 'amount';
    }

    // The SEP-38 fee asset arrives as `iso4217:GHS` or `stellar:USDC:<issuer>`.
    function feeUnit(asset: string): string {
        const parts = asset.split(':');
        return parts.length > 1 ? parts[1] : asset;
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('anchors/seevcash')} class="text-sm text-indigo-600 hover:underline"
                >← SeevCash</a
            >

            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SeevCash — On-Ramp</h1>
            <p class="mt-1 text-sm text-gray-500">
                Ghanaian cedis over mobile money to USDC on Stellar testnet.
            </p>
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
                The mobile money number is where the anchor sends the collection prompt. Testnet
                approves every customer and simulates the prompt.
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

                <div class="mt-4 grid gap-3 sm:grid-cols-2">
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
                    <div>
                        <label for="birth_date" class="block text-sm font-medium text-gray-700">
                            Date of birth
                        </label>
                        <input
                            id="birth_date"
                            type="date"
                            bind:value={kycFields.birth_date}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label
                            for="mobile_money_number"
                            class="block text-sm font-medium text-gray-700"
                        >
                            Mobile money number
                        </label>
                        <input
                            id="mobile_money_number"
                            type="tel"
                            placeholder="+233241234567"
                            bind:value={kycFields.mobile_money_number}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div>
                        <label
                            for="mobile_money_provider"
                            class="block text-sm font-medium text-gray-700"
                        >
                            Provider
                        </label>
                        <select
                            id="mobile_money_provider"
                            bind:value={kycFields.mobile_money_provider}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                            {#each PROVIDERS as p (p)}
                                <option value={p}>{p}</option>
                            {/each}
                        </select>
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
                Enter the USDC to receive, between {MIN_USDC} and {MAX_USDC}. The anchor collects
                the GHS equivalent from your mobile money wallet.
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
                label="Amount (USDC)"
                placeholder="5"
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
                <h2 class="text-lg font-semibold text-gray-900">Approve the mobile money prompt</h2>
                {#if transaction}
                    <span
                        class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                    >
                        {transaction.status}
                    </span>
                {/if}
            </div>

            {#if price}
                <p class="mt-2 text-sm text-gray-600">
                    ≈ {price.sell_amount} GHS → {price.buy_amount} USDC
                    <span class="text-gray-400"
                        >(fee {price.fee.total} {feeUnit(price.fee.asset)}, indicative)</span
                    >
                </p>
            {/if}

            {#if deposit.how}
                <p class="mt-2 text-sm text-gray-600">{deposit.how}</p>
            {/if}

            <p class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Testnet simulates the prompt and its approval, so there is nothing to do on a phone.
                In production the customer approves it with their mobile money PIN.
            </p>

            {#if transaction?.status === 'pending_customer_info_update'}
                <p class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    The anchor needs more customer information (usually the mobile money number).
                    Update KYC and start a new deposit.
                </p>
            {/if}

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
                { label: 'Paid', value: `${transaction?.amount_in ?? ''} GHS` },
                {
                    label: 'Mobile money reference',
                    value: transaction?.external_transaction_id ?? '',
                },
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
        <div class="mt-4"><ErrorAlert message={error} onDismiss={() => (error = null)} /></div>
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View SeevcashRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/seevcash/ramp.ts',
            },
            {
                text: 'SeevCash SEP-6 deposit docs',
                link: 'https://docs.seevcash.com/docs/anchor/deposit',
            },
        ]}
    />
</section>
