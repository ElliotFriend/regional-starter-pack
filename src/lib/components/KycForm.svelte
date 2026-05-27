<script lang="ts">
    import { onMount } from 'svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { authStore } from '$lib/stores/auth';
    import type {
        AnchorCapabilities,
        KycRequirements,
        KycFieldRequirement,
        KycDocumentRequirement,
    } from '$lib/anchors/types';
    import { SANDBOX_KYC_DATA, SANDBOX_KYC_DOCUMENTS } from '$lib/anchors/sandbox';
    import * as api from '$lib/api/anchor';

    interface Props {
        provider: string;
        email: string;
        capabilities: AnchorCapabilities;
        onComplete: () => void;
        ensureAuth?: () => Promise<string | undefined>;
        /**
         * Pre-resolved requirements (e.g. the fields a transaction reports it
         * still needs). When omitted, the form discovers them from the anchor.
         */
        requirements?: KycRequirements;
        /**
         * Scope this submission to a specific transaction (SEP-6
         * `pending_customer_info_update`), so the anchor links the new info to it.
         */
        transactionId?: string;
    }

    let {
        provider,
        email,
        capabilities,
        onComplete,
        ensureAuth,
        requirements: providedRequirements,
        transactionId,
    }: Props = $props();

    // Requirements: supplied by the parent, or discovered from the anchor below.
    // The parent-supplied value is captured once at init (a plain function call
    // sidesteps Svelte's "only captures initial value" warning — that one-shot
    // capture is intended; the form owns this state after mount).
    function initialRequirements(): KycRequirements | null {
        return providedRequirements ?? null;
    }
    let requirements = $state<KycRequirements | null>(initialRequirements());
    let isLoadingRequirements = $state(initialRequirements() === null);

    // Dynamic form state
    let fieldValues = $state<Record<string, string>>({});
    let documentValues = $state<Record<string, File | string>>({});

    // UI state
    let currentStep = $state<'personal' | 'documents' | 'uploading' | 'complete'>('personal');
    let isSubmitting = $state(false);
    let error = $state<string | null>(null);

    // SEP-12 often returns a large field set with only a few required. Show the
    // required ones up front and tuck optional ones behind a disclosure so the
    // form isn't overwhelming. (A document is required unless explicitly not.)
    const requiredFields = $derived(requirements?.fields.filter((f) => f.required) ?? []);
    const optionalFields = $derived(requirements?.fields.filter((f) => !f.required) ?? []);
    const requiredDocuments = $derived(
        requirements?.documents.filter((d) => d.required !== false) ?? [],
    );
    const optionalDocuments = $derived(
        requirements?.documents.filter((d) => d.required === false) ?? [],
    );

    onMount(async () => {
        // Parent supplied the requirements (e.g. a transaction's required-info
        // fields) — nothing to discover.
        if (providedRequirements) return;
        try {
            // Reuse the cached SEP-10 token (no Freighter popup) so the anchor can
            // report exactly which fields this customer still needs via SEP-12.
            const auth = walletStore.publicKey
                ? authStore.get(provider, walletStore.publicKey)
                : undefined;
            requirements = await api.getKycFieldRequirements(fetch, provider, {
                auth,
                transactionId,
            });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load KYC requirements';
        } finally {
            isLoadingRequirements = false;
        }
    });

    function fillTestData() {
        if (!requirements) return;

        // Fill fields
        for (const field of requirements.fields) {
            if (field.key === 'email') {
                fieldValues[field.key] = email || SANDBOX_KYC_DATA.email || '';
            } else if (field.key in SANDBOX_KYC_DATA) {
                fieldValues[field.key] = SANDBOX_KYC_DATA[field.key];
            }
        }

        // Fill url_reference documents
        for (const doc of requirements.documents) {
            if (doc.mode === 'url_reference' && doc.key in SANDBOX_KYC_DOCUMENTS) {
                documentValues[doc.key] = SANDBOX_KYC_DOCUMENTS[doc.key];
            }
        }
    }

    function areFieldsValid(): boolean {
        if (!requirements) return false;
        return requirements.fields
            .filter((f) => f.required)
            .every((f) => fieldValues[f.key]?.trim());
    }

    function areDocumentsValid(): boolean {
        // Only required documents gate submission; optional ones are submitted if
        // the user chose to provide them.
        return requiredDocuments.every((doc) => {
            const val = documentValues[doc.key];
            if (doc.mode === 'file_upload') return val instanceof File;
            return typeof val === 'string' && val.trim().length > 0;
        });
    }

    function handleFileSelect(key: string, event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            documentValues[key] = file;
        }
    }

    async function submitVerification() {
        const customer = customerStore.current;
        if (!customer) {
            error = 'No customer loaded';
            return;
        }

        isSubmitting = true;
        error = null;
        currentStep = 'uploading';

        try {
            // Pre-fill the email field (its key varies by anchor — e.g. SEP-9
            // `email_address`) from the known registration address.
            const emailField = requirements?.fields.find(
                (f) => f.key === 'email_address' || f.key === 'email',
            );
            if (emailField && !fieldValues[emailField.key] && email) {
                fieldValues[emailField.key] = email;
            }

            const auth = ensureAuth ? await ensureAuth() : undefined;

            await api.submitKyc(
                fetch,
                provider,
                customer.id,
                {
                    fields: { ...fieldValues },
                    documents: { ...documentValues },
                    metadata: transactionId ? { transaction_id: transactionId } : undefined,
                },
                auth,
            );

            currentStep = 'complete';
            onComplete();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to submit KYC';
            currentStep =
                requirements && requirements.documents.length > 0 ? 'documents' : 'personal';
        } finally {
            isSubmitting = false;
        }
    }

    async function handlePersonalSubmit() {
        if (!areFieldsValid()) {
            error = 'Please fill in all required fields';
            return;
        }
        error = null;
        if (requirements && requirements.documents.length === 0) {
            await submitVerification();
        } else {
            currentStep = 'documents';
        }
    }

    async function handleDocumentsSubmit() {
        if (!areDocumentsValid()) {
            error = 'Please provide all required documents';
            return;
        }
        await submitVerification();
    }
</script>

{#snippet fieldControl(field: KycFieldRequirement)}
    <div class={field.key === 'address' ? 'sm:col-span-2' : ''}>
        <label for={`kyc-${field.key}`} class="block text-sm font-medium text-gray-700">
            {field.label}{field.required ? ' *' : ''}
        </label>
        {#if field.type === 'select' && field.options}
            <select
                id={`kyc-${field.key}`}
                bind:value={fieldValues[field.key]}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
                {#each field.options as opt (opt.value)}
                    <option value={opt.value}>{opt.label}</option>
                {/each}
            </select>
        {:else}
            <input
                type={field.type}
                id={`kyc-${field.key}`}
                bind:value={fieldValues[field.key]}
                placeholder={field.placeholder || ''}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        {/if}
    </div>
{/snippet}

{#snippet documentControl(doc: KycDocumentRequirement)}
    <div class="rounded-lg border border-gray-200 p-4">
        <label for={`doc-${doc.key}`} class="block text-sm font-medium text-gray-700">
            {doc.label}{doc.required === false ? '' : ' *'}
        </label>
        {#if doc.description}
            <p class="mt-1 text-xs text-gray-500">{doc.description}</p>
        {/if}

        {#if doc.mode === 'file_upload'}
            <input
                type="file"
                id={`doc-${doc.key}`}
                accept={doc.accept || 'image/jpeg,image/png'}
                onchange={(e) => handleFileSelect(doc.key, e)}
                class="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {#if documentValues[doc.key] instanceof File}
                <p class="mt-1 text-xs text-green-600">
                    Selected: {(documentValues[doc.key] as File).name}
                </p>
            {/if}
        {:else}
            <input
                type="text"
                id={`doc-${doc.key}`}
                bind:value={documentValues[doc.key]}
                placeholder="https://..."
                disabled={capabilities.sandbox}
                class="mt-2 block w-full rounded-md border-gray-300 font-mono text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm"
            />
            {#if capabilities.sandbox}
                <p class="mt-1 text-xs text-amber-600">Pre-filled with sandbox placeholder</p>
            {/if}
        {/if}
    </div>
{/snippet}

<div class="kyc-form">
    {#if error}
        <div class="mb-4 rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {/if}

    {#if isLoadingRequirements}
        <div class="flex items-center justify-center py-8">
            <div
                class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
            ></div>
            <span class="ml-2 text-sm text-gray-500">Loading requirements...</span>
        </div>
    {:else if !requirements}
        <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">Failed to load KYC requirements.</p>
        </div>
    {:else if currentStep === 'personal'}
        <div>
            <h3 class="text-lg font-medium text-gray-900">Personal Information</h3>
            <p class="mt-1 text-sm text-gray-500">
                Please provide your information exactly as it appears on your ID.
            </p>

            {#if capabilities.sandbox}
                <button
                    type="button"
                    onclick={fillTestData}
                    class="mt-3 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
                >
                    Fill Test Data (Sandbox)
                </button>
            {/if}

            <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {#each requiredFields as field (field.key)}
                    {@render fieldControl(field)}
                {/each}
            </div>

            {#if optionalFields.length > 0}
                <details class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <summary class="cursor-pointer text-sm font-medium text-gray-700">
                        Optional information ({optionalFields.length})
                    </summary>
                    <p class="mt-1 text-xs text-gray-500">
                        The anchor accepts these but doesn't require them.
                    </p>
                    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {#each optionalFields as field (field.key)}
                            {@render fieldControl(field)}
                        {/each}
                    </div>
                </details>
            {/if}

            <div class="mt-6">
                <button
                    onclick={handlePersonalSubmit}
                    disabled={isSubmitting}
                    class="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {#if requirements && requirements.documents.length === 0}
                        {isSubmitting ? 'Submitting...' : 'Submit Verification'}
                    {:else}
                        Continue to Documents
                    {/if}
                </button>
            </div>
        </div>
    {:else if currentStep === 'documents'}
        <div>
            <h3 class="text-lg font-medium text-gray-900">Document Verification</h3>
            <p class="mt-1 text-sm text-gray-500">
                {#if requirements.documents.some((d: KycDocumentRequirement) => d.mode === 'url_reference')}
                    Provide document references for verification.
                {:else}
                    Please upload clear photos of your ID and a selfie for verification.
                {/if}
            </p>

            <div class="mt-6 space-y-4">
                {#each requiredDocuments as doc (doc.key)}
                    {@render documentControl(doc)}
                {/each}
            </div>

            {#if optionalDocuments.length > 0}
                <details class="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <summary class="cursor-pointer text-sm font-medium text-gray-700">
                        Optional documents ({optionalDocuments.length})
                    </summary>
                    <div class="mt-4 space-y-4">
                        {#each optionalDocuments as doc (doc.key)}
                            {@render documentControl(doc)}
                        {/each}
                    </div>
                </details>
            {/if}

            <div class="mt-6 flex gap-4">
                <button
                    onclick={() => (currentStep = 'personal')}
                    class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                    Back
                </button>
                <button
                    onclick={handleDocumentsSubmit}
                    disabled={isSubmitting || !areDocumentsValid()}
                    class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isSubmitting ? 'Submitting...' : 'Submit Verification'}
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
            <h3 class="mt-4 text-lg font-medium text-gray-900">Submitting Verification</h3>
            <p class="mt-2 text-sm text-gray-500">
                Please wait while we process your submission...
            </p>
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
        </div>
    {/if}
</div>
