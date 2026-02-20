<!--
@component Fiat Account Step

Full fiat account selection/registration step for the off-ramp flow.
Displays saved accounts as radio buttons and a "new account" form.

Usage:
```html
<FiatAccountStep
    {savedAccounts}
    {isLoadingAccounts}
    bind:selectedAccountId
    bind:useNewAccount
    bind:bankName
    bind:clabe
    bind:beneficiary
    {isBankBeforeQuote}
    {hasQuote}
    {isGettingQuote}
    {isCreatingTransaction}
    onBack={handleBack}
    onSubmit={handleSubmit}
/>
```
-->
<script lang="ts">
    import type { SavedFiatAccount } from '$lib/anchors/types';

    interface Props {
        savedAccounts: SavedFiatAccount[];
        isLoadingAccounts: boolean;
        selectedAccountId: string | null;
        useNewAccount: boolean;
        bankName: string;
        clabe: string;
        beneficiary: string;
        isBankBeforeQuote: boolean;
        hasQuote: boolean;
        isGettingQuote: boolean;
        isCreatingTransaction: boolean;
        onBack: () => void;
        onSubmit: () => void;
    }

    let {
        savedAccounts,
        isLoadingAccounts,
        selectedAccountId = $bindable(),
        useNewAccount = $bindable(),
        bankName = $bindable(),
        clabe = $bindable(),
        beneficiary = $bindable(),
        isBankBeforeQuote,
        hasQuote,
        isGettingQuote,
        isCreatingTransaction,
        onBack,
        onSubmit,
    }: Props = $props();

    const showNewAccountForm = $derived(useNewAccount || savedAccounts.length === 0);

    const isSubmitDisabled = $derived(
        isLoadingAccounts ||
            (isBankBeforeQuote && !hasQuote ? isGettingQuote : isCreatingTransaction) ||
            (useNewAccount ? !clabe || !beneficiary : !selectedAccountId),
    );

    const submitLabel = $derived.by(() => {
        if (isBankBeforeQuote && !hasQuote) {
            return isGettingQuote ? 'Getting Quote...' : 'Continue';
        }
        return isCreatingTransaction ? 'Processing...' : 'Confirm & Sign';
    });
</script>

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
                    <p class="mb-2 block text-sm font-medium text-gray-700">Saved Accounts</p>
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
                                    checked={selectedAccountId === account.id && !useNewAccount}
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
                                        {/if}{account.accountNumber || account.id.slice(0, 8)}
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
                                <p class="text-sm font-medium text-gray-900">Use a new account</p>
                            </div>
                        </label>
                    </div>
                </div>
            {/if}

            {#if showNewAccountForm}
                <div
                    class="space-y-4 {savedAccounts.length > 0
                        ? 'border-t border-gray-200 pt-4'
                        : ''}"
                >
                    {#if savedAccounts.length > 0}
                        <p class="text-sm font-medium text-gray-700">New Account Details</p>
                    {/if}

                    <div>
                        <label for="bankName" class="block text-sm font-medium text-gray-700"
                            >Bank Name</label
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
                        <label for="beneficiary" class="block text-sm font-medium text-gray-700"
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
            onclick={onBack}
            class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
            Back
        </button>
        <button
            onclick={onSubmit}
            disabled={isSubmitDisabled}
            class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
            {submitLabel}
        </button>
    </div>
</div>
