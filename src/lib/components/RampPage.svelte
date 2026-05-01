<script lang="ts">
    import type { Snippet } from 'svelte';
    import { page } from '$app/state';
    import { goto } from '$app/navigation';
    import { resolve } from '$app/paths';
    import { walletStore } from '$lib/stores/wallet.svelte';
    import { customerStore } from '$lib/stores/customer.svelte';
    import { kycStore } from '$lib/stores/kyc.svelte';
    import KycStatusDisplay from '$lib/components/KycStatusDisplay.svelte';
    import { KYC_STATUS, SUPPORTED_COUNTRIES, DEFAULT_COUNTRY } from '$lib/constants';
    import type { AnchorCapabilities, KycStatus } from '$lib/anchors/types';
    import type { Region } from '$lib/config/regions';
    import * as api from '$lib/api/anchor';

    interface Props {
        children: Snippet;
    }

    let { children }: Props = $props();

    const direction = $derived<'onramp' | 'offramp'>(page.data.direction);
    const provider: string = $derived(page.data.anchor.id);
    const capabilities: AnchorCapabilities = $derived(page.data.capabilities);
    const anchorRegions: Region[] = $derived(page.data.regions ?? []);

    // Country options shown in the registration dropdown — narrowed to the
    // regions this anchor actually supports.
    const availableCountries = $derived(
        SUPPORTED_COUNTRIES.filter((c) => anchorRegions.some((r) => r.code === c.code)),
    );

    // Map ISO country code → region id (e.g. "MX" → "mexico", "BR" → "brazil")
    // so we can keep the URL's ?region= param in sync with the dropdown.
    const codeToRegionId = $derived(new Map(anchorRegions.map((r) => [r.code, r.id] as const)));

    // Initial country at component-init time: returning customer's stored
    // country → URL ?region= → the first supported country → DEFAULT_COUNTRY.
    // Computed once via a regular function call so the $state below doesn't
    // trip Svelte's "only captures initial value" warning — that one-shot
    // capture is exactly what we want here, since the dropdown takes over
    // as the source of truth after mount.
    function computeInitialCountry(): string {
        const stored = customerStore.current?.country;
        if (stored && availableCountries.some((c) => c.code === stored)) return stored;
        const fromUrl = page.data.activeRegion?.code;
        if (fromUrl && availableCountries.some((c) => c.code === fromUrl)) return fromUrl;
        if (availableCountries.length > 0) return availableCountries[0].code;
        return DEFAULT_COUNTRY;
    }

    // Local UI state
    let email = $state('');
    let country = $state(computeInitialCountry());
    let isRegistering = $state(false);
    let registrationError = $state<string | null>(null);
    let showKyc = $state(false);

    // Keep URL `?region=` in sync when the user changes the country dropdown.
    function onCountryChange() {
        const regionId = codeToRegionId.get(country);
        if (!regionId) return;
        if (page.url.searchParams.get('region') === regionId) return;
        goto(resolve(`/anchors/${provider}/${direction}?region=${regionId}`), {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    }

    // One-time hydration for returning customers: if the URL has no explicit
    // ?region= but the stored customer has a country, sync the URL so
    // page.data.fiatCurrency / paymentRail / primaryToken reflect that
    // customer's region instead of the anchor's first-region default.
    let urlHydratedFromCustomer = $state(false);
    $effect(() => {
        if (urlHydratedFromCustomer) return;
        if (page.url.searchParams.has('region')) {
            urlHydratedFromCustomer = true;
            return;
        }
        const stored = customerStore.current?.country;
        if (!stored) return;
        const matchingRegionId = codeToRegionId.get(stored);
        if (!matchingRegionId) {
            urlHydratedFromCustomer = true;
            return;
        }
        urlHydratedFromCustomer = true;
        goto(resolve(`/anchors/${provider}/${direction}?region=${matchingRegionId}`), {
            replaceState: true,
            keepFocus: true,
            noScroll: true,
        });
    });

    // Iframe KYC state (for providers with kycFlow: 'iframe')
    let kycIframeUrl = $state<string | null>(null);
    let isLoadingIframeUrl = $state(false);
    let isRefreshingKycStatus = $state(false);

    // Hydrate customer from localStorage when wallet connects (or switches)
    $effect(() => {
        const pk = walletStore.publicKey;
        if (pk) {
            customerStore.load(pk, provider);
            kycStore.load(pk, provider);
        } else {
            customerStore.clear();
            kycStore.clear();
        }
    });

    // Auto-load iframe KYC URL when customer is loaded but KYC isn't complete
    let iframeAutoLoaded = false;
    $effect(() => {
        const customer = customerStore.current;
        if (
            customer?.id &&
            capabilities.kycFlow === 'iframe' &&
            customer.kycStatus !== KYC_STATUS.APPROVED &&
            !iframeAutoLoaded
        ) {
            iframeAutoLoaded = true;
            showKyc = true;
            checkIframeKycStatus(customer.id);
            loadKycIframeUrl(customer.id);
        }
    });

    // Auto-check KYC status for form-based providers when customer loads
    let formKycAutoChecked = false;
    $effect(() => {
        const customer = customerStore.current;
        if (
            customer?.id &&
            capabilities.kycFlow === 'form' &&
            customer.kycStatus !== KYC_STATUS.APPROVED &&
            !formKycAutoChecked
        ) {
            formKycAutoChecked = true;
            refreshFormKycStatus();
        }
    });

    async function refreshFormKycStatus() {
        const status = await checkAndUpdateKycStatus();
        if (status === KYC_STATUS.NOT_STARTED) {
            showKyc = true;
        }
    }

    // Derived step based on wallet/customer/kyc state
    let currentStep = $derived.by(() => {
        if (!walletStore.isConnected) return 'connect';
        if (!customerStore.current) return 'register';
        const kycStatus = customerStore.current.kycStatus;
        if (showKyc || kycStatus !== KYC_STATUS.APPROVED) return 'kyc';
        return 'ready';
    });

    async function registerCustomer() {
        if (!walletStore.publicKey) return;

        isRegistering = true;
        registrationError = null;

        try {
            // Get or create customer — skip email lookup for providers that don't support it
            const customer = await api.getOrCreateCustomer(
                fetch,
                provider,
                email || undefined,
                country,
                {
                    supportsEmailLookup: capabilities.emailLookup,
                    publicKey: walletStore.publicKey,
                },
            );
            customerStore.set(customer);

            if (capabilities.kycFlow === 'iframe') {
                // For iframe-based KYC, check status and load iframe URL if needed
                const kycStatus = await checkIframeKycStatus(customer.id);
                if (kycStatus !== KYC_STATUS.APPROVED) {
                    showKyc = true;
                    await loadKycIframeUrl(customer.id);
                }
            } else {
                // For form-based KYC
                await refreshFormKycStatus();
            }
        } catch (err) {
            registrationError = err instanceof Error ? err.message : 'Registration failed';
            console.error('Registration failed:', err);
        } finally {
            isRegistering = false;
        }
    }

    async function checkAndUpdateKycStatus(): Promise<KycStatus> {
        const customer = customerStore.current;
        if (!customer) return KYC_STATUS.NOT_STARTED;

        try {
            const status = await api.getKycStatus(
                fetch,
                provider,
                customer.id,
                walletStore.publicKey ?? undefined,
            );
            const mapped = status as KycStatus;
            customerStore.updateKycStatus(mapped);
            return mapped;
        } catch {
            return customer.kycStatus || KYC_STATUS.NOT_STARTED;
        }
    }

    async function loadKycIframeUrl(customerId: string) {
        isLoadingIframeUrl = true;
        try {
            kycIframeUrl = await api.getKycUrl(
                fetch,
                provider,
                customerId,
                walletStore.publicKey ?? undefined,
                customerStore.current?.bankAccountId ?? undefined,
            );
        } catch (err) {
            console.error('Failed to load KYC iframe URL:', err);
        } finally {
            isLoadingIframeUrl = false;
        }
    }

    async function checkIframeKycStatus(customerId: string): Promise<string> {
        try {
            const status = await api.getKycStatus(
                fetch,
                provider,
                customerId,
                walletStore.publicKey ?? undefined,
            );
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

    async function handleKycComplete() {
        showKyc = false;
        const status = await checkAndUpdateKycStatus();
        if (status === KYC_STATUS.NOT_STARTED) {
            customerStore.updateKycStatus(KYC_STATUS.PENDING);
        }
    }

    async function handleRefreshKycStatus() {
        await checkAndUpdateKycStatus();
    }
</script>

<h1 class="text-2xl font-bold text-gray-900">
    {#if direction === 'onramp'}
        On-Ramp with {page.data.anchor.name}
    {:else}
        Off-Ramp with {page.data.anchor.name}
    {/if}
</h1>
<p class="mt-2 text-gray-500">
    {#if direction === 'onramp'}
        Transfer local currency via bank transfer and receive digital assets directly to your
        Stellar wallet.
    {:else}
        Send digital assets from your Stellar wallet and receive local currency directly to your
        bank account.
    {/if}
</p>

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
            <p class="mt-2 text-sm text-gray-500">Connect your Freighter wallet to get started.</p>
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
                        onchange={onCountryChange}
                        disabled={availableCountries.length <= 1}
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm"
                    >
                        {#each availableCountries as c (c.code)}
                            <option value={c.code}>{c.name}</option>
                        {/each}
                    </select>
                </div>

                <div>
                    <label for="wallet-address" class="block text-sm font-medium text-gray-700"
                        >Wallet Address</label
                    >
                    <input
                        type="text"
                        id="wallet-address"
                        value={walletStore.publicKey ?? ''}
                        readonly
                        class="mt-1 block w-full truncate rounded-md border-gray-300 bg-gray-50 font-mono text-xs text-gray-500 shadow-sm sm:text-sm"
                    />
                </div>

                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700"
                        >Email Address {#if !capabilities.emailLookup}<span
                                class="font-normal text-gray-400">(Optional)</span
                            >{/if}</label
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
                disabled={isRegistering}
                class="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {isRegistering ? 'Processing...' : 'Continue'}
            </button>

            {#if registrationError}
                <p class="mt-2 text-sm text-red-600">{registrationError}</p>
            {/if}
        </div>
    {:else if currentStep === 'kyc'}
        {#if capabilities.kycFlow === 'iframe'}
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
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                    </svg>
                </div>
                <h2 class="mt-4 text-lg font-semibold text-gray-900">Complete Verification</h2>
                <p class="mt-2 text-sm text-gray-500">
                    Complete the onboarding process in the new window, then come back here and check
                    your status.
                </p>

                {#if isLoadingIframeUrl}
                    <div class="mt-6 flex items-center justify-center py-4">
                        <div
                            class="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                        ></div>
                        <span class="ml-2 text-sm text-gray-500">Loading...</span>
                    </div>
                {:else if kycIframeUrl}
                    <button
                        onclick={() => window.open(kycIframeUrl!, '_blank')}
                        class="mt-6 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                        Open Verification
                    </button>
                {/if}

                <button
                    onclick={handleRefreshIframeKycStatus}
                    disabled={isRefreshingKycStatus}
                    class="mt-4 w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {isRefreshingKycStatus ? 'Checking...' : 'Refresh KYC Status'}
                </button>
            </div>
        {:else}
            <!-- Form-based KYC -->
            <KycStatusDisplay
                {provider}
                customer={customerStore.current}
                email={customerStore.current?.email || email}
                {capabilities}
                {showKyc}
                onKycComplete={handleKycComplete}
                onShowKyc={() => (showKyc = true)}
                onRefreshStatus={handleRefreshKycStatus}
            />
        {/if}
    {:else}
        {@render children()}
    {/if}
</div>
