<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { page } from '$app/state';
    import { PUBLIC_STELLAR_NETWORK, PUBLIC_USDC_ISSUER } from '$env/static/public';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import WalletConnect from '$lib/components/WalletConnect.svelte';
    import TrustlineStatus from '$lib/components/ramp/TrustlineStatus.svelte';
    import AmountInput from '$lib/components/ramp/AmountInput.svelte';
    import CompletionStep from '$lib/components/ramp/CompletionStep.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getUsdcAsset } from '$lib/wallet/stellar';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as chipper from '$lib/api/chipper';
    import { sandboxCollectionOutcome } from '$lib/anchors/chipper';
    import type { ChipperMethod, ChipperOrder } from '$lib/anchors/chipper';
    import { getChipperMarket, normalizePhone } from '$lib/config/chipper-markets';
    import type { StellarNetwork } from '$lib/wallet/types';

    // ------------------------------------------------------------------
    // Region & asset (Chipper — region from ?region= query param)
    // ------------------------------------------------------------------

    const network = (PUBLIC_STELLAR_NETWORK || 'testnet') as StellarNetwork;
    const market = $derived(getChipperMarket(page.url.searchParams.get('region')));
    // Chipper returns no Stellar issuer; inject the network-correct USDC issuer.
    const stellarAsset = getUsdcAsset(PUBLIC_USDC_ISSUER);

    // The fee observed on every sandbox order (0.5%). Used only to pre-warn
    // about sandbox outcome cents before the order exists; the real fee comes
    // back on the order.
    const SANDBOX_FEE_ESTIMATE = 0.005;

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step = 'connect' | 'method' | 'amount' | 'review' | 'payment' | 'complete';
    let step = $state<Step>('connect');

    // Collection method + payer phone
    let methods = $state<ChipperMethod[]>([]);
    let methodCode = $state('');
    let phoneInput = $state('');
    const phone = $derived(normalizePhone(phoneInput, market.dialCode));
    const method = $derived(methods.find((m) => m.code === methodCode));

    // Amount + rate preview
    let amount = $state('');
    let hasTrustline = $state(false);
    let rate = $state<string | null>(null);
    const estimatedUsdc = $derived(
        rate && amount ? (Number(amount) * Number(rate)).toFixed(6) : null,
    );
    const outOfRange = $derived.by(() => {
        const n = Number(amount);
        const l = method?.limits;
        return !!l && !!amount && (n < l.min || n > l.max);
    });
    const estimatedTotal = $derived(
        amount ? (Number(amount) * (1 + SANDBOX_FEE_ESTIMATE)).toFixed(2) : null,
    );
    const estimatedOutcome = $derived(
        estimatedTotal ? sandboxCollectionOutcome(estimatedTotal) : null,
    );

    // Order
    let externalReference = $state<string | null>(null);
    let order = $state<ChipperOrder | null>(null);
    // Sandbox: amount + fee is what gets collected; its cents pick the outcome.
    const sandboxOutcome = $derived(
        order?.expectedAmount ? sandboxCollectionOutcome(order.expectedAmount) : null,
    );

    let isWorking = $state(false);
    let error = $state<string | null>(null);

    const orderPoller = createPoller({ intervalMs: 5000, maxAttempts: 60, onTick: pollOrder });

    // ------------------------------------------------------------------
    // Steps
    // ------------------------------------------------------------------

    async function loadMethods() {
        isWorking = true;
        error = null;
        try {
            const caps = await chipper.getCapabilities(fetch, market.country);
            methods = caps.collections.filter((m) => m.status === 'operational');
            methodCode = methods[0]?.code ?? '';
            step = 'method';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load Chipper methods';
        } finally {
            isWorking = false;
        }
    }

    async function getQuote() {
        isWorking = true;
        error = null;
        try {
            rate = (await chipper.getRate(fetch, market.currency, 'USDC')).rate;
            externalReference = null; // a new amount is a new ramp
            step = 'review';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get a rate';
        } finally {
            isWorking = false;
        }
    }

    async function confirmOrder() {
        if (!walletStore.publicKey || !phone || !methodCode) return;
        isWorking = true;
        error = null;
        // One reference per attempt: a retried click returns the same order.
        externalReference ??= crypto.randomUUID();
        try {
            order = await chipper.createOnRampOrder(fetch, {
                collectionCode: methodCode,
                phone,
                fiatCurrency: market.currency,
                fiatAmount: amount,
                stellarAddress: walletStore.publicKey,
                externalReference,
            });
            step = 'payment';
            orderPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create the order';
        } finally {
            isWorking = false;
        }
    }

    async function pollOrder({ stop }: { stop: () => void }) {
        if (!order) return;
        const updated = await chipper.getOrder(fetch, order.id);
        if (!updated) return;
        order = updated;
        if (updated.status === 'completed') {
            step = 'complete';
            stop();
        } else if (updated.failed) {
            const verb = updated.status === 'expired' ? 'expired' : 'could not complete';
            const reason = updated.statusMessage ? `: ${updated.statusMessage}` : '';
            error = `Chipper ${verb} this on-ramp${reason}.`;
            stop();
        }
    }

    function fillTestPhone() {
        phoneInput = market.testPhone;
    }

    function reset() {
        amount = '';
        rate = null;
        order = null;
        externalReference = null;
        error = null;
        step = methods.length ? 'method' : 'connect';
        orderPoller.stop();
    }

    // Load methods once the wallet connects. `untrack` keeps the effect from
    // subscribing to anything loadMethods reads or writes.
    $effect(() => {
        if (walletStore.isConnected && step === 'connect') untrack(() => loadMethods());
    });

    onMount(() => () => orderPoller.stop());
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <a
        href={`/anchors/chipper?region=${market.id}`}
        class="text-sm text-indigo-600 hover:underline"
    >
        ← Chipper
    </a>
    <h1 class="mt-2 text-2xl font-semibold text-gray-900">{market.currency} → USDC on Stellar</h1>
    <p class="mt-1 text-sm text-gray-600">
        Pay with {market.railLabel}; receive USDC in your Stellar wallet.
    </p>

    <div class="mt-6"><WalletConnect /></div>

    {#if step === 'connect' && walletStore.isConnected}
        {#if isWorking}
            <p class="mt-6 text-sm text-gray-500">Loading Chipper payment methods…</p>
        {:else}
            <button
                onclick={loadMethods}
                class="mt-6 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
                Retry loading payment methods
            </button>
        {/if}
    {:else if step === 'method'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Pay from</h2>
            <label class="mt-4 block text-sm font-medium text-gray-700">
                Method
                <select
                    bind:value={methodCode}
                    class="mt-1 block w-full rounded-md border-gray-300 text-sm"
                >
                    {#each methods as m (m.code)}
                        <option value={m.code}>{m.name}</option>
                    {/each}
                </select>
            </label>
            <div class="mt-4 flex items-end justify-between gap-3">
                <label class="block flex-1 text-sm font-medium text-gray-700">
                    Phone number
                    <input
                        bind:value={phoneInput}
                        type="tel"
                        placeholder={market.phonePlaceholder}
                        class="mt-1 block w-full rounded-md border-gray-300 text-sm"
                    />
                </label>
                <button
                    onclick={fillTestPhone}
                    class="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                    Fill test data
                </button>
            </div>
            {#if phoneInput && !phone}
                <p class="mt-1 text-sm text-red-600">Enter a {market.dialCode} mobile number.</p>
            {/if}
            <button
                onclick={() => (step = 'amount')}
                disabled={!phone || !methodCode}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                Continue
            </button>
        </section>
    {:else if step === 'amount'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => (hasTrustline = s.hasTrustline)}
            />
            <AmountInput
                bind:amount
                label="Amount ({market.currency})"
                placeholder="200"
                inputPrefix={market.currencySymbol}
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                additionalDisabled={outOfRange}
                onSubmit={getQuote}
            >
                {#if method?.limits}
                    <p class="mt-1 text-sm text-gray-500">
                        Limits: {method.limits.min.toLocaleString()}–{method.limits.max.toLocaleString()}
                        {market.currency}
                    </p>
                    {#if outOfRange}
                        <p class="mt-1 text-sm text-red-600">
                            Enter an amount within Chipper's {market.currency} limits.
                        </p>
                    {/if}
                {/if}
            </AmountInput>
        </section>
    {:else if step === 'review'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Review</h2>
            <dl class="mt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                    <dt class="text-gray-500">You pay</dt>
                    <dd>{amount} {market.currency} + fee</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Rate</dt>
                    <dd>1 {market.currency} = {rate} USDC</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">You receive (est.)</dt>
                    <dd>{estimatedUsdc} USDC</dd>
                </div>
            </dl>
            <p class="mt-2 text-xs text-gray-500">
                Chipper adds its fee to the amount collected; the exact total appears on the next
                step.
            </p>
            {#if estimatedOutcome}
                <div class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    Sandbox: with the fee, about {estimatedTotal}
                    {market.currency} is collected, which triggers
                    <span class="font-mono">{estimatedOutcome}</span>. Go back and pick an amount
                    like 200 so the order completes.
                </div>
            {/if}
            <div class="mt-6 flex gap-3">
                <button
                    onclick={() => (step = 'amount')}
                    class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Back
                </button>
                <button
                    onclick={confirmOrder}
                    disabled={isWorking}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {isWorking ? 'Creating order…' : 'Confirm and send prompt'}
                </button>
            </div>
        </section>
    {:else if step === 'payment' && order}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Approve the payment</h2>
            <p class="mt-2 text-sm text-gray-700">{order.instructions?.message}</p>
            <dl class="mt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                    <dt class="text-gray-500">Collected</dt>
                    <dd>{order.expectedAmount} {order.from.currency}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Fee</dt>
                    <dd>{order.fee?.amount} {order.fee?.currency}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">You receive</dt>
                    <dd>{order.to.amount} USDC</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Status</dt>
                    <dd class="font-mono">{order.status}</dd>
                </div>
            </dl>
            {#if sandboxOutcome}
                <div class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    Sandbox: a collection of {order.expectedAmount} triggers
                    <span class="font-mono">{sandboxOutcome}</span>, so this order may stall or
                    fail. Start over with an amount whose total doesn’t end in .50, .51, .52, or .99
                    (e.g. 200).
                </div>
            {/if}
            {#if orderPoller.timedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    Still processing. Order ID: <span class="font-mono">{order.id}</span>
                </div>
            {/if}
        </section>
    {:else if step === 'complete' && order}
        <CompletionStep
            title="USDC delivered"
            message="Chipper sent USDC to your Stellar wallet."
            details={[
                { label: 'Received', value: `${order.to.amount} USDC` },
                { label: 'Paid', value: `${order.expectedAmount} ${order.from.currency}` },
                { label: 'Order', value: order.id },
            ]}
            onReset={reset}
        />
    {/if}

    {#if error}
        <ErrorAlert message={error} onDismiss={() => (error = null)} />
    {/if}

    <div class="mt-8">
        <DevBox
            items={[
                {
                    text: 'POST /v1/orders collects from mobile money and pays usdc_stellar in one call.',
                    link: 'https://docs.platform.chipper.ai/guides/orders',
                },
                {
                    text: 'Sandbox collections pick their outcome from the cents of amount + fee.',
                    link: 'https://docs.platform.chipper.ai/sandbox',
                },
            ]}
        />
    </div>
</div>
