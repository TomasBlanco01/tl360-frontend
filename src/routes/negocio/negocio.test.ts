import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { hoyISO } from '$lib/utils/fechas';
import { auth } from '$lib/stores/auth.svelte';
import { empresa } from '../../tests/helpers';
import Negocio from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;

const DUENO = { id: 101, nombre: 'Sofía', email: 'negocio@demo.com', rol: 'admin' as const };

const propia = empresa({
	id: 2700,
	nombre: 'Estilo Urbano',
	direccion: 'Villegas 482',
	telefonos: [
		{ id: 1, numero: '2392411234', principal: true },
		{ id: 2, numero: '2392555001', descripcion: 'Emanuel' }
	],
	slogan: 'Cortes modernos',
	duracion_turno_min: 30,
	rubro_id: 4,
	usuario_id: 101,
	turnos_habilitados: true,
	redes_sociales: [{ tipo: 'instagram', url: 'https://instagram.com/estilo' }],
	fotos: ['https://x.com/a.jpg']
});

interface Backend {
	comercio?: unknown;
	horarios?: Record<string, string[]>;
	turnos?: unknown;
	calificaciones?: unknown;
}

function backend({
	comercio = propia,
	horarios = { Lunes: ['09:00-12:00'] },
	turnos = [],
	calificaciones = []
}: Backend = {}) {
	get.mockImplementation(async (url: string) => {
		if (url.startsWith('/empresas?usuario_id=')) return comercio ? [comercio] : [];
		if (url === '/rubros')
			return [
				{ id: 4, nombre: 'Peluquerías' },
				{ id: 5, nombre: 'Gimnasios' }
			];
		if (url === '/empresas/horarios/2700') return horarios;
		if (url === '/empresas/2700/turnos') {
			if (turnos instanceof Error) throw turnos;
			return turnos;
		}
		if (url === '/empresas/2700/calificaciones') {
			if (calificaciones instanceof Error) throw calificaciones;
			return calificaciones;
		}
		return [];
	});
}

beforeEach(() => {
	for (const f of [get, post, put, del]) f.mockReset();
	put.mockResolvedValue({});
	del.mockResolvedValue({});
	auth.login('tok', DUENO);
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const abrirPestania = (nombre: string) =>
	userEvent.click(screen.getByRole('button', { name: nombre }));

// 2.6 La vista inicial es "Turnos recibidos"; los tests de ficha navegan a su solapa.
const abrirFicha = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
	await screen.findByDisplayValue('Estilo Urbano');
};

describe('acceso', () => {
	it('sin sesión manda a iniciar sesión', async () => {
		auth.logout();
		render(Negocio);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
	});

	it('un cliente común no entra al panel', async () => {
		auth.login('t', { ...DUENO, rol: 'cliente' });
		render(Negocio);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
		expect(get).not.toHaveBeenCalled();
	});

	it('pide solo los comercios del usuario, no todo el catálogo', async () => {
		render(Negocio);
		await abrirFicha();
		expect(get).toHaveBeenCalledWith('/empresas?usuario_id=101');
		expect(get).not.toHaveBeenCalledWith('/empresas');
	});
});

describe('Mi Ficha', () => {
	it('carga los datos del comercio en el formulario', async () => {
		render(Negocio);
		await abrirFicha();
		expect(screen.getByDisplayValue('Villegas 482')).toBeInTheDocument();
		expect(screen.getByLabelText('Característica')).toHaveValue('2392');
		expect(screen.getByLabelText('Número')).toHaveValue('411234');
		expect(screen.getByDisplayValue('2392555001')).toBeInTheDocument(); // "Otros teléfonos" precargado
		expect(screen.getByDisplayValue('30')).toBeInTheDocument();
		// El rubro se elige con un buscador (combobox) que muestra el nombre del elegido.
		await vi.waitFor(() =>
			expect(screen.getByRole('combobox', { name: /^Categoría/ })).toHaveValue('Peluquerías')
		);
		await userEvent.click(screen.getByRole('button', { name: 'Instagram' }));
		expect(screen.getByDisplayValue('https://instagram.com/estilo')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
	});

	it('carga y guarda las etiquetas de accesibilidad (RF-18)', async () => {
		backend({
			comercio: { ...propia, etiquetas: ['Rampa de acceso', 'Wi-Fi gratis'] }
		});
		render(Negocio);
		await abrirFicha();

		expect(screen.getByRole('button', { name: 'Rampa de acceso' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: 'Wi-Fi gratis' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: 'Apto celíacos' })).toHaveAttribute(
			'aria-pressed',
			'false'
		);

		await userEvent.click(screen.getByRole('button', { name: 'Apto celíacos' }));
		await userEvent.click(screen.getByRole('button', { name: 'Wi-Fi gratis' }));
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith(
				'/empresas/2700',
				expect.objectContaining({ etiquetas: ['Rampa de acceso', 'Apto celíacos'] })
			)
		);
	});

	it('muestra, agrega y quita etiquetas propias (no solo las del catálogo)', async () => {
		backend({ comercio: { ...propia, etiquetas: ['Rampa de acceso', 'Color'] } });
		render(Negocio);
		await abrirFicha();
		const propias = screen.getByRole('list', { name: 'Etiquetas propias' });
		expect(within(propias).getByText('Color')).toBeInTheDocument();

		const campo = screen.getByLabelText('Nueva etiqueta propia');
		await userEvent.type(campo, 'alisados{Enter}');
		expect(within(propias).getByText('Alisados')).toBeInTheDocument();
		// Repetida (sin importar mayúsculas) no se agrega; "wifi" marca la del catálogo.
		await userEvent.type(campo, 'COLOR{Enter}');
		expect(screen.getByRole('alert')).toHaveTextContent('ya está agregada');
		await userEvent.clear(campo);
		await userEvent.type(campo, 'wifi{Enter}');
		expect(screen.getByRole('button', { name: 'Wi-Fi gratis' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await userEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Color' }));
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith(
				'/empresas/2700',
				expect.objectContaining({ etiquetas: ['Rampa de acceso', 'Alisados', 'Wi-Fi gratis'] })
			)
		);
	});

	it('sin comercio invita a crearlo', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
		expect(await screen.findByText(/Todavía no tenés un comercio cargado/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Crear comercio' })).toBeInTheDocument();
	});

	it('valida los campos obligatorios antes de guardar', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
		await userEvent.click(await screen.findByRole('button', { name: 'Crear comercio' }));
		expect((await screen.findAllByText('Este campo es obligatorio')).length).toBeGreaterThanOrEqual(
			3
		);
		expect(post).not.toHaveBeenCalled();
	});

	it('la duración del turno es obligatoria solo si ofrece turnos online', async () => {
		render(Negocio);
		await abrirFicha();
		await userEvent.clear(screen.getByLabelText(/Duración del turno/));
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole('checkbox'));
		expect(screen.queryByLabelText(/Duración del turno/)).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith(
				'/empresas/2700',
				expect.objectContaining({ turnos_habilitados: false, duracion_turno_min: undefined })
			)
		);
	});

	it('guardar cambios manda la ficha completa y los teléfonos', async () => {
		render(Negocio);
		await abrirFicha();
		const nombre = screen.getByDisplayValue('Estilo Urbano');
		await userEvent.clear(nombre);
		await userEvent.type(nombre, 'Estilo Urbano 2');
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

		expect(await screen.findByText('Ficha guardada correctamente.')).toBeInTheDocument();
		expect(put).toHaveBeenCalledWith(
			'/empresas/2700',
			expect.objectContaining({
				nombre: 'Estilo Urbano 2',
				direccion: 'Villegas 482',
				slogan: 'Cortes modernos',
				duracion_turno_min: 30,
				rubro_id: 4,
				turnos_habilitados: true,
				fotos: ['https://x.com/a.jpg'],
				telefonos: [
					expect.objectContaining({ numero: '2392411234', principal: true }),
					expect.objectContaining({
						numero: '2392555001',
						descripcion: 'Emanuel',
						principal: false
					})
				],
				redes_sociales: [{ tipo: 'instagram', url: 'https://instagram.com/estilo' }]
			})
		);
	});

	it('crear el comercio hace POST a nombre del usuario', async () => {
		backend({ comercio: null });
		post.mockResolvedValue(empresa({ id: 9, usuario_id: 101 }));
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
		await screen.findByRole('button', { name: 'Crear comercio' });
		await userEvent.type(screen.getByLabelText(/^Nombre/), 'Mi local');
		await userEvent.type(screen.getByLabelText(/^Dirección/), 'Calle 1');
		await userEvent.type(screen.getByLabelText('Característica'), '2392');
		await userEvent.type(screen.getByLabelText('Número'), '000000');
		await userEvent.type(screen.getByLabelText(/Duración del turno/), '45');
		await userEvent.type(screen.getByRole('combobox', { name: /^Categoría/ }), 'pelu');
		await userEvent.click(await screen.findByRole('option', { name: 'Peluquerías' }));
		await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));

		await vi.waitFor(() => expect(post).toHaveBeenCalled());
		expect(post).toHaveBeenCalledWith(
			'/empresas',
			expect.objectContaining({
				nombre: 'Mi local',
				direccion: 'Calle 1',
				telefonos: [expect.objectContaining({ numero: '2392000000', principal: true })],
				duracion_turno_min: 45,
				rubro_id: 4,
				usuario_id: 101,
				turnos_habilitados: true
			})
		);
		expect(await screen.findByText('Ficha guardada correctamente.')).toBeInTheDocument();
	});

	it('muestra el error del backend (por ejemplo una URL inválida)', async () => {
		put.mockRejectedValue(new ApiError(400, 'instagram debe ser una URL http(s) válida'));
		render(Negocio);
		await abrirFicha();
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		expect(
			await screen.findByText('instagram debe ser una URL http(s) válida')
		).toBeInTheDocument();
	});

	it('permite quitar y agregar teléfonos y fotos', async () => {
		render(Negocio);
		await abrirFicha();
		expect(await screen.findByDisplayValue('Emanuel')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Quitar teléfono' }));
		expect(screen.queryByDisplayValue('Emanuel')).not.toBeInTheDocument();
		await userEvent.click(
			screen.getByRole('button', { name: '+ Agregar otro teléfono de contacto' })
		);
		expect(screen.getAllByPlaceholderText('Número')).toHaveLength(1);

		expect(screen.getByDisplayValue('https://x.com/a.jpg')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Quitar foto' }));
		expect(screen.queryByDisplayValue('https://x.com/a.jpg')).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: '+ agregar foto' }));
		expect(screen.getAllByPlaceholderText('https://...')).toHaveLength(1);
	});
});

describe('Horarios', () => {
	it('sin comercio pide cargar primero la ficha', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
		await screen.findByRole('button', { name: 'Crear comercio' });
		await abrirPestania('Horarios');
		expect(screen.getByText('Primero cargá tu ficha')).toBeInTheDocument();
	});

	it('muestra los rangos de cada día', async () => {
		render(Negocio);
		await abrirFicha();
		await abrirPestania('Horarios');
		expect(await screen.findByLabelText('Apertura Lunes 1')).toHaveValue('09:00');
		expect(screen.getByLabelText('Cierre Lunes 1')).toHaveValue('12:00');
		for (const dia of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']) {
			expect(screen.getByText(dia)).toBeInTheDocument();
		}
	});

	it('agrega y quita rangos y guarda todo junto', async () => {
		render(Negocio);
		await abrirFicha();
		await abrirPestania('Horarios');
		await screen.findByLabelText('Apertura Lunes 1');

		const martes = screen.getByText('Martes').parentElement!;
		await userEvent.click(within(martes).getByRole('button', { name: '+ agregar rango' }));
		expect(within(martes).getByLabelText('Apertura Martes 1')).toHaveValue('09:00');
		expect(within(martes).getByLabelText('Cierre Martes 1')).toHaveValue('13:00');

		const lunes = screen.getByText('Lunes').parentElement!;
		await userEvent.click(within(lunes).getByRole('button', { name: 'Quitar' }));
		expect(within(lunes).queryByLabelText('Apertura Lunes 1')).not.toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }));
		expect(await screen.findByText('Horarios guardados.')).toBeInTheDocument();
		expect(put).toHaveBeenCalledWith('/empresas/2700/horarios', {
			horarios: { Lunes: [], Martes: ['09:00-13:00'] }
		});
	});

	it('permite editar la hora de apertura y de cierre de un rango', async () => {
		render(Negocio);
		await abrirFicha();
		await abrirPestania('Horarios');
		fireEvent.change(await screen.findByLabelText('Apertura Lunes 1'), {
			target: { value: '08:30' }
		});
		fireEvent.change(screen.getByLabelText('Cierre Lunes 1'), { target: { value: '13:00' } });
		await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/empresas/2700/horarios', {
				horarios: { Lunes: ['08:30-13:00'] }
			})
		);
	});

	it('no guarda un rango con el cierre antes de la apertura', async () => {
		render(Negocio);
		await abrirFicha();
		await abrirPestania('Horarios');
		fireEvent.change(await screen.findByLabelText('Cierre Lunes 1'), {
			target: { value: '08:00' }
		});
		await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }));
		expect(
			await screen.findByText(/Lunes: el horario de cierre debe ser posterior/)
		).toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();
	});

	it('si el backend rechaza los horarios, muestra el motivo real', async () => {
		put.mockRejectedValue(
			new ApiError(400, "Franja horaria inválida: '20:00-10:00' (se espera HH:MM-HH:MM)")
		);
		render(Negocio);
		await abrirFicha();
		await abrirPestania('Horarios');
		await userEvent.click(await screen.findByRole('button', { name: 'Guardar horarios' }));
		expect(await screen.findByText(/Franja horaria inválida/)).toBeInTheDocument();
		expect(screen.queryByText('Horarios guardados.')).not.toBeInTheDocument();
	});
});

describe('Turnos recibidos', () => {
	const turnos = [
		{
			id: 1,
			fecha: '2026-10-13',
			hora: '09:00:00',
			estado: 'confirmado',
			cliente_nombre: 'Martina Gómez'
		},
		{
			id: 2,
			fecha: '2026-10-13',
			hora: '10:30:00',
			estado: 'confirmado',
			cliente_nombre: 'Lucas Pérez'
		}
	];

	it('lista los turnos con el cliente y la hora', async () => {
		backend({ turnos });
		render(Negocio);
		// 2.6 "Turnos recibidos" ya es la vista inicial: no hay que navegar.
		expect(await screen.findByText('Martina Gómez')).toBeInTheDocument();
		expect(screen.getByText('09:00 hs')).toBeInTheDocument();
		expect(screen.getByText('Lucas Pérez')).toBeInTheDocument();
		expect(screen.getByText('10:30 hs')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/empresas/2700/turnos');
	});

	it('sin turnos lo dice', async () => {
		render(Negocio);
		expect(await screen.findByText('Todavía no recibiste turnos')).toBeInTheDocument();
	});

	it('el dueño cancela un turno y avisa al cliente', async () => {
		backend({ turnos });
		render(Negocio);
		await screen.findByText('Martina Gómez');
		await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
		expect(await screen.findByText(/Se avisará al cliente/)).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
		await vi.waitFor(() => expect(del).toHaveBeenCalledWith('/turnos/cancelar/1'));
		await vi.waitFor(() => expect(screen.queryByText('Martina Gómez')).not.toBeInTheDocument());
		expect(screen.getByText('Lucas Pérez')).toBeInTheDocument();
	});

	it('si desactivó las reservas, igual puede gestionar los turnos ya recibidos', async () => {
		backend({ comercio: { ...propia, turnos_habilitados: false }, turnos });
		render(Negocio);
		expect(await screen.findByText('Martina Gómez')).toBeInTheDocument();
		expect(screen.getByText(/No estás ofreciendo reservas nuevas/)).toBeInTheDocument();
		expect(screen.queryByText('No ofrecés reserva de turnos')).not.toBeInTheDocument();
	});

	it('si el comercio no ofrece turnos online, lo aclara', async () => {
		backend({ comercio: { ...propia, turnos_habilitados: false } });
		render(Negocio);
		expect(await screen.findByText('No ofrecés reserva de turnos')).toBeInTheDocument();
	});

	it('si falla la carga, muestra el motivo', async () => {
		backend({ turnos: new ApiError(403, 'No tenés los permisos para realizar esta acción') });
		render(Negocio);
		expect(
			await screen.findByText('No tenés los permisos para realizar esta acción')
		).toBeInTheDocument();
	});

	it('muestra el correo de contacto y marca los turnos agendados por el comercio', async () => {
		backend({
			turnos: [
				{ ...turnos[0], cliente_email: 'martina@test.com', sin_cuenta: false },
				{ ...turnos[1], cliente_email: null, sin_cuenta: true }
			]
		});
		render(Negocio);
		await screen.findByText('Martina Gómez');
		expect(screen.getByRole('link', { name: 'martina@test.com' })).toHaveAttribute(
			'href',
			'mailto:martina@test.com'
		);
		const lucas = screen.getByText('Lucas Pérez').closest('p')!;
		expect(within(lucas).getByText('Mostrador')).toBeInTheDocument();
		const martina = screen.getByText('Martina Gómez').closest('p')!;
		expect(within(martina).queryByText('Mostrador')).not.toBeInTheDocument();
	});

	describe('agendar un turno sin cuenta (RF-04)', () => {
		async function abrirFormulario() {
			render(Negocio);
			await screen.findByText('Todavía no recibiste turnos');
			await userEvent.click(screen.getByRole('button', { name: '+ Agendar un turno' }));
		}

		// Los horarios de prueba son solo los lunes de 09:00 a 12:00 (turnos de 30 min).
		const LUNES = '2030-01-07';
		async function elegirHorario(hora: string, fecha = LUNES) {
			fireEvent.input(screen.getByLabelText(/^Fecha/), { target: { value: fecha } });
			await screen.findByRole('option', { name: `${hora} hs` });
			await userEvent.selectOptions(screen.getByLabelText(/^Hora/), hora);
		}

		it('solo ofrece los horarios libres de la grilla del comercio', async () => {
			get.mockImplementation(async (url: string) => {
				if (url.startsWith('/turnos/ocupados')) return [{ hora: '10:00' }];
				if (url.startsWith('/empresas?usuario_id=')) return [propia];
				if (url === '/empresas/horarios/2700') return { Lunes: ['09:00-12:00'] };
				return [];
			});
			await abrirFormulario();
			fireEvent.input(screen.getByLabelText(/^Fecha/), { target: { value: LUNES } });
			await screen.findByRole('option', { name: '09:00 hs' });
			const opciones = screen
				.getAllByRole('option')
				.map((o) => o.textContent?.trim())
				.filter((t) => t?.endsWith('hs'));
			expect(opciones).toEqual(['09:00 hs', '09:30 hs', '10:30 hs', '11:00 hs', '11:30 hs']);
			expect(get).toHaveBeenCalledWith(`/turnos/ocupados?empresa_id=2700&fecha=${LUNES}`);
			// Un martes no atiende: no hay horarios para elegir.
			fireEvent.input(screen.getByLabelText(/^Fecha/), { target: { value: '2030-01-08' } });
			expect(await screen.findByText(/Ese día no atendés/)).toBeInTheDocument();
			expect(screen.getByLabelText(/^Hora/)).toBeDisabled();
		});

		it('exige hora y nombre, y valida el correo', async () => {
			await abrirFormulario();
			expect(screen.getByLabelText(/^Fecha/)).toHaveValue(hoyISO());
			await userEvent.click(screen.getByRole('button', { name: 'Agendar turno' }));
			expect(await screen.findAllByText('Este campo es obligatorio')).toHaveLength(2);
			await userEvent.type(screen.getByLabelText(/Nombre de quien viene/), 'Carlos');
			await elegirHorario('10:30');
			await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'carlos@');
			await userEvent.click(screen.getByRole('button', { name: 'Agendar turno' }));
			expect(await screen.findByText('Ingresá un correo electrónico válido')).toBeInTheDocument();
			expect(post).not.toHaveBeenCalled();
		});

		it('agenda el turno, cierra el formulario y recarga la agenda', async () => {
			post.mockResolvedValue({ id: 99 });
			await abrirFormulario();
			await elegirHorario('10:30');
			await userEvent.type(screen.getByLabelText(/Nombre de quien viene/), ' Carlos Medina ');
			await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'carlos@ejemplo.com');
			await userEvent.click(screen.getByRole('button', { name: 'Agendar turno' }));
			await vi.waitFor(() =>
				expect(post).toHaveBeenCalledWith('/empresas/2700/turnos', {
					fecha: LUNES,
					hora: '10:30',
					cliente_nombre: 'Carlos Medina',
					cliente_email: 'carlos@ejemplo.com'
				})
			);
			await vi.waitFor(() =>
				expect(get.mock.calls.filter((c) => c[0] === '/empresas/2700/turnos')).toHaveLength(2)
			);
			expect(screen.queryByRole('button', { name: 'Agendar turno' })).not.toBeInTheDocument();
		});

		it('sin correo lo manda vacío y, si el horario está tomado, conserva el formulario', async () => {
			post.mockRejectedValue(new ApiError(409, 'Turno ya ocupado'));
			await abrirFormulario();
			await elegirHorario('09:00');
			await userEvent.type(screen.getByLabelText(/Nombre de quien viene/), 'Lucía');
			await userEvent.click(screen.getByRole('button', { name: 'Agendar turno' }));
			await vi.waitFor(() =>
				expect(post).toHaveBeenCalledWith(
					'/empresas/2700/turnos',
					expect.objectContaining({ cliente_nombre: 'Lucía', cliente_email: undefined })
				)
			);
			expect(screen.getByRole('button', { name: 'Agendar turno' })).toBeInTheDocument();
			expect(screen.getByLabelText(/Nombre de quien viene/)).toHaveValue('Lucía');
			// El horario que se ocupó mientras tanto deja de ofrecerse.
			await vi.waitFor(() =>
				expect(screen.queryByRole('option', { name: '09:00 hs' })).not.toBeInTheDocument()
			);
		});
	});
});

describe('Publicidades', () => {
	it('sin comercio pide cargar primero la ficha', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi ficha' }));
		await screen.findByRole('button', { name: 'Crear comercio' });
		await abrirPestania('Publicidades');
		expect(screen.getByText('Primero cargá tu ficha')).toBeInTheDocument();
	});

	it('enviar manda la publicidad a aprobación, la lista como pendiente y limpia el formulario', async () => {
		post.mockResolvedValue({
			id: '5',
			empresa_id: 2700,
			titulo: '2x1',
			descripcion: 'Este mes',
			url_imagen: 'https://x.com/banner.jpg',
			estado: 'pendiente'
		});
		render(Negocio);
		await abrirPestania('Publicidades');
		const titulo = await screen.findByLabelText(/^Título/);
		fireEvent.input(titulo, { target: { value: '2x1' } });
		fireEvent.input(screen.getByLabelText(/^Descripción/), { target: { value: 'Este mes' } });
		fireEvent.input(screen.getByLabelText(/^URL de imagen/), {
			target: { value: 'https://x.com/banner.jpg' }
		});
		await userEvent.click(screen.getByRole('button', { name: 'Enviar a aprobación' }));

		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/publicidades', {
				empresa_id: 2700,
				titulo: '2x1',
				descripcion: 'Este mes',
				url_imagen: 'https://x.com/banner.jpg'
			})
		);
		expect(await screen.findByText('Pendiente de aprobación')).toBeInTheDocument();
		expect((titulo as HTMLInputElement).value).toBe('');
	}, 10000);

	it('lista las del comercio con su estado y deja dar de baja la publicada', async () => {
		const mias = [
			{
				id: '1',
				empresa_id: 2700,
				titulo: 'Promo',
				descripcion: 'x',
				url_imagen: 'https://x.com/1.jpg',
				estado: 'aprobada'
			},
			{
				id: '2',
				empresa_id: 2700,
				titulo: 'Vieja',
				descripcion: 'y',
				url_imagen: 'https://x.com/2.jpg',
				estado: 'rechazada'
			}
		];
		const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
		get.mockImplementation(async (url: string) =>
			url === '/publicidades?empresa_id=2700&estado=todas' ? mias : base(url)
		);
		put.mockResolvedValue({ ...mias[0], estado: 'finalizada' });
		render(Negocio);
		await abrirPestania('Publicidades');
		expect(await screen.findByText('Publicada')).toBeInTheDocument();
		expect(screen.getByText('Rechazada')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Reenviar' })).toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/publicidades/1/estado', { estado: 'finalizada' })
		);
		expect(await screen.findByText('Finalizada')).toBeInTheDocument();
	}, 10000);

	it('no envía sin título', async () => {
		render(Negocio);
		await abrirPestania('Publicidades');
		fireEvent.input(await screen.findByLabelText(/^URL de imagen/), {
			target: { value: 'https://x.com/a.jpg' }
		});
		await userEvent.click(await screen.findByRole('button', { name: 'Enviar a aprobación' }));
		expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	}, 10000);

	it('exige una descripción breve', async () => {
		render(Negocio);
		await abrirPestania('Publicidades');
		fireEvent.input(await screen.findByLabelText(/^Título/), { target: { value: '2x1' } });
		fireEvent.input(screen.getByLabelText(/^URL de imagen/), {
			target: { value: 'https://x.com/a.jpg' }
		});
		await userEvent.click(screen.getByRole('button', { name: 'Enviar a aprobación' }));
		expect(await screen.findByText('La descripción es obligatoria.')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	}, 10000);

	it('exige url_imagen válida además del título', async () => {
		render(Negocio);
		await abrirPestania('Publicidades');
		fireEvent.input(await screen.findByLabelText(/^Título/), { target: { value: '2x1' } });
		fireEvent.input(screen.getByLabelText(/^Descripción/), { target: { value: 'Este mes' } });
		await userEvent.click(screen.getByRole('button', { name: 'Enviar a aprobación' }));
		expect(await screen.findByText(/La imagen es obligatoria/)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();

		fireEvent.input(screen.getByLabelText(/^URL de imagen/), { target: { value: 'no-es-url' } });
		await userEvent.click(screen.getByRole('button', { name: 'Enviar a aprobación' }));
		expect(await screen.findByText(/La imagen es obligatoria/)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	}, 10000);
});

describe('vista inicial y verificación', () => {
	it("la pestaña inicial es 'Turnos recibidos' (2.6)", async () => {
		backend({ turnos: [] });
		render(Negocio);
		expect(await screen.findByText('Todavía no recibiste turnos')).toBeInTheDocument();
		expect(screen.queryByDisplayValue('Estilo Urbano')).not.toBeInTheDocument();
	});

	it('la ficha muestra el canal de contacto y el CUIT', async () => {
		render(Negocio);
		await abrirFicha();
		expect(screen.getByLabelText(/¿Cómo te contactan/)).toBeInTheDocument();
		expect(screen.getByLabelText(/CUIT \(11 dígitos\)/)).toBeInTheDocument();
		expect(screen.getByText(/Ubicación en el mapa/)).toBeInTheDocument();
	});

	it('si rechazaron la verificación muestra el motivo (RF-15)', async () => {
		backend({
			comercio: {
				...propia,
				verificado_estado: 'rechazado',
				motivo_rechazo: 'La constancia está vencida'
			}
		});
		render(Negocio);
		await abrirFicha();
		expect(screen.getByText('Verificación rechazada')).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent(
			/Motivo del rechazo: La constancia está vencida/
		);
	});
});

describe('validaciones de ficha (redes y filas vacías)', () => {
	it('rechaza una red social que no sea URL http(s) válida', async () => {
		render(Negocio);
		await abrirFicha();
		await userEvent.click(screen.getByRole('button', { name: 'Instagram' }));
		const input = screen.getByPlaceholderText('https://instagram.com/tu_comercio');
		fireEvent.input(input, { target: { value: 'no-es-url' } });
		await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		expect(await screen.findByText(/Pegá una URL válida/)).toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();
	}, 10000);

	it('exige completar o quitar la fila de foto vacía antes de guardar', async () => {
		render(Negocio);
		await abrirFicha();
		await userEvent.click(screen.getByRole('button', { name: '+ agregar foto' }));
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		expect(await screen.findByText(/fila de foto vacía/)).toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();
	}, 10000);

	it('exige completar o quitar la fila de teléfono vacía antes de guardar', async () => {
		render(Negocio);
		await abrirFicha();
		await userEvent.click(
			screen.getByRole('button', { name: '+ Agregar otro teléfono de contacto' })
		);
		await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
		expect(await screen.findByText(/fila de teléfono vacía/)).toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();
	}, 10000);
});

describe('filtro de turnos por día', () => {
	const agenda = [
		{ id: 1, fecha: '2026-10-13', hora: '09:00:00', estado: 'confirmado', cliente_nombre: 'Ana' },
		{ id: 2, fecha: '2026-10-14', hora: '10:00:00', estado: 'confirmado', cliente_nombre: 'Beto' }
	];

	it('muestra todos sin filtro y filtra por fecha exacta', async () => {
		backend({ turnos: agenda });
		render(Negocio);
		expect(await screen.findByText('Ana')).toBeInTheDocument();
		expect(screen.getByText('Beto')).toBeInTheDocument();
		const filtro = screen.getByLabelText('Filtrar por día');
		expect(filtro).toHaveAttribute('type', 'date');
		fireEvent.input(filtro, { target: { value: '2026-10-14' } });
		await vi.waitFor(() => expect(screen.queryByText('Ana')).not.toBeInTheDocument());
		expect(screen.getByText('Beto')).toBeInTheDocument();
		fireEvent.input(filtro, { target: { value: '' } });
		expect(await screen.findByText('Ana')).toBeInTheDocument();
		expect(screen.getByText('Beto')).toBeInTheDocument();
	});

	it('avisa cuando ningún turno coincide con el día', async () => {
		backend({ turnos: agenda });
		render(Negocio);
		await screen.findByText('Ana');
		fireEvent.input(screen.getByLabelText('Filtrar por día'), {
			target: { value: '2026-10-20' }
		});
		expect(await screen.findByText('No hay turnos para ese día')).toBeInTheDocument();
	});
});

describe('calificaciones del comercio (RF-13)', () => {
	const opiniones = [
		{ usuario_nombre: 'Martina', puntaje: 5, comentario: 'Excelente', creado_en: '2026-09-01' },
		{ usuario_nombre: 'Lucas', puntaje: 3, comentario: null, creado_en: '2026-09-02' }
	];

	it('lista las opiniones con promedio y pide el endpoint del comercio', async () => {
		backend({ calificaciones: opiniones });
		render(Negocio);
		await abrirPestania('Calificaciones');
		expect(await screen.findByText('Martina')).toBeInTheDocument();
		expect(screen.getByText('Excelente')).toBeInTheDocument();
		expect(screen.getByText('Lucas')).toBeInTheDocument();
		// El promedio aparece una sola vez (junto a las estrellas), no repetido.
		expect(screen.getByText('Promedio')).toBeInTheDocument();
		expect(screen.getAllByText(/4\.0/)).toHaveLength(1);
		expect(get).toHaveBeenCalledWith('/empresas/2700/calificaciones');
	});

	it('filtra por puntaje con el select', async () => {
		backend({ calificaciones: opiniones });
		render(Negocio);
		await abrirPestania('Calificaciones');
		await screen.findByText('Martina');
		await userEvent.selectOptions(screen.getByLabelText('Filtrar por puntaje'), '5');
		expect(screen.getByText('Martina')).toBeInTheDocument();
		expect(screen.queryByText('Lucas')).not.toBeInTheDocument();
		await userEvent.selectOptions(screen.getByLabelText('Filtrar por puntaje'), 'todas');
		expect(screen.getByText('Lucas')).toBeInTheDocument();
	});
});

describe('resumen de actividad', () => {
	const resumen = {
		empresa_id: 2700,
		empresa_nombre: 'Estilo Urbano',
		desde: '2026-10-07',
		hasta: '2026-11-05',
		turnos: {
			turnos: 12,
			online: 9,
			mostrador: 3,
			confirmados: 5,
			completados: 6,
			cancelados: 2,
			no_asistio: 1
		},
		calificaciones: 4,
		calificacion_promedio: 4.5,
		favoritos_nuevos: 2,
		por_dia: [{ fecha: '2026-11-03', turnos: 4, cancelados: 1 }]
	};

	function conResumen(r: unknown = resumen) {
		const base = get.getMockImplementation() as (url: string) => Promise<unknown>;
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/empresas/2700/resumen')) {
				if (r instanceof Error) throw r;
				return r;
			}
			return base(url);
		});
	}

	it('pide el resumen de los últimos 30 días y muestra las métricas', async () => {
		conResumen();
		render(Negocio);
		await abrirPestania('Resumen');
		expect(await screen.findByText('Atendidos')).toBeInTheDocument();
		const desde = new Date(hoyISO() + 'T12:00:00');
		desde.setDate(desde.getDate() - 29);
		expect(get).toHaveBeenCalledWith(
			`/empresas/2700/resumen?desde=${desde.toISOString().slice(0, 10)}&hasta=${hoyISO()}`
		);
		expect(screen.getByText('12')).toBeInTheDocument();
		expect(screen.getByText('Mostrador').nextElementSibling).toHaveTextContent('3');
		expect(screen.getByText(/Puntaje promedio del período/)).toHaveTextContent('4.5');
		expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
	});

	it('"Última semana" vuelve a pedir el resumen con ese período', async () => {
		conResumen();
		render(Negocio);
		await abrirPestania('Resumen');
		await screen.findByText('Atendidos');
		await userEvent.click(screen.getByRole('button', { name: 'Última semana' }));
		const desde = new Date(hoyISO() + 'T12:00:00');
		desde.setDate(desde.getDate() - 6);
		await vi.waitFor(() =>
			expect(get).toHaveBeenCalledWith(
				`/empresas/2700/resumen?desde=${desde.toISOString().slice(0, 10)}&hasta=${hoyISO()}`
			)
		);
	});

	it('descargar en PDF abre la impresión del navegador', async () => {
		conResumen();
		const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
		render(Negocio);
		await abrirPestania('Resumen');
		await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
		expect(imprimir).toHaveBeenCalled();
	});

	it('si el backend falla muestra el motivo', async () => {
		conResumen(new ApiError(400, 'El período no puede superar un año'));
		render(Negocio);
		await abrirPestania('Resumen');
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'El período no puede superar un año'
		);
	});
});
