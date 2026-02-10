<script lang="ts">
    import type { Snippet } from 'svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import KycStatusDisplay from '$lib/components/KycStatusDisplay.svelte';
    import { KYC_STATUS, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from '$lib/constants';
    import type { KycStatus } from '$lib/anchors/types';
    import * as api from '$lib/api/anchor';

    interface Props {
        provider: string;
        title: string;
        description: string;
        connectMessage: string;
        children: Snippet;
    }

    let { provider, title, description, connectMessage, children }: Props = $props();

    // Local UI state
    let email = $state('');
    let country = $state(DEFAULT_COUNTRY);
    let isRegistering = $state(false);
    let registrationError = $state<string | null>(null);
    let showKyc = $state(false);
    let kycSubmissionId = $state<string | null>(null);
    let isCompletingKyc = $state(false);

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
            // Get or create customer
            const customer = await api.getOrCreateCustomer(
                fetch,
                provider,
                email,
                country,
            );
            customerStore.set(customer);

            // Check for existing KYC submission
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
        } catch (err) {
            registrationError = err instanceof Error ? err.message : 'Registration failed';
            console.error('Registration failed:', err);
        } finally {
            isRegistering = false;
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
        {:else}
            {@render children()}
        {/if}
    </div>
</div>
