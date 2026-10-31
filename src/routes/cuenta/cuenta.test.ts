import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { activar, desactivar, detectarEstado } from '$lib/push';
import { auth } from '$lib/stores/auth.svelte';
import { favoritos } from '$lib/stores/favoritos.svelte';
import type { MiTurno } from '$lib/types';
import { empresa } from '../../tests/helpers';
import Cuenta from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return {
		...real,
		api: { get: vi.fn().mockResolvedValue([]), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
	};
});

vi.mock('$lib/push', () => ({
	detectarEstado: vi.fn(),
	activar: vi.fn(),
	desactivar: vi.fn()
}));

const get = api.get as ReturnType<typeof vi.fn>;
const borrar = api.delete as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;
const detectar = detectarEstado as ReturnType<typeof vi.fn>;
const activarPush = activar as ReturnType<typeof vi.fn>;
const desactivarPush = desactivar as ReturnType<typeof vi.fn>;

const ana = { id: 3, nombre: 'Ana Pérez', email: 'ana@test.com', rol: 'cliente' as const };

/** Fecha local a `dias` de hoy (positivo = futuro), en formato ISO corto. */
function iso(dias: number): string {
	const d = new Date();
	d.setDate(d.getDate() + dias);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const turnos = [
	{
		id: 10,
		fecha: iso(3),
		hora: '10:00:00',
		estado: 'confirmado',
		empresa_nombre: 'Peluquería Central'
	},
	{
		id: 11,
		fecha: iso(4),
		hora: '16:30:00',
		estado: 'confirmado',
		empresa_nombre: 'Odontólogo Ruiz'
	}
];

function backend(mios: MiTurno[] = turnos) {
	get.mockImplementation(async (url: string) => {
		if (url === '/turnos/mis-turnos') return mios;
		if (url === '/usuarios/yo/recordatorio') return { horas: 24 };
		const m = url.match(/^\/empresas\/(\d+)$/);
		if (m) return empresa({ id: Number(m[1]), nombre: `Favorito ${m[1]}` });
		return [];
	});
}

beforeEach(() => {
	get.mockReset();
	borrar.mockReset().mockResolvedValue({});
	put.mockReset().mockResolvedValue({});
	detectar.mockReset().mockResolvedValue('no-soportado');
	activarPush.mockReset().mockResolvedValue(undefined);
	desactivarPush.mockReset().mockResolvedValue(undefined);
	auth.login('tok', ana);
	favoritos.ids = [];
	backend();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Mi cuenta', () => {
	it('sin sesión manda a iniciar sesión', async () => {
		auth.logout();
		render(Cuenta);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
		expect(get).not.toHaveBeenCalledWith('/turnos/mis-turnos');
	});

	it('muestra los datos del usuario', async () => {
		render(Cuenta);
		expect(await screen.findByText('Ana Pérez · ana@test.com')).toBeInTheDocument();
	});

	it('lista los turnos con comercio y hora sin segundos', async () => {
		render(Cuenta);
		expect(await screen.findByText('Peluquería Central')).toBeInTheDocument();
		expect(screen.getByText('10:00 hs')).toBeInTheDocument();
		expect(screen.getByText('Odontólogo Ruiz')).toBeInTheDocument();
		expect(screen.getByText('16:30 hs')).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: 'Cancelar Turno' })).toHaveLength(2);
	});

	it('sin turnos ofrece explorar comercios', async () => {
		backend([]);
		render(Cuenta);
		expect(await screen.findByText('No tenés turnos reservados')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Explorar comercios' })).toHaveAttribute(
			'href',
			'/comercios'
		);
	});

	describe('cancelar un turno', () => {
		// 2.2 La confirmación es un modal accesible (ConfirmModal), no window.confirm().
		async function abrirModal() {
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getAllByRole('button', { name: 'Cancelar Turno' })[0]);
			expect(await screen.findByText('Cancelar turno')).toBeInTheDocument();
		}

		it('si el usuario confirma, lo cancela y lo saca de la lista', async () => {
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			expect(borrar).toHaveBeenCalledWith('/turnos/cancelar/10');
			await vi.waitFor(() =>
				expect(screen.queryByText('Peluquería Central')).not.toBeInTheDocument()
			);
			expect(screen.getByText('Odontólogo Ruiz')).toBeInTheDocument();
		});

		it('si se arrepiente, no hace nada', async () => {
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
			expect(borrar).not.toHaveBeenCalled();
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('si el backend lo rechaza (fuera de plazo), muestra el motivo y conserva el turno', async () => {
			borrar.mockRejectedValue(
				new ApiError(400, 'Solo se puede cancelar un turno con al menos 2 horas de anticipación')
			);
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			await vi.waitFor(() =>
				expect(
					screen.getByText('Solo se puede cancelar un turno con al menos 2 horas de anticipación')
				).toBeInTheDocument()
			);
			expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		});

		it('ante un error inesperado muestra un mensaje genérico', async () => {
			borrar.mockRejectedValue(new TypeError('Failed to fetch'));
			await abrirModal();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
			await vi.waitFor(() =>
				expect(screen.getByText('No se pudo cancelar el turno.')).toBeInTheDocument()
			);
		});
	});

	describe('favoritos', () => {
		it('sin favoritos muestra el estado vacío', async () => {
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: 'Favoritos' }));
			expect(await screen.findByText('Todavía no tenés favoritos')).toBeInTheDocument();
		});

		it('trae cada comercio favorito por su id (no todo el catálogo)', async () => {
			favoritos.ids = [7, 9];
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: 'Favoritos' }));
			expect(await screen.findByText('Favorito 7')).toBeInTheDocument();
			expect(screen.getByText('Favorito 9')).toBeInTheDocument();
			expect(get).toHaveBeenCalledWith('/empresas/7');
			expect(get).toHaveBeenCalledWith('/empresas/9');
			expect(get).not.toHaveBeenCalledWith('/empresas');
		});
	});

	describe('historial (2.6)', () => {
		it('separa próximos y pasados y el nombre enlaza a la ficha', async () => {
			backend([
				{
					id: 10,
					fecha: iso(5),
					hora: '10:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Futura',
					empresa_id: 5,
					empresa_slug: 'futura'
				},
				{
					id: 11,
					fecha: '2020-01-01',
					hora: '10:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Vieja',
					empresa_id: 6,
					calificado: false
				}
			]);
			render(Cuenta);
			await screen.findByText('Futura');
			expect(screen.queryByText('Vieja')).not.toBeInTheDocument();
			expect(screen.getByRole('link', { name: 'Futura' })).toHaveAttribute(
				'href',
				'/comercios/futura'
			);
			await userEvent.click(screen.getByRole('button', { name: /Turnos pasados/ }));
			expect(await screen.findByText('Vieja')).toBeInTheDocument();
			expect(screen.queryByText('Futura')).not.toBeInTheDocument();
		});

		it('un turno pasado sin calificar enlaza al formulario y uno calificado lo indica (RF-13)', async () => {
			backend([
				{
					id: 12,
					fecha: '2020-01-01',
					hora: '10:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Para calificar',
					empresa_id: 7,
					calificado: false
				},
				{
					id: 13,
					fecha: '2020-01-02',
					hora: '11:00:00',
					estado: 'confirmado',
					empresa_nombre: 'Ya calificada',
					empresa_id: 8,
					calificado: true
				},
				{
					id: 14,
					fecha: '2020-01-03',
					hora: '12:00:00',
					estado: 'cancelado',
					empresa_nombre: 'Cancelada',
					empresa_id: 9,
					calificado: false
				}
			]);
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: /Turnos pasados/ }));
			expect(await screen.findByRole('link', { name: 'Calificar' })).toHaveAttribute(
				'href',
				'/comercios/7#opiniones'
			);
			expect(screen.getByText('Calificado')).toBeInTheDocument();
			expect(screen.getAllByRole('link', { name: 'Calificar' })).toHaveLength(1);
			expect(screen.getByText('Cancelado')).toBeInTheDocument();
			expect(screen.getAllByText('Confirmado')).toHaveLength(2);
		});
	});

	describe('notificaciones push (RNF-04)', () => {
		it('si el navegador no las soporta no muestra la tarjeta', async () => {
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			expect(screen.queryByText('Notificaciones')).not.toBeInTheDocument();
		});

		it('permite activarlas y refleja el estado', async () => {
			detectar.mockResolvedValueOnce('desactivado');
			render(Cuenta);
			await userEvent.click(await screen.findByRole('button', { name: 'Activar notificaciones' }));
			await vi.waitFor(() => expect(activarPush).toHaveBeenCalled());
			expect(await screen.findByText('Activadas en este dispositivo.')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Desactivar notificaciones' })).toBeInTheDocument();
		});

		it('si ya están activas permite desactivarlas', async () => {
			detectar.mockResolvedValueOnce('activo');
			render(Cuenta);
			await userEvent.click(
				await screen.findByRole('button', { name: 'Desactivar notificaciones' })
			);
			await vi.waitFor(() => expect(desactivarPush).toHaveBeenCalled());
			expect(
				await screen.findByRole('button', { name: 'Activar notificaciones' })
			).toBeInTheDocument();
		});

		it('explica cuando el navegador las bloqueó', async () => {
			detectar.mockResolvedValueOnce('bloqueado');
			render(Cuenta);
			expect(await screen.findByText(/El navegador las bloqueó/)).toBeInTheDocument();
			expect(
				screen.queryByRole('button', { name: 'Activar notificaciones' })
			).not.toBeInTheDocument();
		});

		it('carga y guarda la anticipación del recordatorio (RF-03)', async () => {
			detectar.mockResolvedValueOnce('activo');
			render(Cuenta);
			const selector = await screen.findByLabelText(/Anticipación del recordatorio/);
			expect(selector).toHaveValue('24');
			await userEvent.selectOptions(selector, '1');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar recordatorio' }));
			await vi.waitFor(() =>
				expect(put).toHaveBeenCalledWith('/usuarios/yo/recordatorio', { horas: 1 })
			);
			expect(
				await screen.findByText('Anticipación del recordatorio actualizada.')
			).toBeInTheDocument();
		});
	});

	describe('mis datos', () => {
		async function abrirMisDatos() {
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			await userEvent.click(screen.getByRole('button', { name: 'Mis datos' }));
		}

		it('es una pestaña propia con nombre, correo y cambio de contraseña', async () => {
			render(Cuenta);
			await screen.findByText('Peluquería Central');
			expect(screen.queryByLabelText(/Contraseña actual/)).not.toBeInTheDocument();
			await userEvent.click(screen.getByRole('button', { name: 'Mis datos' }));
			expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Ana Pérez');
			expect(screen.getByLabelText(/Correo/)).toHaveValue('ana@test.com');
			expect(screen.getByLabelText(/Contraseña actual/)).toBeInTheDocument();
			expect(screen.getByLabelText(/Nueva contraseña/)).toBeInTheDocument();
			expect(screen.getByLabelText(/Confirmar nueva/)).toBeInTheDocument();
			expect(screen.queryByText('Peluquería Central')).not.toBeInTheDocument();
		});

		it('el dueño de un comercio solo ve Mis datos', async () => {
			auth.login('tok', { ...ana, rol: 'admin' });
			render(Cuenta);
			expect(await screen.findByLabelText(/Contraseña actual/)).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Mis datos' })).toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Mis Turnos' })).not.toBeInTheDocument();
			expect(screen.queryByRole('button', { name: 'Favoritos' })).not.toBeInTheDocument();
		});

		it('un correo nuevo queda pendiente de verificar y lo avisa', async () => {
			put.mockResolvedValue({ ...ana, email: 'ana.nueva@test.com', email_verificado: false });
			await abrirMisDatos();
			const correo = screen.getByLabelText(/Correo/);
			await userEvent.clear(correo);
			await userEvent.type(correo, 'ana.nueva@test.com');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
			expect(
				await screen.findByText(/Te enviamos un enlace para verificar tu nuevo correo/)
			).toBeInTheDocument();
			expect(auth.user?.email).toBe('ana.nueva@test.com');
			expect(auth.user?.email_verificado).toBe(false);
		});

		it('si el backend rechaza el cambio lo muestra y no toca la sesión', async () => {
			put.mockRejectedValue(new ApiError(409, 'Ya existe una cuenta con ese correo'));
			await abrirMisDatos();
			const correo = screen.getByLabelText(/Correo/);
			await userEvent.clear(correo);
			await userEvent.type(correo, 'otra@test.com');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
			expect(await screen.findByText('Ya existe una cuenta con ese correo')).toHaveClass(
				'text-danger-600'
			);
			expect(auth.user?.email).toBe('ana@test.com');
		});

		it('si la contraseña actual es incorrecta lo informa', async () => {
			put.mockRejectedValue(new ApiError(400, 'La contraseña actual no es correcta'));
			await abrirMisDatos();
			await userEvent.type(screen.getByLabelText(/Contraseña actual/), 'Otra1234');
			await userEvent.type(screen.getByLabelText(/Nueva contraseña/), 'Nueva1234');
			await userEvent.type(screen.getByLabelText(/Confirmar nueva/), 'Nueva1234');
			await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
			expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument();
		});

		it('guardar datos llama a /usuarios/yo y actualiza el usuario', async () => {
			put.mockResolvedValue({ ...ana, nombre: 'Ana Nueva', email_verificado: true });
			await abrirMisDatos();
			const campoNombre = screen.getByLabelText(/^Nombre/) as HTMLInputElement;
			await userEvent.clear(campoNombre);
			await userEvent.type(campoNombre, 'Ana Nueva');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
			await vi.waitFor(() =>
				expect(put).toHaveBeenCalledWith(
					'/usuarios/yo',
					expect.objectContaining({ nombre: 'Ana Nueva' })
				)
			);
			expect(auth.user?.nombre).toBe('Ana Nueva');
			expect(await screen.findByText('Datos actualizados correctamente.')).toBeInTheDocument();
		});

		it('cambiar contraseña avisa si no coinciden', async () => {
			await abrirMisDatos();
			await userEvent.type(screen.getByLabelText(/Contraseña actual/), 'Vieja1234');
			await userEvent.type(screen.getByLabelText(/Nueva contraseña/), 'Nueva1234');
			await userEvent.type(screen.getByLabelText(/Confirmar nueva/), 'Distinta1234');
			await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
			expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
			expect(put).not.toHaveBeenCalledWith(
				'/usuarios/yo',
				expect.objectContaining({ password_nueva: expect.anything() })
			);
		});

		it('cambiar contraseña con datos válidos muestra éxito', async () => {
			await abrirMisDatos();
			await userEvent.type(screen.getByLabelText(/Contraseña actual/), 'Vieja1234');
			await userEvent.type(screen.getByLabelText(/Nueva contraseña/), 'Nueva1234');
			await userEvent.type(screen.getByLabelText(/Confirmar nueva/), 'Nueva1234');
			await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
			expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeInTheDocument();
		});
	});
});
