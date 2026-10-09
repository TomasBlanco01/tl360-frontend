<script lang="ts">
	import { animate } from 'animejs';
	import type { Publicidad } from '$lib/types';
	import { urlEmpresa } from '$lib/slug';
	import { browser } from '$app/environment';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { items }: { items: Publicidad[] } = $props();

	let active = $state(0);
	let autoplayTimer: ReturnType<typeof setInterval> | undefined;
	let cardEls: (HTMLDivElement | null)[] = [];
	let montado = false;
	const reduceMovimiento = browser && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// 2.5 Swipe táctil: si el desplazamiento horizontal supera 50px, cambia de tarjeta.
	let tactoX: number | null = null;

	function alTactoInicio(e: TouchEvent) {
		tactoX = e.touches[0]?.clientX ?? null;
	}
	function alTactoFin(e: TouchEvent) {
		if (tactoX === null) return;
		const dx = (e.changedTouches[0]?.clientX ?? tactoX) - tactoX;
		tactoX = null;
		if (Math.abs(dx) < 50) return;
		if (dx < 0) {
			siguiente();
		} else {
			anterior();
		}
		reiniciarAutoplay();
	}

	// Tilt 3D de la tarjeta activa, siguiendo el mouse (solo esa tarjeta, no es anime.js: es
	// liviano y no compite con la animación de posición de abajo, que sí usa anime.js).
	let tiltX = $state(0);
	let tiltY = $state(0);

	/** Distancia circular más corta entre el índice i y el activo (puede dar negativo). */
	function distancia(i: number) {
		const n = items.length;
		let d = i - active;
		if (d > n / 2) d -= n;
		if (d < -n / 2) d += n;
		return d;
	}

	function goTo(i: number) {
		if (items.length === 0) return;
		active = ((i % items.length) + items.length) % items.length;
	}
	function siguiente() {
		goTo(active + 1);
	}
	function anterior() {
		goTo(active - 1);
	}

	function reiniciarAutoplay() {
		if (autoplayTimer) clearInterval(autoplayTimer);
		if (reduceMovimiento) return;
		if (items.length > 1) autoplayTimer = setInterval(siguiente, 4500);
	}

	$effect(() => {
		reiniciarAutoplay();
		return () => clearInterval(autoplayTimer);
	});

	function irA(i: number) {
		goTo(i);
		reiniciarAutoplay();
	}

	/** Posición 3D objetivo (translateX/Z, rotateY, escala, opacidad, z-index) según distancia. */
	function objetivo(d: number) {
		const abs = Math.abs(d);
		const signo = Math.sign(d);
		if (abs === 0)
			return { translateX: 0, translateZ: 0, rotateY: 0, scale: 1, opacity: 1, zIndex: 30 };
		if (abs === 1)
			return {
				translateX: signo * 175,
				translateZ: -90,
				rotateY: -signo * 30,
				scale: 0.82,
				opacity: 0.85,
				zIndex: 20
			};
		if (abs === 2)
			return {
				translateX: signo * 305,
				translateZ: -190,
				rotateY: -signo * 38,
				scale: 0.65,
				opacity: 0.4,
				zIndex: 10
			};
		return {
			translateX: signo * 420,
			translateZ: -280,
			rotateY: -signo * 42,
			scale: 0.5,
			opacity: 0,
			zIndex: 0
		};
	}

	// Anima cada tarjeta a su posición 3D cada vez que cambia el índice activo. La primera vez
	// (montaje) entran con stagger; en navegaciones siguientes usan un ease más "elástico" para
	// que se sienta con más peso/profundidad al pasar de una tarjeta a otra.
	$effect(() => {
		if (items.length === 0) return;
		items.forEach((_, i) => {
			const el = cardEls[i];
			if (!el) return;
			const t = objetivo(distancia(i));
			el.style.zIndex = String(t.zIndex);
			animate(el, {
				translateX: t.translateX,
				translateZ: t.translateZ,
				rotateY: t.rotateY,
				scale: t.scale,
				opacity: t.opacity,
				duration: montado ? 750 : 600,
				delay: montado ? 0 : i * 60,
				ease: montado ? 'outElastic(1, .75)' : 'outExpo'
			});
		});
		montado = true;
		tiltX = 0;
		tiltY = 0;
	});

	function onTiltMove(e: PointerEvent) {
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		tiltY = ((e.clientX - rect.left) / rect.width - 0.5) * 16;
		tiltX = -((e.clientY - rect.top) / rect.height - 0.5) * 16;
	}
	function onTiltLeave() {
		tiltX = 0;
		tiltY = 0;
	}

	/** Hash determinístico simple para generar un gradiente estable por publicidad. */
	function hashSeed(str: string) {
		let h = 0;
		for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
		return h;
	}

	/** Gradiente vibrante tipo Obscura Visuals, para publicidades sin imagen cargada. */
	function gradienteObscura(seed: string) {
		const h = hashSeed(seed || 'tl360');
		const h1 = h % 360;
		const h2 = (h1 + 70 + (h % 50)) % 360;
		const h3 = (h1 + 190 + (h % 70)) % 360;
		return `linear-gradient(135deg, hsl(${h1} 85% 62%), hsl(${h2} 88% 56%) 55%, hsl(${h3} 82% 52%))`;
	}
</script>

{#if items.length > 0}
	<div
		class="relative h-72 touch-pan-y sm:h-80"
		style="perspective: 1400px;"
		onmouseenter={() => clearInterval(autoplayTimer)}
		onmouseleave={reiniciarAutoplay}
		ontouchstart={alTactoInicio}
		ontouchend={alTactoFin}
		role="group"
		aria-roledescription="carrusel"
		aria-label="Publicidades destacadas"
	>
		<div class="absolute inset-0 grid overflow-hidden rounded-card">
			{#each items as pub, i (pub.id)}
				{@const esActiva = distancia(i) === 0}
				<!-- role/tabindex son dinámicos según esActiva; el linter no resuelve el ternario -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					bind:this={cardEls[i]}
					class="col-start-1 row-start-1 w-56 shrink-0 place-self-center overflow-hidden rounded-card bg-white shadow-[var(--shadow-card-hover)] sm:w-72 dark:bg-gray-900 {esActiva
						? ''
						: 'cursor-pointer'}"
					onclick={() => !esActiva && irA(i)}
					role={esActiva ? undefined : 'button'}
					tabindex={esActiva ? undefined : 0}
					onkeydown={(e) => {
						if (!esActiva && (e.key === 'Enter' || e.key === ' ')) irA(i);
					}}
				>
					<div
						role="presentation"
						style={esActiva
							? `transform: perspective(600px) rotateX(${tiltX}deg) rotateY(${tiltY}deg); transition: transform 150ms ease-out;`
							: ''}
						onpointermove={esActiva ? onTiltMove : undefined}
						onpointerleave={esActiva ? onTiltLeave : undefined}
					>
						{#if pub.imagen_url}
							<img
								src={pub.imagen_url}
								alt={pub.titulo}
								class="h-36 w-full object-cover sm:h-40"
								loading="lazy"
								decoding="async"
							/>
						{:else}
							<div
								class="h-36 w-full sm:h-40"
								style="background: {gradienteObscura(pub.titulo || pub.id)};"
							></div>
						{/if}
						<div class="p-4">
							<p class="truncate font-semibold text-gray-800 dark:text-gray-100">{pub.titulo}</p>
							<p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
								{pub.descripcion}
							</p>
							{#if esActiva}
								<a
									href={urlEmpresa({
										id: pub.empresa_id,
										slug: pub.empresa_slug
									})}
									class="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
								>
									Ver comercio →
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>

		{#if items.length > 1}
			<button
				class="absolute top-1/2 left-1 z-40 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow-[var(--shadow-card)] transition hover:bg-white dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-800"
				onclick={() => {
					anterior();
					reiniciarAutoplay();
				}}
				aria-label="Publicidad anterior"
			>
				<ChevronLeft class="h-5 w-5" />
			</button>
			<button
				class="absolute top-1/2 right-1 z-40 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow-[var(--shadow-card)] transition hover:bg-white dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-800"
				onclick={() => {
					siguiente();
					reiniciarAutoplay();
				}}
				aria-label="Siguiente publicidad"
			>
				<ChevronRight class="h-5 w-5" />
			</button>
		{/if}
	</div>

	{#if items.length > 1}
		<div class="mt-4 flex justify-center gap-2">
			{#each items as pub, i (pub.id)}
				<button
					class="h-2 rounded-full transition-all {i === active
						? 'w-6 bg-brand-500'
						: 'w-2 bg-gray-300 dark:bg-gray-700'}"
					onclick={() => irA(i)}
					aria-label="Ir a la publicidad {i + 1}"
				></button>
			{/each}
		</div>
	{/if}
{/if}
