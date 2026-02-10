<script lang="ts">
    import Header from '$lib/components/ui/Header.svelte';
    import Sidebar from '$lib/components/ui/Sidebar.svelte';
    import Footer from '$lib/components/ui/Footer.svelte';

    import './layout.css';
    import favicon from '$lib/assets/favicon.svg';
    import type { LayoutProps } from './$types';

    let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
    <link rel="icon" href={favicon} />
    <title>Regional Starter Pack</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-gray-50">
    <Header />

    <div class="flex flex-1 pt-16">
        <!-- Sidebar -->
        <Sidebar regions={data.regions} anchors={data.anchors} />

        <!-- Main content -->
        <div class="ml-64 flex flex-1 flex-col">
            <main class="flex-1 px-8 py-8">
                {@render children()}
            </main>

            <Footer />
        </div>
    </div>
</div>
