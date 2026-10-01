import { browser } from '$app/environment';
import { PUBLIC_MOCK_MODE } from '$env/static/public';
import type { Publicidad } from '$lib/types';
import { api } from '$lib/api';

const MOCK = PUBLIC_MOCK_MODE === 'true';

// Publicaciones destacadas (RF-06), persistidas en localStorage por comercio: todavía no hay
// tabla/endpoint de backend para esto. Funciona de verdad en el navegador; la limitación es que
// no se comparte entre dispositivos/usuarios hasta que exista un backend real.
const STORAGE_KEY = 'publicidades';

// Con PUBLIC_MOCK_MODE=true, la primera vez que se abre la app en un navegador (localStorage
// vacío) se precarga el carrusel con estos ejemplos, para que el carrusel de la Principal no
// se vea vacío sin tener que cargar una publicidad a mano desde /negocio primero.
const SEED_MOCK: Publicidad[] = [
	{
		id: 'seed-1',
		empresa_id: 1,
		titulo: 'Estilo Urbano Peluquería',
		descripcion: '20% off en color este mes',
		imagen_url: 'https://picsum.photos/seed/ad-peluqueria/480/320'
	},
	{
		id: 'seed-2',
		empresa_id: 3,
		titulo: 'PowerFit Trenque',
		descripcion: 'Mes gratis trayendo un amigo',
		imagen_url: 'https://picsum.photos/seed/ad-gym/480/320'
	},
	{
		id: 'seed-3',
		empresa_id: 49,
		titulo: 'Café del Centro',
		descripcion: 'Nuevo menú de otoño',
		imagen_url: 'https://picsum.photos/seed/ad-cafe/480/320'
	},
	{
		id: 'seed-4',
		empresa_id: 19,
		titulo: 'Estudio Om Yoga',
		descripcion: 'Clase de prueba sin cargo',
		imagen_url: ''
	},
	{
		id: 'seed-5',
		empresa_id: 37,
		titulo: 'Panadería La Espiga',
		descripcion: 'Pan de campo recién horneado',
		imagen_url: 'https://picsum.photos/seed/ad-pan/480/320'
	},
	{
		id: 'seed-6',
		empresa_id: 39,
		titulo: 'Carnicería El Novillo',
		descripcion: 'Asado especial de fin de semana',
		imagen_url: 'https://picsum.photos/seed/ad-carniceria/480/320'
	},
	{
		id: 'seed-7',
		empresa_id: 15,
		titulo: 'Uñas & Detalles',
		descripcion: 'Semipermanente + esmaltado tradicional 2x1',
		imagen_url: 'https://picsum.photos/seed/ad-unas/480/320'
	},
	{
		id: 'seed-8',
		empresa_id: 13,
		titulo: 'Barbería El Clásico',
		descripcion: 'Corte + barba con descuento para nuevos clientes',
		imagen_url: 'https://picsum.photos/seed/ad-barberia/480/320'
	},
	{
		id: 'seed-9',
		empresa_id: 51,
		titulo: 'Inmobiliaria Trenque Lauquen',
		descripcion: 'Nuevos departamentos en venta, financiación propia',
		imagen_url: 'https://picsum.photos/seed/ad-inmobiliaria/480/320'
	},
	{
		id: 'seed-10',
		empresa_id: 53,
		titulo: 'Veterinaria San Roque',
		descripcion: 'Campaña de vacunación antirrábica gratuita',
		imagen_url: ''
	}
];

function loadAll(): Publicidad[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
		if (PUBLIC_MOCK_MODE === 'true') {
			persist(SEED_MOCK);
			return SEED_MOCK;
		}
		return [];
	} catch {
		return [];
	}
}

function persist(items: Publicidad[]) {
	if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

class PublicidadesStore {
	items = <Publicidad[]>(MOCK ? loadAll() : []);

	constructor() {
		if (!MOCK && browser) this.refrescar();
	}

	/** Con backend real, las publicidades viven en la base (tabla publicaciones_destacadas). */
	async refrescar() {
		try {
			this.items = await api.get<Publicidad[]>('/publicidades');
		} catch (err) {
			console.error('Error al obtener publicidades:', err);
		}
	}

	porEmpresa(empresaId: number) {
		return this.items.filter((p) => p.empresa_id === empresaId);
	}

	crear(data: Omit<Publicidad, 'id'>) {
		if (!MOCK) {
			api
				.post<Publicidad>('/publicidades', data)
				.then((nueva) => (this.items = [nueva, ...this.items]))
				.catch((err) => console.error('Error al crear publicidad:', err));
			return;
		}
		const nueva: Publicidad = { ...data, id: crypto.randomUUID() };
		this.items = [...this.items, nueva];
		persist(this.items);
		return nueva;
	}

	eliminar(id: string) {
		this.items = this.items.filter((p) => p.id !== id);
		if (MOCK) persist(this.items);
		else
			api
				.delete(`/publicidades/${id}`)
				.catch((err) => console.error('Error al eliminar publicidad:', err));
	}
}

export const publicidades = new PublicidadesStore();
