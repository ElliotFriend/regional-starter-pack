<script lang="ts">
    import DevBox from '$lib/components/ui/DevBox.svelte';
</script>

<div class="text-center">
    <h1 class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
        Stellar Regional Starter Pack
    </h1>
    <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-500">
        A toolkit and reference implementation for building fiat on/off ramps on the Stellar
        network. Includes a portable anchor library, three pre-built integrations, and a composable
        SEP protocol library.
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

<!-- What's Inside -->
<section class="mt-16">
    <div class="rounded-lg border border-gray-200 bg-white p-8">
        <h2 class="text-2xl font-bold text-gray-900">What's Inside</h2>
        <div class="mt-6 grid gap-6 md:grid-cols-2">
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">Portable Anchor Library</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Framework-agnostic TypeScript clients in <code
                        class="rounded bg-gray-200 px-1">src/lib/anchors/</code
                    >. No SvelteKit imports — copy into any project.
                </p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">Three Pre-Built Integrations</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Etherfuse, AlfredPay, and BlindPay — each implementing the shared <code
                        class="rounded bg-gray-200 px-1">Anchor</code
                    > interface with different capabilities.
                </p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">SEP Protocol Library</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Composable implementations of SEP-1, 6, 10, 12, 24, 31, and 38 for building
                    against any SEP-compliant anchor.
                </p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
                <h3 class="font-semibold text-gray-900">Live Demos</h3>
                <p class="mt-2 text-sm text-gray-600">
                    Working on-ramp and off-ramp flows you can test right now with each anchor
                    provider in sandbox mode.
                </p>
            </div>
        </div>
    </div>
</section>

<!-- How to Use It -->
<section class="mt-16">
    <div class="rounded-lg border border-gray-200 bg-white p-8">
        <h2 class="text-2xl font-bold text-gray-900">How to Use It</h2>

        <div class="mt-8 grid gap-8 md:grid-cols-4">
            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    1
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Clone & Configure</h3>
                <p class="mt-2 text-sm text-gray-500">
                    Clone the repo and add your anchor API keys to the environment.
                </p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    2
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Try the Demos</h3>
                <p class="mt-2 text-sm text-gray-500">
                    Run the app and test on-ramp and off-ramp flows with each anchor in sandbox
                    mode.
                </p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    3
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Copy the Library</h3>
                <p class="mt-2 text-sm text-gray-500">
                    Copy <code class="rounded bg-gray-100 px-1 text-xs">src/lib/anchors/</code> into
                    your own TypeScript project.
                </p>
            </div>

            <div class="text-center">
                <div
                    class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white"
                >
                    4
                </div>
                <h3 class="mt-4 font-semibold text-gray-900">Build Your Own</h3>
                <p class="mt-2 text-sm text-gray-500">
                    Implement the shared <code class="rounded bg-gray-100 px-1 text-xs">Anchor</code
                    > interface for your own use case.
                </p>
            </div>
        </div>
    </div>
</section>

<!-- For Developers -->
<section class="mt-16">
    <DevBox
        items={[
            {
                text: 'View source on GitHub',
                link: 'https://github.com/ElliotFriend/regional-starter-pack',
            },
            {
                text: 'Portable anchor library — copy src/lib/anchors/ into any TypeScript project',
            },
            { text: 'Built with SvelteKit, Svelte 5, and Tailwind CSS' },
            { text: 'SEP protocol library included (SEP-1, 6, 10, 12, 24, 31, 38)' },
        ]}
    />
</section>
