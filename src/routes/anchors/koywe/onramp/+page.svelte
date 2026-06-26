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
    import { getUsdcAsset } from '$lib/wallet/stellar';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as koywe from '$lib/api/koywe';
    import { resolveFiatLimits } from '$lib/anchors/koywe';
    import type { StellarNetwork } from '$lib/wallet/types';
    import { page } from '$app/state';
    import { getKoyweMarket, KOYWE_MARKETS, DEFAULT_KOYWE_REGION } from '$lib/config/koyweMarkets';
    import type {
        KoywePaymentMethod,
        KoyweQuote,
        KoyweOnRampOrder,
        KoyweAccountCheck,
        KoyweOrder,
    } from '$lib/anchors/koywe';

    // ------------------------------------------------------------------
    // Region & token derivation (Koywe — region from ?region= query param)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;

    const requestedRegion = $derived(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION);
    const market = $derived(getKoyweMarket(requestedRegion) ?? KOYWE_MARKETS[DEFAULT_KOYWE_REGION]);
    const fiatCurrency = $derived(market.currency);
    const tokenSymbol = 'USDC';
    // Koywe returns no Stellar issuer; inject the network-correct USDC issuer.
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step =
        | 'connect'
        | 'identity'
        | 'kyc'
        | 'method'
        | 'amount'
        | 'quote'
        | 'payment'
        | 'complete';
    let step = $state<Step>('connect');

    // Identity + KYC
    let email = $state('');
    let accountCheck = $state<KoyweAccountCheck | null>(null);
    // Initial market for the one-time KYC-form defaults (the reactive `market`
    // above drives all display values; users visit one region per page load).
    const initialMarket =
        getKoyweMarket(page.url.searchParams.get('region') ?? DEFAULT_KOYWE_REGION) ??
        KOYWE_MARKETS[DEFAULT_KOYWE_REGION];
    let kycForm = $state({
        documentNumber: '',
        documentType: initialMarket.documentType,
        documentCountry: initialMarket.countryCode,
        names: '',
        firstLastname: '',
        dob: '',
        phoneNumber: '',
        activity: '',
        nationality: initialMarket.countryCode,
        gender: '' as '' | 'H' | 'M' | 'O',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        neighborhood: '',
    });

    // Payment method (rail) selection
    let paymentMethods = $state<KoywePaymentMethod[]>([]);
    let selectedMethodId = $state<string | null>(null);

    // Ramp state
    let amount = $state('');
    let quote = $state<KoyweQuote | null>(null);
    let order = $state<KoyweOnRampOrder | null>(null);
    // Latest polled order, carrying lifecycle diagnostics (dates, txHash, statusDetails).
    let lifecycle = $state<KoyweOrder | null>(null);
    // Koywe per-currency transaction limits for ARS → USDC Stellar (step 3).
    let limits = $state<{ min?: number; max?: number } | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const orderPoller = createPoller({ intervalMs: 5000, maxAttempts: 60, onTick: pollOrder });

    const selectedMethod = $derived(paymentMethods.find((m) => m.id === selectedMethodId) ?? null);

    const emailValid = $derived(email.trim().length > 0 && email.includes('@'));

    const amountOutOfRange = $derived.by(() => {
        if (!amount || !limits) return false;
        const n = parseFloat(amount);
        if (limits.min !== undefined && n < limits.min) return true;
        if (limits.max !== undefined && n > limits.max) return true;
        return false;
    });

    // Adapt KoyweQuote to the QuoteDisplay structural shape.
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
    // KYC + payment-method discovery
    // ------------------------------------------------------------------

    /** Load payment rails and default the selection (first rail-backed, else first). */
    async function loadPaymentMethods() {
        paymentMethods = await koywe.getPaymentProviders(fetch, fiatCurrency);
        selectedMethodId = paymentMethods.find((m) => m.rail)?.id ?? paymentMethods[0]?.id ?? null;
        // Step 3 (GetCurrencyTokens): confirm the pair is supported and read its limits.
        const tokens = await koywe.getTokenCurrencies(fetch);
        const resolved = resolveFiatLimits(tokens, fiatCurrency);
        if (!resolved) {
            throw new Error(`Koywe does not support ${fiatCurrency} → ${tokenSymbol}.`);
        }
        limits = resolved;
    }

    async function checkKyc() {
        if (!emailValid) return;
        isWorking = true;
        error = null;
        try {
            accountCheck = await koywe.checkAccount(fetch, email);
            // No account yet → collect KYC; otherwise proceed (operability is shown).
            if (accountCheck.accountStatus === 'not_started') {
                step = 'kyc';
            } else {
                await loadPaymentMethods();
                step = 'method';
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to check Koywe account status';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        kycForm = { ...market.testData };
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
            await loadPaymentMethods();
            step = 'method';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit Koywe KYC';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Quote
    // ------------------------------------------------------------------

    async function getQuote() {
        if (!amount || !selectedMethodId) return;
        isWorking = true;
        error = null;
        try {
            quote = await koywe.getQuote(fetch, {
                ramp: 'onramp',
                fiatCurrency,
                amount,
                paymentMethodId: selectedMethodId,
            });
            step = 'quote';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get quote';
        } finally {
            isWorking = false;
        }
    }

    async function refreshQuote() {
        if (!amount || !selectedMethodId) return;
        isWorking = true;
        try {
            quote = await koywe.getQuote(fetch, {
                ramp: 'onramp',
                fiatCurrency,
                amount,
                paymentMethodId: selectedMethodId,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Order creation + polling
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            order = await koywe.createOnRampOrder(fetch, {
                quoteId: quote.id,
                stellarAddress: walletStore.publicKey,
                email,
            });
            step = 'payment';
            orderPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create order';
        } finally {
            isWorking = false;
        }
    }

    async function pollOrder({ stop }: { stop: () => void }) {
        if (!order) return;
        const updated = await koywe.getOrder(fetch, order.id, email);
        if (!updated) return;
        // Keep the full polled order for lifecycle diagnostics, and merge its
        // status onto our order (preserving the deposit instructions).
        lifecycle = updated;
        order = { ...order, status: updated.status };
        if (updated.status === 'DELIVERED') {
            step = 'complete';
            stop();
        } else if (updated.isDeliveryExpired) {
            error =
                'Koywe stopped retrying the on-chain delivery, so this order will not complete. The fiat payment was received but the USDC was never sent.';
            stop();
        } else if (
            updated.status === 'REJECTED' ||
            updated.status === 'INVALID_WITHDRAWALS_DETAILS'
        ) {
            error = `Order ${updated.status.toLowerCase().replace(/_/g, ' ')}`;
            stop();
        }
    }

    // ------------------------------------------------------------------
    // Reset / lifecycle
    // ------------------------------------------------------------------

    function reset() {
        amount = '';
        quote = null;
        order = null;
        lifecycle = null;
        error = null;
        step = 'method';
        orderPoller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => orderPoller.stop();
    });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/koywe')} class="text-sm text-indigo-600 hover:underline">
                ← Koywe
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                On-Ramp ({fiatCurrency} → {tokenSymbol})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Buy {tokenSymbol} on Stellar with {fiatCurrency} via Koywe's local rails.
            </p>
        </div>
        <WalletConnect />
    </header>

    <!-- =================== CONNECT / ONBOARD ===================== -->
    {#if step === 'connect'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if !walletStore.isConnected}
                <h2 class="text-lg font-semibold text-gray-900">Connect your wallet</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Koywe delivers USDC to your Stellar public key. Connect Freighter to continue.
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
                        Koywe verifies your identity before delivering USDC. Enter your details
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
                            <option value="H">Male</option>
                            <option value="M">Female</option>
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

    <!-- =================== PAYMENT METHOD ======================== -->
    {#if step === 'method'}
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
                        You can continue, but Koywe will only deliver USDC once verification
                        completes.
                    </p>
                </div>
            {/if}

            <h2 class="text-lg font-semibold text-gray-900">Choose a payment method</h2>
            <p class="mt-1 text-sm text-gray-500">
                Select how you'll send {fiatCurrency} to Koywe.
            </p>

            <div class="mt-4 space-y-2">
                {#each paymentMethods as method (method.id)}
                    <label
                        class="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm
                            {selectedMethodId === method.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'}"
                    >
                        <input
                            type="radio"
                            name="paymentMethod"
                            value={method.id}
                            checked={selectedMethodId === method.id}
                            onchange={() => (selectedMethodId = method.id)}
                            class="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                            <p class="font-medium">{method.label}</p>
                            <p class="text-xs text-gray-500">{method.name}</p>
                        </div>
                    </label>
                {/each}
            </div>

            <button
                onclick={() => (step = 'amount')}
                disabled={!selectedMethodId}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                Continue
            </button>
        </div>
    {/if}

    <!-- =================== AMOUNT ================================ -->
    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Amount</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the {fiatCurrency} amount to convert to {tokenSymbol}.
            </p>

            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />

            <AmountInput
                bind:amount
                label="Amount ({fiatCurrency})"
                placeholder="10000"
                inputPrefix="$"
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                additionalDisabled={amountOutOfRange}
                onSubmit={getQuote}
            >
                {#if limits}
                    <p class="mt-1 text-sm text-gray-500">
                        Koywe limits: min ${limits.min?.toLocaleString() ?? '—'} · max ${limits.max?.toLocaleString() ??
                            '—'}
                    </p>
                    {#if amountOutOfRange}
                        <p class="mt-1 text-sm text-red-600">
                            Enter an amount within Koywe's {fiatCurrency} limits.
                        </p>
                    {/if}
                {/if}
            </AmountInput>
        </div>
    {/if}

    <!-- =================== QUOTE ================================= -->
    {#if step === 'quote' && displayQuote}
        <div class="space-y-4">
            <QuoteDisplay quote={displayQuote} onRefresh={refreshQuote} isRefreshing={isWorking} />
            {#if selectedMethod}
                <div class="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    <span class="text-gray-500">Paying via</span>
                    <span class="ml-1 font-medium">{selectedMethod.label}</span>
                </div>
            {/if}
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
                    {isWorking ? 'Creating order…' : 'Confirm & get instructions'}
                </button>
            </div>
        </div>
    {/if}

    <!-- =================== PAYMENT =============================== -->
    {#if step === 'payment' && order}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Send {fiatCurrency}</h2>
                <span
                    class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                >
                    {order.status}
                </span>
            </div>

            {#if order.deposit?.cvu}
                <!-- WIREAR: inline CVU bank-transfer instructions -->
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    <div>
                        <span class="text-gray-500">CVU</span>
                        <p class="font-medium">
                            <CopyableField value={order.deposit.cvu} mono />
                        </p>
                    </div>
                    {#if order.deposit.alias}
                        <div>
                            <span class="text-gray-500">Alias</span>
                            <p class="font-medium">
                                <CopyableField value={order.deposit.alias} mono />
                            </p>
                        </div>
                    {/if}
                    {#if order.deposit.bankName}
                        <div>
                            <span class="text-gray-500">Bank</span>
                            <p class="font-medium">{order.deposit.bankName}</p>
                        </div>
                    {/if}
                    <div class="border-t border-gray-200 pt-3">
                        <span class="text-gray-500">Amount</span>
                        <p class="text-xl font-bold text-indigo-600">
                            <CopyableField
                                value="{parseFloat(
                                    order.sourceAmount,
                                ).toLocaleString()} {fiatCurrency}"
                            />
                        </p>
                    </div>
                </div>
            {:else if order.interactiveUrl}
                <!-- QRI / Khipu: hosted redirect (opens in a new tab) -->
                <div class="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                    <p>
                        Complete your {fiatCurrency} payment in Koywe's hosted flow, which opens in a
                        new tab. Return here when done — we'll detect delivery automatically.
                    </p>
                    <a
                        href={order.interactiveUrl}
                        target="_blank"
                        rel="noopener"
                        class="mt-3 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Open payment ↗
                    </a>
                </div>
            {:else}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    No payment instructions were returned for this order. Order ID:
                    <CopyableField value={order.id} mono />
                </div>
            {/if}

            <div class="mt-6">
                {#if orderPoller.timedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">Still processing</p>
                        <p class="mt-1">
                            We haven't detected delivery yet. You can close this page and check back
                            later.
                        </p>
                        <div class="mt-3">
                            <span class="text-xs text-amber-600">Order ID</span>
                            <p class="mt-0.5"><CopyableField value={order.id} mono /></p>
                        </div>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        Waiting for confirmation… polling Koywe.
                    </p>
                {/if}
            </div>

            {#if lifecycle?.dates}
                {@const d = lifecycle.dates}
                <div class="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-xs">
                    <p class="font-medium text-gray-700">Order lifecycle</p>
                    <ul class="mt-2 space-y-1 text-gray-600">
                        <li>{d.confirmationDate ? '✓' : '○'} Order confirmed</li>
                        <li>{d.paymentDate ? '✓' : '○'} Fiat payment received</li>
                        <li>{d.executionDate ? '✓' : '○'} On-chain delivery started</li>
                        <li>{d.deliveryDate ? '✓' : '○'} USDC delivered</li>
                        {#if d.expiredByRetriesDate}
                            <li class="text-red-600">✗ Delivery expired after retries</li>
                        {/if}
                    </ul>
                    {#if lifecycle.txHash}
                        <p class="mt-2 text-gray-500">
                            Tx: <span class="font-mono break-all">{lifecycle.txHash}</span>
                        </p>
                    {/if}
                    {#if lifecycle.statusDetails}
                        <p class="mt-1 text-gray-500">Detail: {lifecycle.statusDetails}</p>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && order}
        {@const completionDetails = order.destinationAmount
            ? [{ label: 'Amount', value: `${order.destinationAmount} ${tokenSymbol}` }]
            : []}
        <CompletionStep
            title="{tokenSymbol} delivered"
            message="Koywe sent {tokenSymbol} to your Stellar wallet."
            details={completionDetails}
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/koywe/onramp/+page.svelte',
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
