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
    import * as manteca from '$lib/api/manteca';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type {
        MantecaUser,
        MantecaQuote,
        MantecaSynthetic,
        MantecaWithdrawDestination,
    } from '$lib/anchors/manteca';

    // ------------------------------------------------------------------
    // Region & token derivation (Manteca Brazil — USDC on Stellar → BRL)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const fiatCurrency = 'BRL';
    const tokenSymbol = 'USDC';
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step =
        | 'connect'
        | 'identity'
        | 'kyc'
        | 'destination'
        | 'amount'
        | 'quote'
        | 'signing'
        | 'send'
        | 'complete';
    let step = $state<Step>('connect');

    // Identity + KYC
    let email = $state('');
    let cpf = $state('');
    let surname = $state('');
    let phoneNumber = $state('');
    let nationality = $state('');
    let sex = $state('');
    let maritalStatus = $state('');
    let birthDate = $state('');
    let street = $state('');
    let missingPersonalData = $state<string[]>([]);
    let user = $state<MantecaUser | null>(null);

    // Payout destination (PIX key)
    let pixKey = $state('');
    let destination = $state<MantecaWithdrawDestination | null>(null);

    // Ramp state
    let amount = $state('');
    let quote = $state<MantecaQuote | null>(null);
    let synthetic = $state<MantecaSynthetic | null>(null);
    let stellarTxHash = $state<string | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const payoutPoller = createPoller({ intervalMs: 5000, maxAttempts: 60, onTick: pollPayout });

    const emailValid = $derived(email.trim().length > 0 && email.includes('@'));

    // "Completing" mode: resuming a user that already has identity on file and a
    // known set of still-missing fields — show/require only those (submit via
    // define-personal-data). Otherwise it's a fresh create (full form).
    const completing = $derived(missingPersonalData.length > 0);
    const missingFieldKeys = $derived(
        new Set(
            missingPersonalData.map((p) => {
                const s = p.startsWith('personalData.') ? p.slice('personalData.'.length) : p;
                return s === 'address.street' ? 'street' : s;
            }),
        ),
    );
    function showField(key: string): boolean {
        return !completing || missingFieldKeys.has(key);
    }
    const kycValid = $derived.by(() => {
        const ok = (filled: boolean, key: string) => !showField(key) || filled;
        return (
            (completing || cpf.trim().length > 0) &&
            ok(surname.trim().length > 0, 'surname') &&
            ok(phoneNumber.trim().length > 0, 'phoneNumber') &&
            ok(nationality.trim().length > 0, 'nationality') &&
            ok(sex.trim().length > 0, 'sex') &&
            ok(maritalStatus.trim().length > 0, 'maritalStatus') &&
            ok(birthDate.trim().length > 0, 'birthDate') &&
            ok(street.trim().length > 0, 'street')
        );
    });

    // Adapt MantecaQuote → QuoteDisplay structural shape. Off-ramp: USDC in, BRL out.
    const displayQuote = $derived.by(() => {
        if (!quote) return null;
        const usdc = parseFloat(amount) || 0;
        const price = parseFloat(quote.price) || 0;
        const gross = usdc * price;
        const fee = gross * quote.spreadFraction;
        const brl = gross - fee;
        return {
            fromCurrency: tokenSymbol,
            toCurrency: fiatCurrency,
            fromAmount: usdc.toString(),
            toAmount: brl.toString(),
            exchangeRate: price.toString(),
            fee: fee.toString(),
            expiresAt: new Date(new Date(quote.quotedAt).getTime() + 60_000).toISOString(),
        };
    });

    // ------------------------------------------------------------------
    // Identity + KYC
    // ------------------------------------------------------------------

    async function createIdentity() {
        if (!emailValid) return;
        isWorking = true;
        error = null;
        try {
            // Detect an in-flight onboarding for this email and resume it rather
            // than re-creating (a duplicate create 409s / 500s). Creation itself
            // happens at the KYC step via submitOnboarding.
            const existing = await manteca.findUser(fetch, { email });
            if (!existing) {
                step = 'kyc';
            } else if (existing.canOperate) {
                user = existing;
                step = 'destination';
            } else if (existing.onboarding?.['IDENTITY_DECLARATION']?.status === 'COMPLETED') {
                // Identity is on file — resume KYC to finish any missing fields.
                user = existing;
                missingPersonalData = await manteca.getMissingPersonalData(
                    fetch,
                    existing.numberId,
                );
                step = 'kyc';
            } else {
                // A user exists for this email but has no identity/CPF on file (a bare
                // account). Manteca won't let us attach identity to an existing email,
                // so it can't be completed — surface that instead of looping.
                error =
                    'An incomplete account already exists for this email (no identity on file). Use a different email to onboard in the sandbox.';
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to look up Manteca user';
        } finally {
            isWorking = false;
        }
    }

    function fillTestData() {
        cpf = '12345678909';
        surname = 'SILVA';
        phoneNumber = '11999999999';
        nationality = 'Brasil';
        sex = 'F';
        maritalStatus = 'Soltero';
        birthDate = '1990-01-01';
        street = 'Av Paulista 1000';
    }

    async function submitKyc() {
        if (!kycValid) return;
        isWorking = true;
        error = null;
        try {
            // Only send non-empty fields (in completing mode just the missing ones
            // are shown/filled).
            const personalData = {
                ...(surname.trim() ? { surname } : {}),
                ...(phoneNumber.trim() ? { phoneNumber } : {}),
                ...(nationality.trim() ? { nationality } : {}),
                ...(sex.trim() ? { sex } : {}),
                ...(maritalStatus.trim() ? { maritalStatus } : {}),
                ...(birthDate.trim() ? { birthDate } : {}),
                ...(street.trim() ? { address: { street } } : {}),
            };
            if (user) {
                // Completing an existing user — submit only personalData (a fresh
                // submitOnboarding would 409 on the duplicate email/CPF).
                await manteca.definePersonalData(fetch, user.numberId, personalData);
            } else {
                // Fresh create — submitOnboarding creates the user AND runs KYC.
                try {
                    user = await manteca.submitOnboarding(fetch, {
                        email,
                        legalId: cpf,
                        personalData,
                    });
                } catch (err) {
                    // Already exists (dup email or CPF, 409) — recover and continue.
                    if (err instanceof manteca.MantecaApiError && err.statusCode === 409) {
                        user =
                            (await manteca.findUser(fetch, { legalId: cpf })) ??
                            (await manteca.findUser(fetch, { email }));
                        if (!user) throw err;
                    } else {
                        throw err;
                    }
                }
            }
            const refreshed = user ? await manteca.getUser(fetch, user.numberId) : null;
            if (refreshed) user = refreshed;
            // Discover any still-missing required personalData fields.
            missingPersonalData = user
                ? await manteca.getMissingPersonalData(fetch, user.numberId)
                : [];
            if (missingPersonalData.length > 0) return; // stay on kyc so the user can correct
            step = 'destination';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit Manteca KYC';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Payout destination (resolve the PIX key)
    // ------------------------------------------------------------------

    async function resolveDestination() {
        const key = pixKey.trim();
        if (!key) return;
        isWorking = true;
        error = null;
        try {
            destination = await manteca.getWithdrawDestinationInfo(fetch, key, 'BRAZIL');
            if (!destination.valid) {
                error = 'Manteca could not resolve this PIX key. Check it and try again.';
            }
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to resolve PIX key';
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
            quote = await manteca.getQuote(fetch, {
                ramp: 'offramp',
                asset: tokenSymbol,
                against: fiatCurrency,
            });
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
            quote = await manteca.getQuote(fetch, {
                ramp: 'offramp',
                asset: tokenSymbol,
                against: fiatCurrency,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to refresh quote';
        } finally {
            isWorking = false;
        }
    }

    // ------------------------------------------------------------------
    // Synthetic creation → sign USDC payment → poll payout
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !user || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            synthetic = await manteca.createRampOff(fetch, {
                userAnyId: user.numberId,
                asset: tokenSymbol,
                against: fiatCurrency,
                assetAmount: parseFloat(amount),
                destinationAddress: pixKey.trim(),
            });
            // Pick the STELLAR deposit address specifically — the `depositAddress`
            // scalar is the EVM address; the per-network map holds the Stellar
            // (muxed M…) address the USDC must be sent to.
            const stellarEntry = synthetic.details.depositAddresses?.STELLAR as
                | { address?: string }
                | undefined;
            const depositAddress = stellarEntry?.address;
            if (!depositAddress) {
                throw new Error('Manteca did not return a Stellar deposit address for this order');
            }
            await signAndSubmit(depositAddress, amount);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create off-ramp';
        } finally {
            isWorking = false;
        }
    }

    async function signAndSubmit(depositAddress: string, usdcAmount: string) {
        if (!walletStore.publicKey || !synthetic) return;
        step = 'signing';
        try {
            // Manteca assigns a per-user Stellar deposit address (no memo).
            const xdr = await buildPaymentTransaction({
                sourcePublicKey: walletStore.publicKey,
                destinationPublicKey: depositAddress,
                asset: stellarAsset,
                amount: usdcAmount,
                network,
            });
            const signed = await signWithFreighter(xdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'send';
            payoutPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to send USDC';
            step = 'quote';
        }
    }

    async function pollPayout({ stop }: { stop: () => void }) {
        if (!synthetic) return;
        const updated = await manteca.getSynthetic(fetch, synthetic.id);
        if (!updated) return;
        synthetic = updated;
        if (updated.failed) {
            error = `Manteca could not complete this off-ramp: ${updated.failureReason ?? 'a stage failed'}.`;
            stop();
        } else if (updated.isTerminal && updated.status === 'COMPLETED') {
            step = 'complete';
            stop();
        } else if (updated.status === 'CANCELLED') {
            error = 'Manteca cancelled this off-ramp.';
            stop();
        }
    }

    // ------------------------------------------------------------------
    // Reset / lifecycle
    // ------------------------------------------------------------------

    function reset() {
        amount = '';
        quote = null;
        synthetic = null;
        stellarTxHash = null;
        error = null;
        step = 'destination';
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
            <a href={resolve('/anchors/manteca')} class="text-sm text-indigo-600 hover:underline">
                ← Manteca
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                Off-Ramp ({tokenSymbol} → {fiatCurrency})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Sell {tokenSymbol} on Stellar for {fiatCurrency} via Manteca's PIX rail.
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
                    Next we'll create your Manteca user and run KYC.
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
                Manteca scopes your user account to an email address.
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
                onclick={createIdentity}
                disabled={!emailValid || isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Creating…' : 'Continue'}
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
                        Enter your CPF and personal details. Manteca auto-populates only your name,
                        birth date, and work from the CPF for Brazil — the rest is required.
                    </p>
                </div>
                <button
                    onclick={fillTestData}
                    class="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                    Fill test data
                </button>
            </div>

            {#if !completing}
                <label class="mt-6 block">
                    <span class="text-sm font-medium text-gray-700">CPF</span>
                    <input
                        type="text"
                        bind:value={cpf}
                        placeholder="000.000.000-00"
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if showField('surname')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Surname</span>
                    <input
                        type="text"
                        bind:value={surname}
                        placeholder="SILVA"
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if showField('phoneNumber')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Phone number</span>
                    <input
                        type="text"
                        bind:value={phoneNumber}
                        placeholder="11999999999"
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if showField('nationality')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Nationality</span>
                    <input
                        type="text"
                        bind:value={nationality}
                        placeholder="Brasil"
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if showField('sex')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Sex</span>
                    <select
                        bind:value={sex}
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="" disabled>Select…</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                    </select>
                </label>
            {/if}

            {#if showField('maritalStatus')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Marital status</span>
                    <select
                        bind:value={maritalStatus}
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="" disabled>Select…</option>
                        <option value="Soltero">Soltero</option>
                        <option value="Casado">Casado</option>
                        <option value="Divorciado">Divorciado</option>
                        <option value="Viudo">Viudo</option>
                        <option value="Otros">Otros</option>
                    </select>
                </label>
            {/if}

            {#if showField('birthDate')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Date of birth</span>
                    <input
                        type="date"
                        bind:value={birthDate}
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if showField('street')}
                <label class="mt-4 block">
                    <span class="text-sm font-medium text-gray-700">Address street</span>
                    <input
                        type="text"
                        bind:value={street}
                        placeholder="Av Paulista 1000"
                        class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                </label>
            {/if}

            {#if missingPersonalData.length > 0}
                <div class="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    <p class="font-medium">Manteca still needs more information</p>
                    <ul class="mt-1 list-inside list-disc">
                        {#each missingPersonalData as field (field)}
                            <li class="font-mono">{field}</li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if user && !user.canOperate}
                <p class="mt-3 text-xs text-amber-700">
                    Account status: <span class="font-mono">{user.status}</span>. You can continue
                    once Manteca activates the account; KYC may take a moment to settle.
                </p>
            {/if}

            <button
                onclick={submitKyc}
                disabled={!kycValid || isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isWorking ? 'Submitting…' : 'Submit KYC'}
            </button>
        </div>
    {/if}

    <!-- =================== DESTINATION ========================== -->
    {#if step === 'destination'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if user && !user.canOperate}
                <div class="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    <p class="font-medium">
                        Manteca can't operate this account yet (status: {user.status}).
                    </p>
                    <p class="mt-1">
                        You can continue, but Manteca will only pay out once verification completes.
                    </p>
                </div>
            {/if}

            <h2 class="text-lg font-semibold text-gray-900">Payout PIX key</h2>
            <p class="mt-1 text-sm text-gray-500">
                Enter the PIX key that will receive your {fiatCurrency}. We'll resolve it with
                Manteca to confirm the recipient.
            </p>

            <label class="mt-4 block text-sm font-medium text-gray-700" for="pixKey">
                PIX key
            </label>
            <input
                id="pixKey"
                type="text"
                bind:value={pixKey}
                placeholder="email, phone, CPF, or random key"
                class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />

            {#if destination}
                <div class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
                    {#if destination.valid}
                        <p class="font-medium text-green-700">PIX key resolved</p>
                        {#if destination.name}
                            <p class="mt-1">
                                <span class="text-gray-500">Recipient:</span>
                                <span class="font-medium">{destination.name}</span>
                            </p>
                        {/if}
                        {#if destination.accountType}
                            <p class="mt-0.5">
                                <span class="text-gray-500">Account type:</span>
                                <span class="font-medium">{destination.accountType}</span>
                            </p>
                        {/if}
                        {#if destination.legalId}
                            <p class="mt-0.5">
                                <span class="text-gray-500">Legal ID:</span>
                                <span class="font-mono">{destination.legalId}</span>
                            </p>
                        {/if}
                    {:else}
                        <p class="font-medium text-red-600">
                            Manteca could not resolve this PIX key.
                        </p>
                    {/if}
                </div>
            {/if}

            <div class="mt-6 flex gap-3">
                <button
                    onclick={resolveDestination}
                    disabled={!pixKey.trim() || isWorking}
                    class="flex-1 rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                    {isWorking ? 'Resolving…' : 'Resolve PIX key'}
                </button>
                <button
                    onclick={() => (step = 'amount')}
                    disabled={!destination?.valid}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    Continue
                </button>
            </div>
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
                <span class="ml-1 font-mono text-gray-600">{pixKey}</span>
                {#if destination?.name}
                    <span class="ml-1 text-gray-500">({destination.name})</span>
                {/if}
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
                A Freighter window should be open. Confirm the {tokenSymbol} payment to Manteca's deposit
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

    <!-- =================== SEND / AWAITING PAYOUT =============== -->
    {#if step === 'send' && synthetic}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Awaiting fiat payout</h2>
            <p class="mt-1 text-sm text-gray-500">
                Your {tokenSymbol} payment is on its way. Manteca is sending {fiatCurrency} to your PIX
                key.
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
                <p>Synthetic: <CopyableField value={synthetic.id} mono /></p>
                <p>Status: <span class="font-mono">{synthetic.status}</span></p>
            </div>
            <div class="mt-4 flex items-center justify-center py-6">
                <div
                    class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                ></div>
                <span class="ml-3 text-sm text-gray-500">Polling Manteca…</span>
            </div>
            {#if payoutPoller.timedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    <p class="font-medium">Still processing</p>
                    <p class="mt-1">
                        Manteca hasn't confirmed the payout yet. You can close this page and check
                        back later.
                    </p>
                </div>
            {/if}
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && synthetic}
        {@const brlOut = displayQuote?.toAmount}
        {@const completionDetails = brlOut
            ? [{ label: 'Amount', value: `${brlOut} ${fiatCurrency}` }]
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
            message="Manteca paid out {fiatCurrency} to your PIX key."
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/manteca/offramp/+page.svelte',
            },
            {
                text: 'View MantecaClient',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/lib/anchors/manteca/client.ts',
            },
            {
                text: 'View Manteca API routes',
                link: 'https://github.com/ElliotFriend/regional-starter-pack/tree/main/src/routes/api/anchor/manteca',
            },
        ]}
    />
</section>
