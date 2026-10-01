<script lang="ts">
	let {
		name,
		size = 56
	}: {
		name: string;
		size?: number;
	} = $props();

	const iniciales = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join('')
	);

	// Color determinístico según el nombre, para que cada comercio tenga un color estable.
	const hues = [262, 200, 172, 24, 330, 45];
	const hue = $derived(hues[[...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % hues.length]);
</script>

<div
	class="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{size * 0.38}px"
	style:background="hsl({hue} 55% 55%)"
>
	{iniciales}
</div>
