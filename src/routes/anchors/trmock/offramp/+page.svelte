<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
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
    import * as trmock from '$lib/api/trmock';
    import type {
        Sep6Transaction,
        Sep6WithdrawResponse,
        Sep38QuoteResponse,
    } from '$lib/anchors/sep/types';
    import type { StellarNetwork } from '$lib/wallet/types';

    // No SEP-12 step here, unlike the on-ramp. Verified against the live anchor
    // 2026-09-15: a fresh account that never created a customer still gets a 200
    // from /sep6/withdraw-exchange. GET /sep12/customer returns NEEDS_INFO, but
    // it is advisory — the anchor gates neither ramp on KYC.
    const PROVIDER = 'trmock';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('USDC', PUBLIC_USDC_ISSUER);

    // Minimum off-ramp from GET /health (verified 2026-09-15).
    const MIN_USDC = 1;

    // A valid Turkish IBAN the sandbox accepts as a payout destination.
    const TEST_IBAN = 'TR330006100519786457841326';

    type Step = 'connect' | 'amount' | 'send' | 'signing' | 'awaiting-payout' | 'complete';
    let step = $state<Step>('connect');

    let amount = $state('');
    let iban = $state(TEST_IBAN);
    let quote = $state<Sep38QuoteResponse | null>(null);
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
        getChallenge: trmock.getChallenge,
        submitChallenge: trmock.submitChallenge,
    });

    // Stop polling if the user navigates away mid-withdrawal — parity with
    // the testanchor reference page.
    onMount(() => () => poller.stop());

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') step = 'amount';
    });

    async function startWithdrawal() {
        if (!walletStore.publicKey || !amount) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            quote = await trmock.createQuote(fetch, token, 'offramp', amount);
            withdrawal = await trmock.withdrawExchange(fetch, token, {
                amount,
                account: walletStore.publicKey,
                quoteId: quote.id,
                dest: iban,
            });
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
            // The server pre-built the payment with the anchor's memo attached;
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
            // (e.g. after unlocking Freighter) would just fail again with
            // tx_too_late. Restarting from 'amount' rebuilds a fresh quote
            // and XDR.
            step = 'amount';
        } finally {
            isWorking = false;
        }
    }

    function reset() {
        poller.stop();
        quote = null;
        withdrawal = null;
        transaction = null;
        stellarTxHash = null;
        amount = '';
        error = null;
        step = 'amount';
    }

    // The SEP-38 fee asset arrives as `iso4217:TRY` or `stellar:USDC:<issuer>`.
    // Strip the scheme and, for the Stellar form, show just the asset code.
    function feeUnit(asset: string): string {
        const parts = asset.split(':');
        return parts.length > 1 ? parts[1] : asset;
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!withdrawal?.id) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await trmock.getTransaction(fetch, token, withdrawal.id);
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
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/trmock')} class="text-sm text-indigo-600 hover:underline">
                ← TR Mock Anchor
            </a>
            <div class="flex items-center gap-2">
                <h1 class="mt-1 text-2xl font-semibold text-gray-900">TR Mock Anchor — Off-Ramp</h1>
                <span
                    class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                >
                    Sandbox stand-in
                </span>
            </div>
            <p class="mt-1 text-sm text-gray-500">USDC on Stellar testnet to Turkish Lira.</p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                This flow requires SEP-10 authentication before a withdrawal can start.
            </p>
            <div class="mt-4">
                <WalletConnect />
            </div>
        </div>
    {/if}

    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the USDC amount to withdraw. Minimum {MIN_USDC} USDC per withdrawal.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency="USDC"
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <label class="mt-4 block text-sm font-medium text-gray-700" for="iban"
                >Payout IBAN</label
            >
            <input
                id="iban"
                bind:value={iban}
                class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <p class="mt-1 text-xs text-gray-500">
                Pre-filled with the sandbox's test IBAN. No money moves.
            </p>

            <AmountInput
                bind:amount
                label="Amount (USDC)"
                placeholder="10"
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

            {#if quote}
                <p class="mt-2 text-sm text-gray-600">
                    {quote.sell_amount} USDC → {quote.buy_amount} TRY
                    <span class="text-gray-400"
                        >(fee {quote.fee.total} {feeUnit(quote.fee.asset)})</span
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
                the transaction exactly as shown. The signed transaction below already includes it.
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
                Your USDC was sent to the anchor. Waiting for the simulated FAST payout to complete.
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
                    <p>Order: <CopyableField value={withdrawal.id} mono /></p>
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
                    Still processing — check back later with the order id above.
                </div>
            {/if}
        </div>
    {/if}

    {#if step === 'complete'}
        <CompletionStep
            title="Withdrawal complete"
            details={[
                { label: 'Paid out', value: `${transaction?.amount_out ?? ''} TRY` },
                { label: 'Bank reference', value: transaction?.external_transaction_id ?? '' },
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
