<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { exigirAcceso } from '$lib/auth/guard';
	import { auth } from '$lib/stores/auth.svelte';
	import { publicidades } from '$lib/stores/publicidades.svelte';
	import { toast } from '$lib/_auditoria/toast.svelte';
	import type {
		Categoria,
		Empresa,
		HorariosPorDia,
		TelefonoEmpresa,
		TurnoRecibido
	} from '$lib/types';
	import {
		validateForm,
		required,
		numericPositive,
		telefonoSoloDigitos,
		caracteristicaTelefono,
		constanciaCuit,
		cuit
	} from '$lib/validation';
	import { cacheHorarios } from '$lib/horarios-cache';
	import { track } from '$lib/obs';
	import { DIAS_ORDEN } from '$lib/turnos';
	import { separarTelefono } from '$lib/contacto';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import MapaComercios from '$lib/components/MapaComercios.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import Check from '@lucide/svelte/icons/check';

	const DIAS = DIAS_ORDEN;

	// Lucide no incluye logos de marca; se dibujan a mano en el markup (ver <RedIcono>).
	const REDES = [
		{ id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/tu_comercio' },
		{ id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/tu_comercio' }
	] as const;

	const CANALES = [
		{ id: 'llamada', label: 'Solo llamada' },
		{ id: 'mensaje', label: 'Solo WhatsApp' },
		{ id: 'ambos', label: 'Llamada y WhatsApp' }
	] as const;

	// 2.6 "Mis turnos" es la vista inicial: el dueño entra a trabajar, no a configurar.
	let tab = $state('turnos');

	// ---------- Mi Ficha ----------
	let miEmpresa = $state<Empresa | null>(null);
	let cargandoFicha = $state(true);
	let form = $state({
		nombre: '',
		direccion: '',
		slogan: '',
		duracion_turno_min: '',
		instagram: '',
		facebook: ''
	});
	// Teléfono principal, cargado en dos campos (característica + número) y combinado al guardar.
	let caracteristicaPrincipal = $state('');
	let numeroPrincipal = $state('');
	let redAbierta = $state<(typeof REDES)[number]['id'] | null>(null);
	let turnosHabilitados = $state(true);
	let categoriaId = $state('');
	let categorias = $state<Categoria[]>([]);
	let formErrors = $state<Record<string, string>>({});
	let guardando = $state(false);
	let mensaje = $state('');
	// 1.2 Canal de contacto del comercio.
	let modoContacto = $state<'llamada' | 'mensaje' | 'ambos'>('ambos');
	// 1.3 Coordenadas del local (pin arrastrable).
	let latitud = $state<number | null>(null);
	let longitud = $state<number | null>(null);
	// 1.4 Verificación comercial.
	let cuitValor = $state('');
	let constanciaUrl = $state('');

	// Teléfonos: uno o varios (varios barberos/profesionales de un mismo local, etc.)
	let telefonos = $state<TelefonoEmpresa[]>([]);
	// Fotos: URLs cargadas a mano, mismo patrón que imagen_url de Publicidad.
	let fotos = $state<string[]>([]);

	$effect(() => {
		if (!exigirAcceso('admin')) return;

		api
			.get<Categoria[]>('/categorias')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));

		api
			.get<Empresa[]>(`/empresas?admin_id=${auth.user!.id}`)
			.then((lista) => {
				const propia = lista.find((e) => e.admin_id === auth.user!.id);
				miEmpresa = propia ?? null;
				if (propia) {
					form = {
						nombre: propia.nombre,
						direccion: propia.direccion,
						slogan: propia.slogan,
						duracion_turno_min: String(propia.duracion_turno_min ?? ''),
						instagram: propia.instagram ?? '',
						facebook: propia.facebook ?? ''
					};
					const separado = separarTelefono(propia.telefono);
					caracteristicaPrincipal = separado.caracteristica;
					numeroPrincipal = separado.numero;
					categoriaId = String(propia.categoria_id ?? '');
					turnosHabilitados = propia.turnos_habilitados ?? true;
					fotos = propia.fotos ?? [];
					modoContacto = propia.modo_contacto ?? 'ambos';
					latitud = propia.lat ?? null;
					longitud = propia.lng ?? null;
					cuitValor = propia.cuit ?? '';
					constanciaUrl = propia.constancia_cuit_url ?? '';
					cargarHorarios(propia.id);
					cargarTelefonos(propia.id);
				}
			})
			.catch((err) => console.error(err))
			.finally(() => (cargandoFicha = false));
	});

	const telefonoPrincipal = $derived(`${caracteristicaPrincipal}${numeroPrincipal}`);

	function cargarTelefonos(empresaId: number) {
		api
			.get<TelefonoEmpresa[]>(`/empresas/${empresaId}/telefonos`)
			.then((res) => (telefonos = res.length > 0 ? res : [{ numero: telefonoPrincipal }]))
			.catch(() => (telefonos = [{ numero: telefonoPrincipal }]));
	}

	function agregarTelefono() {
		telefonos = [...telefonos, { numero: '', etiqueta: '', modo_contacto: 'ambos' }];
	}

	function quitarTelefono(index: number) {
		telefonos = telefonos.filter((_, i) => i !== index);
	}

	function agregarFoto() {
		fotos = [...fotos, ''];
	}

	function quitarFoto(index: number) {
		fotos = fotos.filter((_, i) => i !== index);
	}

	function payloadTelefonos() {
		return telefonos
			.filter((t) => t.numero.trim())
			.map((t) => {
				const limpio: TelefonoEmpresa = {
					numero: t.numero.replace(/\D/g, ''),
					etiqueta: t.etiqueta
				};
				if (t.id !== undefined) limpio.id = t.id;
				if (t.modo_contacto) limpio.modo_contacto = t.modo_contacto;
				return limpio;
			});
	}

	async function guardarFicha() {
		mensaje = '';
		// 1.2 Validación dura: solo dígitos en teléfonos.
		formErrors = validateForm(
			{ ...form, categoriaId, caracteristicaPrincipal, numeroPrincipal, cuitValor },
			{
				nombre: [required()],
				direccion: [required()],
				caracteristicaPrincipal: [required(), caracteristicaTelefono()],
				numeroPrincipal: [required(), telefonoSoloDigitos()],
				categoriaId: [required()],
				...(cuitValor.trim() ? { cuitValor: [cuit()] } : {}),
				...(turnosHabilitados ? { duracion_turno_min: [required(), numericPositive()] } : {})
			}
		);
		// Validar teléfonos secundarios uno por uno.
		telefonos.forEach((t, i) => {
			if (t.numero.trim() && !/^[0-9]{6,15}$/.test(t.numero.replace(/\D/g, ''))) {
				formErrors = { ...formErrors, [`tel_${i}`]: 'Usá solo números, sin espacios ni guiones' };
			}
		});
		if (Object.keys(formErrors).length > 0) return;

		const payload = {
			...form,
			telefono: telefonoPrincipal.replace(/\D/g, ''),
			duracion_turno_min: turnosHabilitados ? Number(form.duracion_turno_min) : undefined,
			categoria_id: Number(categoriaId),
			admin_id: auth.user?.id,
			fotos: fotos.map((f) => f.trim()).filter(Boolean),
			turnos_habilitados: turnosHabilitados,
			modo_contacto: modoContacto,
			lat: latitud,
			lng: longitud,
			cuit: cuitValor.replace(/\D/g, '') || undefined,
			constancia_cuit_url: constanciaUrl.trim() || undefined
		};

		guardando = true;
		try {
			if (miEmpresa) {
				const actualizada = await api.put<Empresa>(`/empresas/${miEmpresa.id}`, payload);
				// Fusión (no reemplazo): el mock de tests responde `{}` y el backend real
				// podría devolver la ficha parcial; nunca se pierde el id local.
				miEmpresa = { ...miEmpresa, ...actualizada, id: miEmpresa.id };
			} else {
				miEmpresa = await api.post<Empresa>('/empresas', payload);
				if (miEmpresa?.id) {
					cargarHorarios(miEmpresa.id);
				}
			}

			const telefonosValidos = payloadTelefonos();
			if (miEmpresa && telefonosValidos.length > 0) {
				await api.put(`/empresas/${miEmpresa.id}/telefonos`, { telefonos: telefonosValidos });
			}

			mensaje = 'Ficha guardada correctamente.';
			toast.exito('Ficha guardada correctamente.');
		} catch (err) {
			console.error(err);
			mensaje = err instanceof ApiError ? err.message : 'Error al guardar la ficha.';
			toast.error(mensaje);
		} finally {
			guardando = false;
		}
	}

	// 1.4 Solicitar verificación con CUIT + constancia.
	let solicitandoVerificacion = $state(false);
	async function solicitarVerificacion() {
		if (!miEmpresa) return;
		const errorCuit = cuit()(cuitValor);
		if (!cuitValor.trim() || errorCuit) {
			formErrors = { ...formErrors, cuitValor: errorCuit ?? 'Este campo es obligatorio' };
			return;
		}
		const errorConstancia = constanciaCuit()(constanciaUrl);
		if (errorConstancia) {
			formErrors = { ...formErrors, constanciaUrl: errorConstancia };
			return;
		}
		solicitandoVerificacion = true;
		try {
			const res = await api.put<{ verificado_estado: Empresa['verificado_estado'] }>(
				`/empresas/${miEmpresa.id}/verificacion`,
				{
					accion: 'solicitar',
					cuit: cuitValor.replace(/\D/g, ''),
					constancia_cuit_url: constanciaUrl.trim() || undefined
				}
			);
			miEmpresa = {
				...miEmpresa,
				verificado_estado: res.verificado_estado,
				cuit: cuitValor.replace(/\D/g, ''),
				constancia_cuit_url: constanciaUrl.trim() || undefined
			};
			toast.exito('Solicitud de verificación enviada. Te avisaremos cuando se revise.');
			track('solicitar_verificacion', { empresa: miEmpresa.id });
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud.');
		} finally {
			solicitandoVerificacion = false;
		}
	}

	const estadoVerificacion = $derived(miEmpresa?.verificado_estado ?? 'sin_solicitar');

	// ---------- Horarios ----------
	let horarios = $state<HorariosPorDia>({});
	let guardandoHorarios = $state(false);
	let mensajeHorarios = $state('');

	function cargarHorarios(empresaId: number) {
		api
			.get<HorariosPorDia>(`/empresas/horarios/${empresaId}`)
			.then((h) => (horarios = h))
			.catch((err) => console.error(err));
	}

	function agregarRango(dia: string) {
		horarios = { ...horarios, [dia]: [...(horarios[dia] ?? []), '09:00-13:00'] };
	}

	function cambiarRango(dia: string, index: number, parte: 0 | 1, valor: string) {
		const lista = [...(horarios[dia] ?? [])];
		const partes = lista[index].split('-');
		partes[parte] = valor;
		lista[index] = partes.join('-');
		horarios = { ...horarios, [dia]: lista };
	}

	function quitarRango(dia: string, index: number) {
		horarios = { ...horarios, [dia]: (horarios[dia] ?? []).filter((_, i) => i !== index) };
	}

	async function guardarHorarios() {
		if (!miEmpresa) return;
		mensajeHorarios = '';
		for (const dia of DIAS) {
			for (const rango of horarios[dia] ?? []) {
				const [desde, hasta] = rango.split('-');
				if (!desde || !hasta || hasta <= desde) {
					mensajeHorarios = `${dia}: el horario de cierre debe ser posterior al de apertura.`;
					return;
				}
			}
		}
		guardandoHorarios = true;
		try {
			await api.put(`/empresas/${miEmpresa.id}/horarios`, { horarios });
			cacheHorarios.invalidate(miEmpresa.id);
			mensajeHorarios = 'Horarios guardados.';
			toast.exito('Horarios guardados.');
		} catch (err) {
			console.error(err);
			mensajeHorarios =
				err instanceof ApiError ? err.message : 'No se pudieron guardar los horarios.';
			toast.error(mensajeHorarios);
		} finally {
			guardandoHorarios = false;
		}
	}

	// ---------- Turnos recibidos ----------
	let turnosRecibidos = $state<TurnoRecibido[] | null>(null);
	let errorTurnos = $state('');
	let turnoACancelar: TurnoRecibido | null = $state(null);
	let cancelandoTurno = $state(false);

	function recargarTurnos() {
		if (!miEmpresa) return;
		turnosRecibidos = null;
		errorTurnos = '';
		api
			.get<TurnoRecibido[]>(`/empresas/${miEmpresa.id}/turnos`)
			.then((res) => (turnosRecibidos = res))
			.catch((err) => {
				console.error(err);
				errorTurnos = err instanceof ApiError ? err.message : 'No se pudieron cargar los turnos.';
				turnosRecibidos = [];
			});
	}

	$effect(() => {
		if (tab !== 'turnos' || !miEmpresa || turnosRecibidos !== null) return;
		recargarTurnos();
	});

	async function confirmarCancelarTurno() {
		if (!turnoACancelar) return;
		cancelandoTurno = true;
		try {
			// 1.5 El mock libera el slot en `ocupados`: vuelve a estar disponible al instante.
			await api.delete(`/turnos/cancelar/${turnoACancelar.id}`);
			turnosRecibidos = (turnosRecibidos ?? []).filter((t) => t.id !== turnoACancelar!.id);
			toast.exito('Turno cancelado. El horario quedó libre.');
			turnoACancelar = null;
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo cancelar el turno.');
		} finally {
			cancelandoTurno = false;
		}
	}

	function formatearFecha(fecha: string) {
		return new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});
	}

	// ---------- Publicidades ----------
	let nuevaPublicidad = $state({ titulo: '', descripcion: '', imagen_url: '' });

	function agregarPublicidad() {
		if (!miEmpresa || !nuevaPublicidad.titulo.trim()) return;
		publicidades.crear({ empresa_id: miEmpresa.id, ...nuevaPublicidad });
		toast.exito('Publicidad publicada.');
		nuevaPublicidad = { titulo: '', descripcion: '', imagen_url: '' };
	}
</script>

<div class="mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mi Negocio</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">
		Gestioná tu ficha, horarios, turnos y publicidades.
	</p>

	<Tabs
		tabs={[
			{ id: 'ficha', label: 'Mi Ficha' },
			{ id: 'horarios', label: 'Horarios' },
			{ id: 'turnos', label: 'Turnos recibidos' },
			{ id: 'publicidades', label: 'Publicidades' }
		]}
		bind:active={tab}
	/>

	<div class="mt-6">
		{#if cargandoFicha}
			<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
		{:else if tab === 'ficha'}
			<Card class="max-w-lg p-6">
				{#if !miEmpresa}
					<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
						Todavía no tenés un comercio cargado. Completá el formulario para crearlo.
					</p>
				{:else}
					<!-- 1.4 Badge de estado de verificación -->
					<div class="mb-4 flex flex-wrap items-center gap-2">
						{#if estadoVerificacion === 'verificado'}
							<Badge tone="brand">✓ Comercio verificado</Badge>
						{:else if estadoVerificacion === 'pendiente'}
							<Badge tone="neutral">Verificación pendiente</Badge>
						{:else if estadoVerificacion === 'rechazado'}
							<Badge tone="danger">Verificación rechazada</Badge>
						{:else}
							<Badge tone="neutral">Sin verificar</Badge>
						{/if}
					</div>
				{/if}
				<div class="flex flex-col gap-3">
					<FormField label="Nombre" required bind:value={form.nombre} error={formErrors.nombre} />
					<FormField
						label="Dirección"
						required
						bind:value={form.direccion}
						error={formErrors.direccion}
					/>
					<div>
						<p class="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
							Teléfono principal <span class="text-danger-600">*</span>
						</p>
						<div class="flex gap-2">
							<div class="w-24">
								<FormField
									label="Característica"
									placeholder="2392"
									bind:value={caracteristicaPrincipal}
									error={formErrors.caracteristicaPrincipal}
								/>
							</div>
							<div class="flex-1">
								<FormField
									label="Número"
									placeholder="456789"
									bind:value={numeroPrincipal}
									error={formErrors.numeroPrincipal}
								/>
							</div>
						</div>
						<p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
							Solo números, sin espacios ni guiones. Se muestra como 2392-456789 y WhatsApp lo usa
							como 5492392456789.
						</p>
					</div>

					<!-- 1.2 Selector de canal de contacto -->
					<div>
						<label
							for="modo-contacto"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
						>
							¿Cómo te contactan los clientes?
						</label>
						<select
							id="modo-contacto"
							bind:value={modoContacto}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							{#each CANALES as c (c.id)}
								<option value={c.id}>{c.label}</option>
							{/each}
						</select>
					</div>

					<FormField label="Slogan" bind:value={form.slogan} />

					<label class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
						<input type="checkbox" bind:checked={turnosHabilitados} class="mt-0.5" />
						<span>
							Ofrecer reserva de turnos online
							<span class="block text-xs text-gray-400 dark:text-gray-500">
								Si lo desactivás, tu ficha se muestra igual en el directorio pero sin botón de
								"Reservar turno" — solo con los datos de contacto.
							</span>
						</span>
					</label>

					{#if turnosHabilitados}
						<FormField
							label="Duración del turno (min)"
							type="number"
							required
							bind:value={form.duracion_turno_min}
							error={formErrors.duracion_turno_min}
						/>
					{/if}
					<div>
						<label
							for="categoria"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
						>
							Categoría <span class="text-danger-600">*</span>
						</label>
						<select
							id="categoria"
							bind:value={categoriaId}
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							<option value="">Elegí un rubro…</option>
							{#each categorias as c (c.id)}
								<option value={String(c.id)}>{c.nombre}</option>
							{/each}
						</select>
						{#if formErrors.categoriaId}
							<p class="mt-1 text-xs text-danger-600">{formErrors.categoriaId}</p>
						{/if}
					</div>

					<!-- 1.4 CUIT + constancia -->
					<div
						class="rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40"
					>
						<p class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
							Verificación comercial
						</p>
						<div class="flex flex-col gap-2">
							<FormField
								label="CUIT (11 dígitos)"
								placeholder="20123456786"
								bind:value={cuitValor}
								error={formErrors.cuitValor}
							/>
							<FormField
								label="Constancia de CUIT (URL del comprobante)"
								placeholder="https://ejemplo.com/constancia.pdf"
								bind:value={constanciaUrl}
								error={formErrors.constanciaUrl}
							/>
							{#if miEmpresa && estadoVerificacion !== 'verificado'}
								<div>
									<Button
										size="sm"
										variant="outline"
										disabled={solicitandoVerificacion}
										onclick={solicitarVerificacion}
									>
										{solicitandoVerificacion
											? 'Enviando…'
											: estadoVerificacion === 'pendiente'
												? 'Reenviar solicitud'
												: 'Solicitar verificación'}
									</Button>
								</div>
							{/if}
						</div>
					</div>
					{#snippet redIcono(id: (typeof REDES)[number]['id'], clase: string)}
						{#if id === 'instagram'}
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class={clase}
							>
								<rect x="3" y="3" width="18" height="18" rx="5" />
								<circle cx="12" cy="12" r="4" />
								<circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor" class={clase}>
								<path
									d="M14 3h3v4h-3c-.6 0-1 .4-1 1v3h4l-.5 4H13v6h-4v-6H6v-4h3V8c0-2.8 2.2-5 5-5z"
								/>
							</svg>
						{/if}
					{/snippet}

					<div>
						<p class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Redes sociales</p>
						<div class="flex gap-2">
							{#each REDES as red (red.id)}
								{@const cargado = !!form[red.id]}
								<div class="relative">
									<button
										type="button"
										aria-label={red.label}
										onclick={() => (redAbierta = redAbierta === red.id ? null : red.id)}
										class="relative flex h-11 w-11 items-center justify-center rounded-full border transition {cargado
											? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400'
											: 'border-gray-300 text-gray-500 hover:border-brand-300 dark:border-gray-600 dark:text-gray-400'}"
									>
										{@render redIcono(red.id, 'h-5 w-5')}
										{#if cargado}
											<span
												class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success-600 text-white"
											>
												<Check class="h-2.5 w-2.5" />
											</span>
										{/if}
									</button>

									{#if redAbierta === red.id}
										<div
											class="absolute top-full left-0 z-10 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
										>
											<p
												class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200"
											>
												{@render redIcono(red.id, 'h-4 w-4')}{red.label}
											</p>
											<input
												type="url"
												placeholder={red.placeholder}
												bind:value={form[red.id]}
												class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
											/>
											<div class="mt-2 flex justify-between">
												<button
													type="button"
													class="text-xs text-danger-600 hover:underline"
													onclick={() => {
														form[red.id] = '';
														redAbierta = null;
													}}
												>
													Quitar enlace
												</button>
												<button
													type="button"
													class="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
													onclick={() => (redAbierta = null)}
												>
													Guardar
												</button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>

				{#if mensaje}
					<p class="mt-3 text-sm text-gray-600 dark:text-gray-400">{mensaje}</p>
				{/if}

				<Button class="mt-4" disabled={guardando} onclick={guardarFicha}>
					{guardando ? 'Guardando...' : miEmpresa ? 'Guardar cambios' : 'Crear comercio'}
				</Button>
			</Card>

			<Card class="mt-4 max-w-lg p-6">
				<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Otros teléfonos de contacto
				</p>
				<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
					Sumá uno por cada persona que atiende (peluquero, profesional, etc.) o área (recepción,
					turnos). Se muestran todos en la ficha pública. Solo números.
				</p>
				<div class="flex flex-col gap-3">
					{#each telefonos as tel, i (i)}
						<div class="rounded-lg border border-gray-100 p-2 dark:border-gray-800">
							<div class="flex items-center gap-2">
								<input
									placeholder="Número"
									aria-label="Número de teléfono {i + 1}"
									bind:value={tel.numero}
									inputmode="numeric"
									class="w-32 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
								<input
									placeholder="Etiqueta (opcional, ej: Turnos)"
									aria-label="Etiqueta del teléfono {i + 1}"
									bind:value={tel.etiqueta}
									class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
								<button
									class="text-xs text-danger-600 hover:underline"
									onclick={() => quitarTelefono(i)}
									aria-label="Quitar teléfono"
								>
									Quitar
								</button>
							</div>
							<div class="mt-1 flex items-center gap-2 pl-1">
								<label class="text-xs text-gray-400 dark:text-gray-500" for="canal-tel-{i}">
									Canal:
								</label>
								<select
									id="canal-tel-{i}"
									bind:value={tel.modo_contacto}
									class="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
								>
									<option value={undefined}>Igual que el comercio</option>
									{#each CANALES as c (c.id)}
										<option value={c.id}>{c.label}</option>
									{/each}
								</select>
							</div>
							{#if formErrors[`tel_${i}`]}
								<p class="mt-1 text-xs text-danger-600">{formErrors[`tel_${i}`]}</p>
							{/if}
						</div>
					{/each}
				</div>
				<button
					class="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
					onclick={agregarTelefono}
				>
					+ Agregar otro teléfono de contacto
				</button>
			</Card>

			<!-- 1.3 Pin de ubicación interactivo -->
			<Card class="mt-4 max-w-lg p-6">
				<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
					Ubicación en el mapa
				</p>
				<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
					Arrastrá el pin o hacé clic en el mapa para fijar la ubicación exacta de tu local.
				</p>
				<MapaComercios
					puntos={[]}
					modoSelector={true}
					{latitud}
					{longitud}
					oncambio={(lat, lng) => {
						latitud = Math.round(lat * 1e6) / 1e6;
						longitud = Math.round(lng * 1e6) / 1e6;
					}}
					alto="h-64"
				/>
				<p class="mt-2 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
					{#if latitud != null && longitud != null}
						Lat {latitud.toFixed(6)} · Lng {longitud.toFixed(6)}
					{:else}
						Todavía no fijaste la ubicación.
					{/if}
				</p>
			</Card>

			{#if miEmpresa}
				<Card class="mt-4 max-w-lg p-6">
					<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Fotos del local</p>
					<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
						Pegá la URL de cada foto (mismo formato que la imagen de una publicidad).
					</p>
					<div class="flex flex-col gap-2">
						{#each fotos as _, i (i)}
							<div class="flex items-center gap-2">
								<input
									placeholder="https://..."
									bind:value={fotos[i]}
									class="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
								<button
									class="text-xs text-danger-600 hover:underline"
									onclick={() => quitarFoto(i)}
									aria-label="Quitar foto"
								>
									Quitar
								</button>
							</div>
						{/each}
					</div>
					<button
						class="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
						onclick={agregarFoto}
					>
						+ agregar foto
					</button>
				</Card>
			{/if}
		{:else if tab === 'horarios'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else}
				<Card class="max-w-lg p-6">
					<div class="flex flex-col gap-4">
						{#each DIAS as dia (dia)}
							<div>
								<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">{dia}</p>
								{#each horarios[dia] ?? [] as rango, i (i)}
									<div class="mt-1 flex items-center gap-2 text-sm">
										<input
											type="time"
											step="900"
											aria-label="Apertura {dia} {i + 1}"
											value={rango.split('-')[0]}
											onchange={(e) => cambiarRango(dia, i, 0, e.currentTarget.value)}
											class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<span class="text-gray-400">a</span>
										<input
											type="time"
											step="900"
											aria-label="Cierre {dia} {i + 1}"
											value={rango.split('-')[1]}
											onchange={(e) => cambiarRango(dia, i, 1, e.currentTarget.value)}
											class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
										/>
										<button
											class="text-xs text-danger-600 hover:underline"
											onclick={() => quitarRango(dia, i)}
										>
											Quitar
										</button>
									</div>
								{/each}
								<button
									class="mt-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
									onclick={() => agregarRango(dia)}
								>
									+ agregar rango
								</button>
							</div>
						{/each}
					</div>

					{#if mensajeHorarios}
						<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">{mensajeHorarios}</p>
					{/if}

					<Button class="mt-4" disabled={guardandoHorarios} onclick={guardarHorarios}>
						{guardandoHorarios ? 'Guardando...' : 'Guardar horarios'}
					</Button>
				</Card>
			{/if}
		{:else if tab === 'turnos'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else if !turnosHabilitados}
				<EmptyState
					title="No ofrecés reserva de turnos"
					description="Activá 'Ofrecer reserva de turnos online' en Mi Ficha si querés recibir turnos por la app."
				/>
			{:else if errorTurnos}
				<EmptyState title="No se pudieron cargar los turnos" description={errorTurnos} />
			{:else if turnosRecibidos === null}
				<p class="text-sm text-gray-400 dark:text-gray-500">Cargando turnos...</p>
			{:else if turnosRecibidos.length === 0}
				<EmptyState
					title="Todavía no recibiste turnos"
					description="Cuando un cliente reserve, va a aparecer acá."
				/>
			{:else}
				<div class="flex flex-col gap-3">
					{#each turnosRecibidos as turno (turno.id)}
						<Card class="flex items-center justify-between gap-3 p-4">
							<div>
								<p class="font-semibold text-gray-800 dark:text-gray-100">{turno.cliente_nombre}</p>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									{formatearFecha(turno.fecha)}
								</p>
							</div>
							<div class="flex items-center gap-3">
								<p class="text-lg font-bold text-brand-700 dark:text-brand-400">
									{turno.hora.slice(0, 5)} hs
								</p>
								<button
									class="text-xs font-medium text-danger-600 hover:underline"
									onclick={() => (turnoACancelar = turno)}
								>
									Cancelar
								</button>
							</div>
						</Card>
					{/each}
				</div>
			{/if}
		{:else if tab === 'publicidades'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else}
				<Card class="max-w-lg p-6">
					<p class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
						Nueva publicidad
					</p>
					<div class="flex flex-col gap-3">
						<FormField label="Título" bind:value={nuevaPublicidad.titulo} />
						<FormField label="Descripción" bind:value={nuevaPublicidad.descripcion} />
						<FormField label="URL de imagen" bind:value={nuevaPublicidad.imagen_url} />
					</div>
					<Button class="mt-4" onclick={agregarPublicidad}>Publicar</Button>
				</Card>

				<div class="mt-4 flex flex-col gap-3">
					{#each publicidades.porEmpresa(miEmpresa.id) as pub (pub.id)}
						<Card class="flex items-center justify-between p-4">
							<div>
								<p class="font-semibold text-gray-800 dark:text-gray-100">{pub.titulo}</p>
								<p class="text-sm text-gray-500 dark:text-gray-400">{pub.descripcion}</p>
							</div>
							<button
								class="text-sm text-danger-600 hover:underline"
								onclick={() => publicidades.eliminar(pub.id)}
							>
								Eliminar
							</button>
						</Card>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

<ConfirmModal
	abierto={turnoACancelar !== null}
	titulo="Cancelar turno"
	descripcion={turnoACancelar
		? `¿Cancelar el turno de ${turnoACancelar.cliente_nombre} (${turnoACancelar.hora.slice(0, 5)} hs)? El horario quedará libre.`
		: ''}
	confirmarTexto="Sí, cancelar"
	oncancelar={() => (turnoACancelar = null)}
	onconfirmar={confirmarCancelarTurno}
	ocupado={cancelandoTurno}
/>
