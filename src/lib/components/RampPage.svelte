<script lang="ts">
    import { onMount } from 'svelte';
    import type { Snippet } from 'svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import KycStatusDisplay from '$lib/components/KycStatusDisplay.svelte';
    import BlindPayReceiverForm from '$lib/components/BlindPayReceiverForm.svelte';
    import { KYC_STATUS, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from '$lib/constants';
    import type { KycStatus } from '$lib/anchors/types';
    import type { AnchorCapabilities } from '$lib/config/regions';
    import * as api from '$lib/api/anchor';

    interface Props {
        provider: string;
        title: string;
        description: string;
        connectMessage: string;
        capabilities: AnchorCapabilities;
        children: Snippet;
    }

    let { provider, title, description, connectMessage, capabilities, children }: Props = $props();

    // Local UI state
    let email = $state('');
    let country = $state(DEFAULT_COUNTRY);
    let isRegistering = $state(false);
    let registrationError = $state<string | null>(null);
    let showKyc = $state(false);
    let kycSubmissionId = $state<string | null>(null);
    let isCompletingKyc = $state(false);

    // Iframe KYC state (for providers with kycFlow: 'iframe')
    let kycIframeUrl = $state<string | null>(null);
    let isLoadingIframeUrl = $state(false);
    let isRefreshingKycStatus = $state(false);

    // Redirect KYC state (for providers with kycFlow: 'redirect', e.g. BlindPay)
    let tosId = $state<string | null>(null);
    let redirectKycStep = $state<'tos' | 'receiver_form' | 'polling'>('tos');
    let isRedirectingToTos = $state(false);

    // Detect ToS redirect callback on mount
    onMount(() => {
        if (capabilities.kycFlow === 'redirect' && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const returnedTosId = params.get('tos_id');
            if (returnedTosId) {
                tosId = returnedTosId;
                redirectKycStep = 'receiver_form';
                showKyc = true;
                // Clean the URL
                const url = new URL(window.location.href);
                url.searchParams.delete('tos_id');
                window.history.replaceState({}, '', url.toString());
            }
        }
    });

    // Hydrate customer from localStorage when wallet connects (or switches)
    $effect(() => {
        const pk = walletStore.publicKey;
        if (pk) {
            customerStore.load(pk, provider);
        } else {
            customerStore.clear();
        }
    });

    // Derived step based on wallet/customer/kyc state
    let currentStep = $derived.by(() => {
        if (!walletStore.isConnected) return 'connect';
        if (!customerStore.current) return 'register';
        const kycStatus = customerStore.current.kycStatus;
        if (showKyc || kycStatus !== KYC_STATUS.APPROVED) return 'kyc';
        return 'ready';
    });

    async function registerCustomer() {
        if (!email || !walletStore.publicKey) return;

        isRegistering = true;
        registrationError = null;

        try {
            // Get or create customer — skip email lookup for providers that don't support it
            const customer = await api.getOrCreateCustomer(fetch, provider, email, country, {
                supportsEmailLookup: capabilities.supportsEmailLookup,
                publicKey: walletStore.publicKey,
            });
            customerStore.set(customer);

            if (capabilities.kycFlow === 'redirect') {
                // For redirect-based KYC (BlindPay): redirect to ToS page
                showKyc = true;
                redirectKycStep = 'tos';
            } else if (capabilities.kycFlow === 'iframe') {
                // For iframe-based KYC, check status and load iframe URL if needed
                const kycStatus = await checkIframeKycStatus(customer.id);
                if (kycStatus !== KYC_STATUS.APPROVED) {
                    showKyc = true;
                    await loadKycIframeUrl(customer.id);
                }
            } else {
                // For form-based KYC (AlfredPay path)
                const kycStatus = await checkAndUpdateKycStatus();

                // Try to get submission ID for sandbox completion
                try {
                    const submission = await api.getKycSubmission(fetch, provider, customer.id);
                    if (submission) {
                        kycSubmissionId = submission.submissionId;
                    }
                } catch {
                    // Ignore - submission may not exist
                }

                // Show KYC form if not approved or pending
                if (kycStatus !== KYC_STATUS.APPROVED && kycStatus !== KYC_STATUS.PENDING) {
                    showKyc = true;
                }
            }
        } catch (err) {
            registrationError = err instanceof Error ? err.message : 'Registration failed';
            console.error('Registration failed:', err);
        } finally {
            isRegistering = false;
        }
    }

    async function redirectToTos() {
        isRedirectingToTos = true;
        try {
            const tosUrl = await api.getBlindPayTosUrl(fetch, provider, window.location.href);
            window.location.href = tosUrl;
        } catch (err) {
            registrationError = err instanceof Error ? err.message : 'Failed to get ToS URL';
            isRedirectingToTos = false;
        }
    }

    function handleReceiverFormComplete() {
        // Receiver was created — now poll for KYC approval
        redirectKycStep = 'polling';
    }

    async function handleRefreshRedirectKycStatus() {
        const customer = customerStore.current;
        if (!customer) return;

        isRefreshingKycStatus = true;
        try {
            const status = await api.getKycStatus(fetch, provider, customer.id);
            const mapped = status as KycStatus;
            customerStore.updateKycStatus(mapped);
            if (mapped === KYC_STATUS.APPROVED) {
                showKyc = false;
            }
        } catch (err) {
            console.error('Failed to refresh KYC status:', err);
        } finally {
            isRefreshingKycStatus = false;
        }
    }

    async function checkAndUpdateKycStatus(): Promise<string> {
        const customer = customerStore.current;
        if (!customer) return KYC_STATUS.NOT_STARTED;

        try {
            const submission = await api.getKycSubmission(fetch, provider, customer.id);

            if (submission) {
                const statusResponse = await api.getKycSubmissionStatus(
                    fetch,
                    provider,
                    customer.id,
                    submission.submissionId,
                );

                // Map AlfredPay status to our status
                const status = statusResponse.status.toUpperCase();
                let kycStatus: KycStatus;
                switch (status) {
                    case 'COMPLETED':
                        kycStatus = KYC_STATUS.APPROVED;
                        break;
                    case 'FAILED':
                        kycStatus = KYC_STATUS.REJECTED;
                        break;
                    case 'CREATED':
                    case 'IN_REVIEW':
                        kycStatus = KYC_STATUS.PENDING;
                        break;
                    case 'UPDATE_REQUIRED':
                        kycStatus = KYC_STATUS.UPDATE_REQUIRED;
                        break;
                    default:
                        kycStatus = KYC_STATUS.NOT_STARTED;
                }

                customerStore.updateKycStatus(kycStatus);
                return kycStatus;
            }

            customerStore.updateKycStatus(KYC_STATUS.NOT_STARTED);
            return KYC_STATUS.NOT_STARTED;
        } catch {
            return customer.kycStatus || KYC_STATUS.NOT_STARTED;
        }
    }

    async function loadKycIframeUrl(customerId: string) {
        isLoadingIframeUrl = true;
        try {
            kycIframeUrl = await api.getKycIframeUrl(fetch, provider, customerId, walletStore.publicKey ?? undefined);
        } catch (err) {
            console.error('Failed to load KYC iframe URL:', err);
        } finally {
            isLoadingIframeUrl = false;
        }
    }

    async function checkIframeKycStatus(customerId: string): Promise<string> {
        try {
            const status = await api.getKycStatus(fetch, provider, customerId, walletStore.publicKey ?? undefined);
            const mapped = status as KycStatus;
            customerStore.updateKycStatus(mapped);
            return mapped;
        } catch {
            return KYC_STATUS.NOT_STARTED;
        }
    }

    async function handleRefreshIframeKycStatus() {
        const customer = customerStore.current;
        if (!customer) return;

        isRefreshingKycStatus = true;
        try {
            const status = await checkIframeKycStatus(customer.id);
            if (status === KYC_STATUS.APPROVED) {
                showKyc = false;
            }
        } finally {
            isRefreshingKycStatus = false;
        }
    }

    function handleKycComplete() {
        showKyc = false;
    }

    async function handleSandboxComplete() {
        if (!kycSubmissionId) return;

        isCompletingKyc = true;
        try {
            await api.completeKycSandbox(fetch, provider, kycSubmissionId);
            customerStore.updateKycStatus(KYC_STATUS.APPROVED);
        } catch (err) {
            console.error('Failed to complete KYC:', err);
        } finally {
            isCompletingKyc = false;
        }
    }

    async function handleRefreshKycStatus() {
        await checkAndUpdateKycStatus();
    }
</script>

<div>
    <h1 class="text-2xl font-bold text-gray-900">{title}</h1>
    <p class="mt-2 text-gray-500">{description}</p>

    <div class="mt-8">
        {#if currentStep === 'connect'}
            <div
                class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
            >
                <div
                    class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100"
                >
                    <svg
                        class="h-6 w-6 text-indigo-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        ></path>
                    </svg>
                </div>
                <h2 class="mt-4 text-lg font-semibold text-gray-900">Connect Your Wallet</h2>
                <p class="mt-2 text-sm text-gray-500">{connectMessage}</p>
                <button
                    onclick={() => walletStore.connect()}
                    disabled={walletStore.isConnecting}
                    class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {walletStore.isConnecting ? 'Connecting...' : 'Connect Freighter'}
                </button>
            </div>
        {:else if currentStep === 'register'}
            <div class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 class="text-lg font-semibold text-gray-900">Create Account</h2>
                <p class="mt-1 text-sm text-gray-500">
                    Enter your details to create an account or access your existing one.
                </p>

                <div class="mt-6 space-y-4">
                    <div>
                        <label for="country" class="block text-sm font-medium text-gray-700"
                            >Country</label
                        >
                        <select
                            id="country"
                            bind:value={country}
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                            {#each SUPPORTED_COUNTRIES as c (c.code)}
                                <option value={c.code}>{c.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700"
                            >Email Address</label
                        >
                        <input
                            type="email"
                            id="email"
                            bind:value={email}
                            placeholder="you@example.com"
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                    </div>
                </div>

                <button
                    onclick={registerCustomer}
                    disabled={!email || isRegistering}
                    class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isRegistering ? 'Processing...' : 'Continue'}
                </button>

                {#if registrationError}
                    <p class="mt-2 text-sm text-red-600">{registrationError}</p>
                {/if}
            </div>
        {:else if currentStep === 'kyc'}
            {#if capabilities.kycFlow === 'redirect'}
                {#if redirectKycStep === 'tos'}
                    <div class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
                        <div
                            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100"
                        >
                            <svg class="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 class="mt-4 text-lg font-semibold text-gray-900">Accept Terms of Service</h2>
                        <p class="mt-2 text-sm text-gray-500">
                            You'll be redirected to BlindPay to accept their Terms of Service.
                            After accepting, you'll return here to complete verification.
                        </p>
                        <button
                            onclick={redirectToTos}
                            disabled={isRedirectingToTos}
                            class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isRedirectingToTos ? 'Redirecting...' : 'Accept Terms of Service'}
                        </button>
                        {#if registrationError}
                            <p class="mt-2 text-sm text-red-600">{registrationError}</p>
                        {/if}
                    </div>
                {:else if redirectKycStep === 'receiver_form' && tosId}
                    <BlindPayReceiverForm
                        {provider}
                        {tosId}
                        onComplete={handleReceiverFormComplete}
                    />
                {:else if redirectKycStep === 'polling'}
                    <div class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
                        <div
                            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100"
                        >
                            <svg class="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 class="mt-4 text-lg font-semibold text-gray-900">Verifying Your Identity</h2>
                        <p class="mt-2 text-sm text-gray-500">
                            Your verification is being reviewed. This may take a few moments.
                        </p>
                        <button
                            onclick={handleRefreshRedirectKycStatus}
                            disabled={isRefreshingKycStatus}
                            class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isRefreshingKycStatus ? 'Checking...' : 'Refresh Status'}
                        </button>
                    </div>
                {/if}
            {:else if capabilities.kycFlow === 'iframe'}
                <div class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 class="text-lg font-semibold text-gray-900">Complete Verification</h2>
                    <p class="mt-1 text-sm text-gray-500">
                        Complete the verification process below to continue.
                    </p>

                    {#if isLoadingIframeUrl}
                        <div class="mt-6 flex items-center justify-center py-8">
                            <div
                                class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                            ></div>
                            <span class="ml-2 text-sm text-gray-500">Loading verification...</span>
                        </div>
                    {:else if kycIframeUrl}
                        <div class="mt-4 overflow-hidden rounded-md border border-gray-200">
                            <iframe
                                src={kycIframeUrl}
                                title="KYC Verification"
                                class="h-[600px] w-full"
                                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                            ></iframe>
                        </div>
                    {/if}

                    <button
                        onclick={handleRefreshIframeKycStatus}
                        disabled={isRefreshingKycStatus}
                        class="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isRefreshingKycStatus ? 'Checking...' : 'Refresh KYC Status'}
                    </button>
                </div>
            {:else}
                <KycStatusDisplay
                    {provider}
                    customer={customerStore.current}
                    email={customerStore.current?.email || email}
                    {showKyc}
                    {kycSubmissionId}
                    {isCompletingKyc}
                    onKycComplete={handleKycComplete}
                    onSandboxComplete={handleSandboxComplete}
                    onShowKyc={() => (showKyc = true)}
                    onRefreshStatus={handleRefreshKycStatus}
                />
            {/if}
        {:else}
            {@render children()}
        {/if}
    </div>
</div>
