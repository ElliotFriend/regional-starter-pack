<!--
@component Off-Ramp User Flow Component

This component manages and triggers the various points in the life-cycle of a
user creating an off-ramp transaction. It will create the customer on the
anchor's platform, query and ask for any KYC information required, register bank
account information, and submit a request to the anchor that initiates an
off-ramp transaction, and prompt the user to sign the transaction in freighter.

Usage:
```html
<OffRampFlow />
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import QuoteStep from '$lib/components/ramp/QuoteStep.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import FiatAccountStep from '$lib/components/ramp/FiatAccountStep.svelte';
    import { resolveStellarAsset } from '$lib/utils/stellar-asset';
    import { displayCurrency, formatAmount } from '$lib/utils/currency';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { buildPaymentTransaction, submitTransaction } from '$lib/wallet/stellar';
    import { PUBLIC_USDC_ISSUER, PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type {
        Quote,
        OffRampTransaction,
        SavedFiatAccount,
        TokenInfo,
    } from '$lib/anchors/types';
    import { getStatusColor } from '$lib/utils/status';
    import { TX_STATUS } from '$lib/constants';
    import * as api from '$lib/api/anchor';

    const provider = $derived(page.data.anchor.id);
    const fromCurrency = $derived(page.data.primaryToken);
    const fiatCurrency = $derived(page.data.fiatCurrency);
    const capabilities = $derived(page.data.capabilities);
    const displayName = $derived(page.data.displayName);
    const tokenIssuer = $derived(
        page.data.supportedTokens.find((t: TokenInfo) => t.symbol === page.data.primaryToken)
            ?.issuer,
    );

    // Local state for this flow
    let amount = $state('');
    let quote = $state<Quote | null>(null);
    let transaction = $state<OffRampTransaction | null>(null);
    let isGettingQuote = $state(false);
    let isCreatingTransaction = $state(false);
    let error = $state<string | null>(null);

    // Polling state
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    let signableInterval: ReturnType<typeof setInterval> | null = null;
    let pollCount = $state(0);
    let signablePollCount = $state(0);
    const MAX_POLL_COUNT = 60; // ~5 minutes at 5s intervals
    const MAX_SIGNABLE_POLL_COUNT = 60; // ~5 minutes at 5s intervals
    let pollingTimedOut = $derived(pollCount >= MAX_POLL_COUNT);
    let signableTimedOut = $derived(signablePollCount >= MAX_SIGNABLE_POLL_COUNT);

    // Saved fiat accounts
    let savedAccounts = $state<SavedFiatAccount[]>([]);
    let isLoadingAccounts = $state(false);
    let selectedAccountId = $state<string | null>(null);
    let useNewAccount = $state(false);

    // Hosted bank-account registration state (anchors with kycFlow: 'iframe')
    let isOpeningRegistration = $state(false);
    let hasOpenedRegistration = $state(false);

    const fiatAccountRegistration = $derived(capabilities?.fiatAccountRegistration ?? 'inline');

    // Bank account details (for new accounts) — SPEI
    let bankName = $state('');
    let clabe = $state('');
    let beneficiary = $state('');

    // Bank account details (for new accounts) — PIX
    let pixKey = $state('');
    let pixKeyType = $state('cpf');
    let taxId = $state('');
    let accountHolderName = $state('');

    // Derive payment rail from the active region (set via ?region= URL param
    // or the country dropdown on the registration step). Falls back to SPEI
    // for backwards-compatibility when neither is available.
    const paymentRail = $derived(page.data.paymentRail ?? 'spei');

    // Steps: 'input' | 'quote' | 'bank' | 'awaiting_signable' | 'signing' | 'pending' | 'complete'
    let step = $state<
        'input' | 'quote' | 'bank' | 'awaiting_signable' | 'signing' | 'pending' | 'complete'
    >('input');

    // Trustline + balance state (updated by TrustlineStatus callback)
    let assetBalance = $state('0');
    let hasTrustline = $state(false);

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    const stellarAsset = $derived(
        resolveStellarAsset(fromCurrency, tokenIssuer, PUBLIC_USDC_ISSUER),
    );

    async function getQuote_() {
        if (!amount || isNaN(parseFloat(amount))) return;

        // Some providers require bank account selection before quoting — collect bank details first
        if (capabilities?.requiresBankBeforeQuote) {
            step = 'bank';
            await loadSavedAccounts();
            return;
        }

        isGettingQuote = true;
        error = null;

        try {
            const customer = customerStore.current;
            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: fiatCurrency,
                amount,
                customerId: customer?.id,
                stellarAddress: walletStore.publicKey ?? undefined,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function refreshQuote() {
        if (!amount) return;
        isGettingQuote = true;
        try {
            const customer = customerStore.current;
            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: fiatCurrency,
                amount,
                customerId: customer?.id,
                resourceId: selectedAccountId ?? undefined,
                stellarAddress: walletStore.publicKey ?? undefined,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isGettingQuote = false;
        }
    }

    /**
     * Register bank account (if new), then get quote with bank_account_id.
     * Called from the bank step when the provider needs bank details before quoting.
     */
    async function handleBankThenQuote() {
        const customer = customerStore.current;
        if (!customer) return;

        if (!useNewAccount && !selectedAccountId) return;
        if (useNewAccount && paymentRail === 'pix' && (!pixKey || !taxId || !accountHolderName))
            return;
        if (useNewAccount && paymentRail !== 'pix' && (!clabe || !beneficiary)) return;

        error = null;
        isGettingQuote = true;

        try {
            if (useNewAccount) {
                const accountDetails =
                    paymentRail === 'pix'
                        ? { type: 'pix' as const, pixKey, pixKeyType, taxId, accountHolderName }
                        : { bankName, clabe, beneficiary };
                const result = await api.registerFiatAccount(
                    fetch,
                    provider,
                    customer.id,
                    accountDetails,
                );
                selectedAccountId = result.id;
                useNewAccount = false;
            }

            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: fiatCurrency,
                amount,
                customerId: customer.id,
                resourceId: selectedAccountId!,
                stellarAddress: walletStore.publicKey ?? undefined,
            });

            step = 'quote';
        } catch (err) {
            error =
                err instanceof Error ? err.message : 'Failed to register bank account or get quote';
        } finally {
            isGettingQuote = false;
        }
    }

    async function loadSavedAccounts() {
        const customer = customerStore.current;
        if (!customer) return;

        isLoadingAccounts = true;
        try {
            savedAccounts = await api.getFiatAccounts(fetch, provider, customer.id);
            // If there are saved accounts, select the first one by default
            if (savedAccounts.length > 0) {
                selectedAccountId = savedAccounts[0].id;
                useNewAccount = false;
            } else {
                useNewAccount = true;
            }
        } catch (e) {
            console.error('Failed to load saved accounts:', e);
            useNewAccount = true;
        } finally {
            isLoadingAccounts = false;
        }
    }

    async function proceedToBankDetails() {
        step = 'bank';
        await loadSavedAccounts();
    }

    /**
     * Open the anchor's hosted onboarding UI in a popup so the user can register
     * a new bank account. Used by anchors with `fiatAccountRegistration: 'hosted'`.
     */
    async function handleRegisterNewAccount() {
        const customer = customerStore.current;
        if (!customer || !walletStore.publicKey) return;

        isOpeningRegistration = true;
        error = null;
        try {
            const url = await api.getKycUrl(fetch, provider, customer.id, walletStore.publicKey);
            window.open(url, 'anchor_register', 'width=600,height=800,popup');
            hasOpenedRegistration = true;
        } catch (err) {
            error =
                err instanceof Error ? err.message : 'Failed to open bank-account registration';
        } finally {
            isOpeningRegistration = false;
        }
    }

    /**
     * Re-fetch saved fiat accounts after the user has finished hosted registration.
     */
    async function handleRefreshAccounts() {
        await loadSavedAccounts();
    }

    async function confirmOrder() {
        const customer = customerStore.current;
        if (!quote || !walletStore.publicKey || !customer) return;

        // Hosted-registration anchors require a saved (selected) account — there's no inline form.
        if (fiatAccountRegistration === 'hosted' && !selectedAccountId) return;
        if (fiatAccountRegistration === 'inline') {
            if (!useNewAccount && !selectedAccountId) return;
            if (useNewAccount && paymentRail === 'pix' && (!pixKey || !taxId || !accountHolderName))
                return;
            if (useNewAccount && paymentRail !== 'pix' && (!clabe || !beneficiary)) return;
        }

        isCreatingTransaction = true;
        error = null;

        try {
            // Inline anchors: register the new account first, then create the offramp.
            // Hosted anchors: registration already happened in the hosted UI; selectedAccountId is set.
            let fiatAccountId = selectedAccountId;
            if (fiatAccountRegistration === 'inline' && useNewAccount) {
                const accountDetails =
                    paymentRail === 'pix'
                        ? { type: 'pix' as const, pixKey, pixKeyType, taxId, accountHolderName }
                        : { bankName, clabe, beneficiary };
                const registered = await api.registerFiatAccount(
                    fetch,
                    provider,
                    customer.id,
                    accountDetails,
                    walletStore.publicKey,
                );
                fiatAccountId = registered.id;
                selectedAccountId = registered.id;
                useNewAccount = false;
            }

            if (!fiatAccountId) return;

            const tx = await api.createOffRamp(fetch, provider, {
                customerId: customer.id,
                quoteId: quote.id,
                stellarAddress: walletStore.publicKey,
                fromCurrency: quote.fromCurrency,
                toCurrency: quote.toCurrency,
                amount: quote.fromAmount,
                fiatAccountId,
            });

            transaction = tx;

            if (tx.signableTransaction) {
                // Signable transaction available immediately — go straight to signing
                await signAndSubmit(tx.signableTransaction);
            } else if (capabilities?.deferredOffRampSigning) {
                // Deferred signing: burn transaction is not available at creation time —
                // poll the transaction until it appears
                step = 'awaiting_signable';
                startPollingForSignable();
            } else {
                // Build a payment transaction locally and sign it directly
                await signAndSubmit();
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Transaction failed';
            step = 'bank'; // Go back to bank details
        } finally {
            isCreatingTransaction = false;
        }
    }

    /**
     * Sign the transaction and submit it. If an XDR is provided it is used
     * directly (pre-built by the anchor, e.g. Etherfuse burn). Otherwise a
     * payment transaction is built on the fly.
     */
    async function signAndSubmit(xdr?: string) {
        if (!walletStore.publicKey || !quote) return;

        step = 'signing';
        error = null;

        try {
            let envelope: string;
            if (xdr) {
                // Use pre-built transaction from the anchor (e.g. Etherfuse burn)
                envelope = xdr;
            } else {
                // Build a payment transaction to the anchor's receiving address
                const anchorAddress = transaction!.stellarAddress;
                envelope = await buildPaymentTransaction({
                    sourcePublicKey: walletStore.publicKey,
                    destinationPublicKey: anchorAddress,
                    asset: stellarAsset,
                    amount: String(amount),
                    memo: transaction!.memo || '',
                    network,
                });
            }

            const signed = await signWithFreighter(envelope, network);

            await submitTransaction(signed.signedXdr, network);

            step = 'pending';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Transaction failed';
            step = 'bank'; // Go back to bank details
        }
    }

    function startPollingForSignable() {
        stopPollingForSignable();
        signablePollCount = 0;

        signableInterval = setInterval(async () => {
            if (!transaction) return;

            signablePollCount += 1;

            if (signableTimedOut) {
                stopPollingForSignable();
                return;
            }

            try {
                const updated = await api.getOffRampTransaction(fetch, provider, transaction.id);
                if (updated?.signableTransaction) {
                    stopPollingForSignable();
                    transaction = updated;
                    await signAndSubmit(updated.signableTransaction);
                }
            } catch (err) {
                console.error('Failed to poll for signable transaction:', err);
            }
        }, 5000);
    }

    function stopPollingForSignable() {
        if (signableInterval) {
            clearInterval(signableInterval);
            signableInterval = null;
        }
    }

    function startPolling() {
        if (refreshInterval) clearInterval(refreshInterval);
        pollCount = 0;

        refreshInterval = setInterval(async () => {
            pollCount += 1;

            if (pollingTimedOut) {
                stopPolling();
                return;
            }

            if (transaction) {
                const updated = await api.getOffRampTransaction(fetch, provider, transaction.id);

                if (updated) {
                    transaction = updated;

                    if (updated.status === TX_STATUS.COMPLETED) {
                        step = 'complete';
                        stopPolling();
                    } else if (
                        updated.status === TX_STATUS.FAILED ||
                        updated.status === TX_STATUS.EXPIRED ||
                        updated.status === TX_STATUS.CANCELLED
                    ) {
                        stopPolling();
                    }
                }
            }
        }, 5000);
    }

    function stopPolling() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    function reset() {
        amount = '';
        quote = null;
        transaction = null;
        bankName = '';
        clabe = '';
        beneficiary = '';
        pixKey = '';
        pixKeyType = 'cpf';
        taxId = '';
        accountHolderName = '';
        selectedAccountId = null;
        useNewAccount = false;
        hasOpenedRegistration = false;
        error = null;
        step = 'input';
        stopPolling();
        stopPollingForSignable();
    }

    function clearError() {
        error = null;
    }

    /** Handle the quote step confirm action — either go to bank details or confirm order directly. */
    function handleQuoteConfirm() {
        if (capabilities?.requiresBankBeforeQuote && selectedAccountId) {
            confirmOrder();
        } else {
            proceedToBankDetails();
        }
    }

    /** Label for the quote step confirm button. */
    const quoteConfirmLabel = $derived(
        capabilities?.requiresBankBeforeQuote && selectedAccountId
            ? 'Confirm & Sign'
            : 'Continue to Bank Details',
    );

    /** Handle the bank step back button. */
    function handleBankBack() {
        step = quote ? 'quote' : 'input';
    }

    /** Handle the bank step submit — either get quote first or confirm order. */
    function handleBankSubmit() {
        if (capabilities?.requiresBankBeforeQuote && !quote) {
            handleBankThenQuote();
        } else {
            confirmOrder();
        }
    }

    onMount(() => {
        return () => {
            stopPolling();
            stopPollingForSignable();
        };
    });
</script>

<div class="mx-auto max-w-lg">
    {#if step === 'input'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">Off-Ramp</h2>
            <p class="mt-1 text-sm text-gray-500">
                Convert your digital assets to local currency and receive funds in your bank
                account.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency={fromCurrency}
                onStatusChange={(s) => {
                    hasTrustline = s.hasTrustline;
                    assetBalance = s.balance;
                }}
            />

            <AmountInput
                bind:amount
                label="Amount ({fromCurrency})"
                placeholder="100"
                maxAmount={assetBalance}
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                {isGettingQuote}
                onSubmit={getQuote_}
            />
        </div>
    {:else if step === 'quote'}
        <QuoteStep
            {quote}
            isRefreshing={isGettingQuote}
            isConfirming={isCreatingTransaction}
            confirmLabel={quoteConfirmLabel}
            onRefresh={refreshQuote}
            onCancel={reset}
            onConfirm={handleQuoteConfirm}
        />
    {:else if step === 'bank'}
        <FiatAccountStep
            {savedAccounts}
            {isLoadingAccounts}
            bind:selectedAccountId
            bind:useNewAccount
            bind:bankName
            bind:clabe
            bind:beneficiary
            bind:pixKey
            bind:pixKeyType
            bind:taxId
            bind:accountHolderName
            {paymentRail}
            isBankBeforeQuote={capabilities?.requiresBankBeforeQuote ?? false}
            hasQuote={quote !== null}
            {isGettingQuote}
            {isCreatingTransaction}
            {fiatAccountRegistration}
            onRegisterNewAccount={handleRegisterNewAccount}
            onRefreshAccounts={handleRefreshAccounts}
            {isOpeningRegistration}
            {hasOpenedRegistration}
            onBack={handleBankBack}
            onSubmit={handleBankSubmit}
        />
    {:else if step === 'awaiting_signable'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            {#if signableTimedOut}
                <div
                    class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"
                >
                    <svg
                        class="h-6 w-6 text-amber-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                    </svg>
                </div>
                <h2 class="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h2>
                <p class="mt-2 text-gray-500">
                    We weren't able to prepare your transaction for signing. Please try again.
                </p>
                {#if transaction}
                    <div class="mt-4 text-left">
                        <span class="text-xs text-gray-500">Order ID</span>
                        <p class="mt-0.5"><CopyableField value={transaction.id} mono /></p>
                    </div>
                {/if}
                <button
                    onclick={() => {
                        step = 'bank';
                    }}
                    class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    Try Again
                </button>
            {:else}
                <div
                    class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
                ></div>
                <h2 class="mt-4 text-xl font-semibold text-gray-900">Preparing Your Transaction</h2>
                <p class="mt-2 text-gray-500">
                    Your order has been created. Waiting for the transaction to be ready for
                    signing...
                </p>
                <p class="mt-1 text-sm text-gray-400">This usually takes under a minute.</p>

                {#if transaction && quote}
                    <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4 text-left">
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">You're sending</span>
                            <span class="font-medium"
                                >{formatAmount(transaction.fromAmount)}
                                {displayCurrency(
                                    transaction.fromCurrency || quote.fromCurrency,
                                )}</span
                            >
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">You'll receive</span>
                            <span class="font-medium text-green-600">
                                {parseFloat(
                                    transaction.toAmount || quote.toAmount || '0',
                                ).toLocaleString()}
                                {displayCurrency(transaction.toCurrency || quote.toCurrency)}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Order ID</span>
                            <span class="font-mono text-sm text-gray-700"
                                >{transaction.id.slice(0, 8)}...</span
                            >
                        </div>
                    </div>
                {/if}
            {/if}
        </div>
    {:else if step === 'signing'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
            ></div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">Signing Transaction</h2>
            <p class="mt-2 text-gray-500">
                Please approve the transaction in your Freighter wallet.
            </p>
        </div>
    {:else if step === 'pending'}
        {#if transaction}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <h2 class="text-xl font-semibold text-gray-900">Processing</h2>
                    <span
                        class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {getStatusColor(
                            transaction.status,
                        )}"
                    >
                        {transaction.status}
                    </span>
                </div>

                <p class="mt-2 text-sm text-gray-500">
                    Your digital assets have been sent. We're now processing your bank transfer.
                </p>

                <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4">
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-500">You sent</span>
                        <span class="font-medium"
                            >{formatAmount(transaction.fromAmount)}
                            {displayCurrency(transaction.fromCurrency || quote?.fromCurrency)}</span
                        >
                    </div>
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-500">You'll receive</span>
                        <span class="font-medium text-green-600">
                            {parseFloat(
                                transaction.toAmount || quote?.toAmount || '0',
                            ).toLocaleString()}
                            {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
                        </span>
                    </div>
                    {#if transaction.feeAmount}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Fee</span>
                            <span class="text-sm text-gray-700">
                                {transaction.feeAmount}
                                {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
                                {#if transaction.feeBps}
                                    <span class="text-gray-400">({transaction.feeBps / 100}%)</span>
                                {/if}
                            </span>
                        </div>
                    {/if}
                    {#if transaction.fiatAccount?.bankName}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">Bank</span>
                            <span class="font-medium">{transaction.fiatAccount.bankName}</span>
                        </div>
                    {/if}
                    {#if transaction.fiatAccount?.accountIdentifier}
                        <div class="flex justify-between">
                            <span class="text-sm text-gray-500">CLABE</span>
                            <span class="font-mono text-sm"
                                >{transaction.fiatAccount.accountIdentifier}</span
                            >
                        </div>
                    {/if}
                </div>

                <div class="mt-6">
                    {#if pollingTimedOut}
                        <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                            <p class="font-medium">We haven't received confirmation yet</p>
                            <p class="mt-1">
                                Your transaction is still processing. You can close this page and
                                check back later.
                            </p>
                            <div class="mt-3">
                                <span class="text-xs text-amber-600">Transaction ID</span>
                                <p class="mt-0.5"><CopyableField value={transaction.id} mono /></p>
                            </div>
                        </div>
                    {:else}
                        <p class="text-center text-sm text-gray-500">
                            This page will update when your transfer is complete.
                        </p>
                    {/if}
                    {#if transaction.statusPage}
                        <a
                            href={transaction.statusPage}
                            target="_blank"
                            rel="external noopener noreferrer"
                            class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800"
                        >
                            View on {displayName || 'Anchor'}
                        </a>
                    {/if}
                </div>
            </div>
        {/if}
    {:else if step === 'complete'}
        <CompletionStep
            title="Transfer Complete!"
            message="Your funds have been sent to your bank account."
            {transaction}
            {quote}
            {network}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<!-- For Developers -->
<section class="mx-auto mt-8 max-w-lg">
    <DevBox
        items={[
            {
                text: 'View OffRampFlow component source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/components/OffRampFlow.svelte',
            },
            {
                text: 'View anchor API proxy routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor',
            },
        ]}
    />
</section>
