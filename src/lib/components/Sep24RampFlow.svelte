<!--
@component SEP-24 Ramp Flow

Universal SEP-24 interactive flow for both deposit (on-ramp) and withdrawal (off-ramp).
The anchor handles KYC, quotes, and transaction details inside their hosted UI.

For withdrawal: after the interactive flow completes, the user signs a USDC payment
to the anchor's Stellar address.

For deposit: after the interactive flow completes, the user waits for the anchor
to send USDC to their wallet.

Usage:
```html
<Sep24RampFlow direction="withdraw" {token} />
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { sep1, sep24 } from '$lib/anchors/sep';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { buildPaymentTransaction, submitTransaction } from '$lib/wallet/stellar';
    import { resolveStellarAsset } from '$lib/utils/stellar-asset';
    import { displayCurrency, formatAmount } from '$lib/utils/currency';
    import { PUBLIC_USDC_ISSUER, PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type { Sep24Transaction, Sep24InteractiveResponse } from '$lib/anchors/sep/types';
    import type { TokenInfo } from '$lib/anchors/types';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';

    interface Props {
        direction: 'deposit' | 'withdraw';
        token: string;
    }

    let { direction, token }: Props = $props();

    const anchorName = $derived(page.data.displayName || page.data.anchor.name);
    const sepDomain = $derived(page.data.sepDomain as string);
    const primaryToken = $derived(page.data.primaryToken);
    const tokenIssuer = $derived(
        page.data.supportedTokens.find((t: TokenInfo) => t.symbol === page.data.primaryToken)
            ?.issuer,
    );
    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const stellarAsset = $derived(
        resolveStellarAsset(primaryToken, tokenIssuer, PUBLIC_USDC_ISSUER),
    );

    // Flow state
    let step = $state<'initiate' | 'interactive' | 'signing' | 'pending' | 'complete'>('initiate');
    let transaction = $state<Sep24Transaction | null>(null);
    let transactionId = $state<string | null>(null);
    let interactiveUrl = $state<string | null>(null);
    let isInitiating = $state(false);
    let error = $state<string | null>(null);
    let popup = $state<Window | null>(null);

    // Trustline state (for withdraw, user needs USDC balance)
    let hasTrustline = $state(false);

    // Polling
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    const MAX_POLL_COUNT = 120; // 10 minutes at 5s
    let pollingTimedOut = $derived(pollCount >= MAX_POLL_COUNT);

    // SEP-24 transfer server URL (resolved from stellar.toml)
    let transferServer = $state<string | null>(null);

    async function resolveTransferServer() {
        if (transferServer) return transferServer;
        const toml = await sep1.fetchStellarToml(sepDomain);
        const ep = sep1.getSep24Endpoint(toml);
        if (!ep) throw new Error(`${anchorName} does not support SEP-24`);
        transferServer = ep;
        return ep;
    }

    async function initiate() {
        if (!walletStore.publicKey) return;

        isInitiating = true;
        error = null;

        try {
            const server = await resolveTransferServer();

            let response: Sep24InteractiveResponse;
            if (direction === 'withdraw') {
                response = await sep24.withdraw(server, token, {
                    asset_code: primaryToken,
                    account: walletStore.publicKey,
                    lang: 'en',
                });
            } else {
                response = await sep24.deposit(server, token, {
                    asset_code: primaryToken,
                    account: walletStore.publicKey,
                    lang: 'en',
                });
            }

            transactionId = response.id;
            interactiveUrl = response.url;
            step = 'interactive';

            // Open the anchor's interactive UI
            popup = sep24.openPopup(response.url);

            // Start polling for completion (fallback if postMessage doesn't fire)
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to initiate transaction';
        } finally {
            isInitiating = false;
        }
    }

    function startPolling() {
        stopPolling();
        pollCount = 0;

        pollInterval = setInterval(async () => {
            if (!transactionId || !transferServer) return;

            pollCount += 1;
            if (pollingTimedOut) {
                stopPolling();
                return;
            }

            try {
                const tx = await sep24.getTransaction(transferServer, token, transactionId);
                transaction = tx;

                if (direction === 'withdraw' && tx.status === 'pending_user_transfer_start') {
                    // Anchor is ready for the user to send USDC
                    closePopup();
                    step = 'signing';
                    stopPolling();
                } else if (direction === 'deposit' && tx.status === 'pending_anchor') {
                    // Anchor acknowledged deposit, waiting for completion
                    closePopup();
                    step = 'pending';
                } else if (tx.status === 'completed') {
                    stopPolling();
                    step = 'complete';
                } else if (tx.status === 'error' || tx.status === 'no_market') {
                    stopPolling();
                    error = tx.message || 'Transaction failed';
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 5000);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function closePopup() {
        if (popup && !popup.closed) {
            popup.close();
        }
        popup = null;
    }

    async function signAndSubmit() {
        if (!walletStore.publicKey || !transaction) return;

        error = null;

        try {
            const anchorAddress = transaction.withdraw_anchor_account;
            const memo = transaction.withdraw_memo;

            if (!anchorAddress) {
                throw new Error('Anchor did not provide a deposit address');
            }

            const envelope = await buildPaymentTransaction({
                sourcePublicKey: walletStore.publicKey,
                destinationPublicKey: anchorAddress,
                asset: stellarAsset,
                amount: transaction.amount_in || '0',
                memo: memo || '',
                network,
            });

            const signed = await signWithFreighter(envelope, network);
            await submitTransaction(signed.signedXdr, network);

            step = 'pending';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Transaction signing failed';
        }
    }

    function reset() {
        step = 'initiate';
        transaction = null;
        transactionId = null;
        interactiveUrl = null;
        error = null;
        closePopup();
        stopPolling();
        pollCount = 0;
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        // Listen for postMessage from the anchor's interactive popup
        function handleMessage(event: MessageEvent) {
            // Extract transaction from message (SEP-24 wraps in { transaction: {...} })
            const tx = event.data?.transaction;
            if (!tx?.status) return;

            transaction = tx;

            if (direction === 'withdraw' && tx.status === 'pending_user_transfer_start') {
                closePopup();
                step = 'signing';
                stopPolling();
            } else if (direction === 'deposit' && tx.status === 'pending_anchor') {
                closePopup();
                step = 'pending';
            } else if (tx.status === 'completed') {
                closePopup();
                stopPolling();
                step = 'complete';
            }
        }

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
            closePopup();
            stopPolling();
        };
    });
</script>

<div class="mx-auto max-w-lg">
    {#if step === 'initiate'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">
                {direction === 'withdraw' ? 'Cash Out' : 'Cash In'} with {anchorName}
            </h2>
            <p class="mt-1 text-sm text-gray-500">
                {#if direction === 'withdraw'}
                    Send {primaryToken} from your wallet and pick up cash at a {anchorName} location,
                    or receive funds via bank transfer.
                {:else}
                    Deposit cash at a {anchorName} location and receive {primaryToken} in your Stellar
                    wallet.
                {/if}
            </p>

            {#if direction === 'withdraw'}
                <TrustlineStatus
                    {stellarAsset}
                    {network}
                    showBalance
                    balanceCurrency={primaryToken}
                    onStatusChange={(s) => {
                        hasTrustline = s.hasTrustline;
                    }}
                />
            {/if}

            <button
                onclick={initiate}
                disabled={isInitiating || (direction === 'withdraw' && !hasTrustline)}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isInitiating ? 'Starting...' : `Continue with ${anchorName}`}
            </button>
        </div>
    {:else if step === 'interactive'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
            ></div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">
                Complete in {anchorName}
            </h2>
            <p class="mt-2 text-gray-500">
                A popup window has opened with {anchorName}'s interface. Complete the process there,
                then return here.
            </p>
            <p class="mt-1 text-sm text-gray-400">
                This page will update automatically when you're done.
            </p>

            {#if interactiveUrl}
                <button
                    onclick={() => {
                        popup = sep24.openPopup(interactiveUrl!);
                    }}
                    class="mt-4 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Reopen {anchorName} Window
                </button>
            {/if}

            <button onclick={reset} class="mt-2 text-sm text-gray-400 hover:text-gray-600">
                Cancel
            </button>
        </div>
    {:else if step === 'signing'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">Send {primaryToken}</h2>
            <p class="mt-1 text-sm text-gray-500">
                {anchorName} is ready to process your transaction. Sign and send the {primaryToken}
                payment to complete.
            </p>

            {#if transaction}
                <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4">
                    {#if transaction.amount_in}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">You're sending</span>
                            <span class="font-medium"
                                >{formatAmount(transaction.amount_in)}
                                {displayCurrency(transaction.amount_in_asset || primaryToken)}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.amount_out}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">You'll receive</span>
                            <span class="font-medium text-green-600"
                                >{formatAmount(transaction.amount_out)}
                                {displayCurrency(transaction.amount_out_asset || '')}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.amount_fee}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Fee</span>
                            <span class="text-sm text-gray-700"
                                >{transaction.amount_fee}
                                {displayCurrency(transaction.amount_fee_asset || '')}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.withdraw_anchor_account}
                        <div>
                            <span class="text-xs text-gray-500">Sending to</span>
                            <p class="mt-0.5">
                                <CopyableField value={transaction.withdraw_anchor_account} mono />
                            </p>
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="mt-6 flex gap-3">
                <button
                    onclick={reset}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onclick={signAndSubmit}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Sign & Send
                </button>
            </div>
        </div>
    {:else if step === 'pending'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold text-gray-900">Processing</h2>
                {#if transaction}
                    <span
                        class="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800"
                    >
                        {transaction.status}
                    </span>
                {/if}
            </div>

            <p class="mt-2 text-sm text-gray-500">
                {#if direction === 'withdraw'}
                    Your {primaryToken} has been sent. {anchorName} is processing your withdrawal.
                {:else}
                    {anchorName} is processing your deposit. {primaryToken} will arrive in your wallet
                    shortly.
                {/if}
            </p>

            {#if transaction}
                <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4">
                    {#if transaction.amount_in}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Amount sent</span>
                            <span class="font-medium"
                                >{formatAmount(transaction.amount_in)}
                                {displayCurrency(transaction.amount_in_asset || primaryToken)}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.amount_out}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Amount to receive</span>
                            <span class="font-medium text-green-600"
                                >{formatAmount(transaction.amount_out)}
                                {displayCurrency(transaction.amount_out_asset || '')}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.external_transaction_id}
                        <div>
                            <span class="text-xs text-gray-500">Reference Number</span>
                            <p class="mt-0.5">
                                <CopyableField value={transaction.external_transaction_id} mono />
                            </p>
                        </div>
                    {/if}
                    <div>
                        <span class="text-xs text-gray-500">Transaction ID</span>
                        <p class="mt-0.5">
                            <CopyableField value={transaction.id} mono />
                        </p>
                    </div>
                </div>
            {/if}

            <div class="mt-6">
                {#if pollingTimedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">We haven't received confirmation yet</p>
                        <p class="mt-1">
                            Your transaction is still processing. You can close this page and check
                            back later.
                        </p>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        This page will update when your transaction completes.
                    </p>
                {/if}
                {#if transaction?.more_info_url}
                    <a
                        href={transaction.more_info_url}
                        target="_blank"
                        rel="external noopener noreferrer"
                        class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800"
                    >
                        View on {anchorName}
                    </a>
                {/if}
            </div>
        </div>
    {:else if step === 'complete'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
            >
                <svg
                    class="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">
                {direction === 'withdraw' ? 'Withdrawal' : 'Deposit'} Complete!
            </h2>
            <p class="mt-2 text-gray-500">
                {#if direction === 'withdraw'}
                    Your funds are ready for pickup or have been sent to your bank.
                {:else}
                    {primaryToken} has been deposited to your Stellar wallet.
                {/if}
            </p>

            {#if transaction}
                <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4 text-left">
                    {#if transaction.amount_in}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Sent</span>
                            <span class="font-medium"
                                >{formatAmount(transaction.amount_in)}
                                {displayCurrency(transaction.amount_in_asset || primaryToken)}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.amount_out}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Received</span>
                            <span class="font-medium text-green-600"
                                >{formatAmount(transaction.amount_out)}
                                {displayCurrency(transaction.amount_out_asset || '')}</span
                            >
                        </div>
                    {/if}
                    {#if transaction.external_transaction_id}
                        <div>
                            <span class="text-xs text-gray-500">Reference Number</span>
                            <p class="mt-0.5">
                                <CopyableField value={transaction.external_transaction_id} mono />
                            </p>
                        </div>
                    {/if}
                </div>
            {/if}

            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start Over
            </button>
        </div>
    {/if}

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={clearError} />
        </div>
    {/if}
</div>
