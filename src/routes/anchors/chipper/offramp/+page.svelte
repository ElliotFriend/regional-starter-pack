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
    import CopyableField from '$lib/components/ui/CopyableField.svelte';
    import DevBox from '$lib/components/ui/DevBox.svelte';
    import { getUsdcAsset, buildPaymentTransaction, submitTransaction } from '$lib/wallet/stellar';
    import { signWithFreighter } from '$lib/wallet/freighter';
    import { createPoller } from '$lib/utils/poll.svelte';
    import * as chipper from '$lib/api/chipper';
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

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------

    type Step = 'connect' | 'recipient' | 'amount' | 'review' | 'send' | 'awaiting' | 'complete';
    let step = $state<Step>('connect');

    // Payout method + recipient phone
    let methods = $state<ChipperMethod[]>([]);
    let methodCode = $state('');
    let phoneInput = $state('');
    const phone = $derived(normalizePhone(phoneInput, market.dialCode));
    let recipientName = $state<string | null>(null);

    // Amount + rate preview
    let amount = $state('');
    let hasTrustline = $state(false);
    let usdcBalance = $state('0');
    let rate = $state<string | null>(null);
    const estimatedFiat = $derived(
        rate && amount ? (Number(amount) * Number(rate)).toFixed(2) : null,
    );

    // Order
    let externalReference = $state<string | null>(null);
    let order = $state<ChipperOrder | null>(null);
    let stellarTxHash = $state<string | null>(null);

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
            methods = caps.payouts.filter((m) => m.status === 'operational');
            methodCode = methods[0]?.code ?? '';
            step = 'recipient';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load Chipper methods';
        } finally {
            isWorking = false;
        }
    }

    async function validateRecipient() {
        if (!phone || !methodCode) return;
        isWorking = true;
        error = null;
        try {
            const v = await chipper.validateDestination(fetch, {
                code: methodCode,
                accountNumber: phone,
            });
            if (!v.valid) {
                error = `Chipper couldn’t verify this number${v.reason ? `: ${v.reason}` : ''}.`;
                return;
            }
            recipientName = v.accountName ?? null;
            step = 'amount';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to validate the recipient';
        } finally {
            isWorking = false;
        }
    }

    async function getQuote() {
        isWorking = true;
        error = null;
        try {
            rate = (await chipper.getRate(fetch, 'USDC', market.currency)).rate;
            externalReference = null; // a new amount is a new ramp
            step = 'review';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to get a rate';
        } finally {
            isWorking = false;
        }
    }

    async function confirmOrder() {
        if (!phone || !methodCode) return;
        isWorking = true;
        error = null;
        // One reference per attempt: a retried click returns the same order.
        externalReference ??= crypto.randomUUID();
        try {
            order = await chipper.createOffRampOrder(fetch, {
                payoutCode: methodCode,
                phone,
                fiatCurrency: market.currency,
                usdcAmount: amount,
                externalReference,
            });
            step = 'send';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create the order';
        } finally {
            isWorking = false;
        }
    }

    async function signAndSend() {
        const ins = order?.instructions;
        if (!walletStore.publicKey || !ins?.address || !ins.tag) return;
        isWorking = true;
        error = null;
        try {
            const xdr = await buildPaymentTransaction({
                sourcePublicKey: walletStore.publicKey,
                destinationPublicKey: ins.address,
                asset: stellarAsset,
                amount: ins.amount,
                // Without the memo ID Chipper holds the deposit for manual review.
                memo: ins.tag,
                memoType: 'id',
                network,
            });
            const signed = await signWithFreighter(xdr, network);
            const result = await submitTransaction(signed.signedXdr, network);
            stellarTxHash = result.hash;
            step = 'awaiting';
            orderPoller.start();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to send USDC';
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
            error = `Chipper ${verb} this off-ramp${reason}.`;
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
        stellarTxHash = null;
        externalReference = null;
        recipientName = null;
        error = null;
        step = methods.length ? 'recipient' : 'connect';
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
    <h1 class="mt-2 text-2xl font-semibold text-gray-900">USDC on Stellar → {market.currency}</h1>
    <p class="mt-1 text-sm text-gray-600">
        Send USDC from your Stellar wallet; the recipient gets {market.currency} by {market.railLabel}.
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
    {:else if step === 'recipient'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Pay out to</h2>
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
                    Recipient phone number
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
                onclick={validateRecipient}
                disabled={!phone || !methodCode || isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                {isWorking ? 'Verifying…' : 'Verify recipient'}
            </button>
        </section>
    {:else if step === 'amount'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <p class="mb-4 text-sm text-gray-700">
                Paying out to <span class="font-medium">{recipientName ?? phone}</span>
                {#if recipientName}<span class="text-gray-500">({phone})</span>{/if}
            </p>
            <TrustlineStatus
                {stellarAsset}
                {network}
                onStatusChange={(s) => {
                    hasTrustline = s.hasTrustline;
                    usdcBalance = s.balance;
                }}
            />
            <AmountInput
                bind:amount
                label="Amount (USDC)"
                placeholder="4"
                inputPrefix="$"
                maxAmount={usdcBalance}
                isWalletConnected={walletStore.isConnected}
                {hasTrustline}
                isGettingQuote={isWorking}
                onSubmit={getQuote}
            />
        </section>
    {:else if step === 'review'}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Review</h2>
            <dl class="mt-4 space-y-2 text-sm">
                <div class="flex justify-between">
                    <dt class="text-gray-500">You send</dt>
                    <dd>{amount} USDC + fee</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Rate</dt>
                    <dd>1 USDC = {rate} {market.currency}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Recipient gets (est.)</dt>
                    <dd>{estimatedFiat} {market.currency}</dd>
                </div>
            </dl>
            <p class="mt-2 text-xs text-gray-500">
                Chipper adds its fee to the USDC you send; the exact amount appears on the next
                step.
            </p>
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
                    {isWorking ? 'Creating order…' : 'Confirm'}
                </button>
            </div>
        </section>
    {:else if step === 'send' && order?.instructions}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">
                Send exactly {order.instructions.amount} USDC
            </h2>
            <dl class="mt-4 space-y-3 text-sm">
                <div>
                    <dt class="text-gray-500">To address</dt>
                    <dd><CopyableField value={order.instructions.address ?? ''} mono /></dd>
                </div>
                <div>
                    <dt class="text-gray-500">Memo (ID)</dt>
                    <dd><CopyableField value={order.instructions.tag ?? ''} mono /></dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">Recipient</dt>
                    <dd>{order.to.kyc?.accountName ?? order.to.accountNumber}</dd>
                </div>
                <div class="flex justify-between">
                    <dt class="text-gray-500">They receive</dt>
                    <dd>{order.to.amount} {order.to.currency}</dd>
                </div>
            </dl>
            <p class="mt-3 text-xs text-gray-500">
                The memo ID matches your payment to this order; without it Chipper holds the deposit
                for manual review. The button below includes it for you.
            </p>
            <button
                onclick={signAndSend}
                disabled={isWorking}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
                {isWorking ? 'Waiting for Freighter…' : 'Sign and send with Freighter'}
            </button>
        </section>
    {:else if step === 'awaiting' && order}
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
            <h2 class="text-lg font-semibold text-gray-900">Waiting for the payout</h2>
            <p class="mt-2 text-sm text-gray-700">
                Status: <span class="font-mono">{order.status}</span>
            </p>
            {#if stellarTxHash}
                <p class="mt-2 text-xs text-gray-500">
                    Stellar transaction: <span class="font-mono">{stellarTxHash}</span>
                </p>
            {/if}
            {#if orderPoller.timedOut}
                <div class="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    Still processing. Order ID: <span class="font-mono">{order.id}</span>
                </div>
            {/if}
        </section>
    {:else if step === 'complete' && order}
        <CompletionStep
            title="{market.currency} paid out"
            message="Chipper paid the recipient by {market.railLabel}."
            details={[
                { label: 'Paid out', value: `${order.to.amount} ${order.to.currency}` },
                {
                    label: 'Sent',
                    value: `${order.receivedAmount ?? order.instructions?.amount} USDC`,
                },
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
                    text: 'POST /v1/orders collects usdc_stellar and pays out to mobile money in one call.',
                    link: 'https://docs.platform.chipper.ai/guides/orders',
                },
                {
                    text: 'Send the order’s memo ID as a Stellar MEMO_ID, or the deposit is held for review.',
                    link: 'https://docs.platform.chipper.ai/sandbox',
                },
            ]}
        />
    </div>
</div>
