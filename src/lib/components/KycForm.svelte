<script lang="ts">
    import { customerStore } from '$lib/stores/customer.svelte';
    import { ALFREDPAY_KYC_STATUS, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from '$lib/constants';
    import * as api from '$lib/api/anchor';
    import type { AlfredPayKycFileType } from '$lib/anchors/alfredpay/types';

    interface Props {
        provider: string;
        email: string;
        onComplete: () => void;
    }

    let { provider, email, onComplete }: Props = $props();

    // Form data
    let firstName = $state('');
    let lastName = $state('');
    let dateOfBirth = $state('');
    let dni = $state('');
    let country = $state(DEFAULT_COUNTRY);
    let city = $state('');
    let state_ = $state('');
    let address = $state('');
    let zipCode = $state('');

    // File uploads
    let idFront: File | null = $state(null);
    let idBack: File | null = $state(null);
    let selfie: File | null = $state(null);

    // UI state
    let currentStep = $state<'personal' | 'documents' | 'uploading' | 'complete'>('personal');
    let submissionId = $state<string | null>(null);
    let isSubmitting = $state(false);
    let isCompletingKyc = $state(false);
    let error = $state<string | null>(null);
    let uploadProgress = $state({ idFront: false, idBack: false, selfie: false });

    async function handlePersonalSubmit() {
        if (
            !firstName ||
            !lastName ||
            !dateOfBirth ||
            !dni ||
            !city ||
            !state_ ||
            !address ||
            !zipCode
        ) {
            error = 'Please fill in all required fields';
            return;
        }

        const customer = customerStore.current;
        if (!customer) {
            error = 'No customer loaded';
            return;
        }

        isSubmitting = true;
        error = null;

        try {
            const result = await api.submitKycData(fetch, provider, customer.id, {
                firstName,
                lastName,
                dateOfBirth,
                country,
                city,
                state: state_,
                address,
                zipCode,
                nationalities: [country],
                email,
                dni,
            });

            submissionId = result.submissionId;
            currentStep = 'documents';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit KYC data';
        } finally {
            isSubmitting = false;
        }
    }

    function handleFileSelect(type: 'idFront' | 'idBack' | 'selfie', event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0] || null;

        if (type === 'idFront') idFront = file;
        else if (type === 'idBack') idBack = file;
        else if (type === 'selfie') selfie = file;
    }

    async function uploadFile(fileType: AlfredPayKycFileType, file: File) {
        const customer = customerStore.current;
        if (!submissionId || !customer) return;
        await api.submitKycFile(fetch, provider, customer.id, submissionId, fileType, file);
    }

    async function handleDocumentsSubmit() {
        if (!idFront || !idBack || !selfie) {
            error = 'Please upload all required documents';
            return;
        }

        const customer = customerStore.current;
        if (!submissionId || !customer) {
            error = 'Submission ID not found';
            return;
        }

        isSubmitting = true;
        error = null;
        currentStep = 'uploading';

        try {
            // Upload ID front
            uploadProgress.idFront = true;
            await uploadFile('National ID Front', idFront);
            uploadProgress.idFront = false;

            // Upload ID back
            uploadProgress.idBack = true;
            await uploadFile('National ID Back', idBack);
            uploadProgress.idBack = false;

            // Upload selfie
            uploadProgress.selfie = true;
            await uploadFile('Selfie', selfie);
            uploadProgress.selfie = false;

            // Check submission status and finalize if CREATED
            const statusResponse = await api.getKycSubmissionStatus(
                fetch,
                provider,
                customer.id,
                submissionId,
            );
            if (statusResponse.status === ALFREDPAY_KYC_STATUS.CREATED) {
                await api.finalizeKycSubmission(fetch, provider, customer.id, submissionId);
            }

            currentStep = 'complete';
            onComplete();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to upload documents';
            currentStep = 'documents';
        } finally {
            isSubmitting = false;
        }
    }

    async function handleSandboxComplete() {
        if (!submissionId) {
            error = 'No submission ID found';
            return;
        }

        isCompletingKyc = true;
        error = null;

        try {
            await api.completeKycSandbox(fetch, provider, submissionId);
            onComplete();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to complete KYC';
        } finally {
            isCompletingKyc = false;
        }
    }
</script>

<div class="kyc-form">
    {#if error}
        <div class="mb-4 rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {/if}

    {#if currentStep === 'personal'}
        <div>
            <h3 class="text-lg font-medium text-gray-900">Personal Information</h3>
            <p class="mt-1 text-sm text-gray-500">
                Please provide your information exactly as it appears on your ID.
            </p>

            <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label for="firstName" class="block text-sm font-medium text-gray-700"
                        >First Name *</label
                    >
                    <input
                        type="text"
                        id="firstName"
                        bind:value={firstName}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="lastName" class="block text-sm font-medium text-gray-700"
                        >Last Name *</label
                    >
                    <input
                        type="text"
                        id="lastName"
                        bind:value={lastName}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="dateOfBirth" class="block text-sm font-medium text-gray-700"
                        >Date of Birth *</label
                    >
                    <input
                        type="date"
                        id="dateOfBirth"
                        bind:value={dateOfBirth}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="dni" class="block text-sm font-medium text-gray-700"
                        >National ID Number (CURP/INE) *</label
                    >
                    <input
                        type="text"
                        id="dni"
                        bind:value={dni}
                        placeholder="18 character CURP"
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="country" class="block text-sm font-medium text-gray-700"
                        >Country *</label
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

                <div class="sm:col-span-2">
                    <label for="address" class="block text-sm font-medium text-gray-700"
                        >Street Address *</label
                    >
                    <input
                        type="text"
                        id="address"
                        bind:value={address}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="city" class="block text-sm font-medium text-gray-700">City *</label>
                    <input
                        type="text"
                        id="city"
                        bind:value={city}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="state" class="block text-sm font-medium text-gray-700"
                        >State *</label
                    >
                    <input
                        type="text"
                        id="state"
                        bind:value={state_}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>

                <div>
                    <label for="zipCode" class="block text-sm font-medium text-gray-700"
                        >ZIP Code *</label
                    >
                    <input
                        type="text"
                        id="zipCode"
                        bind:value={zipCode}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                </div>
            </div>

            <div class="mt-6">
                <button
                    onclick={handlePersonalSubmit}
                    disabled={isSubmitting}
                    class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isSubmitting ? 'Submitting...' : 'Continue to Documents'}
                </button>
            </div>
        </div>
    {:else if currentStep === 'documents'}
        <div>
            <h3 class="text-lg font-medium text-gray-900">Document Upload</h3>
            <p class="mt-1 text-sm text-gray-500">
                Please upload clear photos of your ID and a selfie for verification.
            </p>

            <div class="mt-6 space-y-4">
                <div class="rounded-lg border border-gray-200 p-4">
                    <label for="idFront" class="block text-sm font-medium text-gray-700">
                        National ID - Front *
                    </label>
                    <p class="mt-1 text-xs text-gray-500">INE/IFE front side with your photo</p>
                    <input
                        type="file"
                        id="idFront"
                        accept="image/jpeg,image/png,application/pdf"
                        onchange={(e) => handleFileSelect('idFront', e)}
                        class="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {#if idFront}
                        <p class="mt-1 text-xs text-green-600">Selected: {idFront.name}</p>
                    {/if}
                </div>

                <div class="rounded-lg border border-gray-200 p-4">
                    <label for="idBack" class="block text-sm font-medium text-gray-700">
                        National ID - Back *
                    </label>
                    <p class="mt-1 text-xs text-gray-500">INE/IFE back side</p>
                    <input
                        type="file"
                        id="idBack"
                        accept="image/jpeg,image/png,application/pdf"
                        onchange={(e) => handleFileSelect('idBack', e)}
                        class="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {#if idBack}
                        <p class="mt-1 text-xs text-green-600">Selected: {idBack.name}</p>
                    {/if}
                </div>

                <div class="rounded-lg border border-gray-200 p-4">
                    <label for="selfie" class="block text-sm font-medium text-gray-700">
                        Selfie *
                    </label>
                    <p class="mt-1 text-xs text-gray-500">
                        Clear photo of your face, similar to your ID photo
                    </p>
                    <input
                        type="file"
                        id="selfie"
                        accept="image/jpeg,image/png"
                        onchange={(e) => handleFileSelect('selfie', e)}
                        class="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {#if selfie}
                        <p class="mt-1 text-xs text-green-600">Selected: {selfie.name}</p>
                    {/if}
                </div>
            </div>

            <div class="mt-6 flex gap-4">
                <button
                    onclick={() => (currentStep = 'personal')}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Back
                </button>
                <button
                    onclick={handleDocumentsSubmit}
                    disabled={isSubmitting || !idFront || !idBack || !selfie}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isSubmitting ? 'Uploading...' : 'Submit Documents'}
                </button>
            </div>
        </div>
    {:else if currentStep === 'uploading'}
        <div class="text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center">
                <svg
                    class="h-8 w-8 animate-spin text-indigo-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                    ></circle>
                    <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">Uploading Documents</h3>
            <div class="mt-4 space-y-2 text-sm">
                <p class={uploadProgress.idFront ? 'text-indigo-600' : 'text-gray-500'}>
                    {uploadProgress.idFront ? 'Uploading ID Front...' : 'ID Front'}
                </p>
                <p class={uploadProgress.idBack ? 'text-indigo-600' : 'text-gray-500'}>
                    {uploadProgress.idBack ? 'Uploading ID Back...' : 'ID Back'}
                </p>
                <p class={uploadProgress.selfie ? 'text-indigo-600' : 'text-gray-500'}>
                    {uploadProgress.selfie ? 'Uploading Selfie...' : 'Selfie'}
                </p>
            </div>
        </div>
    {:else if currentStep === 'complete'}
        <div class="text-center">
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
            >
                <svg
                    class="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    ></path>
                </svg>
            </div>
            <h3 class="mt-4 text-lg font-medium text-gray-900">Verification Submitted</h3>
            <p class="mt-2 text-sm text-gray-500">
                Your documents have been submitted for review. This usually takes a few minutes.
            </p>

            <!-- Sandbox-only: Manual KYC completion button -->
            <div class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p class="text-sm font-medium text-amber-800">Sandbox Mode</p>
                <p class="mt-1 text-xs text-amber-700">
                    In sandbox, you can manually approve your KYC for testing.
                </p>
                <button
                    onclick={handleSandboxComplete}
                    disabled={isCompletingKyc}
                    class="mt-3 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                    {isCompletingKyc ? 'Completing...' : 'Complete KYC (Sandbox)'}
                </button>
            </div>
        </div>
    {/if}
</div>
