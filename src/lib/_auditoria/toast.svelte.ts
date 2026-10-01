export type TipoToast = 'exito' | 'error' | 'info';

interface Toast {
	id: number;
	tipo: TipoToast;
	mensaje: string;
}

class ToastStore {
	items = $state<Toast[]>([]);
	#siguiente = 0;

	mostrar(mensaje: string, tipo: TipoToast = 'info', ms = 4000) {
		const id = ++this.#siguiente;
		this.items.push({ id, tipo, mensaje });
		if (ms > 0) setTimeout(() => this.cerrar(id), ms);
	}

	exito = (mensaje: string) => this.mostrar(mensaje, 'exito');
	error = (mensaje: string) => this.mostrar(mensaje, 'error', 7000);

	cerrar(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toast = new ToastStore();
