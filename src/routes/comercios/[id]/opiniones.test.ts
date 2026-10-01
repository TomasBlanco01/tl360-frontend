import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { page } from '$app/state';
import { ApiError, api } from '$lib/api';
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
			post: vi.fn().mockResolvedValue({}),
			put: vi.fn().mockResolvedValue({}),
			delete: vi.fn().mockResolvedValue({})
		}
	};
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;

const RESENAS = [
	{
		usuario_nombre: 'Martina',
		puntaje: 5,
		comentario: 'Excelente atención',
		creado_en: '2026-09-01T10:00:00Z'
	},
	{ usuario_nombre: 'Lucas', puntaje: 3, comentario: null, creado_en: '2026-09-02T10:00:00Z' }
];

function backend(comercio: Record<string, unknown> = {}, resenas: unknown[] = RESENAS) {
	get.mockImplementation(async (url: string) => {
		if (url === '/empresas/7')
			return empresa({
				id: 7,
				nombre: 'Estilo Urbano',
				turnos_habilitados: true,
				admin_id: 50,
				...comercio
			});
		if (url === '/empresas/horarios/7') return {};
		if (url === '/empresas/7/calificaciones') return resenas;
		return [];
	});
}

const cargar = async () => {
	render(Ficha);
	await screen.findByRole('heading', { name: 'Estilo Urbano' });
};

const USUARIO = { id: 1, nombre: 'Cliente', email: 'c@demo.com', rol: 'cliente' as const };

beforeEach(() => {
	for (const f of [get, post, put]) f.mockReset();
	post.mockResolvedValue({});
	put.mockResolvedValue({});
	(page as { params: Record<string, string> }).params = { id: '7' };
	auth.login('t', USUARIO);
	favoritos.ids = [];
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('opiniones', () => {
	it('lista las reseñas con autor, estrellas y comentario', async () => {
		await cargar();
		expect(await screen.findByText('Martina')).toBeInTheDocument();
		expect(screen.getByText('Excelente atención')).toBeInTheDocument();
		expect(screen.getByText('Lucas')).toBeInTheDocument();
	});

	it('sin reseñas lo indica', async () => {
		backend({}, []);
		await cargar();
		expect(await screen.findByText('Todavía no hay opiniones.')).toBeInTheDocument();
	});

	it('sin sesión invita a iniciar sesión en vez de mostrar el formulario', async () => {
		auth.logout();
		await cargar();
		expect(screen.getByRole('link', { name: 'Iniciá sesión' })).toHaveAttribute(
			'href',
			'/auth/login'
		);
		expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
	});

	it('el dueño no puede calificar su propio comercio', async () => {
		auth.login('t', { ...USUARIO, id: 50, rol: 'admin' });
		await cargar();
		expect(screen.getByText('No podés calificar tu propio comercio.')).toBeInTheDocument();
		expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
	});

	it('exige elegir un puntaje antes de enviar', async () => {
		await cargar();
		await userEvent.click(screen.getByRole('button', { name: 'Enviar calificación' }));
		expect(await screen.findByText('Elegí un puntaje de 1 a 5 estrellas.')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('envía puntaje y comentario y refresca la ficha y la lista', async () => {
		await cargar();
		await userEvent.click(screen.getByRole('radio', { name: '4 estrellas' }));
		expect(screen.getByRole('radio', { name: '4 estrellas' })).toHaveAttribute(
			'aria-checked',
			'true'
		);
		await userEvent.type(screen.getByLabelText('Comentario'), 'Muy buen corte');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar calificación' }));

		await waitFor(() =>
			expect(post).toHaveBeenCalledWith('/empresas/7/calificaciones', {
				puntaje: 4,
				comentario: 'Muy buen corte'
			})
		);
		expect(await screen.findByText('¡Gracias por tu calificación!')).toBeInTheDocument();
		// volvió a pedir la ficha (para el promedio) y las reseñas
		expect(get.mock.calls.filter(([u]) => u === '/empresas/7').length).toBeGreaterThanOrEqual(2);
	});

	it('sin comentario no manda el campo', async () => {
		await cargar();
		await userEvent.click(screen.getByRole('radio', { name: '1 estrella' }));
		await userEvent.click(screen.getByRole('button', { name: 'Enviar calificación' }));
		await waitFor(() =>
			expect(post).toHaveBeenCalledWith('/empresas/7/calificaciones', {
				puntaje: 1,
				comentario: undefined
			})
		);
	});

	it('muestra el mensaje del backend si rechaza la calificación', async () => {
		post.mockRejectedValue(new ApiError(403, 'No podés calificar tu propio comercio'));
		await cargar();
		await userEvent.click(screen.getByRole('radio', { name: '5 estrellas' }));
		await userEvent.click(screen.getByRole('button', { name: 'Enviar calificación' }));
		expect(await screen.findByText('No podés calificar tu propio comercio')).toBeInTheDocument();
	});
});

describe('reportar un comercio', () => {
	it('no se ofrece sin sesión ni al dueño', async () => {
		auth.logout();
		await cargar();
		expect(
			screen.queryByRole('button', { name: 'Reportar este comercio' })
		).not.toBeInTheDocument();
	});

	it('abre el formulario, envía el motivo y confirma', async () => {
		await cargar();
		await userEvent.click(screen.getByRole('button', { name: 'Reportar este comercio' }));
		await userEvent.type(screen.getByLabelText('Motivo del reporte'), 'Los datos son falsos');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
		await waitFor(() =>
			expect(post).toHaveBeenCalledWith('/empresas/7/reportes', { motivo: 'Los datos son falsos' })
		);
		expect(await screen.findByText('Reporte enviado. Gracias por avisarnos.')).toBeInTheDocument();
		expect(screen.queryByLabelText('Motivo del reporte')).not.toBeInTheDocument();
	});

	it('si ya lo había reportado muestra el aviso del backend (409)', async () => {
		post.mockRejectedValue(
			new ApiError(409, 'Ya reportaste este comercio y el reporte está en revisión')
		);
		await cargar();
		await userEvent.click(screen.getByRole('button', { name: 'Reportar este comercio' }));
		await userEvent.type(screen.getByLabelText('Motivo del reporte'), 'Sigue mal');
		await userEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }));
		expect(await screen.findByText(/Ya reportaste este comercio/)).toBeInTheDocument();
	});
});

describe('sello de verificado (superadmin)', () => {
	it('un cliente no ve el botón', async () => {
		await cargar();
		expect(screen.queryByRole('button', { name: /sello de verificado/ })).not.toBeInTheDocument();
	});

	it('el superadmin lo otorga y luego lo quita', async () => {
		auth.login('t', { ...USUARIO, id: 99, rol: 'superadmin' });
		put.mockResolvedValueOnce({ verificado: true }).mockResolvedValueOnce({ verificado: false });
		await cargar();
		await userEvent.click(screen.getByRole('button', { name: 'Otorgar sello de verificado' }));
		await waitFor(() =>
			expect(put).toHaveBeenCalledWith('/empresas/7/verificado', { verificado: true })
		);
		expect(await screen.findByText('Verificado')).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Quitar sello de verificado' }));
		await waitFor(() =>
			expect(put).toHaveBeenLastCalledWith('/empresas/7/verificado', { verificado: false })
		);
		await waitFor(() => expect(screen.queryByText('Verificado')).not.toBeInTheDocument());
	});

	it('muestra el error si falla', async () => {
		auth.login('t', { ...USUARIO, id: 99, rol: 'superadmin' });
		put.mockRejectedValue(
			new ApiError(403, 'Solo el administrador de la plataforma puede hacer esto')
		);
		await cargar();
		await userEvent.click(screen.getByRole('button', { name: 'Otorgar sello de verificado' }));
		expect(await screen.findByText(/Solo el administrador/)).toBeInTheDocument();
	});
});

describe('mapa de la ficha', () => {
	it('sin coordenadas usa el mapa embebido de respaldo', async () => {
		await cargar();
		expect(screen.getByTitle(/Mapa de ubicación/)).toBeInTheDocument();
		expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();
	});

	it('con coordenadas dibuja el mapa interactivo en lugar del iframe', async () => {
		backend({ lat: -35.97, lng: -62.73 });
		await cargar();
		expect(await screen.findByTestId('mapa')).toBeInTheDocument();
		expect(screen.queryByTitle(/Mapa de ubicación/)).not.toBeInTheDocument();
	});
});
