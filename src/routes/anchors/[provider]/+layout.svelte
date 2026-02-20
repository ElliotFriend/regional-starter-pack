<script lang="ts">
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();
</script>

<div class="mx-auto max-w-4xl">
    {@render children()}
</div>
