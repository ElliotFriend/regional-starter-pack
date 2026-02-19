<script lang="ts">
    import * as api from '$lib/api/anchor';
    import { customerStore } from '$lib/stores/customer.svelte';
    import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';

    interface Props {
        provider: string;
        tosId: string;
        onComplete: () => void;
    }

    let { provider, tosId, onComplete }: Props = $props();

    // Form fields
    let firstName = $state('');
    let lastName = $state('');
    let email = $state(customerStore.current?.email || '');
    let phoneNumber = $state('');
    let dateOfBirth = $state('');
    let taxId = $state('');
    let addressLine1 = $state('');
    let city = $state('');
    let stateRegion = $state('');
    let country = $state('MX');
    let postalCode = $state('');

    let isSubmitting = $state(false);
    let error = $state<string | null>(null);

    function clearError() {
        error = null;
    }

    async function handleSubmit() {
        if (
            !firstName ||
            !lastName ||
            !email ||
            !phoneNumber ||
            !dateOfBirth ||
            !taxId ||
            !addressLine1 ||
            !city ||
            !stateRegion ||
            !postalCode
        ) {
            error = 'Please fill in all required fields';
            return;
        }

        isSubmitting = true;
        error = null;

        try {
            const receiverData = {
                tos_id: tosId,
                type: 'individual',
                kyc_type: 'standard',
                email,
                first_name: firstName,
                last_name: lastName,
                phone_number: phoneNumber,
                date_of_birth: new Date(dateOfBirth).toISOString(),
                tax_id: taxId,
                address_line_1: addressLine1,
                city,
                state_province_region: stateRegion,
                country,
                postal_code: postalCode,
                ip_address: '0.0.0.0',
                // Placeholder document URLs for development
                id_doc_country: country,
                id_doc_type: 'ID_CARD',
                id_doc_front_file:
                    'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/1000_F_365165797_VwQbNaD4yjWwQ6y1ENKh1xS0TXauOQvj.jpg',
                id_doc_back_file:
                    'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/1000_F_365165797_VwQbNaD4yjWwQ6y1ENKh1xS0TXauOQvj.jpg',
                selfie_file: 'https://pub-4fabf5dd55154f19a0384b16f2b816d9.r2.dev/selfie.png',
            };

            const result = await api.createBlindPayReceiver(fetch, provider, receiverData);

            // Update customer store with the real receiver ID and KYC status
            const receiverId = (result as { id: string }).id;
            const kycStatus = (result as { kyc_status: string }).kyc_status;

            customerStore.set({
                id: receiverId,
                email,
                kycStatus:
                    kycStatus === 'approved'
                        ? 'approved'
                        : kycStatus === 'rejected'
                          ? 'rejected'
                          : 'pending',
                createdAt:
                    (result as { created_at: string }).created_at || new Date().toISOString(),
                updatedAt:
                    (result as { updated_at: string }).updated_at || new Date().toISOString(),
            });

            onComplete();
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to create receiver';
            console.error('BlindPay receiver creation failed:', err);
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
    <h2 class="text-lg font-semibold text-gray-900">Complete Verification</h2>
    <p class="mt-1 text-sm text-gray-500">
        Enter your details to complete identity verification with BlindPay.
    </p>

    <form
        onsubmit={(e) => {
            e.preventDefault();
            handleSubmit();
        }}
        class="mt-6 space-y-4"
    >
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label for="bp-firstName" class="block text-sm font-medium text-gray-700"
                    >First Name</label
                >
                <input
                    type="text"
                    id="bp-firstName"
                    bind:value={firstName}
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
            <div>
                <label for="bp-lastName" class="block text-sm font-medium text-gray-700"
                    >Last Name</label
                >
                <input
                    type="text"
                    id="bp-lastName"
                    bind:value={lastName}
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
        </div>

        <div>
            <label for="bp-email" class="block text-sm font-medium text-gray-700">Email</label>
            <input
                type="email"
                id="bp-email"
                bind:value={email}
                required
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>

        <div>
            <label for="bp-phone" class="block text-sm font-medium text-gray-700"
                >Phone Number (E.164)</label
            >
            <input
                type="tel"
                id="bp-phone"
                bind:value={phoneNumber}
                placeholder="+521234567890"
                required
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>

        <div>
            <label for="bp-dob" class="block text-sm font-medium text-gray-700">Date of Birth</label
            >
            <input
                type="date"
                id="bp-dob"
                bind:value={dateOfBirth}
                required
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>

        <div>
            <label for="bp-taxId" class="block text-sm font-medium text-gray-700"
                >Tax ID (CURP)</label
            >
            <input
                type="text"
                id="bp-taxId"
                bind:value={taxId}
                placeholder="ABCD123456HDFRRN09"
                required
                class="mt-1 block w-full rounded-md border-gray-300 font-mono shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>

        <div>
            <label for="bp-address" class="block text-sm font-medium text-gray-700">Address</label>
            <input
                type="text"
                id="bp-address"
                bind:value={addressLine1}
                placeholder="Street address"
                required
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label for="bp-city" class="block text-sm font-medium text-gray-700">City</label>
                <input
                    type="text"
                    id="bp-city"
                    bind:value={city}
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
            <div>
                <label for="bp-state" class="block text-sm font-medium text-gray-700">State</label>
                <input
                    type="text"
                    id="bp-state"
                    bind:value={stateRegion}
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
            <div>
                <label for="bp-country" class="block text-sm font-medium text-gray-700"
                    >Country</label
                >
                <select
                    id="bp-country"
                    bind:value={country}
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                    <option value="MX">Mexico</option>
                </select>
            </div>
            <div>
                <label for="bp-postal" class="block text-sm font-medium text-gray-700"
                    >Postal Code</label
                >
                <input
                    type="text"
                    id="bp-postal"
                    bind:value={postalCode}
                    required
                    class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
        </div>

        <div class="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            <strong>Note:</strong> Identity document images use placeholder URLs for development. A file
            upload integration will be added in a future update.
        </div>

        <button
            type="submit"
            disabled={isSubmitting}
            class="mt-2 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
            {isSubmitting ? 'Submitting...' : 'Submit Verification'}
        </button>
    </form>

    {#if error}
        <div class="mt-4">
            <ErrorAlert message={error} onDismiss={clearError} />
        </div>
    {/if}
</div>
