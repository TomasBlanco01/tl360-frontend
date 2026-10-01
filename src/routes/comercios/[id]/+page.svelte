<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import type { Empresa, HorariosPorDia, Resena } from '$lib/types';
	import { auth } from '$lib/stores/auth.svelte';
	import { favoritos } from '$lib/stores/favoritos.svelte';
	import { estaAbiertoAhora, agruparHorarios } from '$lib/turnos';
	import { enlaceLlamada, enlaceWhatsApp, formatearTelefono } from '$lib/contacto';
	import Card from '$lib/components/ui/Card.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RatingStars from '$lib/components/ui/RatingStars.svelte';
	import MapaComercios from '$lib/components/MapaComercios.svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Clock from '@lucide/svelte/icons/clock';
	import X from '@lucide/svelte/icons/x';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const empresaId = $derived(Number(page.params.id));

	let empresa = $state<Empresa | null>(null);
	let horarios = $state<HorariosPorDia>({});
	let cargando = $state(true);

	const gruposHorario = $derived(agruparHorarios(horarios));

	$effect(() => {
		cargando = true;
		Promise.all([
			api.get<Empresa>(`/empresas/${empresaId}`),
			api.get<HorariosPorDia>(`/empresas/horarios/${empresaId}`)
		])
			.then(([e, h]) => {
				empresa = e;
				horarios = h;
			})
			.catch((err) => console.error('Error cargando comercio:', err))
			.finally(() => (cargando = false));
	});

	// ---------- Reseñas (RF-13) ----------
	let resenas = $state<Resena[]>([]);
	let puntaje = $state(0);
	let comentario = $state('');
	let enviandoResena = $state(false);
	let mensajeResena = $state('');
	let errorResena = $state(false);

	const esDueno = $derived(!!auth.user && empresa?.admin_id === auth.user.id);

	$effect(() => {
		api
			.get<Resena[]>(`/empresas/${empresaId}/calificaciones`)
			.then((r) => (resenas = r))
			.catch(() => (resenas = []));
	});

	async function enviarResena() {
		mensajeResena = '';
		if (puntaje < 1) {
			errorResena = true;
			mensajeResena = 'Elegí un puntaje de 1 a 5 estrellas.';
			return;
		}
		enviandoResena = true;
		try {
			await api.post(`/empresas/${empresaId}/calificaciones`, {
				puntaje,
				comentario: comentario.trim() || undefined
			});
			const [e, r] = await Promise.all([
				api.get<Empresa>(`/empresas/${empresaId}`),
				api.get<Resena[]>(`/empresas/${empresaId}/calificaciones`)
			]);
			empresa = e;
			resenas = r;
			errorResena = false;
			mensajeResena = '¡Gracias por tu calificación!';
		} catch (err) {
			errorResena = true;
			mensajeResena = err instanceof ApiError ? err.message : 'No se pudo enviar la calificación.';
		} finally {
			enviandoResena = false;
		}
	}

	// ---------- Reportar (RF-16) ----------
	let reportando = $state(false);
	let motivoReporte = $state('');
	let mensajeReporte = $state('');
	let errorReporte = $state(false);

	async function enviarReporte() {
		mensajeReporte = '';
		errorReporte = false;
		try {
			await api.post(`/empresas/${empresaId}/reportes`, { motivo: motivoReporte });
			mensajeReporte = 'Reporte enviado. Gracias por avisarnos.';
			motivoReporte = '';
			reportando = false;
		} catch (err) {
			errorReporte = true;
			mensajeReporte = err instanceof ApiError ? err.message : 'No se pudo enviar el reporte.';
		}
	}

	// ---------- Sello de verificado (RF-15, solo superadmin) ----------
	let mensajeSello = $state('');
	async function alternarVerificado() {
		if (!empresa) return;
		mensajeSello = '';
		try {
			const res = await api.put<{ verificado: boolean }>(`/empresas/${empresaId}/verificado`, {
				verificado: !empresa.verificado
			});
			empresa = { ...empresa, verificado: res.verificado };
		} catch (err) {
			mensajeSello = err instanceof ApiError ? err.message : 'No se pudo cambiar el sello.';
		}
	}

	const abierto = $derived(estaAbiertoAhora(horarios));

	// Uno o varios teléfonos (un local puede tener varios barberos/profesionales).
	const telefonos = $derived(
		empresa?.telefonos && empresa.telefonos.length > 0
			? empresa.telefonos
			: empresa
				? [{ numero: empresa.telefono }]
				: []
	);

	const mapaSrc = $derived(
		empresa
			? `https://www.google.com/maps?q=${encodeURIComponent(`${empresa.direccion}, Trenque Lauquen, Buenos Aires, Argentina`)}&output=embed`
			: ''
	);

	function toggleFavorito() {
		if (!auth.user) {
			goto('/auth/login');
			return;
		}
		favoritos.toggle(empresaId);
	}

	function contactar(modo: 'llamada' | 'mensaje', numero: string) {
		if (modo === 'llamada') {
			window.location.href = enlaceLlamada(numero);
		} else {
			window.open(enlaceWhatsApp(numero), '_blank', 'noopener');
		}
	}

	// ---------- Visor de fotos (lightbox) ----------
	let fotoAbierta = $state<number | null>(null);
	let lightboxEl = $state<HTMLDivElement | undefined>();
	const totalFotos = $derived(empresa?.fotos?.length ?? 0);

	$effect(() => {
		if (fotoAbierta !== null) lightboxEl?.focus();
	});

	function siguienteFoto() {
		if (fotoAbierta !== null) fotoAbierta = (fotoAbierta + 1) % totalFotos;
	}
	function fotoAnterior() {
		if (fotoAbierta !== null) fotoAbierta = (fotoAbierta - 1 + totalFotos) % totalFotos;
	}
	function teclaLightbox(e: KeyboardEvent) {
		if (fotoAbierta === null) return;
		if (e.key === 'Escape') fotoAbierta = null;
		else if (e.key === 'ArrowRight') siguienteFoto();
		else if (e.key === 'ArrowLeft') fotoAnterior();
	}
</script>

{#if cargando}
	<p class="mx-auto max-w-3xl px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
		Cargando comercio...
	</p>
{:else if !empresa}
	<p class="mx-auto max-w-3xl px-4 py-10 text-center text-sm text-danger-600">
		No se encontró el comercio solicitado.
	</p>
{:else}
	<div class="mx-auto max-w-3xl px-4 py-8">
		<Card class="p-6">
			<div class="flex items-start gap-4">
				<Avatar name={empresa.nombre} size={64} />
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">{empresa.nombre}</h1>
						{#if empresa.verificado}
							<Badge tone="brand">Verificado</Badge>
						{/if}
						<Badge tone={abierto ? 'success' : 'danger'}
							>{abierto ? 'Abierto ahora' : 'Cerrado'}</Badge
						>
						{#if empresa.turnos_habilitados === false}
							<Badge tone="neutral">Solo contacto directo</Badge>
						{/if}
					</div>
					{#if empresa.categoria}
						<p class="text-sm text-gray-400 dark:text-gray-500">{empresa.categoria}</p>
					{/if}
					{#if empresa.calificacion_promedio}
						<div class="mt-1">
							<RatingStars
								value={empresa.calificacion_promedio}
								count={empresa.calificacion_cantidad}
							/>
						</div>
					{/if}
				</div>

				<button
					class="text-2xl transition {favoritos.isFavorito(empresaId)
						? 'text-danger-600'
						: 'hover:text-danger-400 text-gray-300'}"
					onclick={toggleFavorito}
					aria-label="Marcar como favorito"
				>
					{favoritos.isFavorito(empresaId) ? '♥' : '♡'}
				</button>
			</div>

			{#if empresa.slogan}
				<p class="mt-4 text-gray-600 dark:text-gray-300">{empresa.slogan}</p>
			{/if}

			{#if empresa.descripcion}
				<p class="mt-3 text-sm whitespace-pre-line text-gray-500 dark:text-gray-400">
					{empresa.descripcion}
				</p>
			{/if}

			{#if empresa.etiquetas && empresa.etiquetas.length > 0}
				<div class="mt-3 flex flex-wrap gap-2">
					{#each empresa.etiquetas as etiqueta (etiqueta)}
						<Badge tone="neutral">{etiqueta}</Badge>
					{/each}
				</div>
			{/if}

			<div
				class="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 dark:border-gray-800"
			>
				<div>
					<p
						class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500"
					>
						<MapPin class="h-3.5 w-3.5" /> Dirección
					</p>
					<p class="mt-1 text-sm text-gray-700 dark:text-gray-300">{empresa.direccion}</p>
				</div>
				<div>
					<p
						class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500"
					>
						<Clock class="h-3.5 w-3.5" /> Horarios
					</p>
					{#if Object.keys(horarios).length === 0}
						<p class="mt-1 text-sm text-gray-400 dark:text-gray-500">Sin horarios cargados</p>
					{:else}
						<ul class="mt-1 flex flex-col gap-0.5 text-sm text-gray-700 dark:text-gray-300">
							{#each gruposHorario as grupo (grupo.etiqueta)}
								<li>
									{grupo.etiqueta}: {grupo.rangos.length > 0 ? grupo.rangos.join(', ') : 'Cerrado'}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex flex-wrap items-center gap-3">
				{#if empresa.turnos_habilitados !== false}
					<Button size="lg" onclick={() => goto(`/comercios/${empresaId}/reservar`)}>
						Reservar turno
					</Button>
				{:else if telefonos.length > 0}
					{#if empresa.modo_contacto !== 'mensaje'}
						<Button size="lg" onclick={() => contactar('llamada', telefonos[0].numero)}
							>Llamar</Button
						>
					{/if}
					{#if empresa.modo_contacto !== 'llamada'}
						<Button
							size="lg"
							variant={empresa.modo_contacto === 'mensaje' ? 'primary' : 'outline'}
							onclick={() => contactar('mensaje', telefonos[0].numero)}
						>
							WhatsApp
						</Button>
					{/if}
				{/if}
				{#if empresa.instagram || empresa.facebook}
					<span class="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700"></span>
				{/if}
				{#if empresa.instagram}
					<a
						href={empresa.instagram}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
					>
						Instagram <ExternalLink class="h-3.5 w-3.5" />
					</a>
				{/if}
				{#if empresa.facebook}
					<a
						href={empresa.facebook}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
					>
						Facebook <ExternalLink class="h-3.5 w-3.5" />
					</a>
				{/if}
			</div>

			{#if telefonos.length > 0}
				<div class="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
					<p class="mb-2 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500">
						Contacto
					</p>
					<div class="flex flex-col gap-2">
						{#each telefonos as tel, i (tel.numero + i)}
							<div class="flex flex-wrap items-center gap-3">
								<span class="text-sm text-gray-700 dark:text-gray-300">
									{tel.etiqueta ? `${tel.etiqueta} — ` : ''}{formatearTelefono(tel.numero)}
								</span>
								{#if empresa.modo_contacto !== 'mensaje'}
									<Button
										variant="outline"
										size="sm"
										onclick={() => contactar('llamada', tel.numero)}
									>
										Llamar
									</Button>
								{/if}
								{#if empresa.modo_contacto !== 'llamada'}
									<Button
										variant="outline"
										size="sm"
										onclick={() => contactar('mensaje', tel.numero)}
									>
										WhatsApp
									</Button>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if empresa.fotos && empresa.fotos.length > 0}
				<div class="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
					<p class="mb-2 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500">Fotos</p>
					<div class="flex gap-3 overflow-x-auto pb-1">
						{#each empresa.fotos as foto, i (foto)}
							<button
								type="button"
								onclick={() => (fotoAbierta = i)}
								class="shrink-0 cursor-zoom-in"
								aria-label="Ver foto {i + 1} en grande"
							>
								<img
									src={foto}
									alt={empresa.nombre}
									class="h-32 w-44 rounded-lg object-cover"
									loading="lazy"
								/>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if empresa.fotos && fotoAbierta !== null}
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
					role="dialog"
					aria-modal="true"
					aria-label="Foto de {empresa.nombre}"
					tabindex="-1"
					bind:this={lightboxEl}
					onkeydown={teclaLightbox}
					onclick={(e) => e.target === e.currentTarget && (fotoAbierta = null)}
				>
					<button
						class="absolute top-4 right-4 text-white/80 hover:text-white"
						onclick={() => (fotoAbierta = null)}
						aria-label="Cerrar"
					>
						<X class="h-7 w-7" />
					</button>
					{#if totalFotos > 1}
						<button
							class="absolute left-2 text-white/80 hover:text-white sm:left-6"
							onclick={fotoAnterior}
							aria-label="Foto anterior"
						>
							<ChevronLeft class="h-9 w-9" />
						</button>
						<button
							class="absolute right-2 text-white/80 hover:text-white sm:right-6"
							onclick={siguienteFoto}
							aria-label="Foto siguiente"
						>
							<ChevronRight class="h-9 w-9" />
						</button>
					{/if}
					<img
						src={empresa.fotos[fotoAbierta]}
						alt="{empresa.nombre} — foto {fotoAbierta + 1}"
						class="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
					/>
					{#if totalFotos > 1}
						<p class="absolute bottom-4 text-sm text-white/80">
							Foto {fotoAbierta + 1} de {totalFotos}
						</p>
					{/if}
				</div>
			{/if}

			<div class="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
				<p class="mb-2 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500">
					Ubicación
				</p>
				{#if empresa.lat != null && empresa.lng != null}
					<MapaComercios
						puntos={[
							{ id: empresa.id, nombre: empresa.nombre, lat: empresa.lat, lng: empresa.lng }
						]}
						alto="h-56"
					/>
				{:else}
					<iframe
						title="Mapa de ubicación de {empresa.nombre}"
						src={mapaSrc}
						class="h-56 w-full rounded-lg border-0"
						loading="lazy"
						referrerpolicy="no-referrer-when-downgrade"
					></iframe>
				{/if}
			</div>

			<div class="mt-5 border-t border-gray-100 pt-5 dark:border-gray-800">
				<p class="mb-3 text-xs font-semibold text-gray-400 uppercase dark:text-gray-500">
					Opiniones
				</p>

				{#if !auth.user}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						<a
							href="/auth/login"
							class="font-medium text-brand-600 hover:underline dark:text-brand-400"
							>Iniciá sesión</a
						> para calificar este comercio.
					</p>
				{:else if esDueno}
					<p class="text-sm text-gray-500 dark:text-gray-400">
						No podés calificar tu propio comercio.
					</p>
				{:else}
					<div class="flex flex-col gap-2">
						<div class="flex items-center gap-1" role="radiogroup" aria-label="Tu puntaje">
							{#each [1, 2, 3, 4, 5] as n (n)}
								<button
									type="button"
									role="radio"
									aria-checked={puntaje === n}
									aria-label="{n} {n === 1 ? 'estrella' : 'estrellas'}"
									class="text-2xl leading-none transition {n <= puntaje
										? 'text-warning-500'
										: 'hover:text-warning-400 text-gray-300 dark:text-gray-600'}"
									onclick={() => (puntaje = n)}>★</button
								>
							{/each}
						</div>
						<textarea
							bind:value={comentario}
							rows="2"
							maxlength="1000"
							placeholder="Contanos tu experiencia (opcional)"
							aria-label="Comentario"
							class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						></textarea>
						<div>
							<Button size="sm" disabled={enviandoResena} onclick={enviarResena}>
								Enviar calificación
							</Button>
						</div>
					</div>
					{#if mensajeResena}
						<p class="mt-2 text-sm {errorResena ? 'text-danger-600' : 'text-success-600'}">
							{mensajeResena}
						</p>
					{/if}
				{/if}

				<ul class="mt-4 flex flex-col gap-3">
					{#each resenas as r, i (i)}
						<li class="text-sm">
							<div class="flex items-center gap-2">
								<span class="font-semibold text-gray-700 dark:text-gray-200"
									>{r.usuario_nombre}</span
								>
								<RatingStars value={r.puntaje} />
							</div>
							{#if r.comentario}
								<p class="text-gray-500 dark:text-gray-400">{r.comentario}</p>
							{/if}
						</li>
					{/each}
					{#if resenas.length === 0}
						<li class="text-sm text-gray-400 dark:text-gray-500">Todavía no hay opiniones.</li>
					{/if}
				</ul>
			</div>

			<div
				class="mt-5 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 dark:border-gray-800"
			>
				{#if auth.user && !esDueno}
					<button
						class="text-xs text-gray-400 hover:underline dark:text-gray-500"
						onclick={() => (reportando = !reportando)}
					>
						Reportar este comercio
					</button>
				{/if}
				{#if auth.isSuperAdmin}
					<button
						class="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
						onclick={alternarVerificado}
					>
						{empresa.verificado ? 'Quitar sello de verificado' : 'Otorgar sello de verificado'}
					</button>
				{/if}
				{#if mensajeSello}
					<span class="text-xs text-danger-600">{mensajeSello}</span>
				{/if}
				{#if mensajeReporte}
					<span class="text-xs {errorReporte ? 'text-danger-600' : 'text-success-600'}"
						>{mensajeReporte}</span
					>
				{/if}
			</div>
			{#if reportando}
				<div class="mt-3 flex flex-col gap-2">
					<textarea
						bind:value={motivoReporte}
						rows="2"
						maxlength="500"
						placeholder="¿Qué problema tiene esta ficha? (datos falsos, cerrado, contenido ofensivo…)"
						aria-label="Motivo del reporte"
						class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					></textarea>
					<div>
						<Button size="sm" variant="outline" onclick={enviarReporte}>Enviar reporte</Button>
					</div>
				</div>
			{/if}
		</Card>
	</div>
{/if}
