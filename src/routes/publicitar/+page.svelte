<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';

	let form = $state({ nombre: '', contacto: '', tipo: 'colecta', mensaje: '' });
	let enviando = $state(false);
	let error = $state('');
	let enviada = $state(false);

	async function enviar(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const nombre = form.nombre.trim();
		const contacto = form.contacto.trim();
		const mensaje = form.mensaje.trim();
		if (nombre.length < 2) {
			error = 'Contanos tu nombre o el de la organización.';
			return;
		}
		if (contacto.length < 5) {
			error = 'Dejá un email o teléfono para que podamos contactarte.';
			return;
		}
		if (mensaje.length < 10) {
			error = 'Contanos brevemente qué querés difundir (mínimo 10 caracteres).';
			return;
		}
		enviando = true;
		try {
			await api.post('/solicitudes-publicidad', {
				nombre,
				contacto,
				tipo: form.tipo,
				mensaje
			});
			enviada = true;
		} catch (err) {
			error =
				err instanceof ApiError
					? err.message
					: 'No pudimos enviar tu solicitud. Probá de nuevo en un rato.';
		} finally {
			enviando = false;
		}
	}
</script>

<svelte:head>
	<title>Difundí tu evento o colecta — TL360</title>
	<meta
		name="description"
		content="Pedí difusión gratuita en TL360 para tu colecta solidaria, evento barrial o emprendimiento."
	/>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Difundí tu evento o colecta</h1>
	<p class="mt-2 mb-6 text-gray-500 dark:text-gray-400">
		Si organizás una colecta solidaria, un evento sin fines de lucro o una feria barrial, contanos
		acá. <strong class="text-gray-700 dark:text-gray-200">No necesitás crear una cuenta</strong>: la
		plataforma revisa el pedido y arma la difusión en el carrusel de destacados.
	</p>

	{#if enviada}
		<Card class="p-6">
			<p class="text-lg font-semibold text-gray-800 dark:text-gray-100">¡Recibimos tu solicitud!</p>
			<p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
				Nos vamos a contactar al dato que dejaste para coordinar la difusión. Gracias por sumarte.
			</p>
			<a
				href="/"
				class="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
				>Volver al inicio →</a
			>
		</Card>
	{:else}
		<Card class="p-6">
			<form class="flex flex-col gap-4" onsubmit={enviar}>
				<FormField label="Nombre o institución" bind:value={form.nombre} required />
				<FormField
					label="Email o teléfono de contacto"
					bind:value={form.contacto}
					required
					placeholder="Ej. vecinos@correo.com o 11 5555-1234"
				/>
				<div class="flex flex-col gap-1">
					<label for="tipo" class="text-sm font-medium text-gray-700 dark:text-gray-200">
						¿Qué querés difundir?
					</label>
					<select
						id="tipo"
						bind:value={form.tipo}
						class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					>
						<option value="colecta">Colecta o evento solidario</option>
						<option value="publicidad">Emprendimiento o servicio</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="mensaje" class="text-sm font-medium text-gray-700 dark:text-gray-200">
						Contanos de qué se trata <span class="text-danger-600">*</span>
					</label>
					<textarea
						id="mensaje"
						bind:value={form.mensaje}
						rows="5"
						maxlength="1000"
						placeholder="Fechas, lugar, qué necesitan difundir y cómo puede ayudar la gente…"
						class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					></textarea>
				</div>

				{#if error}
					<p role="alert" class="text-sm text-danger-600">{error}</p>
				{/if}

				<Button type="submit" disabled={enviando}>
					{enviando ? 'Enviando…' : 'Enviar solicitud'}
				</Button>
				<p class="text-xs text-gray-400 dark:text-gray-500">
					Usamos el contacto solo para responder tu pedido. La difusión es gratuita y está sujeta a
					revisión.
				</p>
			</form>
		</Card>
	{/if}
</div>
