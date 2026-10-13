import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { favoritos } from '$lib/stores/favoritos.svelte';
import { empresa } from '../../../tests/helpers';
import Ficha from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: {
			get: vi.fn().mockResolvedValue([]),
			post: vi.fn(),
			put: vi.fn().mockResolvedValue({}),
			delete: vi.fn().mockResolvedValue({})
		}
	};
});

const get = api.get as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;

const HORARIOS = { Lunes: ['09:00-12:00', '16:00-20:00'], Sábado: ['09:00-13:00'] };

function backend(
	comercio: Record<string, unknown> = {},
	horarios: Record<string, string[]> = HORARIOS
) {
	get.mockImplementation(async (url: string) => {
		if (url === '/empresas/7')
			return empresa({
				id: 7,
				nombre: 'Estilo Urbano',
				direccion: 'Villegas 482',
				turnos_habilitados: true,
				...comercio
			});
		if (url === '/empresas/horarios/7') return horarios;
		return [];
	});
}

async function cargarFicha() {
	render(Ficha);
	return screen.findByRole('heading', { name: 'Estilo Urbano' });
}

beforeEach(() => {
	get.mockReset();
	put.mockClear();
	(page as { params: Record<string, string> }).params = { id: '7' };
	auth.logout();
	favoritos.ids = [];
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

describe('ficha del comercio', () => {
	it('mientras carga muestra un aviso', () => {
		get.mockImplementation(() => new Promise(() => {}));
		render(Ficha);
		expect(screen.getByText('Cargando comercio...')).toBeInTheDocument();
	});

	it('si el comercio no existe lo informa', async () => {
		get.mockRejectedValue(new Error('404'));
		render(Ficha);
		expect(await screen.findByText('No encontramos ese comercio')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Ver directorio' })).toHaveAttribute(
			'href',
			'/comercios'
		);
	});

	it('muestra los datos del comercio', async () => {
		backend({
			categoria: 'Peluquerías',
			slogan: 'Cortes modernos',
			descripcion: 'Color, alisados y peinados para novias.'
		});
		await cargarFicha();
		expect(screen.getByText('Peluquerías')).toBeInTheDocument();
		expect(screen.getByText('Cortes modernos')).toBeInTheDocument();
		expect(screen.getByText('Color, alisados y peinados para novias.')).toBeInTheDocument();
		expect(screen.getByText('Villegas 482')).toBeInTheDocument();
	});

	it('no muestra la descripción si el comercio no tiene', async () => {
		backend({ descripcion: undefined });
		await cargarFicha();
		expect(screen.queryByText(/novias/)).not.toBeInTheDocument();
	});

	it('lista los horarios por día, en orden', async () => {
		await cargarFicha();
		expect(screen.getByText('Lunes: 09:00-12:00, 16:00-20:00')).toBeInTheDocument();
		expect(screen.getByText('Sábado: 09:00-13:00')).toBeInTheDocument();
		expect(screen.queryByText(/^Martes:/)).not.toBeInTheDocument();
	});

	it('sin horarios lo dice', async () => {
		backend({}, {});
		await cargarFicha();
		expect(screen.getByText('Sin horarios cargados')).toBeInTheDocument();
	});

	it('muestra el sello Verificado y la calificación solo si corresponden', async () => {
		backend({ verificado: true, calificacion_promedio: 4.5, calificacion_cantidad: 12 });
		await cargarFicha();
		expect(screen.getByText('Verificado')).toBeInTheDocument();
		expect(screen.getByText('4.5 (12)')).toBeInTheDocument();
	});

	it('sin verificar ni calificaciones no muestra ninguno', async () => {
		await cargarFicha();
		expect(screen.queryByText('Verificado')).not.toBeInTheDocument();
		expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
	});

	it('muestra las etiquetas y las fotos', async () => {
		backend({ etiquetas: ['Wi-Fi gratis', 'Pet friendly'], fotos: ['https://x.com/a.jpg'] });
		await cargarFicha();
		expect(screen.getByText('Wi-Fi gratis')).toBeInTheDocument();
		expect(screen.getByText('Pet friendly')).toBeInTheDocument();
		expect(screen.getByAltText('Estilo Urbano')).toHaveAttribute('src', 'https://x.com/a.jpg');
	});

	it('las redes sociales abren en otra pestaña sin filtrar el origen', async () => {
		backend({ instagram: 'https://instagram.com/estilo', facebook: 'https://facebook.com/estilo' });
		await cargarFicha();
		const ig = screen.getByRole('link', { name: /Instagram/ });
		expect(ig).toHaveAttribute('href', 'https://instagram.com/estilo');
		expect(ig).toHaveAttribute('target', '_blank');
		expect(ig).toHaveAttribute('rel', 'noopener noreferrer');
		expect(screen.getByRole('link', { name: /Facebook/ })).toHaveAttribute(
			'href',
			'https://facebook.com/estilo'
		);
	});

	it('incluye el mapa de la dirección', async () => {
		await cargarFicha();
		const mapa = screen.getByTitle('Mapa de ubicación de Estilo Urbano');
		expect(mapa.getAttribute('src')).toContain(encodeURIComponent('Villegas 482, Trenque Lauquen'));
	});

	describe('abierto o cerrado según la hora', () => {
		const ahora = (h: number, m: number) => {
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(2026, 9, 12, h, m)); // lunes
		};

		it('dentro del horario: "Abierto ahora"', async () => {
			ahora(10, 0);
			await cargarFicha();
			expect(screen.getByText('Abierto ahora')).toBeInTheDocument();
		});

		it('fuera del horario: "Cerrado"', async () => {
			ahora(14, 0);
			await cargarFicha();
			expect(screen.getByText('Cerrado')).toBeInTheDocument();
			expect(screen.queryByText('Abierto ahora')).not.toBeInTheDocument();
		});
	});

	describe('turnos', () => {
		it('si toma turnos ofrece reservar', async () => {
			await cargarFicha();
			await userEvent.click(screen.getByRole('button', { name: 'Reservar turno' }));
			expect(goto).toHaveBeenCalledWith('/comercios/7/reservar');
		});

		it('si no toma turnos lo indica y ofrece contacto directo', async () => {
			backend({ turnos_habilitados: false, telefono: '2392411234' });
			await cargarFicha();
			expect(screen.getByText('Solo contacto directo')).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Reservar turno' })).not.toBeInTheDocument();
			expect(screen.getAllByRole('button', { name: 'Llamar' }).length).toBeGreaterThan(0);
			expect(screen.getAllByRole('button', { name: 'WhatsApp' }).length).toBeGreaterThan(0);
		});
	});

	describe('contacto', () => {
		it('muestra todos los teléfonos con su etiqueta', async () => {
			backend({
				telefonos: [{ numero: '2392111111', etiqueta: 'Turnos' }, { numero: '2392222222' }]
			});
			await cargarFicha();
			expect(screen.getByText('Turnos — 2392-111111')).toBeInTheDocument();
			expect(screen.getByText('2392-222222')).toBeInTheDocument();
		});

		it('WhatsApp abre el chat con el número en formato internacional', async () => {
			const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
			backend({ telefonos: [{ numero: '2392411234' }] });
			await cargarFicha();
			await userEvent.click(screen.getAllByRole('button', { name: 'WhatsApp' })[0]);
			expect(abrir).toHaveBeenCalledWith('https://wa.me/5492392411234', '_blank', 'noopener');
		});

		it('respeta el modo de contacto elegido por el comercio', async () => {
			backend({ telefonos: [{ numero: '2392411234' }], modo_contacto: 'llamada' });
			await cargarFicha();
			expect(screen.getAllByRole('button', { name: 'Llamar' }).length).toBeGreaterThan(0);
			expect(screen.queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
		});

		it('modo "mensaje": solo WhatsApp', async () => {
			backend({ telefonos: [{ numero: '2392411234' }], modo_contacto: 'mensaje' });
			await cargarFicha();
			expect(screen.getAllByRole('button', { name: 'WhatsApp' }).length).toBeGreaterThan(0);
			expect(screen.queryByRole('button', { name: 'Llamar' })).not.toBeInTheDocument();
		});
	});

	describe('favoritos', () => {
		it('sin sesión manda a iniciar sesión', async () => {
			await cargarFicha();
			await userEvent.click(screen.getByRole('button', { name: 'Marcar como favorito' }));
			expect(goto).toHaveBeenCalledWith('/auth/login');
			expect(put).not.toHaveBeenCalled();
		});

		it('con sesión lo marca y se ve el corazón lleno', async () => {
			auth.login('t', { id: 3, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' });
			await cargarFicha();
			const corazon = screen.getByRole('button', { name: 'Marcar como favorito' });
			expect(corazon).toHaveTextContent('♡');
			await userEvent.click(corazon);
			expect(put).toHaveBeenCalledWith('/favoritos/7');
			await vi.waitFor(() => expect(corazon).toHaveTextContent('♥'));
		});

		it('si ya era favorito se ve lleno desde el inicio', async () => {
			auth.login('t', { id: 3, nombre: 'Ana', email: 'a@b.com', rol: 'cliente' });
			favoritos.ids = [7];
			await cargarFicha();
			expect(screen.getByRole('button', { name: 'Marcar como favorito' })).toHaveTextContent('♥');
		});
	});
});
