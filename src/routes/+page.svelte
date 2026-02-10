<div class="text-center">
    <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
        Regional Starter Pack
    </h1>
    <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
        A reference implementation for building fiat on/off ramps on the Stellar network. Connect
        local payment rails to digital assets through regulated anchor providers.
    </p>
    <div class="mt-8 flex justify-center gap-4">
        <a
            href="/regions"
            class="rounded-md bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-700"
        >
            Browse Regions
        </a>
        <a
            href="/anchors"
            class="rounded-md bg-white px-6 py-3 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
        >
            View Anchors
        </a>
    </div>
</div>

<!-- What is This -->
<section class="mt-16">
    <div class="rounded-lg border border-gray-200 bg-white p-8">
        <h2 class="text-2xl font-bold text-gray-900">What is This?</h2>
        <p class="mt-4 text-gray-600">
            The Regional Starter Pack demonstrates how to interact with anchor on/off ramp functionality using
            the Stellar network. It provides working examples of integrating with anchor providers
            to enable users to convert between local currencies and digital assets.
        </p>
        <div class="mt-6 grid gap-6 md:grid-cols-3">
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">On-Ramp</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Deposit local currency via bank transfer and receive digital assets in your
                    Stellar wallet.
                </p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">Off-Ramp</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Send digital assets from your Stellar wallet and receive local currency in your
                    bank account.
                </p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">Anchors</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Regulated entities that bridge traditional finance and the Stellar blockchain in
                    specific regions.
                </p>
            </div>
        </div>
    </div>
</section>

<!-- How It Works -->
<section class="mt-16">
    <div class="rounded-lg border border-gray-200 bg-white p-8">
        <h2 class="text-2xl font-bold text-gray-900">How It Works</h2>

        <div class="mt-8 grid gap-8 md:grid-cols-4">
            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    1
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Choose Region</h3>
                <p class="mt-2 text-sm text-gray-500">
                    Select a region to see available anchors and payment options.
                </p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    2
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Connect Wallet</h3>
                <p class="mt-2 text-sm text-gray-500">Connect a Stellar wallet to get started.</p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    3
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Verify Identity</h3>
                <p class="mt-2 text-sm text-gray-500">Complete KYC verification with the anchor.</p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    4
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Transfer</h3>
                <p class="mt-2 text-sm text-gray-500">
                    On-ramp or off-ramp using local payment rails.
                </p>
            </div>
        </div>
    </div>
</section>

<!-- For Developers -->
<section class="mt-16">
    <div class="rounded-lg bg-gray-900 p-8 text-white">
        <h2 class="text-2xl font-bold">For Developers</h2>
        <p class="mt-2 text-gray-300">
            This is a reference implementation built with SvelteKit. The code is designed to be
            modular and copy-paste friendly.
        </p>
        <ul class="mt-4 space-y-2 text-sm text-gray-300">
            <li class="flex items-center gap-2">
                <svg
                    class="h-5 w-5 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
                Standalone API functions in
                <code class="rounded bg-gray-800 px-1">$lib/api/anchor.ts</code>
            </li>
            <li class="flex items-center gap-2">
                <svg
                    class="h-5 w-5 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
                Reusable Svelte 5 components with runes
            </li>
            <li class="flex items-center gap-2">
                <svg
                    class="h-5 w-5 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
                Freighter wallet integration
            </li>
            <li class="flex items-center gap-2">
                <svg
                    class="h-5 w-5 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
                Server-side API routes for secure anchor communication
            </li>
        </ul>
    </div>
</section>
