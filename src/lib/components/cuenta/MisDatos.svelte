<script lang="ts">
	// Datos personales y contraseña de la cuenta. Lo usan Mi Cuenta y Mi Negocio.
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/stores/auth.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { required, email as emailRule, passwordSegura, validateForm } from '$lib/validation';
	import type { Usuario } from '$lib/types';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import RequisitosPassword from '$lib/components/RequisitosPassword.svelte';

	let nombre = $state(auth.user?.nombre ?? '');
	let email = $state(auth.user?.email ?? '');
	let erroresDatos = $state<Record<string, string>>({});
	let guardandoDatos = $state(false);
	let mensajeDatos = $state('');
	let errorDatos = $state(false);

	let actual = $state('');
	let nueva = $state('');
	let confirmar = $state('');
	let erroresPass = $state<Record<string, string>>({});
	let guardandoPass = $state(false);
	let mensajePass = $state('');
	let errorPass = $state(false);

	async function guardarDatos() {
		erroresDatos = {};
		mensajeDatos = '';
		errorDatos = false;
		const errs = validateForm(
			{ nombre, email },
			{ nombre: [required()], email: [required(), emailRule()] }
		);
		if (Object.keys(errs).length > 0) {
			erroresDatos = errs;
			return;
		}
		guardandoDatos = true;
		try {
			const perfil = await api.put<Partial<Usuario>>('/usuarios/yo', {
				nombre: nombre.trim(),
				email: email.trim()
			});
			auth.actualizar({
				nombre: perfil.nombre ?? nombre.trim(),
				email: perfil.email ?? email.trim(),
				...(perfil.email_verificado !== undefined && {
					email_verificado: perfil.email_verificado
				})
			});
			// RF-01: un correo nuevo vuelve a exigir verificación; el backend ya mandó el enlace.
			mensajeDatos =
				perfil.email_verificado === false
					? 'Datos actualizados. Te enviamos un enlace para verificar tu nuevo correo.'
					: 'Datos actualizados correctamente.';
			toast.exito(mensajeDatos);
		} catch (err) {
			const msg = err instanceof ApiError ? err.message : 'No se pudieron guardar los cambios.';
			mensajeDatos = msg;
			errorDatos = true;
			toast.error(msg);
		} finally {
			guardandoDatos = false;
		}
	}

	async function cambiarContrasena() {
		erroresPass = {};
		mensajePass = '';
		errorPass = false;
		const errs = validateForm(
			{ actual, nueva, confirmar },
			{ actual: [required()], nueva: [required(), passwordSegura()], confirmar: [required()] }
		);
		let combinados = { ...errs };
		if (!errs.confirmar && confirmar && nueva !== confirmar) {
			combinados = { ...combinados, confirmar: 'Las contraseñas no coinciden' };
		}
		if (Object.keys(combinados).length > 0) {
			erroresPass = combinados;
			return;
		}
		guardandoPass = true;
		try {
			await api.put('/usuarios/yo', { password_actual: actual, password_nueva: nueva });
			actual = '';
			nueva = '';
			confirmar = '';
			errorPass = false;
			mensajePass = 'Contraseña actualizada correctamente.';
			toast.exito('Contraseña actualizada correctamente.');
		} catch (err) {
			errorPass = true;
			const msg = err instanceof ApiError ? err.message : 'No se pudo actualizar la contraseña.';
			mensajePass = msg;
			toast.error(msg);
		} finally {
			guardandoPass = false;
		}
	}
</script>

<section aria-labelledby="mis-datos">
	<h2 id="mis-datos" class="sr-only">Mis datos</h2>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<Card class="p-5">
			<h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
				Datos personales
			</h3>
			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					guardarDatos();
				}}
				class="flex flex-col gap-3"
			>
				<FormField label="Nombre" required bind:value={nombre} error={erroresDatos.nombre} />
				<FormField
					label="Correo electrónico"
					type="email"
					required
					bind:value={email}
					error={erroresDatos.email}
				/>
				{#if mensajeDatos}
					<p class="text-sm {errorDatos ? 'text-danger-600' : 'text-success-600'}">
						{mensajeDatos}
					</p>
				{/if}
				<div>
					<Button type="submit" size="sm" disabled={guardandoDatos}>
						{guardandoDatos ? 'Guardando...' : 'Guardar cambios'}
					</Button>
				</div>
			</form>
		</Card>
		<Card class="p-5">
			<h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
				Cambiar contraseña
			</h3>
			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					cambiarContrasena();
				}}
				class="flex flex-col gap-3"
			>
				<FormField
					label="Contraseña actual"
					type="password"
					required
					bind:value={actual}
					error={erroresPass.actual}
				/>
				<div>
					<FormField
						label="Nueva contraseña"
						type="password"
						required
						bind:value={nueva}
						error={erroresPass.nueva}
					/>
					<RequisitosPassword password={nueva} />
				</div>
				<FormField
					label="Confirmar nueva contraseña"
					type="password"
					required
					bind:value={confirmar}
					error={erroresPass.confirmar}
				/>
				{#if mensajePass}
					<p class="text-sm {errorPass ? 'text-danger-600' : 'text-success-600'}">
						{mensajePass}
					</p>
				{/if}
				<div>
					<Button type="submit" size="sm" disabled={guardandoPass}>
						{guardandoPass ? 'Guardando...' : 'Cambiar contraseña'}
					</Button>
				</div>
			</form>
		</Card>
	</div>
</section>
