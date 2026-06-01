<script lang="ts">
    import { onMount } from 'svelte';
    import { resolve } from '$app/paths';
    import { PUBLIC_STELLAR_NETWORK, PUBLIC_USDC_ISSUER } from '$env/static/public';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import QuoteDisplay from '$lib/components/QuoteDisplay.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getUsdcAsset, buildPaymentTransaction, submitTransaction } from '$lib/wallet/stellar';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as koywe from '$lib/api/koywe';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type { KoyweQuote, KoyweOffRampOrder, KoyweAccountCheck } from '$lib/anchors/koywe';

    // ------------------------------------------------------------------
    // Region & token derivation (Koywe Argentina — USDC on Stellar → ARS)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const fiatCurrency = 'ARS';
    const fiatCountry = 'ARG';
    const tokenSymbol = 'USDC';
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step =
        | 'connect'
        | 'identity'
        | 'kyc'
        | 'account'
        | 'amount'
        | 'quote'
        | 'signing'
        | 'awaiting-payout'
        | 'complete';
    let step = $state<Step>('connect');

    // Identity + KYC
    let email = $state('');
    let accountCheck = $state<KoyweAccountCheck | null>(null);
    let kycForm = $state({
        documentNumber: '',
        documentType: 'DNI',
        documentCountry: 'ARG',
        names: '',
        firstLastname: '',
        dob: '',
        phoneNumber: '',
        activity: '',
        nationality: 'ARG',
        gender: '' as '' | 'M' | 'F' | 'O',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        neighborhood: '',
    });

    // Payout account: the user enters a CVU/account number, which we register
    // with Koywe (POST /rest/bank-accounts) to obtain the bank-account id the
    // off-ramp order references as its destinationAddress.
    //
    // TODO(koywe): off-ramp is BLOCKED here (integration paused 2026-06-01).
    // POST /rest/bank-accounts rejects even Koywe's own documented DNI↔CVU test
    // pairs with a 400 ownership-validation error, and the whitelisted DNIs are
    // single-use. Both are Koywe sandbox-side; document upload
    // (POST /upload-delegated-kyc-files) is also not yet built. See the koywe
    // README "TODO — remaining Koywe work" section for the full list.
    let accountNumber = $state('');
    let bankAccountId = $state('');

    // Ramp state
    let amount = $state('');
    let quote = $state<KoyweQuote | null>(null);
    let order = $state<KoyweOffRampOrder | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const payoutPoller = createPoller({ intervalMs: 5000, maxAttempts: 60, onTick: pollPayout });

    const emailValid = $derived(email.trim().length > 0 && email.includes('@'));

    const displayQuote = $derived(
        quote
            ? {
                  id: quote.id,
                  fromCurrency: quote.sourceAsset,
                  toCurrency: quote.targetAsset,
                  fromAmount: quote.sourceAmount,
                  toAmount: quote.destinationAmount,
                  exchangeRate: quote.exchangeRate,
                  fee: quote.fee,
                  expiresAt: quote.expiresAt,
              }
            : null,
    );

    // ------------------------------------------------------------------
    // KYC discovery + submission
    // ------------------------------------------------------------------

    async function checkKyc() {
        if (!emailValid) return;
        isWorking = true;
        error = null;
        try {
            accountCheck = await koywe.checkAccount(fetch, email);
            // No account yet → collect KYC; otherwise show the real check result.
            step = accountCheck.accountStatus === 'not_started' ? 'kyc' : 'account';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to check Koywe account status';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        // Sandbox: off-ramp bank accounts are ownership-validated, so the document
        // number must be one of Koywe's whitelisted DNIs and the CVU must be its
        // paired value. This uses the pair (34770518 ↔ 0000242600000000009120).
        // Use a *fresh email* — an existing account is locked to its first DNI.
        kycForm = {
            documentNumber: '34770518',
            documentType: 'DNI',
            documentCountry: 'ARG',
            names: 'Test',
            firstLastname: 'User',
            dob: '1990-01-01',
            phoneNumber: '+5491155551234',
            activity: 'Software Engineer',
            nationality: 'ARG',
            gender: 'O',
            street: 'Av. 9 de Julio 1000',
            city: 'Buenos Aires',
            state: 'CABA',
            zipCode: 'C1043',
            neighborhood: 'Centro',
        };
        accountNumber = '0000242600000000009120';
    }

    async function submitKyc() {
        isWorking = true;
        error = null;
        try {
            await koywe.createAccount(fetch, {
                email,
                document: {
                    documentNumber: kycForm.documentNumber,
                    documentType: kycForm.documentType,
                    country: kycForm.documentCountry,
                },
                address: {
                    country: kycForm.documentCountry,
                    zipCode: kycForm.zipCode,
                    state: kycForm.state,
                    city: kycForm.city,
                    street: kycForm.street,
                    neighborhood: kycForm.neighborhood || undefined,
                },
                personalInfo: {
                    names: kycForm.names,
                    dob: kycForm.dob,
                    phoneNumber: kycForm.phoneNumber,
                    activity: kycForm.activity,
                    firstLastname: kycForm.firstLastname || undefined,
                    nationality: kycForm.nationality || undefined,
                    gender: kycForm.gender || undefined,
                },
            });
            // Re-check operability; the account may not be verified synchronously.
            accountCheck = await koywe.checkAccount(fetch, email);
            step = 'account';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit Koywe KYC';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Payout bank account (register, then reference by id in the order)
    // ------------------------------------------------------------------

    async function registerBankAccount() {
        const number = accountNumber.trim();
        if (!number) return;
        isWorking = true;
        error = null;
        try {
            // Idempotent: re-registering the same account 400s, so reuse an
            // existing one if the user already added this CVU.
            const existing = await koywe.getBankAccounts(fetch, {
                email,
                countryCode: fiatCountry,
                currencySymbol: fiatCurrency,
            });
            const match = existing.find((a) => a.accountNumber === number);
            const account =
                match ??
                (await koywe.createBankAccount(fetch, {
                    email,
                    accountNumber: number,
                    countryCode: fiatCountry,
                    currencySymbol: fiatCurrency,
                    documentNumber: kycForm.documentNumber || undefined,
                }));
            bankAccountId = account.id;
            step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to register bank account';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Quote
    // ------------------------------------------------------------------

    async function getQuote() {
        if (!amount) return;
        isWorking = true;
        error = null;
        try {
            quote = await koywe.getQuote(fetch, { ramp: 'offramp', fiatCurrency, amount });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isWorking = false;
        }
    }

    async function refreshQuote() {
        if (!amount) return;
        isWorking = true;
        try {
            quote = await koywe.getQuote(fetch, { ramp: 'offramp', fiatCurrency, amount });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Order creation → sign USDC payment → submit tx hash → poll payout
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !walletStore.publicKey || !bankAccountId) return;
        isWorking = true;
        error = null;
        try {
            order = await koywe.createOffRampOrder(fetch, {
                quoteId: quote.id,
                bankAccountId,
                email,
            });
            if (!order.depositAddress) {
                throw new Error('Koywe did not return a deposit address for this order');
            }
            await signAndSubmit(order.depositAddress, order.sourceAmount);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create order';
        } finally {
            isWorking = false;
        }
    }

    async function signAndSubmit(destination: string, usdcAmount: string) {
        if (!walletStore.publicKey || !order) return;
        step = 'signing';
        try {
            const xdr = await buildPaymentTransaction({
                sourcePublicKey: walletStore.publicKey,
                destinationPublicKey: destination,
                asset: stellarAsset,
                amount: usdcAmount,
                network,
            });
            const signed = await signWithFreighter(xdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            await koywe.submitTxHash(fetch, order.id, result.hash, email);
            step = 'awaiting-payout';
            payoutPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to send USDC';
            step = 'quote';
        }
    }

    async function pollPayout({ stop }: { stop: () => void }) {
        if (!order) return;
        const updated = await koywe.getOrder(fetch, order.id, email);
        if (!updated) return;
        order = { ...order, status: updated.status };
        if (updated.status === 'DELIVERED') {
            step = 'complete';
            stop();
        } else if (
            updated.status === 'REJECTED' ||
            updated.status === 'INVALID_WITHDRAWALS_DETAILS'
        ) {
            error = `Order ${updated.status.toLowerCase().replace(/_/g, ' ')}`;
            stop();
        }
    }

    function reset() {
        amount = '';
        quote = null;
        order = null;
        stellarTxHash = null;
        error = null;
        step = 'account';
        payoutPoller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => payoutPoller.stop();
    });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/koywe')} class="text-sm text-indigo-600 hover:underline">
                ← Koywe
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                Off-Ramp ({tokenSymbol} → {fiatCurrency})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Sell {tokenSymbol} on Stellar for {fiatCurrency} via Koywe.
            </p>
        </div>
        <WalletConnect />
    </header>

    <!-- =================== CONNECT ============================== -->
    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if !walletStore.isConnected}
                <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
                <p class="mt-1 text-sm text-gray-500">
                    You'll send {tokenSymbol} from this Stellar wallet. Connect Freighter to continue.
                </p>
            {:else}
                <h2 class="text-lg font-semibold text-gray-900">Start</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Next we'll identify your Koywe account and check your KYC status.
                </p>
                <button
                    onclick={() => (step = 'identity')}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    Continue
                </button>
            {/if}
        </div>
    {/if}

    <!-- =================== IDENTITY ============================== -->
    {#if step === 'identity'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Your email</h2>
            <p class="mt-1 text-sm text-gray-500">
                Koywe scopes your account and KYC to an email address.
            </p>

            <label class="mt-4 block">
                <span class="text-sm font-medium text-gray-700">Email</span>
                <input
                    type="email"
                    bind:value={email}
                    placeholder="you@example.com"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

            <button
                onclick={checkKyc}
                disabled={!emailValid || isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Checking…' : 'Continue'}
            </button>
        </div>
    {/if}

    <!-- =================== KYC =================================== -->
    {#if step === 'kyc'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-start justify-between">
                <div>
                    <h2 class="text-lg font-semibold text-gray-900">Identity verification</h2>
                    <p class="mt-1 text-sm text-gray-500">
                        Koywe verifies your identity before paying out fiat. Enter your details
                        below.
                    </p>
                </div>
                <button
                    onclick={fillTestData}
                    class="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                    Fill test data
                </button>
            </div>

            <!-- Document -->
            <fieldset class="mt-6">
                <legend class="text-sm font-semibold text-gray-900">Document</legend>
                <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label class="block sm:col-span-1">
                        <span class="text-xs font-medium text-gray-700">Type</span>
                        <input
                            type="text"
                            bind:value={kycForm.documentType}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block sm:col-span-1">
                        <span class="text-xs font-medium text-gray-700">Number</span>
                        <input
                            type="text"
                            bind:value={kycForm.documentNumber}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block sm:col-span-1">
                        <span class="text-xs font-medium text-gray-700">Country</span>
                        <input
                            type="text"
                            bind:value={kycForm.documentCountry}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                </div>
            </fieldset>

            <!-- Personal -->
            <fieldset class="mt-6">
                <legend class="text-sm font-semibold text-gray-900">Personal</legend>
                <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">First name(s)</span>
                        <input
                            type="text"
                            bind:value={kycForm.names}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Last name</span>
                        <input
                            type="text"
                            bind:value={kycForm.firstLastname}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Date of birth</span>
                        <input
                            type="date"
                            bind:value={kycForm.dob}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Phone number</span>
                        <input
                            type="tel"
                            bind:value={kycForm.phoneNumber}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Activity</span>
                        <input
                            type="text"
                            bind:value={kycForm.activity}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Nationality</span>
                        <input
                            type="text"
                            bind:value={kycForm.nationality}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Gender</span>
                        <select
                            bind:value={kycForm.gender}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        >
                            <option value="">Select…</option>
                            <option value="M">Male</option>
                            <option value="F">Female</option>
                            <option value="O">Other</option>
                        </select>
                    </label>
                </div>
            </fieldset>

            <!-- Address -->
            <fieldset class="mt-6">
                <legend class="text-sm font-semibold text-gray-900">Address</legend>
                <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="block sm:col-span-2">
                        <span class="text-xs font-medium text-gray-700">Street</span>
                        <input
                            type="text"
                            bind:value={kycForm.street}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">City</span>
                        <input
                            type="text"
                            bind:value={kycForm.city}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">State / Province</span>
                        <input
                            type="text"
                            bind:value={kycForm.state}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Zip code</span>
                        <input
                            type="text"
                            bind:value={kycForm.zipCode}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                    <label class="block">
                        <span class="text-xs font-medium text-gray-700">Neighborhood</span>
                        <input
                            type="text"
                            bind:value={kycForm.neighborhood}
                            class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </label>
                </div>
            </fieldset>

            <button
                onclick={submitKyc}
                disabled={isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Submitting…' : 'Submit KYC'}
            </button>
        </div>
    {/if}

    <!-- =================== PAYOUT ACCOUNT ======================= -->
    {#if step === 'account'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if accountCheck && !accountCheck.canOperate}
                <div class="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    <p class="font-medium">
                        Koywe can't operate this account yet (status: {accountCheck.accountStatus}).
                    </p>
                    {#if accountCheck.missing.length > 0}
                        <p class="mt-1">Still needed by Koywe:</p>
                        <ul class="mt-1 list-disc pl-4">
                            {#each accountCheck.missing as item (item.field)}
                                <li>
                                    {item.message} <span class="opacity-60">({item.field})</span>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                    <p class="mt-1">
                        You can continue, but Koywe will only pay out once verification completes.
                    </p>
                </div>
            {/if}

            <h2 class="text-lg font-semibold text-gray-900">Payout account</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the CVU (account number) that will receive your {fiatCurrency}. We'll register
                it with Koywe as your payout account.
            </p>
            <label class="mt-4 block text-sm font-medium text-gray-700" for="accountNumber">
                CVU / account number
            </label>
            <input
                id="accountNumber"
                type="text"
                bind:value={accountNumber}
                placeholder="0000242600000000009120"
                class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
            <p class="mt-2 text-xs text-amber-700">
                Heads up: Koywe's sandbox currently rejects bank-account registration with a
                validation error even for its own documented DNI↔CVU test pairs (e.g. DNI
                <span class="font-mono">34770518</span> ↔ CVU
                <span class="font-mono">0000242600000000009120</span>, which "Fill test data" uses).
                This is a known Koywe-side limitation — the off-ramp can't complete past this step
                until it's resolved.
            </p>
            <button
                onclick={registerBankAccount}
                disabled={!accountNumber.trim() || isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Registering…' : 'Register & continue'}
            </button>
        </div>
    {/if}

    <!-- =================== AMOUNT ================================ -->
    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the {tokenSymbol} amount to convert to {fiatCurrency}.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                showBalance
                balanceCurrency={tokenSymbol}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount ({tokenSymbol})"
                placeholder="10"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={getQuote}
            />
        </div>
    {/if}

    <!-- =================== QUOTE ================================= -->
    {#if step === 'quote' && displayQuote}
        <div class="space-y-4">
            <QuoteDisplay quote={displayQuote} onRefresh={refreshQuote} isRefreshing={isWorking} />
            <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                <span class="text-gray-500">Payout to</span>
                <span class="ml-1 font-mono text-gray-600">{accountNumber}</span>
            </div>
            <div class="flex gap-3">
                <button
                    onclick={() => (step = 'amount')}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onclick={confirmQuote}
                    disabled={isWorking}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isWorking ? 'Creating order…' : 'Confirm & send USDC'}
                </button>
            </div>
        </div>
    {/if}

    <!-- =================== SIGNING =============================== -->
    {#if step === 'signing'}
        <div class="rounded-lg border border-indigo-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Sign in Freighter</h2>
            <p class="mt-1 text-sm text-gray-500">
                A Freighter window should be open. Confirm the {tokenSymbol} payment to Koywe's deposit
                address.
            </p>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Awaiting signature…</span>
            </div>
        </div>
    {/if}

    <!-- =================== AWAITING PAYOUT ======================= -->
    {#if step === 'awaiting-payout' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Awaiting fiat payout</h2>
            <p class="mt-1 text-sm text-gray-500">
                Your {tokenSymbol} payment is on its way. Koywe is sending {fiatCurrency} to your bank
                account.
            </p>
            <div class="mt-4 space-y-1 text-sm text-gray-600">
                {#if stellarTxHash}
                    <p>
                        Stellar tx:
                        <a
                            href="https://stellar.expert/explorer/{network}/tx/{stellarTxHash}"
                            target="_blank"
                            rel="noopener"
                            class="text-indigo-600 hover:underline"
                        >
                            {stellarTxHash.slice(0, 12)}…↗
                        </a>
                    </p>
                {/if}
                <p>Order: <CopyableField value={order.id} mono /></p>
                <p>Status: <span class="font-mono">{order.status}</span></p>
            </div>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling Koywe…</span>
            </div>
            {#if payoutPoller.timedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still processing</p>
                    <p class="mt-1">
                        Koywe hasn't confirmed the payout yet. You can close this page and check
                        back later.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && order}
        {@const completionDetails = order.destinationAmount
            ? [{ label: 'Amount', value: `${order.destinationAmount} ${fiatCurrency}` }]
            : []}
        {@const completionLinks = stellarTxHash
            ? [
                  {
                      label: 'View payment on Stellar Expert ↗',
                      href: `https://stellar.expert/explorer/${network}/tx/${stellarTxHash}`,
                  },
              ]
            : []}
        <CompletionStep
            title="{fiatCurrency} sent"
            message="Koywe sent {fiatCurrency} to your bank account."
            details={completionDetails}
            links={completionLinks}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={clearError} />
    {/if}
</div>

<section class="mx-auto mt-8 max-w-2xl px-4">
    <DevBox
        items={[
            {
                text: 'View this page source',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/koywe/offramp/+page.svelte',
            },
            {
                text: 'View KoyweClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/koywe/client.ts',
            },
            {
                text: 'View Koywe API routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor/koywe',
            },
        ]}
    />
</section>
