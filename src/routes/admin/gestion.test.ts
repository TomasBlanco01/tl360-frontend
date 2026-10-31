import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { toast } from '$lib/_auditoria/toast.svelte';
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

const comercios = [
	{
		id: 7,
		nombre: 'Estilo Urbano',
		categoria: 'Peluquerías',
		categoria_id: 1,
		direccion: 'Villegas 482',
		telefono: '2392411234',
		slogan: 'Cortes y color',
		admin_id: 3,
		verificado: true,
		slug: 'estilo-urbano'
	},
	{
		id: 8,
		nombre: 'Gym Norte',
		categoria: 'Gimnasios',
		categoria_id: 2,
		direccion: 'Roca 10',
		admin_id: null,
		verificado: false,
		slug: 'gym-norte'
	}
];

const usuarios = [
	{ id: 1, nombre: 'Admin TL360', email: 'admin@demo.com', rol: 'superadmin' },
	{ id: 3, nombre: 'Sofía Ramírez', email: 'negocio@demo.com', rol: 'admin' },
	{ id: 9, nombre: 'Martina Gómez', email: 'cliente@demo.com', rol: 'cliente' }
];

const publicidades = [
	{ id: 4, empresa_id: 7, titulo: '20% en cortes', descripcion: 'Todo octubre' },
	{
		id: 5,
		empresa_id: null,
		titulo: 'Colecta para el hospital',
		descripcion: 'Insumos pediátricos'
	}
];

const turnos = [
	{
		id: 31,
		fecha: '2026-11-03',
		hora: '10:00',
		estado: 'confirmado',
		cliente_nombre: 'Martina Gómez'
	}
];

function backend(url: string) {
	if (url === '/categorias') return rubros;
	if (url.startsWith('/empresas?verificado_estado=')) return [];
	if (/^\/empresas\/\d+\/turnos$/.test(url)) return url === '/empresas/7/turnos' ? turnos : [];
	if (url.startsWith('/empresas')) return comercios;
	if (url === '/usuarios') return usuarios;
	if (url.startsWith('/publicidades')) return publicidades;
	return [];
}

beforeEach(() => {
	for (const f of [get, post, put, borrar]) f.mockReset().mockResolvedValue({});
	get.mockImplementation(async (url: string) => backend(url));
	auth.login('t', { id: 1, nombre: 'Admin', email: 'admin@demo.com', rol: 'superadmin' });
	toast.items = [];
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

const avisos = () => toast.items.map((t) => t.mensaje);
const fila = (texto: string) => screen.getByText(texto).closest('li')!;
const llamadasA = (url: string) => get.mock.calls.filter((c) => c[0] === url).length;

async function abrir(solapa: string) {
	render(Admin);
	await userEvent.click(screen.getByRole('button', { name: solapa }));
}

describe('solapa Comercios', () => {
	it('lista los comercios con su estado de verificación y dueño', async () => {
		await abrir('Comercios');
		expect(await screen.findByRole('link', { name: 'Estilo Urbano' })).toHaveAttribute(
			'href',
			'/comercios/estilo-urbano'
		);
		expect(within(fila('Estilo Urbano')).getByText('Verificado')).toBeInTheDocument();
		expect(within(fila('Estilo Urbano')).getByText(/dueño #3/)).toBeInTheDocument();
		expect(within(fila('Gym Norte')).getByText('Sin verificar')).toBeInTheDocument();
		expect(within(fila('Gym Norte')).getByText(/dueño #—/)).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/empresas');
	});

	it('busca por texto y categoría', async () => {
		await abrir('Comercios');
		await screen.findByText('Estilo Urbano');
		await userEvent.type(screen.getByLabelText('Buscar'), ' gym ');
		await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Gimnasios');
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/empresas?q=gym&categoria_id=2'));
	});

	it('si falla la carga muestra el motivo', async () => {
		get.mockImplementation(async (url: string) => {
			if (url === '/empresas') throw new ApiError(500, 'Servicio no disponible');
			return backend(url);
		});
		await abrir('Comercios');
		expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
	});

	it('sin resultados lo indica', async () => {
		get.mockImplementation(async (url: string) => (url === '/empresas' ? [] : backend(url)));
		await abrir('Comercios');
		expect(await screen.findByText(/No hay comercios para este filtro/)).toBeInTheDocument();
	});

	describe('alta', () => {
		it('exige nombre, dirección y categoría', async () => {
			await abrir('Comercios');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('Nombre y dirección son obligatorios.')).toBeInTheDocument();
			await userEvent.type(screen.getByLabelText('Nombre *'), 'Kiosco Sur');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('Elegí una categoría.')).toBeInTheDocument();
			expect(post).not.toHaveBeenCalled();
		});

		it('crea el comercio con dueño y sin reservas, y recarga la lista', async () => {
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.type(screen.getByLabelText('Nombre *'), ' Kiosco Sur ');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.selectOptions(screen.getByLabelText('Categoría *'), 'Gimnasios');
			await userEvent.type(screen.getByLabelText('ID dueño (admin_id)'), '5');
			await userEvent.click(screen.getByLabelText('Acepta reservas de turnos'));
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			await vi.waitFor(() =>
				expect(post).toHaveBeenCalledWith('/empresas', {
					nombre: 'Kiosco Sur',
					direccion: 'Mitre 20',
					categoria_id: 2,
					admin_id: 5,
					turnos_habilitados: false
				})
			);
			await vi.waitFor(() => expect(llamadasA('/empresas')).toBe(2));
			expect(screen.queryByRole('button', { name: 'Crear comercio' })).not.toBeInTheDocument();
			expect(avisos()).toContain('Comercio creado.');
		});

		it('si el backend lo rechaza muestra el motivo', async () => {
			post.mockRejectedValue(new ApiError(400, 'La categoría indicada no existe'));
			await abrir('Comercios');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.type(screen.getByLabelText('Nombre *'), 'Kiosco Sur');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.selectOptions(screen.getByLabelText('Categoría *'), 'Peluquerías');
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('La categoría indicada no existe')).toBeInTheDocument();
		});
	});

	describe('edición', () => {
		it('precarga la ficha y guarda los cambios', async () => {
			put.mockResolvedValue({ nombre: 'Estilo Urbano Peluquería' });
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(within(fila('Estilo Urbano')).getByRole('button', { name: 'Editar' }));
			const nombre = screen.getByLabelText('Nombre del comercio');
			expect(nombre).toHaveValue('Estilo Urbano');
			expect(screen.getByLabelText('Teléfono del comercio')).toHaveValue('2392411234');
			expect(screen.getByLabelText('ID dueño del comercio')).toHaveValue('3');
			await userEvent.clear(nombre);
			await userEvent.type(nombre, 'Estilo Urbano Peluquería');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			await vi.waitFor(() =>
				expect(put).toHaveBeenCalledWith('/empresas/7', {
					nombre: 'Estilo Urbano Peluquería',
					direccion: 'Villegas 482',
					telefono: '2392411234',
					slogan: 'Cortes y color',
					categoria_id: 1,
					admin_id: 3
				})
			);
			expect(
				await screen.findByRole('link', { name: 'Estilo Urbano Peluquería' })
			).toBeInTheDocument();
		});

		it('no guarda sin nombre y lo avisa', async () => {
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(within(fila('Estilo Urbano')).getByRole('button', { name: 'Editar' }));
			await userEvent.clear(screen.getByLabelText('Nombre del comercio'));
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			expect(put).not.toHaveBeenCalled();
			expect(avisos()).toContain('Nombre, dirección y categoría son obligatorios.');
		});

		it('cancelar vuelve a la lista sin guardar', async () => {
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(within(fila('Estilo Urbano')).getByRole('button', { name: 'Editar' }));
			await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
			expect(put).not.toHaveBeenCalled();
			expect(screen.getByRole('link', { name: 'Estilo Urbano' })).toBeInTheDocument();
		});

		it('si el backend rechaza la edición lo informa', async () => {
			put.mockRejectedValue(new ApiError(403, 'No podés editar una empresa que no es tuya'));
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(within(fila('Estilo Urbano')).getByRole('button', { name: 'Editar' }));
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			await vi.waitFor(() =>
				expect(avisos()).toContain('No podés editar una empresa que no es tuya')
			);
		});
	});

	it('quitar el sello de verificado lo actualiza en la lista (RF-15)', async () => {
		put.mockResolvedValue({ verificado: false });
		await abrir('Comercios');
		await screen.findByText('Estilo Urbano');
		await userEvent.click(
			within(fila('Estilo Urbano')).getByRole('button', { name: 'Quitar verificado' })
		);
		expect(put).toHaveBeenCalledWith('/empresas/7/verificado', { verificado: false });
		await vi.waitFor(() =>
			expect(within(fila('Estilo Urbano')).getByText('Sin verificar')).toBeInTheDocument()
		);
		expect(
			within(fila('Estilo Urbano')).queryByRole('button', { name: 'Quitar verificado' })
		).toBeNull();
		expect(
			within(fila('Gym Norte')).queryByRole('button', { name: 'Quitar verificado' })
		).toBeNull();
	});

	describe('turnos del comercio', () => {
		it('los muestra con cliente y estado, y se pueden ocultar', async () => {
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(
				within(fila('Estilo Urbano')).getByRole('button', { name: 'Ver turnos' })
			);
			expect(await screen.findByText(/Martina Gómez · confirmado/)).toBeInTheDocument();
			expect(get).toHaveBeenCalledWith('/empresas/7/turnos');
			await userEvent.click(screen.getByRole('button', { name: 'Ocultar turnos' }));
			expect(screen.queryByText(/Martina Gómez · confirmado/)).not.toBeInTheDocument();
		});

		it('sin turnos lo indica', async () => {
			await abrir('Comercios');
			await screen.findByText('Gym Norte');
			await userEvent.click(within(fila('Gym Norte')).getByRole('button', { name: 'Ver turnos' }));
			expect(await screen.findByText('Sin turnos próximos.')).toBeInTheDocument();
		});
	});

	describe('baja', () => {
		it('pide confirmación y, si se acepta, lo saca de la lista', async () => {
			await abrir('Comercios');
			await screen.findByText('Gym Norte');
			await userEvent.click(within(fila('Gym Norte')).getByRole('button', { name: 'Eliminar' }));
			expect(
				await screen.findByText(/No se puede eliminar si tiene turnos registrados/)
			).toBeInTheDocument();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
			await vi.waitFor(() => expect(borrar).toHaveBeenCalledWith('/empresas/8'));
			await vi.waitFor(() => expect(screen.queryByText('Gym Norte')).not.toBeInTheDocument());
		});

		it('si el comercio tiene turnos, informa el motivo y lo conserva', async () => {
			borrar.mockRejectedValue(
				new ApiError(409, 'La empresa tiene turnos registrados y no puede eliminarse')
			);
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(
				within(fila('Estilo Urbano')).getByRole('button', { name: 'Eliminar' })
			);
			await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
			await vi.waitFor(() =>
				expect(avisos()).toContain('La empresa tiene turnos registrados y no puede eliminarse')
			);
			expect(screen.getByRole('link', { name: 'Estilo Urbano' })).toBeInTheDocument();
		});
	});
});

describe('solapa Usuarios', () => {
	it('lista los usuarios con correo, id y rol', async () => {
		await abrir('Usuarios');
		expect(await screen.findByText('Sofía Ramírez')).toBeInTheDocument();
		expect(screen.getByText('negocio@demo.com · #3')).toBeInTheDocument();
		expect(within(fila('Admin TL360')).getByText('superadmin')).toBeInTheDocument();
		expect(within(fila('Martina Gómez')).getByText('cliente')).toBeInTheDocument();
	});

	it('valida los datos antes de crear', async () => {
		await abrir('Usuarios');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText('Nombre'), 'Lucas');
		await userEvent.type(screen.getByLabelText('Email'), 'lucas-sin-arroba');
		await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('Ingresá un correo electrónico válido')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('crea una cuenta con el rol elegido y recarga la lista', async () => {
		await abrir('Usuarios');
		await screen.findByText('Sofía Ramírez');
		await userEvent.type(screen.getByLabelText('Nombre'), ' Lucas Díaz ');
		await userEvent.type(screen.getByLabelText('Email'), 'lucas@demo.com');
		await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');
		await userEvent.selectOptions(screen.getByLabelText('Rol'), 'superadmin');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/usuarios', {
				nombre: 'Lucas Díaz',
				email: 'lucas@demo.com',
				['contraseña']: 'Clave1234',
				rol: 'superadmin'
			})
		);
		await vi.waitFor(() => expect(llamadasA('/usuarios')).toBe(2));
		expect(screen.getByLabelText('Nombre')).toHaveValue('');
	});

	it('si el correo ya existe muestra el aviso del backend', async () => {
		post.mockRejectedValue(new ApiError(409, 'El email ya está registrado'));
		await abrir('Usuarios');
		await userEvent.type(screen.getByLabelText('Nombre'), 'Sofía');
		await userEvent.type(screen.getByLabelText('Email'), 'negocio@demo.com');
		await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave1234');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('El email ya está registrado')).toBeInTheDocument();
	});

	it('si falla la carga muestra el motivo', async () => {
		get.mockImplementation(async (url: string) => {
			if (url === '/usuarios') throw new Error('red caída');
			return backend(url);
		});
		await abrir('Usuarios');
		expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument();
	});
});

describe('solapa Publicidades (RF-06)', () => {
	it('distingue las de comercio de las colectas de la plataforma', async () => {
		await abrir('Publicidades');
		expect(await screen.findByText('20% en cortes')).toBeInTheDocument();
		expect(screen.getByText(/#4 · comercio #7/)).toBeInTheDocument();
		expect(screen.getByText(/#5 · colecta de la plataforma/)).toBeInTheDocument();
	});

	it('exige título, descripción e imagen http(s) en ese orden', async () => {
		await abrir('Publicidades');
		const publicar = () => userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await publicar();
		expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText('Título'), 'Feria de emprendedores');
		await publicar();
		expect(await screen.findByText('La descripción es obligatoria.')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText('Descripción'), 'Sábado en la plaza');
		await userEvent.type(screen.getByLabelText('URL de imagen'), 'ftp://x.com/a.png');
		await publicar();
		expect(await screen.findByText(/La imagen es obligatoria/)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('sin comercio crea una colecta de la plataforma y recarga', async () => {
		await abrir('Publicidades');
		await screen.findByText('20% en cortes');
		await userEvent.type(screen.getByLabelText('Título'), 'Colecta de abrigo');
		await userEvent.type(screen.getByLabelText('Descripción'), 'Hasta el viernes');
		await userEvent.type(screen.getByLabelText('URL de imagen'), 'https://x.com/a.jpg');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/publicidades', {
				empresa_id: null,
				titulo: 'Colecta de abrigo',
				descripcion: 'Hasta el viernes',
				imagen_url: 'https://x.com/a.jpg'
			})
		);
		await vi.waitFor(() => expect(llamadasA('/publicidades')).toBe(2));
		expect(screen.getByLabelText('Título')).toHaveValue('');
	});

	it('con ID de comercio la asocia a ese comercio', async () => {
		await abrir('Publicidades');
		await userEvent.type(screen.getByLabelText(/ID del comercio/), '7');
		await userEvent.type(screen.getByLabelText('Título'), 'Promo');
		await userEvent.type(screen.getByLabelText('Descripción'), 'Descuento');
		await userEvent.type(screen.getByLabelText('URL de imagen'), 'http://x.com/p.png');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/publicidades', expect.objectContaining({ empresa_id: 7 }))
		);
	});

	it('si el backend la rechaza muestra el motivo', async () => {
		post.mockRejectedValue(new ApiError(403, 'Solo el superadmin crea colectas'));
		await abrir('Publicidades');
		await userEvent.type(screen.getByLabelText('Título'), 'Colecta');
		await userEvent.type(screen.getByLabelText('Descripción'), 'Ayuda');
		await userEvent.type(screen.getByLabelText('URL de imagen'), 'https://x.com/a.jpg');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		expect(await screen.findByText('Solo el superadmin crea colectas')).toBeInTheDocument();
	});

	it('filtra por comercio', async () => {
		await abrir('Publicidades');
		await screen.findByText('20% en cortes');
		await userEvent.type(screen.getByLabelText('Filtrar por comercio'), '7');
		await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
		await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/publicidades?empresa_id=7'));
		expect(llamadasA('/publicidades?empresa_id=7')).toBe(1);
	});

	describe('baja', () => {
		it('pide confirmación y la quita de la lista', async () => {
			await abrir('Publicidades');
			await screen.findByText('20% en cortes');
			await userEvent.click(
				within(fila('20% en cortes')).getByRole('button', { name: 'Eliminar' })
			);
			expect(await screen.findByText('¿Eliminar “20% en cortes” (id 4)?')).toBeInTheDocument();
			await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
			await vi.waitFor(() => expect(borrar).toHaveBeenCalledWith('/publicidades/4'));
			await vi.waitFor(() => expect(screen.queryByText('20% en cortes')).not.toBeInTheDocument());
		});

		it('si se cancela no borra nada', async () => {
			await abrir('Publicidades');
			await screen.findByText('20% en cortes');
			await userEvent.click(
				within(fila('20% en cortes')).getByRole('button', { name: 'Eliminar' })
			);
			await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
			expect(borrar).not.toHaveBeenCalled();
			expect(screen.getByText('20% en cortes')).toBeInTheDocument();
		});

		it('si el backend falla la conserva y lo avisa', async () => {
			borrar.mockRejectedValue(new ApiError(500, 'No se pudo eliminar'));
			await abrir('Publicidades');
			await screen.findByText('20% en cortes');
			await userEvent.click(
				within(fila('20% en cortes')).getByRole('button', { name: 'Eliminar' })
			);
			await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
			await vi.waitFor(() => expect(avisos()).toContain('No se pudo eliminar'));
			expect(screen.getByText('20% en cortes')).toBeInTheDocument();
		});
	});
});

describe('verificación comercial (RF-15)', () => {
	const pendiente = { id: 2, nombre: 'Barbería Dorrego', cuit: '20123456786', slug: 'x' };

	it('rechazar exige un motivo y lo envía al backend', async () => {
		get.mockImplementation(async (url: string) =>
			url.startsWith('/empresas?verificado_estado=pendiente') ? [pendiente] : backend(url)
		);
		render(Admin);
		await screen.findByText('Barbería Dorrego');
		await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
		const motivo = screen.getByLabelText(/Motivo del rechazo/);
		await userEvent.type(motivo, 'no');
		await userEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(/entre 5 y 500 caracteres/);
		expect(put).not.toHaveBeenCalled();

		await userEvent.clear(motivo);
		await userEvent.type(motivo, '  La constancia está vencida  ');
		await userEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/empresas/2/verificacion', {
				accion: 'rechazar',
				motivo: 'La constancia está vencida'
			})
		);
		await vi.waitFor(() => expect(screen.queryByText('Barbería Dorrego')).not.toBeInTheDocument());
		expect(avisos()).toContain('Verificación de “Barbería Dorrego” rechazada.');
	});

	it('cancelar el rechazo no envía nada', async () => {
		get.mockImplementation(async (url: string) =>
			url.startsWith('/empresas?verificado_estado=pendiente') ? [pendiente] : backend(url)
		);
		render(Admin);
		await screen.findByText('Barbería Dorrego');
		await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
		await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
		expect(screen.queryByLabelText(/Motivo del rechazo/)).not.toBeInTheDocument();
		expect(put).not.toHaveBeenCalled();
		expect(screen.getByText('Barbería Dorrego')).toBeInTheDocument();
	});

	it('si el backend no puede resolverla, la conserva y avisa', async () => {
		get.mockImplementation(async (url: string) =>
			url.startsWith('/empresas?verificado_estado=pendiente') ? [pendiente] : backend(url)
		);
		put.mockRejectedValue(
			new ApiError(409, 'No hay una solicitud pendiente con constancia para resolver')
		);
		render(Admin);
		await screen.findByText('Barbería Dorrego');
		await userEvent.click(screen.getByRole('button', { name: 'Aprobar Verificación' }));
		await vi.waitFor(() =>
			expect(avisos()).toContain('No hay una solicitud pendiente con constancia para resolver')
		);
		expect(screen.getByText('Barbería Dorrego')).toBeInTheDocument();
	});

	it('si falla la carga de la bandeja muestra el motivo', async () => {
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/empresas?verificado_estado=pendiente')) throw new Error('red caída');
			return backend(url);
		});
		render(Admin);
		expect(await screen.findByText('No se pudieron cargar las solicitudes.')).toBeInTheDocument();
	});
});
