<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { exigirAcceso } from '$lib/auth/guard';
	import { auth } from '$lib/stores/auth.svelte';
	import { publicidades } from '$lib/stores/publicidades.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import { page } from '$app/state';
	import AvisosCuenta from '$lib/components/cuenta/AvisosCuenta.svelte';
	import MisDatos from '$lib/components/cuenta/MisDatos.svelte';
	import type {
		EstadoAprobacion,
		Publicidad,
		ResumenComercio,
		Rubro,
		Empresa,
		HorariosPorDia,
		Resena,
		RedSocial,
		TelefonoEmpresa,
		TurnoRecibido
	} from '$lib/types';
	import { hoyISO } from '$lib/utils/fechas';
	import {
		validateForm,
		required,
		numericPositive,
		telefonoSoloDigitos,
		caracteristicaTelefono,
		constanciaCuit,
		cuit,
		email as emailRule
	} from '$lib/validation';
	import { cacheHorarios } from '$lib/horarios-cache';
	import { DIAS_ORDEN, slotsDelDia } from '$lib/turnos';
	import { CATALOGO_ETIQUETAS, aEtiquetaCanoncia, normalizarEtiqueta } from '$lib/etiquetas';
	import SelectorRubro from '$lib/components/SelectorRubro.svelte';
	import { separarTelefono } from '$lib/contacto';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import RatingStars from '$lib/components/ui/RatingStars.svelte';
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
	// `?tab=cuenta` llega desde /cuenta: el dueño tiene sus datos personales dentro de Mi Negocio.
	let tab = $state(page.url.searchParams.get('tab') === 'cuenta' ? 'cuenta' : 'turnos');

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
	let categorias = $state<Rubro[]>([]);
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

	// Otros teléfonos además del principal (varios barberos/profesionales de un mismo local, etc.).
	let telefonos = $state<TelefonoEmpresa[]>([]);
	// Lo que el formulario no edita del principal (descripción, canal, WhatsApp) se conserva al guardar.
	let principalOriginal = $state<TelefonoEmpresa | null>(null);
	// Redes que este formulario no muestra (TikTok, X, YouTube, web) se conservan al guardar.
	let otrasRedes = $state<RedSocial[]>([]);
	// Fotos: URLs cargadas a mano, mismo patrón que url_imagen de Publicidad.
	let fotos = $state<string[]>([]);
	// RF-18: etiquetas de accesibilidad y servicios que el cliente puede filtrar.
	let etiquetasSeleccionadas = $state<string[]>([]);

	$effect(() => {
		if (!exigirAcceso('admin')) return;

		api
			.get<Rubro[]>('/rubros')
			.then((res) => (categorias = res))
			.catch((err) => console.error(err));

		api
			.get<Empresa[]>(`/empresas?usuario_id=${auth.user!.id}`)
			.then((lista) => {
				const propia = lista.find((e) => e.usuario_id === auth.user!.id);
				miEmpresa = propia ?? null;
				// Cuenta de comercio recién creada: todavía no hay turnos que mirar, el primer paso
				// es cargar la ficha.
				if (!propia) tab = 'ficha';
				if (propia) {
					form = {
						nombre: propia.nombre,
						direccion: propia.direccion,
						slogan: propia.slogan ?? '',
						duracion_turno_min: String(propia.duracion_turno_min ?? ''),
						instagram: redDe(propia, 'instagram'),
						facebook: redDe(propia, 'facebook')
					};
					otrasRedes = (propia.redes_sociales ?? []).filter(
						(r) => r.tipo !== 'instagram' && r.tipo !== 'facebook'
					);
					const lista = propia.telefonos ?? [];
					const principal = lista.find((t) => t.principal) ?? lista[0] ?? null;
					principalOriginal = principal;
					telefonos = lista.filter((t) => t !== principal).map((t) => ({ ...t }));
					const separado = separarTelefono(principal?.numero ?? '');
					caracteristicaPrincipal = separado.caracteristica;
					numeroPrincipal = separado.numero;
					categoriaId = String(propia.rubro_id ?? '');
					turnosHabilitados = propia.turnos_habilitados ?? true;
					fotos = propia.fotos ?? [];
					etiquetasSeleccionadas = propia.etiquetas ?? [];
					modoContacto = propia.modo_contacto ?? 'ambos';
					latitud = propia.lat ?? null;
					longitud = propia.lng ?? null;
					cuitValor = propia.cuit ?? '';
					constanciaUrl = propia.url_cuit ?? '';
					cargarHorarios(propia.id);
				}
			})
			.catch((err) => console.error(err))
			.finally(() => (cargandoFicha = false));
	});

	const telefonoPrincipal = $derived(`${caracteristicaPrincipal}${numeroPrincipal}`);

	function redDe(empresa: Empresa, tipo: RedSocial['tipo']): string {
		return empresa.redes_sociales?.find((r) => r.tipo === tipo)?.url ?? '';
	}

	function agregarTelefono() {
		telefonos = [...telefonos, { numero: '', descripcion: '', canal: 'ambos' }];
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

	function alternarEtiquetaFicha(etiqueta: string) {
		etiquetasSeleccionadas = etiquetasSeleccionadas.includes(etiqueta)
			? etiquetasSeleccionadas.filter((e) => e !== etiqueta)
			: [...etiquetasSeleccionadas, etiqueta];
	}

	// RF-18: además del catálogo (accesibilidad y servicios, que se pueden filtrar), cada comercio
	// suma etiquetas propias que describen lo que hace ("Color", "Alisados", "Sin TACC"...).
	const MAX_ETIQUETAS = 12;
	const MAX_LARGO_ETIQUETA = 40;
	let nuevaEtiqueta = $state('');
	let errorEtiqueta = $state('');
	const etiquetasPropias = $derived(
		etiquetasSeleccionadas.filter((e) => !(CATALOGO_ETIQUETAS as readonly string[]).includes(e))
	);

	function agregarEtiquetaPropia() {
		errorEtiqueta = '';
		const texto = nuevaEtiqueta.trim().replace(/\s+/g, ' ');
		if (!texto) return;
		if (texto.length > MAX_LARGO_ETIQUETA) {
			errorEtiqueta = `Cada etiqueta puede tener hasta ${MAX_LARGO_ETIQUETA} caracteres.`;
			return;
		}
		// Si coincide con una del catálogo ("wifi"), se marca esa en vez de duplicarla.
		const canonica = aEtiquetaCanoncia(texto);
		const nombre = (CATALOGO_ETIQUETAS as readonly string[]).includes(canonica)
			? canonica
			: texto.charAt(0).toUpperCase() + texto.slice(1);
		if (etiquetasSeleccionadas.some((e) => normalizarEtiqueta(e) === normalizarEtiqueta(nombre))) {
			errorEtiqueta = 'Esa etiqueta ya está agregada.';
			return;
		}
		if (etiquetasSeleccionadas.length >= MAX_ETIQUETAS) {
			errorEtiqueta = `Se permiten hasta ${MAX_ETIQUETAS} etiquetas por comercio.`;
			return;
		}
		etiquetasSeleccionadas = [...etiquetasSeleccionadas, nombre];
		nuevaEtiqueta = '';
	}

	function quitarEtiqueta(etiqueta: string) {
		etiquetasSeleccionadas = etiquetasSeleccionadas.filter((e) => e !== etiqueta);
	}

	/** telefono_empresa completo: el principal del formulario primero y después los demás. */
	function payloadTelefonos(): TelefonoEmpresa[] {
		const principal = telefonoPrincipal.replace(/\D/g, '');
		const otros = telefonos
			.map((t) => ({ ...t, numero: t.numero.replace(/\D/g, '') }))
			.filter((t) => t.numero && t.numero !== principal)
			// Un número repetido en la lista se guarda una sola vez.
			.filter((t, i, lista) => lista.findIndex((x) => x.numero === t.numero) === i)
			.map((t) => ({
				numero: t.numero,
				descripcion: t.descripcion?.trim() || undefined,
				canal: t.canal || undefined,
				es_whatsapp: t.es_whatsapp ?? false,
				principal: false
			}));
		return [
			{
				numero: principal,
				descripcion: principalOriginal?.descripcion || undefined,
				canal: principalOriginal?.canal || undefined,
				es_whatsapp: principalOriginal?.es_whatsapp ?? false,
				principal: true
			},
			...otros
		];
	}

	/** red_social: las dos que edita el formulario más las que ya tenía y acá no se muestran. */
	function payloadRedes(): RedSocial[] {
		const editadas = (['instagram', 'facebook'] as const)
			.filter((tipo) => form[tipo].trim())
			.map((tipo) => ({ tipo, url: form[tipo].trim() }));
		return [...editadas, ...otrasRedes];
	}

	function esUrlHttpValida(valor: string): boolean {
		const v = valor.trim();
		if (!v) return false;
		try {
			const u = new URL(v);
			return u.protocol === 'http:' || u.protocol === 'https:';
		} catch {
			return false;
		}
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
		// Validar redes sociales: si hay valor, debe ser URL http(s) válida.
		for (const red of ['instagram', 'facebook'] as const) {
			const v = form[red].trim();
			if (v && !esUrlHttpValida(v)) {
				formErrors = {
					...formErrors,
					[red]: 'Pegá una URL válida que empiece con http(s)://'
				};
			}
		}
		if (Object.keys(formErrors).length > 0) return;
		// No permitir filas vacías de fotos/teléfonos: completar o quitar antes de guardar.
		if (telefonos.some((t) => !t.numero.trim())) {
			mensaje = 'Completá o quitá la fila de teléfono vacía antes de guardar.';
			toast.error(mensaje);
			return;
		}
		if (fotos.some((f) => !f.trim())) {
			mensaje = 'Completá o quitá la fila de foto vacía antes de guardar.';
			toast.error(mensaje);
			return;
		}

		const payload = {
			nombre: form.nombre,
			direccion: form.direccion,
			slogan: form.slogan,
			telefonos: payloadTelefonos(),
			redes_sociales: payloadRedes(),
			duracion_turno_min: turnosHabilitados ? Number(form.duracion_turno_min) : undefined,
			rubro_id: Number(categoriaId),
			usuario_id: auth.user?.id,
			fotos: fotos.map((f) => f.trim()).filter(Boolean),
			etiquetas: etiquetasSeleccionadas,
			turnos_habilitados: turnosHabilitados,
			modo_contacto: modoContacto,
			lat: latitud,
			lng: longitud,
			cuit: cuitValor.replace(/\D/g, '') || undefined,
			url_cuit: constanciaUrl.trim() || undefined
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
					url_cuit: constanciaUrl.trim() || undefined
				}
			);
			miEmpresa = {
				...miEmpresa,
				verificado_estado: res.verificado_estado,
				cuit: cuitValor.replace(/\D/g, ''),
				url_cuit: constanciaUrl.trim() || undefined
			};
			toast.exito('Solicitud de verificación enviada. Te avisaremos cuando se revise.');
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

	/** Atajo: el horario del lunes se copia de martes a viernes (después se ajusta lo distinto). */
	function copiarLunesALaSemana() {
		const lunes = horarios['Lunes'] ?? [];
		const copia = { ...horarios };
		for (const dia of ['Martes', 'Miércoles', 'Jueves', 'Viernes']) copia[dia] = [...lunes];
		horarios = copia;
	}

	// Para recibir turnos hacen falta horarios cargados: se avisa en "Mis turnos".
	const sinHorarios = $derived(Object.values(horarios).every((r) => (r ?? []).length === 0));

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

	// RF-04: turno de mostrador. El comercio lo agenda para alguien sin cuenta (por teléfono o en
	// el local); queda con origen 'mostrador' y comparte la grilla con las reservas online.
	let agendando = $state(false);
	const turnoManualVacio = () => ({ fecha: hoyISO(), hora: '', nombre: '', email: '', nota: '' });
	let turnoManual = $state(turnoManualVacio());
	let erroresTurnoManual = $state<Record<string, string>>({});
	let guardandoTurnoManual = $state(false);

	// Solo se ofrecen los horarios libres de la grilla del comercio (los mismos que ve el cliente):
	// así no se pueden agendar dos turnos a la misma hora ni fuera del horario de atención.
	let ocupadosManual = $state<string[]>([]);
	let cargandoOcupados = $state(false);
	const slotsManual = $derived(
		slotsDelDia(turnoManual.fecha, horarios, Number(form.duracion_turno_min) || 30)
	);
	const libresManual = $derived(slotsManual.filter((h) => !ocupadosManual.includes(h)));

	$effect(() => {
		if (!agendando || !miEmpresa || !turnoManual.fecha) return;
		const fecha = turnoManual.fecha;
		const id = miEmpresa.id;
		let vigente = true;
		cargandoOcupados = true;
		api
			.get<{ hora: string }[]>(`/turnos/ocupados?empresa_id=${id}&fecha=${fecha}`)
			.then((res) => {
				if (!vigente) return;
				ocupadosManual = res.map((t) => t.hora.slice(0, 5));
				// Si la hora elegida dejó de estar libre (u otro día), se vuelve a elegir.
				if (turnoManual.hora && !libresManual.includes(turnoManual.hora)) turnoManual.hora = '';
			})
			.catch(() => vigente && (ocupadosManual = []))
			.finally(() => vigente && (cargandoOcupados = false));
		return () => {
			vigente = false;
		};
	});

	async function agendarTurnoManual() {
		if (!miEmpresa) return;
		erroresTurnoManual = validateForm(turnoManual, {
			fecha: [required()],
			hora: [required()],
			nombre: [required()],
			email: [emailRule()]
		});
		if (turnoManual.nota.trim().length > 300)
			erroresTurnoManual = { ...erroresTurnoManual, nota: 'Hasta 300 caracteres.' };
		if (Object.keys(erroresTurnoManual).length > 0) return;
		guardandoTurnoManual = true;
		try {
			await api.post(`/empresas/${miEmpresa.id}/turnos`, {
				fecha: turnoManual.fecha,
				hora: turnoManual.hora,
				cliente_nombre: turnoManual.nombre.trim(),
				cliente_email: turnoManual.email.trim() || undefined,
				nota: turnoManual.nota.trim() || undefined
			});
			toast.exito('Turno agendado.');
			ocupadosManual = [...ocupadosManual, turnoManual.hora];
			turnoManual = turnoManualVacio();
			agendando = false;
			// Vaciar la lista alcanza: el $effect de la solapa la vuelve a pedir una sola vez.
			turnosRecibidos = null;
		} catch (err) {
			// 409: alguien reservó ese horario mientras se completaba el formulario.
			if (err instanceof ApiError && err.status === 409) {
				ocupadosManual = [...ocupadosManual, turnoManual.hora];
				turnoManual.hora = '';
			}
			toast.error(err instanceof ApiError ? err.message : 'No se pudo agendar el turno.');
		} finally {
			guardandoTurnoManual = false;
		}
	}

	async function confirmarCancelarTurno() {
		if (!turnoACancelar) return;
		cancelandoTurno = true;
		try {
			// 1.5 El mock libera el slot en `ocupados`: vuelve a estar disponible al instante.
			await api.delete(`/turnos/cancelar/${turnoACancelar.id}`);
			turnosRecibidos = (turnosRecibidos ?? []).filter((t) => t.id !== turnoACancelar!.id);
			toast.exito('Turno cancelado. Avisamos al cliente y el horario quedó libre.');
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

	// ---------- Resumen de actividad (se calcula a pedido y se descarga en PDF) ----------
	let resumen = $state<ResumenComercio | null>(null);
	let errorResumen = $state('');
	let cargandoResumen = $state(false);
	function haceDias(dias: number) {
		const d = new Date(hoyISO() + 'T12:00:00');
		d.setDate(d.getDate() - dias);
		return d.toISOString().slice(0, 10);
	}
	let periodo = $state({ desde: haceDias(29), hasta: hoyISO() });

	function elegirPeriodo(dias: number) {
		periodo = { desde: haceDias(dias - 1), hasta: hoyISO() };
		cargarResumen();
	}

	function cargarResumen() {
		if (!miEmpresa) return;
		if (periodo.hasta < periodo.desde) {
			errorResumen = 'La fecha de fin no puede ser anterior a la de inicio.';
			return;
		}
		cargandoResumen = true;
		errorResumen = '';
		api
			.get<ResumenComercio>(
				`/empresas/${miEmpresa.id}/resumen?desde=${periodo.desde}&hasta=${periodo.hasta}`
			)
			.then((res) => (resumen = res))
			.catch((err) => {
				console.error(err);
				errorResumen = err instanceof ApiError ? err.message : 'No se pudo calcular el resumen.';
			})
			.finally(() => (cargandoResumen = false));
	}

	$effect(() => {
		if (tab !== 'resumen' || !miEmpresa || resumen !== null || cargandoResumen || errorResumen)
			return;
		cargarResumen();
	});

	/** El navegador guarda la página como PDF; la hoja de impresión deja solo el resumen. */
	function descargarResumen() {
		window.print();
	}

	// ---------- Publicidades (RF-06): nacen pendientes hasta que las aprueba la plataforma ----------
	let nuevaPublicidad = $state({ titulo: '', descripcion: '', url_imagen: '' });
	let mensajePublicidad = $state('');
	let misPublicidades = $state<Publicidad[] | null>(null);
	let guardandoPublicidad = $state(false);
	let publicidadAEliminar = $state<Publicidad | null>(null);
	let eliminandoPublicidad = $state(false);

	const ESTADO_PUBLICIDAD: Record<
		EstadoAprobacion,
		{ texto: string; tono: 'neutral' | 'brand' | 'success' | 'danger' }
	> = {
		pendiente: { texto: 'Pendiente de aprobación', tono: 'brand' },
		aprobada: { texto: 'Publicada', tono: 'success' },
		rechazada: { texto: 'Rechazada', tono: 'danger' },
		finalizada: { texto: 'Finalizada', tono: 'neutral' }
	};

	function cargarMisPublicidades() {
		if (!miEmpresa) return;
		publicidades
			.delComercio(miEmpresa.id)
			.then((res) => (misPublicidades = res))
			.catch(() => (misPublicidades = []));
	}

	$effect(() => {
		if (tab !== 'publicidades' || !miEmpresa || misPublicidades !== null) return;
		cargarMisPublicidades();
	});

	async function agregarPublicidad() {
		if (!miEmpresa) return;
		mensajePublicidad = '';
		if (!nuevaPublicidad.titulo.trim()) {
			mensajePublicidad = 'El título es obligatorio.';
			toast.error(mensajePublicidad);
			return;
		}
		if (!nuevaPublicidad.descripcion.trim()) {
			mensajePublicidad = 'La descripción es obligatoria.';
			toast.error(mensajePublicidad);
			return;
		}
		if (!esUrlHttpValida(nuevaPublicidad.url_imagen)) {
			mensajePublicidad = 'La imagen es obligatoria: pegá una URL válida http(s)://.';
			toast.error(mensajePublicidad);
			return;
		}
		guardandoPublicidad = true;
		try {
			const nueva = await publicidades.crear({ empresa_id: miEmpresa.id, ...nuevaPublicidad });
			toast.exito(
				nueva.estado === 'aprobada'
					? 'Publicidad publicada.'
					: 'Publicidad enviada: se muestra cuando la plataforma la aprueba.'
			);
			nuevaPublicidad = { titulo: '', descripcion: '', url_imagen: '' };
			misPublicidades = [nueva, ...(misPublicidades ?? [])];
		} catch (err) {
			mensajePublicidad =
				err instanceof ApiError ? err.message : 'No se pudo enviar la publicidad.';
			toast.error(mensajePublicidad);
		} finally {
			guardandoPublicidad = false;
		}
	}

	async function cambiarEstadoPublicidad(pub: Publicidad, estado: EstadoAprobacion) {
		try {
			const actualizada = await publicidades.cambiarEstado(pub.id, estado);
			misPublicidades = (misPublicidades ?? []).map((p) => (p.id === pub.id ? actualizada : p));
			toast.exito(estado === 'finalizada' ? 'Publicidad dada de baja.' : 'Publicidad reenviada.');
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar la publicidad.');
		}
	}

	async function confirmarEliminarPublicidad() {
		if (!publicidadAEliminar) return;
		eliminandoPublicidad = true;
		try {
			await publicidades.eliminar(publicidadAEliminar.id);
			misPublicidades = (misPublicidades ?? []).filter((p) => p.id !== publicidadAEliminar!.id);
			publicidadAEliminar = null;
			toast.exito('Publicidad eliminada.');
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la publicidad.');
		} finally {
			eliminandoPublicidad = false;
		}
	}

	// ---------- Turnos recibidos: filtro por día ----------
	let filtroDia = $state('');
	const turnosFiltrados = $derived(
		(turnosRecibidos ?? []).filter((t) => !filtroDia || t.fecha === filtroDia)
	);

	// ---------- Calificaciones del comercio (RF-13, dueño) ----------
	let calificaciones = $state<Resena[] | null>(null);
	let errorCalificaciones = $state('');
	let filtroPuntaje = $state('todas');

	function recargarCalificaciones() {
		if (!miEmpresa) return;
		calificaciones = null;
		errorCalificaciones = '';
		api
			.get<Resena[]>(`/empresas/${miEmpresa.id}/calificaciones`)
			.then((res) => (calificaciones = res))
			.catch((err) => {
				console.error(err);
				errorCalificaciones =
					err instanceof ApiError ? err.message : 'No se pudieron cargar las calificaciones.';
				calificaciones = [];
			});
	}

	$effect(() => {
		if (tab !== 'calificaciones' || !miEmpresa || calificaciones !== null) return;
		recargarCalificaciones();
	});

	const calificacionesFiltradas = $derived(
		(calificaciones ?? []).filter(
			(c) => filtroPuntaje === 'todas' || c.puntaje === Number(filtroPuntaje)
		)
	);
	const promedioCalificaciones = $derived(
		calificaciones && calificaciones.length > 0
			? calificaciones.reduce((acc, c) => acc + c.puntaje, 0) / calificaciones.length
			: 0
	);
</script>

<div class="mx-auto max-w-6xl px-4 py-8">
	<h1 class="mb-1 text-2xl font-bold text-gray-800 dark:text-gray-100">Mi Negocio</h1>
	<p class="mb-6 text-gray-500 dark:text-gray-400">
		Tus turnos del día a día; la ficha y los horarios se configuran en sus solapas.
	</p>

	<!-- Lo operativo primero (turnos); la configuración (ficha y horarios) al final. -->
	<Tabs
		tabs={[
			{ id: 'turnos', label: 'Mis turnos' },
			{ id: 'resumen', label: 'Resumen' },
			{ id: 'calificaciones', label: 'Calificaciones' },
			{ id: 'publicidades', label: 'Publicidades' },
			{ id: 'ficha', label: 'Mi ficha', grupo: 'Configuración' },
			{ id: 'horarios', label: 'Horarios' },
			{ id: 'cuenta', label: 'Mi cuenta' }
		]}
		bind:active={tab}
	/>

	<div class="mt-6">
		{#if tab === 'cuenta'}
			<AvisosCuenta />
			<MisDatos />
		{:else if cargandoFicha}
			<p class="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
		{:else if tab === 'ficha'}
			{#snippet seccion(titulo: string, ayuda: string)}
				<p class="text-sm font-semibold text-gray-800 dark:text-gray-100">{titulo}</p>
				{#if ayuda}<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">{ayuda}</p>{/if}
			{/snippet}
			<!-- Toda la ficha es un solo formulario: un único "Guardar cambios" (abajo, siempre a la
			     vista) guarda datos, teléfonos, etiquetas, redes, fotos y ubicación juntos. -->
			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					guardarFicha();
				}}
			>
				<Card class="overflow-visible p-0">
					<div
						class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-4 sm:px-6 dark:border-gray-800"
					>
						<div>
							<p class="text-base font-bold text-gray-800 dark:text-gray-100">
								{miEmpresa ? 'Ficha de tu comercio' : 'Creá tu comercio'}
							</p>
							{#if !miEmpresa}
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Todavía no tenés un comercio cargado. Completá el formulario para crearlo.
								</p>
							{/if}
							<p class="text-xs text-gray-400 dark:text-gray-500">
								Los campos con <span class="text-danger-600">*</span> son obligatorios.
							</p>
						</div>
						{#if miEmpresa}
							<!-- 1.4 Badge de estado de verificación -->
							{#if estadoVerificacion === 'verificado'}
								<Badge tone="brand">✓ Comercio verificado</Badge>
							{:else if estadoVerificacion === 'pendiente'}
								<Badge tone="neutral">Verificación pendiente</Badge>
							{:else if estadoVerificacion === 'rechazado'}
								<Badge tone="danger">Verificación rechazada</Badge>
							{:else}
								<Badge tone="neutral">Sin verificar</Badge>
							{/if}
						{/if}
					</div>
					{#if miEmpresa && estadoVerificacion === 'rechazado' && miEmpresa.motivo_rechazo}
						<p
							class="mx-4 mt-4 rounded-lg bg-danger-50 p-3 text-sm text-danger-600 sm:mx-6 dark:bg-danger-600/10"
							role="status"
						>
							<strong>Motivo del rechazo:</strong>
							{miEmpresa.motivo_rechazo}<br />
							Corregilo y volvé a solicitar la verificación.
						</p>
					{/if}

					<div class="divide-y divide-gray-100 dark:divide-gray-800">
						<!-- Datos principales -->
						<section class="grid grid-cols-1 gap-4 px-4 py-5 sm:px-6 lg:grid-cols-2">
							<div class="lg:col-span-2">{@render seccion('Datos del comercio', '')}</div>
							<FormField
								label="Nombre"
								required
								bind:value={form.nombre}
								error={formErrors.nombre}
							/>
							<FormField
								label="Dirección"
								required
								bind:value={form.direccion}
								error={formErrors.direccion}
							/>
							<SelectorRubro
								id="categoria"
								label="Categoría"
								required
								rubros={categorias}
								bind:value={categoriaId}
								error={formErrors.categoriaId}
							/>
							<FormField label="Slogan" bind:value={form.slogan} />
							<div>
								<p class="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">
									Teléfono principal <span class="text-danger-600">*</span>
								</p>
								<div class="flex gap-2">
									<div class="w-28 shrink-0">
										<FormField
											label="Característica"
											placeholder="2392"
											bind:value={caracteristicaPrincipal}
											error={formErrors.caracteristicaPrincipal}
										/>
									</div>
									<div class="min-w-0 flex-1">
										<FormField
											label="Número"
											placeholder="456789"
											bind:value={numeroPrincipal}
											error={formErrors.numeroPrincipal}
										/>
									</div>
								</div>
								<p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
									Solo números, sin espacios ni guiones. Se muestra como 2392-456789 y WhatsApp lo
									usa como 5492392456789.
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
							<label
								class="flex items-start gap-2 text-sm text-gray-700 lg:col-span-1 dark:text-gray-200"
							>
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
						</section>

						<!-- Otros teléfonos -->
						<section class="px-4 py-5 sm:px-6">
							{@render seccion(
								'Otros teléfonos de contacto',
								'Sumá uno por cada persona que atiende (peluquero, profesional, etc.) o área (recepción, turnos). Se muestran todos en la ficha pública. Solo números.'
							)}
							<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
								{#each telefonos as tel, i (i)}
									<div class="rounded-lg border border-gray-100 p-2 dark:border-gray-800">
										<div class="flex flex-wrap items-center gap-2">
											<input
												placeholder="Número"
												aria-label="Número de teléfono {i + 1}"
												bind:value={tel.numero}
												inputmode="numeric"
												class="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 sm:w-36 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
											/>
											<input
												placeholder="Descripción (opcional, ej: Turnos)"
												aria-label="Descripción del teléfono {i + 1}"
												bind:value={tel.descripcion}
												class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
											/>
											<button
												type="button"
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
												bind:value={tel.canal}
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
								type="button"
								class="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
								onclick={agregarTelefono}
							>
								+ Agregar otro teléfono de contacto
							</button>
						</section>

						<!-- RF-18 Etiquetas: catálogo filtrable + propias -->
						<section class="px-4 py-5 sm:px-6">
							{@render seccion(
								'Etiquetas',
								'Marcá las de accesibilidad y servicios que ofrecés (los clientes filtran el directorio por ellas) y sumá las tuyas para describir lo que hacés.'
							)}
							<p class="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
								Accesibilidad y servicios
							</p>
							<div class="flex flex-wrap gap-2">
								{#each CATALOGO_ETIQUETAS as etiqueta (etiqueta)}
									{@const activa = etiquetasSeleccionadas.includes(etiqueta)}
									<button
										type="button"
										aria-pressed={activa}
										onclick={() => alternarEtiquetaFicha(etiqueta)}
										class="rounded-full border px-3 py-1.5 text-xs font-semibold transition {activa
											? 'border-brand-500 bg-brand-500 text-white'
											: 'border-gray-300 bg-white text-gray-600 hover:border-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'}"
									>
										{etiqueta}
									</button>
								{/each}
							</div>
							<p class="mt-4 mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
								Etiquetas propias
							</p>
							{#if etiquetasPropias.length > 0}
								<ul class="mb-2 flex flex-wrap gap-2" aria-label="Etiquetas propias">
									{#each etiquetasPropias as etiqueta (etiqueta)}
										<li
											class="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pr-1 pl-3 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
										>
											{etiqueta}
											<button
												type="button"
												aria-label="Quitar la etiqueta {etiqueta}"
												class="rounded-full px-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-700"
												onclick={() => quitarEtiqueta(etiqueta)}>×</button
											>
										</li>
									{/each}
								</ul>
							{/if}
							<div class="flex max-w-md gap-2">
								<input
									id="nueva-etiqueta"
									bind:value={nuevaEtiqueta}
									maxlength={MAX_LARGO_ETIQUETA}
									placeholder="Ej.: Color, Alisados, Sin TACC"
									aria-label="Nueva etiqueta propia"
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											agregarEtiquetaPropia();
										}
									}}
									class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
								/>
								<Button type="button" size="sm" variant="outline" onclick={agregarEtiquetaPropia}>
									Agregar
								</Button>
							</div>
							<p class="mt-1 text-xs text-gray-400 dark:text-gray-500">
								Hasta {MAX_ETIQUETAS} etiquetas en total ({etiquetasSeleccionadas.length} usadas). Enter
								para agregar.
							</p>
							{#if errorEtiqueta}
								<p class="mt-1 text-xs text-danger-600" role="alert">{errorEtiqueta}</p>
							{/if}
						</section>

						<!-- Redes y fotos -->
						<section class="grid grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:grid-cols-2">
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
								{@render seccion('Redes sociales', 'Tocá un ícono para pegar el enlace.')}
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
													{#if formErrors[red.id]}
														<p class="mt-1 text-xs text-danger-600">{formErrors[red.id]}</p>
													{/if}
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
															Listo
														</button>
													</div>
												</div>
											{/if}
										</div>
									{/each}
								</div>
								{#if formErrors.instagram}
									<p class="mt-1 text-xs text-danger-600">{formErrors.instagram}</p>
								{/if}
								{#if formErrors.facebook}
									<p class="mt-1 text-xs text-danger-600">{formErrors.facebook}</p>
								{/if}
							</div>
							<div>
								{@render seccion(
									'Fotos del local',
									'Pegá la URL de cada foto (mismo formato que la imagen de una publicidad).'
								)}
								<div class="flex flex-col gap-2">
									{#each fotos as _, i (i)}
										<div class="flex items-center gap-2">
											<input
												placeholder="https://..."
												aria-label="URL de la foto {i + 1}"
												bind:value={fotos[i]}
												class="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
											/>
											<button
												type="button"
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
									type="button"
									class="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
									onclick={agregarFoto}
								>
									+ agregar foto
								</button>
							</div>
						</section>

						<!-- 1.3 Pin de ubicación interactivo -->
						<section class="px-4 py-5 sm:px-6">
							{@render seccion(
								'Ubicación en el mapa',
								'Arrastrá el pin o hacé clic en el mapa para fijar la ubicación exacta de tu local.'
							)}
							<MapaComercios
								puntos={[]}
								modoSelector={true}
								{latitud}
								{longitud}
								oncambio={(lat, lng) => {
									latitud = Math.round(lat * 1e6) / 1e6;
									longitud = Math.round(lng * 1e6) / 1e6;
								}}
								alto="h-72"
							/>
							<p class="mt-2 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
								{#if latitud != null && longitud != null}
									Lat {latitud.toFixed(6)} · Lng {longitud.toFixed(6)}
								{:else}
									Todavía no fijaste la ubicación.
								{/if}
							</p>
						</section>

						<!-- 1.4 CUIT + constancia -->
						<section class="px-4 py-5 sm:px-6">
							{@render seccion(
								'Verificación comercial',
								'Con el CUIT y la constancia, la plataforma revisa tu comercio y le otorga el sello de verificado.'
							)}
							<div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
							</div>
							{#if miEmpresa && estadoVerificacion !== 'verificado'}
								<div class="mt-3">
									<Button
										type="button"
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
						</section>
					</div>

					<!-- Barra de guardado: siempre a la vista, guarda toda la ficha. -->
					<div
						class="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-card border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-gray-800 dark:bg-gray-900/95"
					>
						<p class="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
							{mensaje ||
								'Este botón guarda toda la ficha: datos, teléfonos, etiquetas, redes, fotos y ubicación.'}
						</p>
						<Button type="submit" disabled={guardando}>
							{guardando ? 'Guardando...' : miEmpresa ? 'Guardar cambios' : 'Crear comercio'}
						</Button>
					</div>
				</Card>
			</form>
		{:else if tab === 'horarios'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi ficha."
				/>
			{:else}
				<Card class="p-0">
					<div
						class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-4 sm:px-6 dark:border-gray-800"
					>
						<div>
							<p class="text-base font-bold text-gray-800 dark:text-gray-100">
								Horarios de atención
							</p>
							<p class="text-xs text-gray-400 dark:text-gray-500">
								Los turnos online se ofrecen dentro de estas franjas. Un día sin franjas queda
								cerrado.
							</p>
						</div>
						<Button type="button" size="sm" variant="ghost" onclick={copiarLunesALaSemana}>
							Copiar el lunes a martes–viernes
						</Button>
					</div>
					<div class="grid grid-cols-1 gap-x-8 gap-y-5 px-4 py-5 sm:px-6 md:grid-cols-2">
						{#each DIAS as dia (dia)}
							<div>
								<p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
									{dia}
									{#if (horarios[dia] ?? []).length === 0}
										<span class="ml-1 text-xs font-normal text-gray-400">· cerrado</span>
									{/if}
								</p>
								{#each horarios[dia] ?? [] as rango, i (i)}
									<div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
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
					<div
						class="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-card border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-gray-800 dark:bg-gray-900/95"
					>
						<p class="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
							{mensajeHorarios || 'Guardá para aplicar los cambios a la agenda.'}
						</p>
						<Button disabled={guardandoHorarios} onclick={guardarHorarios}>
							{guardandoHorarios ? 'Guardando...' : 'Guardar horarios'}
						</Button>
					</div>
				</Card>
			{/if}
		{:else if tab === 'turnos'}
			{#if miEmpresa && turnosHabilitados && sinHorarios}
				<div
					class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
					role="status"
				>
					<strong>Todavía no cargaste tus horarios de atención.</strong> Hasta que lo hagas, los
					clientes no pueden reservar turnos online.
					<button class="ml-1 font-semibold underline" onclick={() => (tab = 'horarios')}
						>Cargar horarios</button
					>
				</div>
			{/if}
			{#if miEmpresa}
				<div class="mb-4">
					{#if agendando}
						<Card class="p-5">
							<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
								Agendar un turno de mostrador
							</p>
							<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
								Para alguien que pidió turno por teléfono o vino al local. El correo es opcional: si
								lo cargás, le llega la confirmación.
							</p>
							<form
								novalidate
								onsubmit={(e) => {
									e.preventDefault();
									agendarTurnoManual();
								}}
								class="grid grid-cols-1 gap-3 sm:grid-cols-2"
							>
								<FormField
									label="Fecha"
									type="date"
									required
									min={hoyISO()}
									bind:value={turnoManual.fecha}
									error={erroresTurnoManual.fecha}
								/>
								<div class="flex flex-col gap-1">
									<label
										for="hora-turno-manual"
										class="text-sm font-medium text-gray-700 dark:text-gray-200"
									>
										Hora<span class="text-danger-600"> *</span>
									</label>
									<select
										id="hora-turno-manual"
										bind:value={turnoManual.hora}
										disabled={cargandoOcupados || libresManual.length === 0}
										aria-invalid={!!erroresTurnoManual.hora}
										class="rounded-lg border bg-white px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 {erroresTurnoManual.hora
											? 'border-danger-600'
											: 'border-gray-300 dark:border-gray-600'}"
									>
										<option value="">
											{cargandoOcupados
												? 'Buscando horarios libres…'
												: libresManual.length === 0
													? 'Sin horarios libres ese día'
													: 'Elegí un horario libre'}
										</option>
										{#each libresManual as hora (hora)}
											<option value={hora}>{hora} hs</option>
										{/each}
									</select>
									{#if erroresTurnoManual.hora}
										<p class="text-xs text-danger-600">{erroresTurnoManual.hora}</p>
									{:else if !cargandoOcupados && slotsManual.length === 0}
										<p class="text-xs text-gray-500 dark:text-gray-400">
											Ese día no atendés según tus horarios (o ya pasó el horario de hoy). Elegí
											otra fecha.
										</p>
									{:else if !cargandoOcupados && libresManual.length === 0}
										<p class="text-xs text-gray-500 dark:text-gray-400">
											Todos los horarios de ese día ya están tomados.
										</p>
									{:else}
										<p class="text-xs text-gray-400 dark:text-gray-500">
											{libresManual.length} libres · los ocupados no se muestran.
										</p>
									{/if}
								</div>
								<FormField
									label="Nombre de quien viene"
									required
									bind:value={turnoManual.nombre}
									error={erroresTurnoManual.nombre}
								/>
								<FormField
									label="Correo electrónico"
									type="email"
									bind:value={turnoManual.email}
									error={erroresTurnoManual.email}
								/>
								<div class="sm:col-span-2">
									<FormField
										label="Nota (opcional)"
										bind:value={turnoManual.nota}
										error={erroresTurnoManual.nota}
									/>
								</div>
								<div class="flex gap-2 sm:col-span-2">
									<Button type="submit" size="sm" disabled={guardandoTurnoManual}>
										{guardandoTurnoManual ? 'Agendando...' : 'Agendar turno'}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onclick={() => (agendando = false)}
									>
										Cancelar
									</Button>
								</div>
							</form>
						</Card>
					{:else}
						<Button size="sm" variant="outline" onclick={() => (agendando = true)}>
							+ Agendar un turno
						</Button>
					{/if}
				</div>
			{/if}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else if errorTurnos}
				<EmptyState title="No se pudieron cargar los turnos" description={errorTurnos} />
			{:else if turnosRecibidos === null}
				<p class="text-sm text-gray-400 dark:text-gray-500">Cargando turnos...</p>
			{:else if turnosRecibidos.length === 0}
				{#if !turnosHabilitados}
					<EmptyState
						title="No ofrecés reserva de turnos"
						description="Activá 'Ofrecer reserva de turnos online' en Mi Ficha si querés recibir turnos por la app."
					/>
				{:else}
					<EmptyState
						title="Todavía no recibiste turnos"
						description="Cuando un cliente reserve, va a aparecer acá."
					/>
				{/if}
			{:else}
				{#if !turnosHabilitados}
					<p class="mb-3 text-sm text-gray-500 dark:text-gray-400">
						No estás ofreciendo reservas nuevas; estos son los turnos que ya recibiste.
					</p>
				{/if}
				<div class="mb-3 flex flex-wrap items-center gap-2">
					<label for="filtro-dia" class="text-sm font-medium text-gray-700 dark:text-gray-200">
						Filtrar por día
					</label>
					<input
						id="filtro-dia"
						type="date"
						bind:value={filtroDia}
						aria-label="Filtrar por día"
						class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					/>
					{#if filtroDia}
						<button
							type="button"
							class="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
							onclick={() => (filtroDia = '')}
						>
							Limpiar filtro
						</button>
					{/if}
				</div>
				{#if turnosFiltrados.length === 0}
					<EmptyState
						title="No hay turnos para ese día"
						description="Probá con otra fecha o limpiá el filtro para ver toda la agenda."
					/>
				{:else}
					<div class="flex flex-col gap-3">
						{#each turnosFiltrados as turno (turno.id)}
							<Card class="flex items-center justify-between gap-3 p-4">
								<div class="min-w-0">
									<p
										class="flex flex-wrap items-center gap-2 font-semibold text-gray-800 dark:text-gray-100"
									>
										{turno.cliente_nombre}
										{#if turno.sin_cuenta}
											<Badge tone="neutral">Mostrador</Badge>
										{/if}
									</p>
									<p class="text-sm text-gray-500 dark:text-gray-400">
										{formatearFecha(turno.fecha)}
									</p>
									{#if turno.nota}
										<p class="text-xs text-gray-500 dark:text-gray-400">{turno.nota}</p>
									{/if}
									{#if turno.cliente_email}
										<a
											href="mailto:{turno.cliente_email}"
											class="block truncate text-xs text-brand-600 hover:underline dark:text-brand-400"
										>
											{turno.cliente_email}
										</a>
									{/if}
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
			{/if}
		{:else if tab === 'resumen'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else}
				<Card class="p-5 print:hidden">
					<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
						Resumen de actividad
					</p>
					<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
						Elegí el período y descargalo en PDF. Incluye los turnos online y los de mostrador.
					</p>
					<div class="flex flex-wrap items-end gap-3">
						<FormField label="Desde" type="date" bind:value={periodo.desde} />
						<FormField label="Hasta" type="date" bind:value={periodo.hasta} />
						<Button size="sm" disabled={cargandoResumen} onclick={cargarResumen}>Ver resumen</Button
						>
						<Button size="sm" variant="ghost" onclick={() => elegirPeriodo(7)}>Última semana</Button
						>
						<Button size="sm" variant="ghost" onclick={() => elegirPeriodo(30)}>Último mes</Button>
					</div>
				</Card>
				{#if errorResumen}
					<p class="mt-3 text-sm text-danger-600" role="alert">{errorResumen}</p>
				{:else if cargandoResumen && !resumen}
					<p class="mt-3 text-sm text-gray-400 dark:text-gray-500">Calculando resumen...</p>
				{:else if resumen}
					<section class="resumen-imprimible mt-4" aria-label="Resumen de actividad">
						<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
							<div>
								<h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">
									{resumen.empresa_nombre}
								</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400">
									Del {new Date(resumen.desde + 'T00:00:00').toLocaleDateString('es-AR')} al
									{new Date(resumen.hasta + 'T00:00:00').toLocaleDateString('es-AR')}
								</p>
							</div>
							<Button size="sm" variant="outline" class="print:hidden" onclick={descargarResumen}>
								Descargar PDF
							</Button>
						</div>
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
							{#each [{ titulo: 'Turnos', valor: resumen.turnos.turnos }, { titulo: 'Online', valor: resumen.turnos.online }, { titulo: 'Mostrador', valor: resumen.turnos.mostrador }, { titulo: 'Cancelados', valor: resumen.turnos.cancelados }, { titulo: 'Atendidos', valor: resumen.turnos.completados }, { titulo: 'No asistieron', valor: resumen.turnos.no_asistio }, { titulo: 'Calificaciones', valor: resumen.calificaciones }, { titulo: 'Favoritos nuevos', valor: resumen.favoritos_nuevos }] as dato (dato.titulo)}
								<Card class="p-4">
									<p class="text-xs text-gray-500 dark:text-gray-400">{dato.titulo}</p>
									<p class="text-2xl font-bold text-gray-800 dark:text-gray-100">{dato.valor}</p>
								</Card>
							{/each}
						</div>
						{#if resumen.calificacion_promedio !== null}
							<p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
								Puntaje promedio del período: <strong>{resumen.calificacion_promedio}</strong> / 5
							</p>
						{/if}
						{#if resumen.por_dia.length > 0}
							<table class="mt-4 w-full text-left text-sm">
								<thead class="text-xs text-gray-500 uppercase dark:text-gray-400">
									<tr
										><th class="py-1">Día</th><th class="py-1">Turnos</th><th class="py-1"
											>Cancelados</th
										></tr
									>
								</thead>
								<tbody class="divide-y divide-gray-100 dark:divide-gray-800">
									{#each resumen.por_dia as dia (dia.fecha)}
										<tr class="text-gray-700 dark:text-gray-300">
											<td class="py-1">{formatearFecha(dia.fecha)}</td>
											<td class="py-1">{dia.turnos}</td>
											<td class="py-1">{dia.cancelados}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<p class="mt-4 text-sm text-gray-400 dark:text-gray-500">
								No hubo turnos en este período.
							</p>
						{/if}
					</section>
				{/if}
			{/if}
		{:else if tab === 'calificaciones'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else if errorCalificaciones}
				<EmptyState
					title="No se pudieron cargar las calificaciones"
					description={errorCalificaciones}
				/>
			{:else if calificaciones === null}
				<p class="text-sm text-gray-400 dark:text-gray-500">Cargando calificaciones...</p>
			{:else if calificaciones.length === 0}
				<EmptyState
					title="Todavía no tenés calificaciones"
					description="Cuando un cliente califique tu comercio, va a aparecer acá."
				/>
			{:else}
				<Card class="mb-3 flex flex-wrap items-center gap-3 p-4">
					<!-- Las estrellas ya muestran el promedio y la cantidad: no se repite el número. -->
					<div class="flex items-center gap-2">
						<span class="text-sm font-medium text-gray-600 dark:text-gray-300">Promedio</span>
						<RatingStars value={promedioCalificaciones} count={calificaciones.length} />
					</div>
					<label class="ml-auto flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
						Filtrar por puntaje
						<select
							bind:value={filtroPuntaje}
							aria-label="Filtrar por puntaje"
							class="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
						>
							<option value="todas">Todas</option>
							<option value="5">5 estrellas</option>
							<option value="4">4 estrellas</option>
							<option value="3">3 estrellas</option>
							<option value="2">2 estrellas</option>
							<option value="1">1 estrella</option>
						</select>
					</label>
				</Card>
				{#if calificacionesFiltradas.length === 0}
					<EmptyState
						title="Sin calificaciones con ese puntaje"
						description="Probá con otro filtro."
					/>
				{:else}
					<div class="flex flex-col gap-3">
						{#each calificacionesFiltradas as c, i (i)}
							<Card class="p-4">
								<div class="flex items-center gap-2">
									<span class="font-semibold text-gray-700 dark:text-gray-200"
										>{c.usuario_nombre}</span
									>
									<RatingStars value={c.puntaje} />
								</div>
								{#if c.comentario}
									<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{c.comentario}</p>
								{/if}
							</Card>
						{/each}
					</div>
				{/if}
			{/if}
		{:else if tab === 'publicidades'}
			{#if !miEmpresa}
				<EmptyState
					title="Primero cargá tu ficha"
					description="Necesitás crear tu comercio en la pestaña Mi Ficha."
				/>
			{:else}
				<Card class="max-w-lg p-6">
					<p class="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
						Nueva publicidad
					</p>
					<p class="mb-3 text-xs text-gray-400 dark:text-gray-500">
						Aparece en la portada cuando la plataforma la aprueba.
					</p>
					<div class="flex flex-col gap-3">
						<FormField label="Título" required bind:value={nuevaPublicidad.titulo} />
						<FormField label="Descripción" required bind:value={nuevaPublicidad.descripcion} />
						<FormField
							label="URL de imagen"
							required
							placeholder="https://..."
							bind:value={nuevaPublicidad.url_imagen}
						/>
						<p class="text-xs text-gray-400 dark:text-gray-500">
							<span class="text-danger-600">*</span> Campos obligatorios.
						</p>
					</div>
					{#if mensajePublicidad}
						<p class="mt-2 text-sm text-danger-600">{mensajePublicidad}</p>
					{/if}
					<Button class="mt-4" disabled={guardandoPublicidad} onclick={agregarPublicidad}>
						{guardandoPublicidad ? 'Enviando...' : 'Enviar a aprobación'}
					</Button>
				</Card>

				<div class="mt-4 flex flex-col gap-3">
					{#if misPublicidades === null}
						<p class="text-sm text-gray-400 dark:text-gray-500">Cargando publicidades...</p>
					{:else}
						{#each misPublicidades as pub (pub.id)}
							<Card class="flex items-center justify-between gap-3 p-4">
								<div class="min-w-0">
									<p
										class="flex flex-wrap items-center gap-2 font-semibold text-gray-800 dark:text-gray-100"
									>
										{pub.titulo}
										{#if pub.estado}
											<Badge tone={ESTADO_PUBLICIDAD[pub.estado].tono}>
												{ESTADO_PUBLICIDAD[pub.estado].texto}
											</Badge>
										{/if}
									</p>
									<p class="text-sm text-gray-500 dark:text-gray-400">{pub.descripcion}</p>
								</div>
								<div class="flex shrink-0 flex-col items-end gap-1">
									{#if pub.estado === 'aprobada'}
										<button
											class="text-sm text-gray-500 hover:underline"
											onclick={() => cambiarEstadoPublicidad(pub, 'finalizada')}
										>
											Dar de baja
										</button>
									{:else if pub.estado === 'rechazada'}
										<button
											class="text-sm text-brand-600 hover:underline dark:text-brand-400"
											onclick={() => cambiarEstadoPublicidad(pub, 'pendiente')}
										>
											Reenviar
										</button>
									{/if}
									<button
										class="text-sm text-danger-600 hover:underline"
										onclick={() => (publicidadAEliminar = pub)}
									>
										Eliminar
									</button>
								</div>
							</Card>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<ConfirmModal
	abierto={turnoACancelar !== null}
	titulo="Cancelar turno"
	descripcion={turnoACancelar
		? `¿Cancelar el turno de ${turnoACancelar.cliente_nombre} (${turnoACancelar.hora.slice(0, 5)} hs)? Se avisará al cliente y el horario quedará libre.`
		: ''}
	confirmarTexto="Sí, cancelar"
	oncancelar={() => (turnoACancelar = null)}
	onconfirmar={confirmarCancelarTurno}
	ocupado={cancelandoTurno}
/>

<ConfirmModal
	abierto={publicidadAEliminar !== null}
	titulo="Eliminar publicidad"
	descripcion={publicidadAEliminar
		? `¿Eliminar la publicidad “${publicidadAEliminar.titulo}”? Esta acción no se puede deshacer.`
		: ''}
	confirmarTexto="Sí, eliminar"
	oncancelar={() => (publicidadAEliminar = null)}
	onconfirmar={confirmarEliminarPublicidad}
	ocupado={eliminandoPublicidad}
/>

<style>
	/* Al descargar el resumen en PDF, la hoja de impresión deja solo el resumen. */
	@media print {
		:global(body *) {
			visibility: hidden;
		}
		:global(.resumen-imprimible),
		:global(.resumen-imprimible *) {
			visibility: visible;
		}
		:global(.resumen-imprimible) {
			position: absolute;
			inset: 0 auto auto 0;
			width: 100%;
		}
	}
</style>
