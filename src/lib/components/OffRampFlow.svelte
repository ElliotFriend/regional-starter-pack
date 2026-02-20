<!--
@component Off-Ramp User Flow Component

This component manages and triggers the various points in the life-cycle of a
user creating an off-ramp transaction. It will create the customer on the
anchor's platform, query and ask for any KYC information required, register bank
account information, and submit a request to the anchor that initiates an
off-ramp transaction, and prompt the user to sign the transaction in freighter.

Usage:
```html
<OffRampFlow provider="etherfuse" />
```
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import {
        buildPaymentTransaction,
        submitTransaction,
        getUsdcAsset,
        getStellarAsset,
        checkTrustline,
        buildTrustlineTransaction,
    } from '$lib/wallet/stellar';
    import { PUBLIC_USDC_ISSUER, PUBLIC_STELLAR_NETWORK } from '$env/static/public';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type { Quote, OffRampTransaction, SavedFiatAccount } from '$lib/anchors/types';
    import { getStatusColor } from '$lib/utils/status';
    import { PROVIDER, CURRENCY, TX_STATUS } from '$lib/constants';
    import { getToken } from '$lib/config/regions';
    import * as api from '$lib/api/anchor';

    interface Props {
        provider?: string;
        fromCurrency?: string;
    }

    let { provider = PROVIDER.ETHERFUSE, fromCurrency = CURRENCY.USDC }: Props = $props();

    // Local state for this flow
    let amount = $state('');
    let quote = $state<Quote | null>(null);
    let transaction = $state<OffRampTransaction | null>(null);
    let isGettingQuote = $state(false);
    let isCreatingTransaction = $state(false);
    let isSigning = $state(false);
    let error = $state<string | null>(null);
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    let signableInterval: ReturnType<typeof setInterval> | null = null;

    // Saved fiat accounts
    let savedAccounts = $state<SavedFiatAccount[]>([]);
    let isLoadingAccounts = $state(false);
    let selectedAccountId = $state<string | null>(null);
    let useNewAccount = $state(false);

    // Bank account details (for new accounts)
    let bankName = $state('');
    let accountNumber = $state('');
    let clabe = $state('');
    let beneficiary = $state('');

    // Steps: 'input' | 'quote' | 'bank' | 'awaiting_signable' | 'signing' | 'pending' | 'complete'
    let step = $state<
        'input' | 'quote' | 'bank' | 'awaiting_signable' | 'signing' | 'pending' | 'complete'
    >('input');

    // Asset balance
    let assetBalance = $state('0');
    let hasTrustline = $state(false);
    let isCheckingBalance = $state(true);

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    // Resolve the Stellar asset from the fromCurrency token config
    const stellarAsset = $derived.by(() => {
        const tokenConfig = getToken(fromCurrency);
        return tokenConfig?.issuer
            ? getStellarAsset(tokenConfig.symbol, tokenConfig.issuer)
            : getUsdcAsset(PUBLIC_USDC_ISSUER);
    });

    async function checkBalance() {
        if (!walletStore.publicKey) return;

        isCheckingBalance = true;
        try {
            const result = await checkTrustline(walletStore.publicKey, stellarAsset, network);
            hasTrustline = result.hasTrustline;
            assetBalance = result.balance;
        } catch (e) {
            console.error('Failed to check balance:', e);
        } finally {
            isCheckingBalance = false;
        }
    }

    async function addTrustline() {
        if (!walletStore.publicKey) return;

        isSigning = true;
        try {
            const xdr = await buildTrustlineTransaction({
                sourcePublicKey: walletStore.publicKey,
                asset: stellarAsset,
                network,
            });

            const signed = await signWithFreighter(xdr, network);
            await submitTransaction(signed.signedXdr, network);

            // Refresh balance
            await checkBalance();
        } catch (e) {
            console.error('Failed to add trustline:', e);
        } finally {
            isSigning = false;
        }
    }

    /** Build the customerId for quote requests. BlindPay expects "receiverId:bankAccountId". */
    function getQuoteCustomerId(bankAccountId?: string): string | undefined {
        const customer = customerStore.current;
        if (!customer) return undefined;
        if (provider === PROVIDER.BLINDPAY && bankAccountId) {
            return `${customer.id}:${bankAccountId}`;
        }
        return customer.id;
    }

    async function getQuote_() {
        if (!amount || isNaN(parseFloat(amount))) return;

        // BlindPay requires bank_account_id for payout quotes — collect bank details first
        if (provider === PROVIDER.BLINDPAY) {
            step = 'bank';
            await loadSavedAccounts();
            return;
        }

        isGettingQuote = true;
        error = null;

        try {
            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: CURRENCY.FIAT,
                amount,
                customerId: getQuoteCustomerId(),
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
            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: CURRENCY.FIAT,
                amount,
                customerId: getQuoteCustomerId(selectedAccountId ?? undefined),
                stellarAddress: walletStore.publicKey ?? undefined,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isGettingQuote = false;
        }
    }

    /**
     * BlindPay off-ramp: register bank account (if new), then get quote with bank_account_id.
     * Called from the bank step when BlindPay needs bank details before quoting.
     */
    async function handleBlindPayBankContinue() {
        const customer = customerStore.current;
        if (!customer) return;

        if (!useNewAccount && !selectedAccountId) return;
        if (useNewAccount && (!clabe || !beneficiary)) return;

        error = null;
        isGettingQuote = true;

        try {
            if (useNewAccount) {
                const result = await api.registerFiatAccount(fetch, provider, customer.id, {
                    bankName,
                    accountNumber,
                    clabe,
                    beneficiary,
                });
                selectedAccountId = result.id;
                useNewAccount = false;
            }

            quote = await api.getQuote(fetch, provider, {
                fromCurrency,
                toCurrency: CURRENCY.FIAT,
                amount,
                customerId: getQuoteCustomerId(selectedAccountId!),
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

    async function confirmOrder() {
        const customer = customerStore.current;
        if (!quote || !walletStore.publicKey || !customer) return;

        // Validate: either selected account or new account details
        if (!useNewAccount && !selectedAccountId) return;
        if (useNewAccount && (!bankName || !accountNumber || !clabe || !beneficiary)) return;

        isCreatingTransaction = true;
        error = null;

        try {
            let tx: OffRampTransaction;

            if (useNewAccount) {
                // Create with new bank account
                tx = await api.createOffRamp(fetch, provider, {
                    customerId: customer.id,
                    quoteId: quote.id,
                    stellarAddress: walletStore.publicKey,
                    fromCurrency: quote.fromCurrency,
                    toCurrency: quote.toCurrency,
                    amount: quote.fromAmount,
                    bankAccount: {
                        bankName,
                        clabe,
                        beneficiary,
                    },
                });
            } else {
                // Use existing fiat account
                if (!selectedAccountId) return;

                tx = await api.createOffRamp(fetch, provider, {
                    customerId: customer.id,
                    quoteId: quote.id,
                    stellarAddress: walletStore.publicKey,
                    fromCurrency: quote.fromCurrency,
                    toCurrency: quote.toCurrency,
                    amount: quote.fromAmount,
                    fiatAccountId: selectedAccountId,
                });
            }

            transaction = tx;

            if (tx.signableTransaction) {
                // Signable transaction available immediately — go straight to signing
                await signAndSubmit(tx.signableTransaction);
            } else if (provider === PROVIDER.ETHERFUSE) {
                // Etherfuse: burn transaction is not available at creation time —
                // poll GET /ramp/order/{id} until it appears
                step = 'awaiting_signable';
                startPollingForSignable();
            } else {
                // Other providers (BlindPay, AlfredPay, etc.): build a payment
                // transaction locally and sign it directly
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
        isSigning = true;
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

            if (provider === PROVIDER.BLINDPAY) {
                // BlindPay: submit signed XDR back to BlindPay (step 2 of 2)
                await api.submitSignedPayout(
                    fetch,
                    provider,
                    quote.id,
                    signed.signedXdr,
                    walletStore.publicKey,
                );
            } else {
                // Other providers: submit directly to the Stellar network
                await submitTransaction(signed.signedXdr, network);
            }

            step = 'pending';
            startPolling();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Transaction failed';
            step = 'bank'; // Go back to bank details
        } finally {
            isSigning = false;
        }
    }

    function startPollingForSignable() {
        stopPollingForSignable();

        signableInterval = setInterval(async () => {
            if (!transaction) return;

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

        refreshInterval = setInterval(async () => {
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
        accountNumber = '';
        clabe = '';
        beneficiary = '';
        selectedAccountId = null;
        useNewAccount = false;
        error = null;
        step = 'input';
        stopPolling();
        stopPollingForSignable();
    }

    /** Strip the issuer from a `CODE:ISSUER` asset string. */
    function displayCurrency(currency: string | undefined): string {
        if (!currency) return '';
        return currency.split(':')[0];
    }

    /** Format a numeric string to at most 7 decimal places, trimming trailing zeros. */
    function formatAmount(value: string): string {
        return parseFloat(parseFloat(value).toFixed(7)).toString();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        checkBalance();
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

            {#if walletStore.isConnected}
                <div class="mt-4 rounded-md bg-gray-50 p-3">
                    <div class="flex items-center justify-between">
                        <span class="text-sm text-gray-500">Your Balance</span>
                        {#if isCheckingBalance}
                            <span class="text-sm text-gray-400">Loading...</span>
                        {:else if hasTrustline}
                            <span class="font-medium"
                                >{formatAmount(assetBalance)} {displayCurrency(fromCurrency)}</span
                            >
                        {:else}
                            <button
                                onclick={addTrustline}
                                disabled={isSigning}
                                class="text-sm text-indigo-600 hover:text-indigo-800"
                            >
                                {isSigning ? 'Adding...' : 'Add Trustline'}
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}

            <div class="mt-6">
                <label for="amount" class="block text-sm font-medium text-gray-700"
                    >Amount ({fromCurrency})</label
                >
                <input
                    type="number"
                    id="amount"
                    bind:value={amount}
                    placeholder="100"
                    min="1"
                    step="1"
                    max={assetBalance}
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
                {#if parseFloat(amount) > parseFloat(assetBalance)}
                    <p class="mt-1 text-sm text-red-600">Insufficient balance</p>
                {/if}
            </div>

            <button
                onclick={getQuote_}
                disabled={!amount ||
                    isGettingQuote ||
                    !walletStore.isConnected ||
                    !hasTrustline ||
                    parseFloat(amount) > parseFloat(assetBalance)}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isGettingQuote ? 'Getting Quote...' : 'Get Quote'}
            </button>

            {#if !walletStore.isConnected}
                <p class="mt-2 text-center text-sm text-gray-500">
                    Please connect your wallet first.
                </p>
            {/if}
        </div>
    {:else if step === 'quote'}
        <div class="space-y-4">
            {#if quote}
                <QuoteDisplay {quote} onRefresh={refreshQuote} isRefreshing={isGettingQuote} />
            {/if}

            <div class="flex gap-3">
                <button
                    onclick={reset}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                {#if provider === PROVIDER.BLINDPAY && selectedAccountId}
                    <!-- BlindPay: bank already registered before quote, go straight to confirm -->
                    <button
                        onclick={confirmOrder}
                        disabled={isCreatingTransaction}
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isCreatingTransaction ? 'Processing...' : 'Confirm & Sign'}
                    </button>
                {:else}
                    <button
                        onclick={proceedToBankDetails}
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Continue to Bank Details
                    </button>
                {/if}
            </div>
        </div>
    {:else if step === 'bank'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-xl font-semibold text-gray-900">Bank Account</h2>
            <p class="mt-1 text-sm text-gray-500">Select where you want to receive your funds.</p>

            {#if isLoadingAccounts}
                <div class="mt-6 flex items-center justify-center py-8">
                    <div
                        class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                    ></div>
                    <span class="ml-2 text-sm text-gray-500">Loading saved accounts...</span>
                </div>
            {:else}
                <div class="mt-6 space-y-4">
                    {#if savedAccounts.length > 0}
                        <div>
                            <p class="mb-2 block text-sm font-medium text-gray-700">
                                Saved Accounts
                            </p>
                            <div class="space-y-2">
                                {#each savedAccounts as account (account.id)}
                                    <label
                                        class="flex cursor-pointer items-center rounded-lg border p-3 transition-colors {selectedAccountId ===
                                            account.id && !useNewAccount
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-gray-300'}"
                                    >
                                        <input
                                            type="radio"
                                            name="fiatAccount"
                                            value={account.id}
                                            checked={selectedAccountId === account.id &&
                                                !useNewAccount}
                                            onchange={() => {
                                                selectedAccountId = account.id;
                                                useNewAccount = false;
                                            }}
                                            class="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div class="ml-3">
                                            <p class="text-sm font-medium text-gray-900">
                                                {account.bankName || 'Bank Account'}
                                            </p>
                                            <p class="text-sm text-gray-500">
                                                {#if account.accountHolderName}{account.accountHolderName}
                                                    &bull;
                                                {/if}{account.accountNumber ||
                                                    account.id.slice(0, 8)}
                                            </p>
                                        </div>
                                    </label>
                                {/each}

                                <label
                                    class="flex cursor-pointer items-center rounded-lg border p-3 transition-colors {useNewAccount
                                        ? 'border-indigo-500 bg-indigo-50'
                                        : 'border-gray-200 hover:border-gray-300'}"
                                >
                                    <input
                                        type="radio"
                                        name="fiatAccount"
                                        value="new"
                                        checked={useNewAccount}
                                        onchange={() => {
                                            useNewAccount = true;
                                            selectedAccountId = null;
                                        }}
                                        class="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div class="ml-3">
                                        <p class="text-sm font-medium text-gray-900">
                                            Use a new account
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    {/if}

                    {#if useNewAccount || savedAccounts.length === 0}
                        <div
                            class="space-y-4 {savedAccounts.length > 0
                                ? 'border-t border-gray-200 pt-4'
                                : ''}"
                        >
                            {#if savedAccounts.length > 0}
                                <p class="text-sm font-medium text-gray-700">New Account Details</p>
                            {/if}

                            <div>
                                <label
                                    for="bankName"
                                    class="block text-sm font-medium text-gray-700">Bank Name</label
                                >
                                <input
                                    type="text"
                                    id="bankName"
                                    bind:value={bankName}
                                    placeholder="BBVA, Santander, etc."
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label for="clabe" class="block text-sm font-medium text-gray-700"
                                    >CLABE (18 digits)</label
                                >
                                <input
                                    type="text"
                                    id="clabe"
                                    bind:value={clabe}
                                    placeholder="012180001234567890"
                                    maxlength="18"
                                    class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label
                                    for="accountNumber"
                                    class="block text-sm font-medium text-gray-700"
                                    >Account Number</label
                                >
                                <input
                                    type="text"
                                    id="accountNumber"
                                    bind:value={accountNumber}
                                    placeholder="1234567890"
                                    class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label
                                    for="beneficiary"
                                    class="block text-sm font-medium text-gray-700"
                                    >Beneficiary Name</label
                                >
                                <input
                                    type="text"
                                    id="beneficiary"
                                    bind:value={beneficiary}
                                    placeholder="Full name as it appears on the account"
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="mt-6 flex gap-3">
                <button
                    onclick={() => (step = quote ? 'quote' : 'input')}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Back
                </button>
                {#if provider === PROVIDER.BLINDPAY && !quote}
                    <!-- BlindPay: bank step is before quote — continue to get quote -->
                    <button
                        onclick={handleBlindPayBankContinue}
                        disabled={isLoadingAccounts ||
                            isGettingQuote ||
                            (useNewAccount && (!clabe || !beneficiary)) ||
                            (!useNewAccount && !selectedAccountId)}
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isGettingQuote ? 'Getting Quote...' : 'Continue'}
                    </button>
                {:else}
                    <button
                        onclick={confirmOrder}
                        disabled={isLoadingAccounts ||
                            isCreatingTransaction ||
                            (useNewAccount &&
                                (!bankName || !clabe || !accountNumber || !beneficiary)) ||
                            (!useNewAccount && !selectedAccountId)}
                        class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isCreatingTransaction ? 'Processing...' : 'Confirm & Sign'}
                    </button>
                {/if}
            </div>
        </div>
    {:else if step === 'awaiting_signable'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
                class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
            ></div>
            <h2 class="mt-4 text-xl font-semibold text-gray-900">Preparing Your Transaction</h2>
            <p class="mt-2 text-gray-500">
                Your order has been created. Waiting for the transaction to be ready for signing...
            </p>

            {#if transaction && quote}
                <div class="mt-6 space-y-3 rounded-md bg-gray-50 p-4 text-left">
                    <div class="flex justify-between">
                        <span class="text-sm text-gray-500">You're sending</span>
                        <span class="font-medium"
                            >{formatAmount(transaction.fromAmount)}
                            {displayCurrency(transaction.fromCurrency || quote.fromCurrency)}</span
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
                    <p class="text-center text-sm text-gray-500">
                        This page will update when your transfer is complete.
                    </p>
                    {#if transaction.statusPage}
                        <a
                            href={transaction.statusPage}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-800"
                        >
                            View on Etherfuse
                        </a>
                    {/if}
                </div>
            </div>
        {/if}
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
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    ></path>
                </svg>
            </div>

            <h2 class="mt-4 text-xl font-semibold text-gray-900">Transfer Complete!</h2>
            <p class="mt-2 text-gray-500">Your funds have been sent to your bank account.</p>

            {#if transaction}
                <div class="mt-4 space-y-1 text-sm text-gray-600">
                    <p>
                        Amount: {parseFloat(
                            transaction.toAmount || quote?.toAmount || '0',
                        ).toLocaleString()}
                        {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
                    </p>
                    {#if transaction.feeAmount}
                        <p>
                            Fee: {transaction.feeAmount}
                            {displayCurrency(transaction.toCurrency || quote?.toCurrency)}
                            {#if transaction.feeBps}
                                <span class="text-gray-400">({transaction.feeBps / 100}%)</span>
                            {/if}
                        </p>
                    {/if}
                    {#if transaction.fiatAccount?.bankName}
                        <p>Bank: {transaction.fiatAccount.bankName}</p>
                    {/if}
                </div>
            {/if}

            <button
                onclick={reset}
                class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start New Transaction
            </button>
        </div>
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<!-- For Developers -->
<section class="mx-auto mt-8 max-w-lg">
    <div class="rounded-lg bg-gray-900 p-8 text-white">
        <h2 class="mb-4 text-2xl font-bold">For Developers</h2>
        <a
            href="https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/components/OffRampFlow.svelte"
            target="_blank"
            class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
            View Component Source Code
        </a>
    </div>
</section>
