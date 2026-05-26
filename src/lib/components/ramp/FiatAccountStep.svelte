<!--
@component Fiat Account Step

Full fiat account selection/registration step for the off-ramp flow.
Displays saved accounts as radio buttons.

For anchors with `fiatAccountRegistration: 'inline'` (default), shows a manual
SPEI (Mexico) or PIX (Brazil) form for entering new account details.

For anchors with `fiatAccountRegistration: 'hosted'` (e.g. Etherfuse), shows
a "Register a Bank Account" button that defers to the anchor's hosted onboarding
UI. The parent component is responsible for opening the URL and refreshing
the saved-accounts list.
-->
<script lang="ts">
    import type { SavedFiatAccount } from '$lib/anchors/types';
    import {
        SANDBOX_SPEI_ACCOUNT,
        SANDBOX_PIX_ACCOUNT,
        SANDBOX_PIX_KEYS,
    } from '$lib/anchors/sandbox';

    interface Props {
        savedAccounts: SavedFiatAccount[];
        isLoadingAccounts: boolean;
        selectedAccountId: string | null;
        useNewAccount: boolean;
        /** SPEI fields (Mexico) — only used when fiatAccountRegistration is 'inline'. */
        bankName: string;
        clabe: string;
        beneficiary: string;
        /** PIX fields (Brazil) — only used when fiatAccountRegistration is 'inline'. */
        pixKey: string;
        pixKeyType: string;
        taxId: string;
        accountHolderName: string;
        /** Payment rail determines which inline form fields to show. Defaults to 'spei'. */
        paymentRail: string;
        isBankBeforeQuote: boolean;
        hasQuote: boolean;
        isGettingQuote: boolean;
        isCreatingTransaction: boolean;
        /** How new accounts are registered. Defaults to 'inline'. */
        fiatAccountRegistration?: 'inline' | 'hosted';
        /** Called when the user clicks "Register a Bank Account" in hosted mode. */
        onRegisterNewAccount?: () => void;
        /** Called when the user clicks "Refresh accounts" after returning from hosted registration. */
        onRefreshAccounts?: () => void;
        /** Whether a hosted registration popup is currently being opened. */
        isOpeningRegistration?: boolean;
        /** Whether the user has opened a hosted registration popup at least once. */
        hasOpenedRegistration?: boolean;
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
        pixKey = $bindable(),
        pixKeyType = $bindable(),
        taxId = $bindable(),
        accountHolderName = $bindable(),
        paymentRail = 'spei',
        isBankBeforeQuote,
        hasQuote,
        isGettingQuote,
        isCreatingTransaction,
        fiatAccountRegistration = 'inline',
        onRegisterNewAccount,
        onRefreshAccounts,
        isOpeningRegistration = false,
        hasOpenedRegistration = false,
        onBack,
        onSubmit,
    }: Props = $props();

    const isPix = $derived(paymentRail === 'pix');
    const isHosted = $derived(fiatAccountRegistration === 'hosted');
    const showNewAccountSection = $derived(useNewAccount || savedAccounts.length === 0);
    const pixKeyPlaceholder = $derived(SANDBOX_PIX_KEYS[pixKeyType] ?? '');

    function fillTestData() {
        if (isPix) {
            pixKey = SANDBOX_PIX_KEYS[pixKeyType] ?? SANDBOX_PIX_ACCOUNT.pixKey;
            taxId = SANDBOX_PIX_ACCOUNT.taxId;
            accountHolderName = SANDBOX_PIX_ACCOUNT.accountHolderName;
        } else {
            bankName = SANDBOX_SPEI_ACCOUNT.bankName;
            clabe = SANDBOX_SPEI_ACCOUNT.clabe;
            beneficiary = SANDBOX_SPEI_ACCOUNT.beneficiary;
        }
    }

    const isInlineFormValid = $derived.by(() => {
        if (isPix) {
            return !!pixKey && !!taxId && !!accountHolderName;
        }
        return !!clabe && !!beneficiary;
    });

    // Submit is disabled when:
    // - we're loading saved accounts, or
    // - a transaction/quote is already in flight, or
    // - in hosted mode and no saved account is selected (the "Register" button is the only way forward), or
    // - in inline mode with the new-account form open and the form is invalid, or
    // - in inline mode with no selection
    const isSubmitDisabled = $derived(
        isLoadingAccounts ||
            (isBankBeforeQuote && !hasQuote ? isGettingQuote : isCreatingTransaction) ||
            (isHosted
                ? !selectedAccountId
                : useNewAccount
                  ? !isInlineFormValid
                  : !selectedAccountId),
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

            {#if showNewAccountSection}
                <div
                    class="space-y-4 {savedAccounts.length > 0
                        ? 'border-t border-gray-200 pt-4'
                        : ''}"
                >
                    {#if savedAccounts.length > 0}
                        <p class="text-sm font-medium text-gray-700">New Account</p>
                    {/if}

                    {#if isHosted}
                        <div class="rounded-md bg-indigo-50 p-4 text-sm text-indigo-800">
                            <p>
                                You'll register a new bank account through your anchor's hosted
                                onboarding flow in a new window. Once you're done, come back and
                                click "Refresh accounts" to see it here.
                            </p>
                        </div>
                        <div class="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onclick={onRegisterNewAccount}
                                disabled={isOpeningRegistration}
                                class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isOpeningRegistration
                                    ? 'Opening...'
                                    : hasOpenedRegistration
                                      ? 'Reopen Registration'
                                      : 'Register a Bank Account'}
                            </button>
                            {#if hasOpenedRegistration}
                                <button
                                    type="button"
                                    onclick={onRefreshAccounts}
                                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Refresh accounts
                                </button>
                            {/if}
                        </div>
                    {:else}
                        <button
                            type="button"
                            onclick={fillTestData}
                            class="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                        >
                            Fill Test Data (Sandbox)
                        </button>

                        {#if isPix}
                            <!-- PIX fields (Brazil) -->
                            <div>
                                <label for="pixKey" class="block text-sm font-medium text-gray-700"
                                    >PIX Key</label
                                >
                                <input
                                    type="text"
                                    id="pixKey"
                                    bind:value={pixKey}
                                    placeholder={pixKeyPlaceholder}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label
                                    for="pixKeyType"
                                    class="block text-sm font-medium text-gray-700"
                                    >PIX Key Type</label
                                >
                                <select
                                    id="pixKeyType"
                                    bind:value={pixKeyType}
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                >
                                    <option value="cpf">CPF</option>
                                    <option value="cnpj">CNPJ</option>
                                    <option value="email">Email</option>
                                    <option value="phone">Phone</option>
                                    <option value="random">Random Key</option>
                                </select>
                            </div>

                            <div>
                                <label for="taxId" class="block text-sm font-medium text-gray-700"
                                    >CPF/CNPJ (Tax ID)</label
                                >
                                <input
                                    type="text"
                                    id="taxId"
                                    bind:value={taxId}
                                    placeholder="12345678901"
                                    class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>

                            <div>
                                <label
                                    for="accountHolderName"
                                    class="block text-sm font-medium text-gray-700"
                                    >Account Holder Name</label
                                >
                                <input
                                    type="text"
                                    id="accountHolderName"
                                    bind:value={accountHolderName}
                                    placeholder="Full name as registered with the bank"
                                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                />
                            </div>
                        {:else}
                            <!-- SPEI fields (Mexico) -->
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
                        {/if}
                    {/if}
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
