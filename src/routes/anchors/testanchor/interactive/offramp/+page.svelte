<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { dev } from '$app/env';
    import { walletStore } from '#lib/stores/wallet.svelte.ts';
    import { signWithFreighter } from '#lib/wallet/freighter.ts';
    import { getStellarAsset, submitTransaction } from '#lib/wallet/stellar.ts';
    import { createSep10Session } from '#lib/wallet/sep10-session.ts';
    import { createPoller } from '#lib/utils/poll.svelte.ts';
    import WalletConnect from '#lib/components/WalletConnect.svelte';
    import TrustlineStatus from '#lib/components/ramp/TrustlineStatus.svelte';
    import CompletionStep from '#lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '#lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '#lib/components/ui/CopyableField.svelte';
    import DevBox from '#lib/components/ui/DevBox.svelte';
    import { TestAnchorRampClient } from '#lib/anchors/testanchor/index.ts';
    import type { Sep24Transaction } from '#lib/anchors/sep/types.ts';
    import type { StellarNetwork } from '#lib/wallet/types.ts';

    // No proxy routes: the test anchor holds no secrets and serves CORS on its SEP
    // endpoints, so the page talks to the anchor directly. The SEP-10 token
    // never leaves the browser.
    const anchor = new TestAnchorRampClient({ debug: dev });

    const PROVIDER = 'testanchor';
    const SRT_ISSUER = 'GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B';
    const network: StellarNetwork = 'testnet';
    const stellarAsset = getStellarAsset('SRT', SRT_ISSUER);

    type Step =
        | 'connect'
        | 'ready'
        | 'hosted'
        | 'ready-to-send'
        | 'signing'
        | 'awaiting-payout'
        | 'complete';

    let step = $state<Step>('connect');
    let amount = $state('');
    let transactionId = $state<string | null>(null);
    let transaction = $state<Sep24Transaction | null>(null);
    let interactiveUrl = $state<string | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let isWorking = $state(false);
    let error = $state<string | null>(null);
    const poller = createPoller({
        intervalMs: 5000,
        maxAttempts: 120,
        onTick: pollTransaction,
    });

    $effect(() => {
        if (walletStore.isConnected && step === 'connect') {
            step = 'ready';
        }
    });

    const sep10 = createSep10Session(PROVIDER, {
        getChallenge: (_fetch, account) => anchor.getChallenge(account),
        submitChallenge: (_fetch, signedXdr) => anchor.submitChallenge(signedXdr),
    });

    async function startWithdraw() {
        if (!walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            const token = await sep10.ensure(fetch);
            if (!token) throw new Error('Wallet authentication failed');
            const session = await anchor.sep24Withdraw(token, {
                asset_code: 'SRT',
                asset_issuer: SRT_ISSUER,
                account: walletStore.publicKey,
                amount: amount || undefined,
            });
            transactionId = session.id;
            interactiveUrl = session.url;
            step = 'hosted';
            window.open(session.url, '_blank', 'noopener');
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to start withdrawal';
        } finally {
            isWorking = false;
        }
    }

    async function pollTransaction({ stop }: { stop: () => void }) {
        if (!transactionId) return;
        const token = sep10.cached();
        if (!token) return;
        const updated = await anchor.getSep24Transaction(token, transactionId);
        if (!updated) return;
        transaction = updated;
        if (
            step === 'hosted' &&
            updated.status === 'pending_user_transfer_start' &&
            updated.withdraw_anchor_account &&
            walletStore.publicKey
        ) {
            // The wallet's half of a SEP-24 withdrawal: pay the anchor now that
            // the hosted flow has set withdraw_anchor_account.
            stop();
            step = 'ready-to-send';
            return;
        }
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        } else if (
            updated.status === 'refunded' ||
            updated.status === 'expired' ||
            updated.status === 'error' ||
            updated.status === 'no_market'
        ) {
            error = updated.message || `The anchor ended this withdrawal: ${updated.status}`;
            stop();
        }
    }

    // Signing is tied to this click, never to a poll tick: wallet prompts
    // should only open in response to the user.
    async function sendPayment() {
        if (!transaction || !walletStore.publicKey) return;
        error = null;
        step = 'signing';
        try {
            // Build at click time: the XDR carries a Horizon sequence number and
            // a 180s timebound, which go stale while the user is in the popup.
            const xdr = await anchor.buildWithdrawalPaymentXdr(
                transaction,
                walletStore.publicKey,
                'SRT',
            );
            const signed = await signWithFreighter(xdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'awaiting-payout';
            poller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to sign and submit the payment';
            // Back to the send step; the next click rebuilds a fresh XDR.
            step = 'ready-to-send';
        }
    }

    function reopen() {
        if (interactiveUrl) window.open(interactiveUrl, '_blank', 'noopener');
    }

    function reset() {
        amount = '';
        transactionId = null;
        transaction = null;
        interactiveUrl = null;
        stellarTxHash = null;
        error = null;
        step = walletStore.isConnected ? 'ready' : 'connect';
        poller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => () => poller.stop());
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('anchors/testanchor')} class="text-sm text-indigo-600 hover:underline">
                ← Test Anchor
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">SEP-24 Off-Ramp (Interactive)</h1>
            <p class="mt-1 text-sm text-gray-500">
                Withdraw SRT to fiat via the anchor-hosted interactive flow.
            </p>
        </div>
        <WalletConnect />
    </header>

    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
            <p class="mt-1 text-sm text-gray-500">
                The interactive flow requires a SEP-10 wallet signature to authenticate.
            </p>
        </div>
    {/if}

    {#if step === 'ready'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Start interactive withdrawal</h2>
            <p class="mt-1 text-sm text-gray-500">
                Optionally pre-fill an amount. The anchor will collect payout details inside its
                hosted UI.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency="SRT"
                onStatusChange={() => {}}
            />

            <label class="mt-6 block text-sm font-medium text-gray-700" for="amount">
                Amount (SRT, optional)
            </label>
            <input
                id="amount"
                type="number"
                bind:value={amount}
                placeholder="10"
                min="0"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />

            <button
                onclick={startWithdraw}
                disabled={isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Authenticating…' : 'Start hosted withdrawal'}
            </button>
            <p class="mt-3 text-xs text-gray-500">
                You'll sign a SEP-10 challenge in Varial and then complete the rest in a new tab.
            </p>
        </div>
    {/if}

    {#if step === 'hosted'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Complete in hosted flow</h2>
            <p class="mt-1 text-sm text-gray-500">
                The anchor's hosted flow will collect your payout details and the burn transfer
                instructions. This page polls for updates.
            </p>

            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if transactionId}
                    <p>Transaction: <CopyableField value={transactionId} mono /></p>
                {/if}
                {#if transaction}
                    <p>Status: <span class="font-mono">{transaction.status}</span></p>
                    {#if transaction.message}
                        <p>Message: {transaction.message}</p>
                    {/if}
                {/if}
            </div>

            <div class="mt-4 flex gap-3">
                <button
                    onclick={reopen}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Reopen hosted flow
                </button>
            </div>

            <div class="mt-6 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-24 transaction…</span>
            </div>

            {#if poller.timedOut}
                <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still processing</p>
                    <p class="mt-1">
                        The withdrawal hasn't completed yet. You can check back later — your
                        transaction id is above.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    {#if step === 'ready-to-send' && transaction}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Send SRT to the anchor</h2>
            <p class="mt-1 text-sm text-gray-500">
                The hosted flow is done. In SEP-24 the wallet sends the payment: confirm it in
                Varial and the anchor pays out once it arrives.
            </p>
            <div class="mt-4 space-y-2 text-sm text-gray-600">
                <p>
                    Amount:
                    <span class="font-mono">{transaction.amount_in} SRT</span>
                </p>

                <p>
                    Anchor account:
                    <CopyableField value={transaction.withdraw_anchor_account ?? ''} mono />
                </p>
                {#if transaction.withdraw_memo}
                    <p>
                        Memo ({transaction.withdraw_memo_type}):
                        <CopyableField value={transaction.withdraw_memo} mono />
                    </p>
                {/if}
            </div>
            <button
                type="button"
                onclick={sendPayment}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Send {transaction.amount_in} SRT
            </button>
        </div>
    {/if}

    {#if step === 'signing'}
        <div class="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Sign in Varial</h2>
            <p class="mt-1 text-sm text-gray-500">
                A Varial window should be open. Confirm to send SRT to the anchor.
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
            <h2 class="text-lg font-semibold text-gray-900">Awaiting payout</h2>
            <p class="mt-1 text-sm text-gray-500">
                Your SRT was sent to the anchor. Waiting for it to complete the withdrawal.
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
                {#if transaction}
                    <p>Status: <span class="font-mono">{transaction.status}</span></p>
                {/if}
            </div>
            <div class="mt-4 flex items-center justify-center py-4">
                <div
                    class="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling SEP-24 transaction…</span>
            </div>
        </div>
    {/if}

    {#if step === 'complete' && transaction}
        {@const completionDetails = [
            ...(transaction.amount_in
                ? [{ label: 'Sent', value: `${transaction.amount_in} SRT` }]
                : []),
            ...(transaction.amount_out
                ? [
                      {
                          label: 'Received',
                          value: `${transaction.amount_out} ${transaction.amount_out_asset ?? ''}`,
                      },
                  ]
                : []),
        ]}
        {@const completionLinks = [
            ...(transaction.stellar_transaction_id
                ? [
                      {
                          label: 'View on Stellar Expert ↗',
                          href: `https://stellar.expert/explorer/${network}/tx/${transaction.stellar_transaction_id}`,
                      },
                  ]
                : []),

            ...(transaction.more_info_url
                ? [
                      {
                          label: "Anchor's transaction page ↗",
                          href: transaction.more_info_url,
                      },
                  ]
                : []),
        ]}
        <CompletionStep
            title="Withdrawal complete"
            details={completionDetails}
            links={completionLinks}
            onReset={reset}
            resetLabel="Start new withdrawal"
        />
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/testanchor/interactive/offramp/+page.svelte',
            },
            {
                text: 'View TestAnchorRampClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/testanchor/ramp.ts',
            },
        ]}
    />
</section>
