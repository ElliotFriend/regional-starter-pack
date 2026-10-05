<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { dev } from '$app/environment';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { getStellarAsset, submitTransaction } from '$lib/wallet/stellar';
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
    import { SeevcashRampClient } from '$lib/anchors/seevcash';
    import type {
        Sep6Transaction,
        Sep6WithdrawResponse,
        Sep12CustomerResponse,
        Sep38PriceResponse,
    } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

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

    type Step = 'connect' | 'kyc' | 'amount' | 'send' | 'signing' | 'awaiting-payout' | 'complete';
    let step = $state<Step>('connect');

    let customer = $state<Sep12CustomerResponse | null>(null);
    let kycFields = $state<Record<string, string>>({ mobile_money_provider: 'MTN' });
    let amount = $state('');
    let price = $state<Sep38PriceResponse | null>(null);
    let withdrawal = $state<(Sep6WithdrawResponse & { signableXdr: string }) | null>(null);
    let transaction = $state<Sep6Transaction | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let hasTrustline = $state(false);

    let isWorking = $state(false);
    let error = $state<string | null>(null);
    const poller = createPoller({
        intervalMs: 5000,
        maxAttempts: 60,
        onTick: pollTransaction,
    });

    const sep10 = createSep10Session(PROVIDER, {
        getChallenge: (_fetch, account) => anchor.getChallenge(account),
        submitChallenge: (_fetch, signedXdr) => anchor.submitChallenge(signedXdr),
    });

    // Stop polling if the user navigates away mid-withdrawal.
    onMount(() => () => poller.stop());

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

    async function startWithdrawal() {
        if (!walletStore.publicKey || !amount) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            // Indicative only: plain SEP-6 withdraw converts at the anchor's
            // rate when the USDC payment lands.
            price = await anchor.getPrice({ kind: 'withdraw', amount });
            withdrawal = await anchor.withdraw(token, { amount, account: walletStore.publicKey });
            step = 'send';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start the withdrawal';
        } finally {
            isWorking = false;
        }
    }

    async function sendPayment() {
        if (!withdrawal || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        step = 'signing';
        try {
            // The client pre-built the payment with the anchor's memo attached;
            // the wallet only has to sign and submit it.
            const signed = await signWithFreighter(withdrawal.signableXdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'awaiting-payout';
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to sign and submit the payment';
            // Back to 'amount', not 'send': the XDR was built against a
            // Horizon sequence number and a 180s timebound, so a stale retry
            // would fail with tx_too_late. Restarting rebuilds a fresh XDR.
            step = 'amount';
        } finally {
            isWorking = false;
        }
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!withdrawal?.id) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await anchor.getTransaction(token, withdrawal.id);
        if (!updated) return;
        transaction = updated;
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        }
        if (updated.status === 'error' || updated.status === 'refunded') {
            error = updated.message || 'The anchor could not complete this withdrawal';
            stop();
        }
    }

    function reset() {
        poller.stop();
        price = null;
        withdrawal = null;
        transaction = null;
        stellarTxHash = null;
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
            <a href={resolve('/anchors/seevcash')} class="text-sm text-indigo-600 hover:underline">
                ← SeevCash
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SeevCash — Off-Ramp</h1>
            <p class="mt-1 text-sm text-gray-500">
                USDC on Stellar testnet to Ghanaian cedis over mobile money.
            </p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                This flow requires SEP-10 authentication before KYC and withdrawal can proceed.
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
                The mobile money number is where the anchor pays out; a withdrawal can't name a
                different one. Testnet approves every customer and simulates the payout.
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
                Enter the USDC to withdraw, between {MIN_USDC} and {MAX_USDC}. The GHS payout goes
                to the mobile money number on your KYC.
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
                placeholder="2"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={startWithdrawal}
            />
        </div>
    {/if}

    {#if step === 'send' && withdrawal}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Send USDC to the anchor</h2>

            {#if price}
                <p class="mt-2 text-sm text-gray-600">
                    {price.sell_amount} USDC → ≈ {price.buy_amount} GHS
                    <span class="text-gray-400"
                        >(fee {price.fee.total} {feeUnit(price.fee.asset)}, indicative)</span
                    >
                </p>
            {/if}

            <p class="mt-2 text-sm text-gray-600">
                Anchor account: <CopyableField value={withdrawal.account_id} mono />
            </p>
            <p class="mt-2 text-sm text-gray-600">
                Memo ({withdrawal.memo_type}): <CopyableField value={withdrawal.memo ?? ''} mono />
            </p>
            <p class="mt-1 text-xs text-gray-500">
                The memo is how the anchor identifies your incoming payment — it must be attached to
                the transaction exactly as shown. The transaction you'll sign already includes it.
            </p>

            <button
                type="button"
                onclick={sendPayment}
                disabled={isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Preparing…' : `Send ${amount} USDC`}
            </button>
        </div>
    {/if}

    {#if step === 'signing'}
        <div class="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Sign in Freighter</h2>
            <p class="mt-1 text-sm text-gray-500">
                A Freighter window should be open. Confirm to send USDC to the anchor.
            </p>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Awaiting signature…</span>
            </div>
        </div>
    {/if}

    {#if step === 'awaiting-payout'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Awaiting payout</h2>
                {#if transaction}
                    <span
                        class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                    >
                        {transaction.status}
                    </span>
                {/if}
            </div>
            <p class="mt-1 text-sm text-gray-500">
                Your USDC was sent to the anchor. Waiting for the simulated mobile money payout.
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
                {#if withdrawal?.id}
                    <p>Transaction ID: <CopyableField value={withdrawal.id} mono /></p>
                {/if}
            </div>
            <div class="mt-4 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-6 transaction…</span>
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
            title="Withdrawal complete"
            details={[
                { label: 'Paid out', value: `${transaction?.amount_out ?? ''} GHS` },
                {
                    label: 'Mobile money reference',
                    value: transaction?.external_transaction_id ?? '',
                },
            ]}
            links={stellarTxHash
                ? [
                      {
                          label: 'View on Stellar Expert',
                          href: `https://stellar.expert/explorer/${network}/tx/${stellarTxHash}`,
                      },
                  ]
                : []}
            onReset={reset}
            resetLabel="Start new withdrawal"
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
                text: 'View SeevcashRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/seevcash/ramp.ts',
            },
            {
                text: 'SeevCash SEP-6 withdraw docs',
                link: 'https://docs.seevcash.com/docs/anchor/withdraw',
            },
        ]}
    />
</section>
