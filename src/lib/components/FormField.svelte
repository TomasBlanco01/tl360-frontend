<script lang="ts">
	let {
		label,
		type = 'text',
		value = $bindable(''),
		error = '',
		required: isRequired = false,
		placeholder = '',
		id
	}: {
		label: string;
		type?: string;
		value?: string;
		error?: string;
		required?: boolean;
		placeholder?: string;
		id?: string;
	} = $props();

	const fieldId = $derived(id ?? label.toLowerCase().replace(/\s+/g, '-'));
</script>

<div class="flex flex-col gap-1">
	<label for={fieldId} class="text-sm font-medium text-gray-700 dark:text-gray-200">
		{label}{#if isRequired}<span class="text-danger-600"> *</span>{/if}
	</label>
	<input
		{type}
		id={fieldId}
		{placeholder}
		bind:value
		class="rounded-lg border bg-white px-3 py-2 text-gray-800 transition outline-none focus:ring-2 focus:ring-brand-300 dark:bg-gray-800 dark:text-gray-100 {error
			? 'border-danger-600'
			: 'border-gray-300 dark:border-gray-600'}"
		aria-invalid={!!error}
		aria-describedby={error ? `${fieldId}-error` : undefined}
	/>
	{#if error}
		<p id="{fieldId}-error" class="text-xs text-danger-600">{error}</p>
	{/if}
</div>
