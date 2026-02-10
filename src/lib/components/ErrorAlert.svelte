<script lang="ts">
    interface Props {
        message: string;
        onDismiss: () => void;
    }

    let { message, onDismiss }: Props = $props();
</script>

<div class="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
    {message}
    <button onclick={onDismiss} class="ml-2 underline">Dismiss</button>
</div>
