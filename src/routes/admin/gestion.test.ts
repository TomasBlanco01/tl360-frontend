import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { ApiError, api } from '$lib/api';
import { auth } from '$lib/stores/auth.svelte';
import { toast } from '$lib/components/toast.svelte';
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
		rubro: 'Peluquerías',
		rubro_id: 1,
		direccion: 'Villegas 482',
		telefonos: [{ id: 1, numero: '2392411234', principal: true }],
		slogan: 'Cortes y color',
		usuario_id: 3,
		verificado: true,
		slug: 'estilo-urbano'
	},
	{
		id: 8,
		nombre: 'Gym Norte',
		rubro: 'Gimnasios',
		rubro_id: 2,
		direccion: 'Roca 10',
		usuario_id: null,
		verificado: false,
		slug: 'gym-norte'
	}
];

const usuarios = [
	{
		id: 1,
		nombre: 'Admin TL360',
		email: 'admin@demo.com',
		rol: 'superadmin',
		email_verificado: true
	},
	{
		id: 3,
		nombre: 'Sofía Ramírez',
		email: 'negocio@demo.com',
		rol: 'admin',
		email_verificado: true
	},
	{
		id: 9,
		nombre: 'Martina Gómez',
		email: 'cliente@demo.com',
		rol: 'cliente',
		email_verificado: false
	}
];

const publicidades = [
	{
		id: 4,
		empresa_id: 7,
		empresa_nombre: 'Peluquería Central',
		titulo: '20% en cortes',
		descripcion: 'Todo octubre',
		estado: 'pendiente'
	},
	{
		id: 6,
		empresa_id: 8,
		empresa_nombre: 'Gym Norte',
		titulo: 'Promo vieja',
		descripcion: 'Septiembre',
		estado: 'aprobada'
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
	if (url === '/rubros') return rubros;
	if (url.startsWith('/empresas?verificado_estado=')) return [];
	if (/^\/empresas\/\d+\/turnos$/.test(url)) return url === '/empresas/7/turnos' ? turnos : [];
	if (url.startsWith('/empresas')) return comercios;
	if (url.startsWith('/usuarios')) {
		// Igual que el backend: buscador, rol, ids y paginado.
		const p = new URL(url, 'http://x').searchParams;
		const q = (p.get('q') ?? '').toLowerCase();
		const ids = p.get('ids')?.split(',').map(Number);
		const lista = usuarios.filter(
			(u) =>
				(!q || u.nombre.toLowerCase().includes(q) || u.email.includes(q)) &&
				(!p.get('rol') || u.rol === p.get('rol')) &&
				(!ids || ids.includes(u.id))
		);
		const desde = Number(p.get('offset') ?? 0);
		return lista.slice(desde, desde + Number(p.get('limit') ?? 1000));
	}
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
		// El dueño se muestra por nombre (no por id), pidiendo los nombres juntos.
		expect(
			await within(fila('Estilo Urbano')).findByText(/dueño: Sofía Ramírez/)
		).toBeInTheDocument();
		expect(within(fila('Gym Norte')).getByText('Sin verificar')).toBeInTheDocument();
		expect(within(fila('Gym Norte')).getByText(/dueño: sin asignar/)).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/empresas?limit=21&offset=0');
		expect(get).toHaveBeenCalledWith('/usuarios?ids=3');
	});

	it('busca por texto y rubro', async () => {
		await abrir('Comercios');
		await screen.findByText('Estilo Urbano');
		await userEvent.type(screen.getByLabelText('Buscar'), ' gym ');
		await userEvent.type(screen.getByRole('combobox', { name: 'Filtrar por rubro' }), 'gim');
		await userEvent.click(screen.getByRole('option', { name: 'Gimnasios' }));
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		await vi.waitFor(() =>
			expect(get).toHaveBeenCalledWith('/empresas?q=gym&rubro_id=2&limit=21&offset=0')
		);
	});

	it('si falla la carga muestra el motivo', async () => {
		get.mockImplementation(async (url: string) => {
			if (url === '/empresas?limit=21&offset=0') throw new ApiError(500, 'Servicio no disponible');
			return backend(url);
		});
		await abrir('Comercios');
		expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
	});

	it('pagina los comercios de a 20', async () => {
		const muchos = Array.from({ length: 21 }, (_, i) => ({
			...comercios[0],
			id: 100 + i,
			slug: `c-${i}`,
			nombre: `Comercio ${i + 1}`
		}));
		get.mockImplementation(async (url: string) =>
			url === '/empresas?limit=21&offset=0'
				? muchos
				: url === '/empresas?limit=21&offset=20'
					? [{ ...comercios[0], id: 999, slug: 'ultimo', nombre: 'Comercio final' }]
					: backend(url)
		);
		await abrir('Comercios');
		expect(await screen.findByText('Comercio 20')).toBeInTheDocument();
		expect(screen.queryByText('Comercio 21')).not.toBeInTheDocument();
		const paginas = screen.getByRole('navigation', { name: 'Páginas de comercios' });
		expect(within(paginas).getByRole('button', { name: '← Anterior' })).toBeDisabled();
		await userEvent.click(within(paginas).getByRole('button', { name: 'Siguiente →' }));
		expect(await screen.findByText('Comercio final')).toBeInTheDocument();
		const paginas2 = screen.getByRole('navigation', { name: 'Páginas de comercios' });
		expect(within(paginas2).getByText('Página 2')).toBeInTheDocument();
		expect(within(paginas2).getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
	});

	it('sin resultados lo indica', async () => {
		get.mockImplementation(async (url: string) =>
			url === '/empresas?limit=21&offset=0' ? [] : backend(url)
		);
		await abrir('Comercios');
		expect(await screen.findByText(/No hay comercios para este filtro/)).toBeInTheDocument();
	});

	describe('alta', () => {
		it('exige nombre, dirección y rubro', async () => {
			await abrir('Comercios');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('Nombre y dirección son obligatorios.')).toBeInTheDocument();
			await userEvent.type(screen.getByLabelText(/^Nombre ?[*]$/), 'Kiosco Sur');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('Elegí un rubro.')).toBeInTheDocument();
			expect(post).not.toHaveBeenCalled();
		});

		it('crea el comercio con dueño y sin reservas, y recarga la lista', async () => {
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.type(screen.getByLabelText(/^Nombre ?[*]$/), ' Kiosco Sur ');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.click(screen.getByRole('combobox', { name: /^Rubro/ }));
			await userEvent.click(screen.getByRole('option', { name: 'Gimnasios' }));
			// El dueño se busca por nombre, no por id.
			await userEvent.type(screen.getByRole('combobox', { name: 'Dueño del comercio' }), 'sof');
			await userEvent.click(await screen.findByRole('option', { name: /Sofía Ramírez/ }));
			expect(get).toHaveBeenCalledWith('/usuarios?rol=admin&limit=8&q=sof');
			// Sin horarios cargados no hay reservas: el alta nace sin turnos online.
			expect(screen.getByLabelText(/Acepta reservas de turnos/)).not.toBeChecked();
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			await vi.waitFor(() =>
				expect(post).toHaveBeenCalledWith(
					'/empresas',
					expect.objectContaining({
						nombre: 'Kiosco Sur',
						direccion: 'Mitre 20',
						rubro_id: 2,
						usuario_id: 3,
						turnos_habilitados: false,
						telefonos: []
					})
				)
			);
			await vi.waitFor(() => expect(llamadasA('/empresas?limit=21&offset=0')).toBe(2));
			expect(screen.queryByRole('button', { name: 'Crear comercio' })).not.toBeInTheDocument();
			expect(avisos()).toContain('Comercio creado.');
		});

		it('si el backend lo rechaza muestra el motivo', async () => {
			post.mockRejectedValue(new ApiError(400, 'El rubro indicado no existe'));
			await abrir('Comercios');
			await userEvent.click(screen.getByRole('button', { name: 'Nuevo comercio' }));
			await userEvent.type(screen.getByLabelText(/^Nombre ?[*]$/), 'Kiosco Sur');
			await userEvent.type(screen.getByLabelText('Dirección *'), 'Mitre 20');
			await userEvent.type(screen.getByRole('combobox', { name: /^Rubro/ }), 'pelu');
			await userEvent.click(screen.getByRole('option', { name: 'Peluquerías' }));
			await userEvent.click(screen.getByRole('button', { name: 'Crear comercio' }));
			expect(await screen.findByText('El rubro indicado no existe')).toBeInTheDocument();
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
			expect(
				await screen.findByText('Sofía Ramírez', { selector: 'span *, span' })
			).toBeInTheDocument();
			expect(screen.getByRole('combobox', { name: 'Rubro del comercio' })).toHaveValue(
				'Peluquerías'
			);
			await userEvent.clear(nombre);
			await userEvent.type(nombre, 'Estilo Urbano Peluquería');
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			await vi.waitFor(() =>
				expect(put).toHaveBeenCalledWith('/empresas/7', {
					nombre: 'Estilo Urbano Peluquería',
					direccion: 'Villegas 482',
					slogan: 'Cortes y color',
					rubro_id: 1,
					usuario_id: 3
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
			expect(avisos()).toContain('Nombre, dirección y rubro son obligatorios.');
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
			put.mockRejectedValue(new ApiError(403, 'No tenés los permisos para realizar esta acción'));
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(within(fila('Estilo Urbano')).getByRole('button', { name: 'Editar' }));
			await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
			await vi.waitFor(() =>
				expect(avisos()).toContain('No tenés los permisos para realizar esta acción')
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

		it('con muchos turnos muestra unos pocos y el resto en un modal', async () => {
			const muchos = Array.from({ length: 8 }, (_, i) => ({
				id: 100 + i,
				fecha: i < 6 ? '2026-11-03' : '2026-11-04',
				hora: `1${i}:00`,
				estado: 'confirmado',
				cliente_nombre: `Cliente ${i}`
			}));
			get.mockImplementation(async (url: string) =>
				url === '/empresas/7/turnos' ? muchos : backend(url)
			);
			await abrir('Comercios');
			await screen.findByText('Estilo Urbano');
			await userEvent.click(
				within(fila('Estilo Urbano')).getByRole('button', { name: 'Ver turnos' })
			);
			expect(await screen.findByText(/Cliente 4 · confirmado/)).toBeInTheDocument();
			expect(screen.queryByText(/Cliente 5 · confirmado/)).not.toBeInTheDocument();
			await userEvent.click(screen.getByRole('button', { name: 'Ver todos (8)' }));
			const modal = screen.getByRole('dialog', { name: 'Turnos de Estilo Urbano' });
			expect(within(modal).getByText('Cliente 7')).toBeInTheDocument();
			await userEvent.type(within(modal).getByLabelText('Día'), '2026-11-04');
			expect(within(modal).queryByText('Cliente 0')).not.toBeInTheDocument();
			expect(within(modal).getByText('2 de 8')).toBeInTheDocument();
			await userEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
	it('lista los usuarios con correo, rol y estado del correo (sin ids)', async () => {
		await abrir('Usuarios');
		expect(await screen.findByText('Sofía Ramírez')).toBeInTheDocument();
		expect(screen.getByText('negocio@demo.com')).toBeInTheDocument();
		expect(screen.queryByText(/#3/)).not.toBeInTheDocument();
		expect(screen.getByLabelText('Rol de Sofía Ramírez')).toHaveValue('admin');
		expect(screen.getByLabelText('Rol de Martina Gómez')).toHaveValue('cliente');
		// La propia cuenta no se puede cambiar de rol.
		expect(screen.getByLabelText('Rol de Admin TL360')).toBeDisabled();
		expect(within(fila('Martina Gómez')).getByText('Correo sin verificar')).toBeInTheDocument();
		expect(
			within(fila('Sofía Ramírez')).queryByText('Correo sin verificar')
		).not.toBeInTheDocument();
	});

	it('confirma el correo de quien no recibió el enlace', async () => {
		put.mockResolvedValue({ ...usuarios[2], email_verificado: true });
		await abrir('Usuarios');
		await screen.findByText('Martina Gómez');
		await userEvent.click(
			within(fila('Martina Gómez')).getByRole('button', { name: 'Confirmar correo' })
		);
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/usuarios/9', { email_verificado: true })
		);
		await vi.waitFor(() =>
			expect(
				within(fila('Martina Gómez')).queryByText('Correo sin verificar')
			).not.toBeInTheDocument()
		);
		expect(avisos()).toContain('Correo de Martina Gómez confirmado.');
	});

	it('cambia el rol con confirmación y muestra el motivo si el backend lo rechaza', async () => {
		put.mockResolvedValue({ ...usuarios[2], rol: 'admin' });
		await abrir('Usuarios');
		await screen.findByText('Martina Gómez');
		await userEvent.selectOptions(screen.getByLabelText('Rol de Martina Gómez'), 'admin');
		const modal = await screen.findByRole('dialog');
		expect(within(modal).getByText(/de Cliente a Dueño de comercio/)).toBeInTheDocument();
		await userEvent.click(within(modal).getByRole('button', { name: 'Sí, cambiar' }));
		await vi.waitFor(() => expect(put).toHaveBeenCalledWith('/usuarios/9', { rol: 'admin' }));
		await vi.waitFor(() =>
			expect(screen.getByLabelText('Rol de Martina Gómez')).toHaveValue('admin')
		);

		put.mockRejectedValue(new ApiError(409, 'Tiene 1 comercio(s) a su nombre'));
		await userEvent.selectOptions(screen.getByLabelText('Rol de Sofía Ramírez'), 'cliente');
		await userEvent.click(
			within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sí, cambiar' })
		);
		await vi.waitFor(() => expect(avisos()).toContain('Tiene 1 comercio(s) a su nombre'));
		expect(screen.getByLabelText('Rol de Sofía Ramírez')).toHaveValue('admin');
	});

	it('marca los obligatorios y muestra las condiciones de la contraseña', async () => {
		await abrir('Usuarios');
		expect(screen.getByLabelText(/^Nombre ?[*]$/)).toBeInTheDocument();
		expect(screen.getByLabelText(/^Contraseña ?[*]$/)).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText(/^Contraseña ?[*]$/), 'clave');
		expect(screen.getByText('Una letra mayúscula')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText(/^Nombre/), 'Lucas');
		await userEvent.type(screen.getByLabelText(/^Email/), 'lucas@demo.com');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText(/al menos 8 caracteres e incluir/)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('busca y pagina los usuarios', async () => {
		await abrir('Usuarios');
		await screen.findByText('Sofía Ramírez');
		expect(get).toHaveBeenCalledWith('/usuarios?limit=21&offset=0');
		await userEvent.type(screen.getByLabelText('Buscar usuario'), 'martina');
		await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
		await vi.waitFor(() => expect(screen.queryByText('Sofía Ramírez')).not.toBeInTheDocument());
		expect(get).toHaveBeenCalledWith('/usuarios?limit=21&offset=0&q=martina');
		expect(screen.getByText('Martina Gómez')).toBeInTheDocument();
		await userEvent.selectOptions(screen.getByLabelText('Filtrar por rol'), 'admin');
		await vi.waitFor(() =>
			expect(get).toHaveBeenCalledWith('/usuarios?limit=21&offset=0&q=martina&rol=admin')
		);
		expect(await screen.findByText('Ningún usuario coincide con la búsqueda.')).toBeInTheDocument();
	});

	it('valida los datos antes de crear', async () => {
		await abrir('Usuarios');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('Este campo es obligatorio')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText(/^Nombre/), 'Lucas');
		await userEvent.type(screen.getByLabelText(/^Email/), 'lucas-sin-arroba');
		await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave1234');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('Ingresá un correo electrónico válido')).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('crea una cuenta con el rol elegido y recarga la lista', async () => {
		await abrir('Usuarios');
		await screen.findByText('Sofía Ramírez');
		await userEvent.type(screen.getByLabelText(/^Nombre/), ' Lucas Díaz ');
		await userEvent.type(screen.getByLabelText(/^Email/), 'lucas@demo.com');
		await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave1234');
		await userEvent.selectOptions(screen.getByLabelText(/^Rol ?[*]$/), 'superadmin');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/usuarios', {
				nombre: 'Lucas Díaz',
				email: 'lucas@demo.com',
				['contraseña']: 'Clave1234',
				rol: 'superadmin'
			})
		);
		await vi.waitFor(() => expect(llamadasA('/usuarios?limit=21&offset=0')).toBe(2));
		expect(screen.getByLabelText(/^Nombre/)).toHaveValue('');
	});

	it('si el correo ya existe muestra el aviso del backend', async () => {
		post.mockRejectedValue(new ApiError(409, 'El email ya está registrado'));
		await abrir('Usuarios');
		await userEvent.type(screen.getByLabelText(/^Nombre/), 'Sofía');
		await userEvent.type(screen.getByLabelText(/^Email/), 'negocio@demo.com');
		await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave1234');
		await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
		expect(await screen.findByText('El email ya está registrado')).toBeInTheDocument();
	});

	it('si falla la carga muestra el motivo', async () => {
		get.mockImplementation(async (url: string) => {
			if (url.startsWith('/usuarios')) throw new Error('red caída');
			return backend(url);
		});
		await abrir('Usuarios');
		expect(await screen.findByText('No se pudieron cargar los usuarios.')).toBeInTheDocument();
	});
});

/** El comercio de la publicidad se elige buscándolo por nombre. */
async function elegirComercio() {
	await userEvent.type(screen.getByRole('combobox', { name: /^Comercio/ }), 'estilo');
	await userEvent.click(await screen.findByRole('option', { name: /Estilo Urbano/ }));
}

describe('solapa Publicidades (RF-06)', () => {
	it('abre la bandeja de pendientes y muestra el comercio y el estado', async () => {
		await abrir('Publicidades');
		expect(await screen.findByText('20% en cortes')).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith('/publicidades?estado=pendiente');
		expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		expect(within(fila('20% en cortes')).getByText('Pendiente')).toBeInTheDocument();
		expect(within(fila('Promo vieja')).getByText('Aprobada')).toBeInTheDocument();
	});

	it('aprobar y rechazar cambian el estado en el backend y la sacan de la bandeja', async () => {
		put.mockImplementation(async (url: string, cuerpo: { estado: string }) => ({
			...publicidades[0],
			estado: cuerpo.estado,
			url
		}));
		await abrir('Publicidades');
		await screen.findByText('20% en cortes');
		await userEvent.click(within(fila('20% en cortes')).getByRole('button', { name: 'Aprobar' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/publicidades/4/estado', { estado: 'aprobada' })
		);
		await vi.waitFor(() => expect(screen.queryByText('20% en cortes')).not.toBeInTheDocument());
		expect(avisos()).toContain('Publicidad aprobada.');
		await userEvent.click(within(fila('Promo vieja')).getByRole('button', { name: 'Finalizar' }));
		await vi.waitFor(() =>
			expect(put).toHaveBeenCalledWith('/publicidades/6/estado', { estado: 'finalizada' })
		);
	});

	it('exige comercio, título, descripción e imagen http(s) en ese orden', async () => {
		await abrir('Publicidades');
		const publicar = () => userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await publicar();
		expect(await screen.findByText(/Elegí el comercio/)).toBeInTheDocument();
		await elegirComercio();
		await publicar();
		expect(await screen.findByText('El título es obligatorio.')).toBeInTheDocument();
		// Los obligatorios están marcados con *.
		await userEvent.type(screen.getByLabelText(/^Título ?[*]$/), 'Feria de emprendedores');
		await publicar();
		expect(await screen.findByText('La descripción es obligatoria.')).toBeInTheDocument();
		await userEvent.type(screen.getByLabelText(/^Descripción ?[*]$/), 'Sábado en la plaza');
		await userEvent.type(screen.getByLabelText(/^URL de imagen ?[*]$/), 'ftp://x.com/a.png');
		await publicar();
		expect(await screen.findByText(/La imagen es obligatoria/)).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();
	});

	it('con ID de comercio la crea aprobada y recarga la lista', async () => {
		post.mockResolvedValue({ id: 9, empresa_id: 7, estado: 'aprobada' });
		await abrir('Publicidades');
		await screen.findByText('20% en cortes');
		await elegirComercio();
		await userEvent.type(screen.getByLabelText(/^Título/), 'Promo');
		await userEvent.type(screen.getByLabelText(/^Descripción/), 'Descuento');
		await userEvent.type(screen.getByLabelText(/^URL de imagen/), 'http://x.com/p.png');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		await vi.waitFor(() =>
			expect(post).toHaveBeenCalledWith('/publicidades', {
				empresa_id: 7,
				titulo: 'Promo',
				descripcion: 'Descuento',
				url_imagen: 'http://x.com/p.png'
			})
		);
		await vi.waitFor(() => expect(llamadasA('/publicidades?estado=pendiente')).toBe(2));
		expect(avisos()).toContain('Publicidad creada y aprobada.');
		expect(screen.getByLabelText(/^Título/)).toHaveValue('');
	});

	it('si el backend la rechaza muestra el motivo', async () => {
		post.mockRejectedValue(new ApiError(400, 'El rubro indicado no existe'));
		await abrir('Publicidades');
		await elegirComercio();
		await userEvent.type(screen.getByLabelText(/^Título/), 'Promo');
		await userEvent.type(screen.getByLabelText(/^Descripción/), 'Ayuda');
		await userEvent.type(screen.getByLabelText(/^URL de imagen/), 'https://x.com/a.jpg');
		await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
		expect(await screen.findByText('El rubro indicado no existe')).toBeInTheDocument();
	});

	it('filtra por estado y por comercio', async () => {
		await abrir('Publicidades');
		await screen.findByText('20% en cortes');
		await userEvent.selectOptions(screen.getByLabelText('Estado'), 'todas');
		await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/publicidades?estado=todas'));
		// Por nombre del comercio, no por id.
		await userEvent.type(screen.getByLabelText('Filtrar por comercio'), 'gym norte');
		await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
		await vi.waitFor(() =>
			expect(get).toHaveBeenCalledWith('/publicidades?estado=todas&q=gym%20norte')
		);
		expect(llamadasA('/publicidades?estado=todas&q=gym%20norte')).toBe(1);
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
