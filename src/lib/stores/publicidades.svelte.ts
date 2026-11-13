import { browser } from '$app/environment';
import type { Difusion, ItemCarrusel, Publicidad } from '$lib/types';
import { api } from '$lib/api';

/** Una difusión (colecta o evento) se muestra en el carrusel como un ítem sin comercio. */
export function difusionComoItem(d: Difusion): ItemCarrusel {
	return {
		id: `difusion-${d.id}`,
		empresa_id: null,
		titulo: d.titulo,
		descripcion: d.descripcion,
		url_imagen: d.url_imagen || `https://picsum.photos/seed/difusion-${d.id}/480/320`
	};
}

// Carrusel de portada (RF-06): publicidades aprobadas de los comercios y difusiones aprobadas de
// colectas o eventos. Las dos listas vienen de la API (en modo mock, del backend en memoria).
class PublicidadesStore {
	items = $state<Publicidad[]>([]);
	difusiones = $state<Difusion[]>([]);

	constructor() {
		if (browser) this.refrescar();
	}

	async refrescar() {
		try {
			const [publicidades, difusiones] = await Promise.all([
				api.get<Publicidad[]>('/publicidades'),
				api.get<Difusion[]>('/difusiones')
			]);
			this.items = publicidades;
			this.difusiones = difusiones;
		} catch (err) {
			console.error('Error al obtener publicidades:', err);
		}
	}

	/** Todo lo vigente, en el orden del carrusel: primero los comercios, después las difusiones. */
	get carrusel(): ItemCarrusel[] {
		return [...this.items, ...this.difusiones.map(difusionComoItem)];
	}

	/** Las del comercio, en cualquier estado, para que el dueño vea cuáles esperan aprobación. */
	delComercio(empresaId: number) {
		return api.get<Publicidad[]>(`/publicidades?empresa_id=${empresaId}&estado=todas`);
	}

	/** El dueño la carga pendiente de aprobación; si la carga el superadmin, queda aprobada. */
	async crear(data: Pick<Publicidad, 'empresa_id' | 'titulo' | 'descripcion' | 'url_imagen'>) {
		const nueva = await api.post<Publicidad>('/publicidades', data);
		if (nueva.estado === 'aprobada') this.items = [nueva, ...this.items];
		return nueva;
	}

	async cambiarEstado(id: string, estado: Publicidad['estado']) {
		const actualizada = await api.put<Publicidad>(`/publicidades/${id}/estado`, { estado });
		this.items =
			actualizada.estado === 'aprobada'
				? [actualizada, ...this.items.filter((p) => p.id !== id)]
				: this.items.filter((p) => p.id !== id);
		return actualizada;
	}

	async eliminar(id: string) {
		await api.delete(`/publicidades/${id}`);
		this.items = this.items.filter((p) => p.id !== id);
	}
}

export const publicidades = new PublicidadesStore();
