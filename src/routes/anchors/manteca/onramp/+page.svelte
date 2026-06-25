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
    import * as manteca from '$lib/api/manteca';
    import type { StellarNetwork } from '$lib/wallet/types';
    import type { MantecaUser, MantecaQuote, MantecaSynthetic } from '$lib/anchors/manteca';

    // ------------------------------------------------------------------
    // Region & token derivation (Manteca Brazil — BRL → USDC on Stellar)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const fiatCurrency = 'BRL';
    const tokenSymbol = 'USDC';
    // Manteca returns no Stellar issuer; inject the network-correct USDC issuer.
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step = 'connect' | 'identity' | 'kyc' | 'amount' | 'quote' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    // Identity + KYC
    let email = $state('');
    let cpf = $state('');
    let surname = $state('');
    let phoneNumber = $state('');
    let nationality = $state('');
    let sex = $state('');
    let maritalStatus = $state('');
    let street = $state('');
    let missingPersonalData = $state<string[]>([]);
    let user = $state<MantecaUser | null>(null);

    // Ramp state
    let amount = $state('');
    let quote = $state<MantecaQuote | null>(null);
    let synthetic = $state<MantecaSynthetic | null>(null);
    let hasTrustline = $state(false);

    // UI flags
    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const syntheticPoller = createPoller({
        intervalMs: 5000,
        maxAttempts: 60,
        onTick: pollSynthetic,
    });

    const emailValid = $derived(email.trim().length > 0 && email.includes('@'));
    const kycValid = $derived(
        cpf.trim().length > 0 &&
            surname.trim().length > 0 &&
            phoneNumber.trim().length > 0 &&
            nationality.trim().length > 0 &&
            sex.trim().length > 0 &&
            maritalStatus.trim().length > 0 &&
            street.trim().length > 0,
    );

    // Adapt MantecaQuote → QuoteDisplay structural shape. Manteca quotes carry a
    // unit price (BRL per USDC) + a fee fraction; derive the leg amounts from the
    // BRL amount the user entered. On-ramp: BRL in, USDC out.
    const displayQuote = $derived.by(() => {
        if (!quote) return null;
        const brl = parseFloat(amount) || 0;
        const price = parseFloat(quote.price) || 0;
        const fee = brl * quote.spreadFraction;
        const usdc = price > 0 ? (brl - fee) / price : 0;
        return {
            fromCurrency: fiatCurrency,
            toCurrency: tokenSymbol,
            fromAmount: brl.toString(),
            toAmount: usdc.toString(),
            exchangeRate: price > 0 ? (1 / price).toString() : '0',
            fee: fee.toString(),
            // Manteca's composed quote has no explicit expiry; show a short window.
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
            user = await manteca.createUser(fetch, { email });
            step = 'kyc';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create Manteca user';
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
        street = 'Av Paulista 1000';
    }

    async function submitKyc() {
        if (!kycValid) return;
        isWorking = true;
        error = null;
        try {
            // Brazil auto-populates only name/birthDate/work from the CPF; the rest of
            // personalData must be supplied for the user to reach ACTIVE.
            await manteca.submitOnboarding(fetch, {
                email,
                legalId: cpf,
                personalData: {
                    surname,
                    phoneNumber,
                    nationality,
                    sex,
                    maritalStatus,
                    address: { street },
                },
            });
            // Re-read the user to pick up canOperate; KYC may not be synchronous.
            const refreshed = user ? await manteca.getUser(fetch, user.numberId) : null;
            if (refreshed) user = refreshed;
            // Discover any still-missing required personalData fields.
            missingPersonalData = user
                ? await manteca.getMissingPersonalData(fetch, user.numberId)
                : [];
            if (missingPersonalData.length > 0) return; // stay on kyc so the user can correct
            step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit Manteca KYC';
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
                ramp: 'onramp',
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
                ramp: 'onramp',
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
    // Synthetic creation + polling
    // ------------------------------------------------------------------

    async function confirmQuote() {
        if (!quote || !user || !walletStore.publicKey) return;
        isWorking = true;
        error = null;
        try {
            synthetic = await manteca.createRampOn(fetch, {
                userAnyId: user.numberId,
                asset: tokenSymbol,
                against: fiatCurrency,
                againstAmount: parseFloat(amount),
                stellarAddress: walletStore.publicKey,
            });
            step = 'payment';
            syntheticPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create on-ramp';
        } finally {
            isWorking = false;
        }
    }

    async function pollSynthetic({ stop }: { stop: () => void }) {
        if (!synthetic) return;
        const updated = await manteca.getSynthetic(fetch, synthetic.id);
        if (!updated) return;
        synthetic = updated;
        if (updated.isTerminal && updated.status === 'COMPLETED') {
            step = 'complete';
            stop();
        } else if (updated.status === 'CANCELLED') {
            error = 'Manteca cancelled this on-ramp.';
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
        error = null;
        step = 'amount';
        syntheticPoller.stop();
    }

    function clearError() {
        error = null;
    }

    onMount(() => {
        return () => syntheticPoller.stop();
    });
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <header class="mb-6 flex items-center justify-between">
        <div>
            <a href={resolve('/anchors/manteca')} class="text-sm text-indigo-600 hover:underline">
                ← Manteca
            </a>
            <h1 class="mt-1 text-2xl font-semibold text-gray-900">
                On-Ramp ({fiatCurrency} → {tokenSymbol})
            </h1>
            <p class="mt-1 text-sm text-gray-500">
                Buy {tokenSymbol} on Stellar with {fiatCurrency} via Manteca's PIX rail.
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
                    Manteca delivers USDC to your Stellar public key. Connect Freighter to continue.
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

            <label class="mt-6 block">
                <span class="text-sm font-medium text-gray-700">CPF</span>
                <input
                    type="text"
                    bind:value={cpf}
                    placeholder="000.000.000-00"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

            <label class="mt-4 block">
                <span class="text-sm font-medium text-gray-700">Surname</span>
                <input
                    type="text"
                    bind:value={surname}
                    placeholder="SILVA"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

            <label class="mt-4 block">
                <span class="text-sm font-medium text-gray-700">Phone number</span>
                <input
                    type="text"
                    bind:value={phoneNumber}
                    placeholder="11999999999"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

            <label class="mt-4 block">
                <span class="text-sm font-medium text-gray-700">Nationality</span>
                <input
                    type="text"
                    bind:value={nationality}
                    placeholder="Brasil"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

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

            <label class="mt-4 block">
                <span class="text-sm font-medium text-gray-700">Address street</span>
                <input
                    type="text"
                    bind:value={street}
                    placeholder="Av Paulista 1000"
                    class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
            </label>

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

    <!-- =================== AMOUNT ================================ -->
    {#if step === 'amount'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            {#if user && !user.canOperate}
                <div class="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                    <p class="font-medium">
                        Manteca can't operate this account yet (status: {user.status}).
                    </p>
                    <p class="mt-1">
                        You can continue, but Manteca will only deliver USDC once verification
                        completes.
                    </p>
                </div>
            {/if}

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
                placeholder="100"
                inputPrefix="R$"
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
                    {isWorking ? 'Creating order…' : 'Confirm & get PIX details'}
                </button>
            </div>
        </div>
    {/if}

    <!-- =================== PAYMENT =============================== -->
    {#if step === 'payment' && synthetic}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex items-center justify-between">
                <h2 class="text-lg font-semibold text-gray-900">Pay via PIX</h2>
                <span
                    class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                >
                    {synthetic.status}
                </span>
            </div>

            {#if synthetic.details.pix || synthetic.details.depositAddress || synthetic.details.depositAlias}
                <div class="mt-4 space-y-3 rounded-md bg-gray-50 p-4 text-sm">
                    {#if synthetic.details.pix}
                        <div>
                            <span class="text-gray-500">PIX code (copy &amp; paste)</span>
                            <p class="font-medium">
                                <CopyableField value={synthetic.details.pix.code} mono />
                            </p>
                        </div>
                        <div>
                            <span class="text-gray-500">QR</span>
                            <p class="font-medium">
                                <a
                                    href={synthetic.details.pix.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-indigo-600 underline">Open PIX QR</a
                                >
                            </p>
                        </div>
                    {/if}
                    {#if synthetic.details.depositAddress}
                        <div>
                            <span class="text-gray-500">PIX key</span>
                            <p class="font-medium">
                                <CopyableField value={synthetic.details.depositAddress} mono />
                            </p>
                        </div>
                    {/if}
                    {#if synthetic.details.depositAlias}
                        <div>
                            <span class="text-gray-500">Alias</span>
                            <p class="font-medium">
                                <CopyableField value={synthetic.details.depositAlias} mono />
                            </p>
                        </div>
                    {/if}
                    <div class="border-t border-gray-200 pt-3">
                        <span class="text-gray-500">Amount</span>
                        <p class="text-xl font-bold text-indigo-600">
                            <CopyableField value="R$ {parseFloat(amount).toLocaleString()}" />
                        </p>
                    </div>
                </div>
            {:else}
                <div class="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                    No PIX instructions were returned for this synthetic. Synthetic ID:
                    <CopyableField value={synthetic.id} mono />
                </div>
            {/if}

            <!--
                No deposit-sim button: the sandbox auto-detects the PIX deposit
                (~15s) and auto-converts BRL→USDC, advancing the synthetic to its
                WITHDRAW stage on its own — just poll. The broker test-deposit
                endpoint is a separate product (Broker-as-a-Service) and is not
                used. NOTE: in sandbox the Stellar WITHDRAW leg currently fails
                ("Withdraw FAILED") with no on-chain broadcast, so USDC does not
                land on testnet — not an issuer issue (Manteca's pooled sandbox
                account trusts the same Circle testnet USDC); the sandbox just
                doesn't execute Stellar withdrawals. The poller below reflects
                real synthetic status.
            -->

            <div class="mt-6">
                {#if syntheticPoller.timedOut}
                    <div class="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                        <p class="font-medium">Still processing</p>
                        <p class="mt-1">
                            We haven't detected delivery yet. You can close this page and check back
                            later.
                        </p>
                        <div class="mt-3">
                            <span class="text-xs text-amber-600">Synthetic ID</span>
                            <p class="mt-0.5"><CopyableField value={synthetic.id} mono /></p>
                        </div>
                    </div>
                {:else}
                    <p class="text-center text-sm text-gray-500">
                        Waiting for confirmation… polling Manteca.
                    </p>
                {/if}
            </div>
        </div>
    {/if}

    <!-- =================== COMPLETE ============================== -->
    {#if step === 'complete' && synthetic}
        {@const usdcOut = displayQuote?.toAmount}
        {@const completionDetails = usdcOut
            ? [{ label: 'Amount', value: `${usdcOut} ${tokenSymbol}` }]
            : []}
        <CompletionStep
            title="{tokenSymbol} delivered"
            message="Manteca sent {tokenSymbol} to your Stellar wallet."
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
                link: 'https://github.com/ElliotFriend/regional-starter-pack/blob/main/src/routes/anchors/manteca/onramp/+page.svelte',
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
