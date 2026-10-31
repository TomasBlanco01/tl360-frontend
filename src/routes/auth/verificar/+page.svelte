<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fly } from 'svelte/transition';
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { validateForm, required, email as emailRule } from '$lib/validation';
	import FormField from '$lib/components/FormField.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// RF-01: dos modos. Con ?token= verifica la cuenta; sin token muestra el estado
	// pendiente y permite reenviar el enlace. Se lee `page.url` directo (sin derived
	// intermedios) para no capturar valores iniciales y reaccionar a cambios de query.
	let estado = $state<'verificando' | 'ok' | 'error' | 'pendiente'>(
		page.url.searchParams.get('token') ? 'verificando' : 'pendiente'
	);
	let mensaje = $state('');
	let email = $state(page.url.searchParams.get('email') ?? '');
	let emailDestino = $state(page.url.searchParams.get('email') ?? '');
	let reenviando = $state(false);
	let reenviado = $state(false);
	let enlaceDemo = $state('');
	let tokenProcesado = $state<string | null>(null);

	$effect(() => {
		const t = page.url.searchParams.get('token') ?? '';
		if (t && t !== tokenProcesado) {
			tokenProcesado = t;
			verificar(t);
		}
	});

	async function verificar(t: string) {
		estado = 'verificando';
		mensaje = '';
		try {
			const res = await api.post<{ message: string }>('/auth/verificar-email', { token: t });
			estado = 'ok';
			mensaje = res.message ?? 'Cuenta verificada correctamente.';
			auth.setVerificado();
		} catch (err) {
			estado = 'error';
			mensaje = err instanceof ApiError ? err.message : 'No se pudo verificar la cuenta.';
		}
	}

	async function reenviar() {
		const errors = validateForm({ email }, { email: [required(), emailRule()] });
		if (errors.email) {
			mensaje = errors.email;
			return;
		}
		mensaje = '';
		enlaceDemo = '';
		reenviando = true;
		try {
			const res = await api.post<{ message: string; token_verificacion?: string }>(
				'/auth/reenviar-verificacion',
				{ email }
			);
			reenviado = true;
			mensaje =
				res.message ?? 'Si el correo está pendiente de verificación, te enviamos un nuevo enlace.';
			// En modo mock el enlace de ejemplo vuelve en la respuesta para poder recorrer el flujo.
			if (res.token_verificacion) {
				enlaceDemo = `/auth/verificar?token=${encodeURIComponent(res.token_verificacion)}`;
			}
		} catch (err) {
			mensaje = err instanceof ApiError ? err.message : 'No se pudo reenviar el enlace.';
		} finally {
			reenviando = false;
		}
	}
</script>

<div
	class="flex min-h-[90vh] items-center justify-center bg-gradient-to-b from-brand-100 to-white px-4 dark:from-gray-900 dark:to-gray-950"
>
	<div
		class="w-full max-w-sm rounded-card bg-white p-8 shadow-[var(--shadow-card)] dark:bg-gray-900"
		transition:fly={{ y: 40, duration: 500 }}
	>
		<h1 class="mb-1 text-center text-2xl font-bold text-brand-700 dark:text-brand-400">
			Verificá tu cuenta
		</h1>

		{#if estado === 'verificando'}
			<p class="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
				Verificando tu correo…
			</p>
		{:else if estado === 'ok'}
			<p class="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">{mensaje}</p>
			<Button class="mt-6 w-full" size="lg" onclick={() => goto('/auth/login')}>
				Iniciar sesión
			</Button>
		{:else if estado === 'error'}
			<p class="mt-6 text-center text-sm text-danger-600">{mensaje}</p>
			<Button
				class="mt-6 w-full"
				size="lg"
				variant="outline"
				onclick={() => (estado = 'pendiente')}
			>
				Pedir un nuevo enlace
			</Button>
		{:else}
			<p class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
				Te enviamos un correo con un enlace de verificación
				{#if emailDestino}
					a <span class="font-semibold">{emailDestino}</span>
				{/if}. Tenés que confirmarlo antes de reservar turnos.
			</p>
			<div class="mt-6 flex flex-col gap-4">
				<FormField label="Correo electrónico" type="email" bind:value={email} />
				<Button size="lg" disabled={reenviando} onclick={reenviar} class="w-full">
					{reenviando ? 'Enviando…' : 'Reenviar enlace'}
				</Button>
			</div>
			{#if mensaje}
				<p class="mt-3 text-center text-sm text-gray-600 dark:text-gray-300">{mensaje}</p>
			{/if}
			{#if enlaceDemo}
				<p class="mt-3 text-center text-sm">
					<a href={enlaceDemo} class="font-semibold text-brand-600 hover:underline">
						Abrir enlace de ejemplo (modo demo)
					</a>
				</p>
			{/if}
			{#if reenviado}
				<p class="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
					¿Ya lo confirmaste?
					<a href="/auth/login" class="font-bold text-brand-600 dark:text-brand-400">
						Iniciá sesión
					</a>
				</p>
			{/if}
		{/if}
	</div>
</div>
