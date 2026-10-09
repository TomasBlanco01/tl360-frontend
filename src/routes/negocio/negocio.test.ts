import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
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

const DUENO = { id: 101, nombre: 'Sofía', email: 'negocio@demo.com', rol: 'admin' as const };

const propia = empresa({
	id: 2700,
	nombre: 'Estilo Urbano',
	direccion: 'Villegas 482',
	telefono: '2392411234',
	slogan: 'Cortes modernos',
	duracion_turno_min: 30,
	categoria_id: 4,
	admin_id: 101,
	turnos_habilitados: true,
	instagram: 'https://instagram.com/estilo',
	fotos: ['https://x.com/a.jpg']
});

interface Backend {
	comercio?: unknown;
	horarios?: Record<string, string[]>;
	telefonos?: unknown[];
	turnos?: unknown;
}

function backend({
	comercio = propia,
	horarios = { Lunes: ['09:00-12:00'] },
	telefonos = [{ id: 1, numero: '2392411234', etiqueta: 'Emanuel' }],
	turnos = []
}: Backend = {}) {
	get.mockImplementation(async (url: string) => {
		if (url.startsWith('/empresas?admin_id=')) return comercio ? [comercio] : [];
		if (url === '/categorias')
			return [
				{ id: 4, nombre: 'Peluquerías' },
				{ id: 5, nombre: 'Gimnasios' }
			];
		if (url === '/empresas/2700/telefonos') return telefonos;
		if (url === '/empresas/horarios/2700') return horarios;
		if (url === '/empresas/2700/turnos') {
			if (turnos instanceof Error) throw turnos;
			return turnos;
		}
		return [];
	});
}

beforeEach(() => {
	for (const f of [get, post, put]) f.mockReset();
	put.mockResolvedValue({});
	auth.login('tok', DUENO);
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const abrirPestania = (nombre: string) =>
	userEvent.click(screen.getByRole('button', { name: nombre }));

// 2.6 La vista inicial es "Turnos recibidos"; los tests de ficha navegan a su solapa.
const abrirFicha = async () => {
	await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
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
		expect(get).toHaveBeenCalledWith('/empresas?admin_id=101');
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
		expect(screen.getAllByDisplayValue('2392411234').length).toBeGreaterThan(0); // "Otros teléfonos" precargado
		expect(screen.getByDisplayValue('30')).toBeInTheDocument();
		await vi.waitFor(() =>
			expect((screen.getByLabelText(/^Categoría/) as HTMLSelectElement).value).toBe('4')
		);
		await userEvent.click(screen.getByRole('button', { name: 'Instagram' }));
		expect(screen.getByDisplayValue('https://instagram.com/estilo')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
	});

	it('sin comercio invita a crearlo', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
		expect(await screen.findByText(/Todavía no tenés un comercio cargado/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Crear comercio' })).toBeInTheDocument();
	});

	it('valida los campos obligatorios antes de guardar', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
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
				telefono: '2392411234',
				slogan: 'Cortes modernos',
				duracion_turno_min: 30,
				categoria_id: 4,
				turnos_habilitados: true,
				instagram: 'https://instagram.com/estilo',
				fotos: ['https://x.com/a.jpg']
			})
		);
		expect(put).toHaveBeenCalledWith('/empresas/2700/telefonos', {
			telefonos: [{ id: 1, numero: '2392411234', etiqueta: 'Emanuel' }]
		});
	});

	it('crear el comercio hace POST a nombre del usuario', async () => {
		backend({ comercio: null });
		post.mockResolvedValue(empresa({ id: 9, admin_id: 101 }));
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
		await screen.findByRole('button', { name: 'Crear comercio' });
		await userEvent.type(screen.getByLabelText(/^Nombre/), 'Mi local');
		await userEvent.type(screen.getByLabelText(/^Dirección/), 'Calle 1');
		await userEvent.type(screen.getByLabelText('Característica'), '2392');
		await userEvent.type(screen.getByLabelText('Número'), '000000');
		await userEvent.type(screen.getByLabelText(/Duración del turno/), '45');
		await userEvent.selectOptions(
			await screen
				.findByRole('option', { name: 'Peluquerías' })
				.then(() => screen.getByLabelText(/^Categoría/)),
			'Peluquerías'
		);
		await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));

		await vi.waitFor(() => expect(post).toHaveBeenCalled());
		expect(post).toHaveBeenCalledWith(
			'/empresas',
			expect.objectContaining({
				nombre: 'Mi local',
				direccion: 'Calle 1',
				telefono: '2392000000',
				duracion_turno_min: 45,
				categoria_id: 4,
				admin_id: 101,
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
		await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
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

	it('si el comercio no ofrece turnos online, lo aclara', async () => {
		backend({ comercio: { ...propia, turnos_habilitados: false } });
		render(Negocio);
		expect(await screen.findByText('No ofrecés reserva de turnos')).toBeInTheDocument();
	});

	it('si falla la carga, muestra el motivo', async () => {
		backend({ turnos: new ApiError(403, 'No podés editar una empresa que no es tuya') });
		render(Negocio);
		expect(
			await screen.findByText('No podés editar una empresa que no es tuya')
		).toBeInTheDocument();
	});
});

describe('Publicidades', () => {
	it('sin comercio pide cargar primero la ficha', async () => {
		backend({ comercio: null });
		render(Negocio);
		await userEvent.click(screen.getByRole('button', { name: 'Mi Ficha' }));
		await screen.findByRole('button', { name: 'Crear comercio' });
		await abrirPestania('Publicidades');
		expect(screen.getByText('Primero cargá tu ficha')).toBeInTheDocument();
	});

	it('publicar manda la publicidad del comercio y limpia el formulario', async () => {
		post.mockResolvedValue({
			id: '5',
			empresa_id: 2700,
			titulo: '2x1',
			descripcion: 'Este mes',
			imagen_url: ''
		});
		render(Negocio);
		await abrirPestania('Publicidades');
		const titulo = await screen.findByLabelText('Título');
		await userEvent.type(titulo, '2x1');
		await userEvent.type(screen.getByLabelText('Descripción'), 'Este mes');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));

		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/publicidades', {
				empresa_id: 2700,
				titulo: '2x1',
				descripcion: 'Este mes',
				imagen_url: ''
			})
		);
		expect((titulo as HTMLInputElement).value).toBe('');
	});

	it('no publica sin título', async () => {
		render(Negocio);
		await abrirPestania('Publicidades');
		await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
		expect(post).not.toHaveBeenCalled();
	});
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
});
