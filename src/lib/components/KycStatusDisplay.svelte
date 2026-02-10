<script lang="ts">
    import KycForm from './KycForm.svelte';
    import { KYC_STATUS } from '$lib/constants';
    import type { Customer } from '$lib/anchors/types';

    interface Props {
        provider: string;
        customer: Customer | null;
        email: string;
        showKyc: boolean;
        kycSubmissionId: string | null;
        isCompletingKyc: boolean;
        onKycComplete: () => void;
        onSandboxComplete: () => void;
        onShowKyc: () => void;
        onRefreshStatus: () => void;
    }

    let {
        provider,
        customer,
        email,
        showKyc,
        kycSubmissionId,
        isCompletingKyc,
        onKycComplete,
        onSandboxComplete,
        onShowKyc,
        onRefreshStatus,
    }: Props = $props();
</script>

<div class="mx-auto max-w-2xl">
    {#if showKyc}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Identity Verification</h2>
            <p class="mt-1 text-sm text-gray-500">
                Complete the verification below to start using the service.
            </p>
            <div class="mt-4">
                <KycForm {provider} {email} onComplete={onKycComplete} />
            </div>
        </div>
    {:else if customer?.kycStatus === KYC_STATUS.PENDING}
        <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
            <h2 class="text-lg font-semibold text-yellow-800">KYC Verification Pending</h2>
            <p class="mt-2 text-sm text-yellow-700">
                Your identity verification is being processed. This usually takes a few minutes.
            </p>
            <button
                onclick={onRefreshStatus}
                class="mt-4 text-sm font-medium text-yellow-800 hover:text-yellow-900"
            >
                Check Status
            </button>

            {#if kycSubmissionId}
                <div class="mt-6 rounded-lg border border-amber-300 bg-amber-100 p-4">
                    <p class="text-sm font-medium text-amber-800">Sandbox Mode</p>
                    <p class="mt-1 text-xs text-amber-700">
                        Manually approve your KYC for testing.
                    </p>
                    <button
                        onclick={onSandboxComplete}
                        disabled={isCompletingKyc}
                        class="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                        {isCompletingKyc ? 'Completing...' : 'Complete KYC (Sandbox)'}
                    </button>
                </div>
            {/if}
        </div>
    {:else if customer?.kycStatus === KYC_STATUS.REJECTED}
        <div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
            <h2 class="text-lg font-semibold text-red-800">Verification Failed</h2>
            <p class="mt-2 text-sm text-red-700">
                Unfortunately, your identity verification was not approved. Please contact support.
            </p>
        </div>
    {:else if customer?.kycStatus === KYC_STATUS.UPDATE_REQUIRED}
        <div class="rounded-lg border border-orange-200 bg-orange-50 p-6 text-center">
            <h2 class="text-lg font-semibold text-orange-800">Additional Information Required</h2>
            <p class="mt-2 text-sm text-orange-700">
                Your verification requires additional information. Please update your submission.
            </p>
            <button
                onclick={onShowKyc}
                class="mt-4 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
                Update Information
            </button>
        </div>
    {:else}
        <div class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <h2 class="text-lg font-semibold text-gray-900">Complete Verification</h2>
            <p class="mt-2 text-sm text-gray-500">
                You need to complete identity verification before using the service.
            </p>
            <button
                onclick={onShowKyc}
                class="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
                Start Verification
            </button>
        </div>
    {/if}
</div>
