import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { goto } from '$app/navigation';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import Admin from './+page.svelte';

vi.mock('$lib/api', async (original) => {
	const real = await original<typeof import('$lib/api')>();
	return { ...real, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const put = api.put as ReturnType<typeof vi.fn>;
const borrar = api.delete as ReturnType<typeof vi.fn>;

const rubros = [
	{ id: 1, nombre: 'Peluquerías' },
	{ id: 2, nombre: 'Gimnasios' }
];

beforeEach(() => {
	for (const f of [get, post, put, borrar]) f.mockReset().mockResolvedValue({});
	get.mockResolvedValue(rubros);
	auth.login('t', { id: 1, nombre: 'Admin', email: 'admin@demo.com', rol: 'superadmin' });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const fila = (nombre: string) => screen.getByText(nombre).closest('li')!;

describe('panel de administración', () => {
	it('sin sesión manda a iniciar sesión', async () => {
		auth.logout();
		render(Admin);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/auth/login'));
		expect(get).not.toHaveBeenCalled();
	});

	it('solo el superadmin entra: un cliente o un dueño vuelven al inicio', async () => {
		for (const rol of ['cliente', 'admin'] as const) {
			vi.mocked(goto).mockClear();
			auth.login('t', { id: 2, nombre: 'X', email: 'x@y.com', rol });
			const { unmount } = render(Admin);
			await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/'));
			expect(get).not.toHaveBeenCalled();
			unmount();
		}
	});

	it('lista los rubros existentes', async () => {
		render(Admin);
		expect(await screen.findByText('Peluquerías')).toBeInTheDocument();
		expect(screen.getByText('Gimnasios')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/categorias');
	});

	it('sin rubros lo indica', async () => {
		get.mockResolvedValue([]);
		render(Admin);
		expect(await screen.findByText('Todavía no hay categorías cargadas.')).toBeInTheDocument();
	});

	describe('crear', () => {
		it('exige un nombre', async () => {
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
			expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument();
			expect(post).not.toHaveBeenCalled();
		});

		it('crea el rubro, limpia el campo y recarga la lista', async () => {
			render(Admin);
			await screen.findByText('Peluquerías');
			const campo = screen.getByLabelText('Nombre') as HTMLInputElement;
			await userEvent.type(campo, 'Yoga');
			await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
			await vi.waitFor(() => expect(post).toHaveBeenCalledWith('/categorias', { nombre: 'Yoga' }));
			await vi.waitFor(() => expect(campo.value).toBe(''));
			expect(get).toHaveBeenCalledTimes(2);
		});

		it('si el nombre está repetido muestra el aviso del backend (409)', async () => {
			post.mockRejectedValue(new ApiError(409, 'Ya existe un rubro con ese nombre'));
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.type(screen.getByLabelText('Nombre'), 'Gimnasios');
			await userEvent.click(screen.getByRole('button', { name: 'Agregar' }));
			expect(await screen.findByText('Ya existe un rubro con ese nombre')).toBeInTheDocument();
		});
	});

	describe('editar', () => {
		it('cambia el nombre y guarda', async () => {
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Peluquerías')).getByRole('button', { name: 'Editar' }));
			const campo = screen.getByDisplayValue('Peluquerías');
			await userEvent.clear(campo);
			await userEvent.type(campo, 'Peluquerías y barberías');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			await vi.waitFor(() =>
				expect(put).toHaveBeenCalledWith('/categorias/1', { nombre: 'Peluquerías y barberías' })
			);
		});

		it('cancelar la edición no guarda nada', async () => {
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Peluquerías')).getByRole('button', { name: 'Editar' }));
			await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
			expect(put).not.toHaveBeenCalled();
			expect(screen.getByText('Peluquerías')).toBeInTheDocument();
		});

		it('no guarda un nombre vacío', async () => {
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Peluquerías')).getByRole('button', { name: 'Editar' }));
			await userEvent.clear(screen.getByDisplayValue('Peluquerías'));
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			expect(put).not.toHaveBeenCalled();
		});
	});

	describe('eliminar', () => {
		it('pide confirmación y, si se acepta, borra y recarga', async () => {
			const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Gimnasios')).getByRole('button', { name: 'Eliminar' }));
			expect(confirmar).toHaveBeenCalledWith(
				expect.stringContaining('no tiene comercios asignados')
			);
			await vi.waitFor(() => expect(borrar).toHaveBeenCalledWith('/categorias/2'));
		});

		it('si se cancela la confirmación no borra', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(false);
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Gimnasios')).getByRole('button', { name: 'Eliminar' }));
			expect(borrar).not.toHaveBeenCalled();
		});

		it('si el rubro tiene comercios, muestra el motivo (409)', async () => {
			vi.spyOn(window, 'confirm').mockReturnValue(true);
			borrar.mockRejectedValue(
				new ApiError(409, 'El rubro tiene comercios asignados y no puede eliminarse')
			);
			render(Admin);
			await screen.findByText('Peluquerías');
			await userEvent.click(within(fila('Peluquerías')).getByRole('button', { name: 'Eliminar' }));
			expect(
				await screen.findByText('El rubro tiene comercios asignados y no puede eliminarse')
			).toBeInTheDocument();
		});
	});
});
