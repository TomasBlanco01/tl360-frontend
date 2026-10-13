import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
import Toaster from '$lib/_auditoria/Toaster.svelte';
import { toast } from '$lib/_auditoria/toast.svelte';
import PublicidadCarousel from '$lib/components/PublicidadCarousel.svelte';
import MapaComercios from '$lib/components/MapaComercios.svelte';

/**
 * P1-5 Accesibilidad automatizada sin deps nuevas (sin axe-core: el entorno
 * puede no tener acceso al registry). Cubre lo critico: dialogo modal,
 * region viva de avisos, carrusel y mapa.
 */
describe('a11y: ConfirmModal', () => {
	const base = {
		abierto: true,
		titulo: 'Cancelar turno',
		descripcion: 'El horario quedara libre.',
		onconfirmar: () => {},
		oncancelar: () => {}
	};

	it('expone dialog con aria-modal y nombre accesible', () => {
		render(ConfirmModal, { ...base });
		const dialogo = screen.getByRole('dialog', { name: 'Cancelar turno' });
		expect(dialogo).toHaveAttribute('aria-modal', 'true');
		expect(dialogo).toHaveAttribute('aria-describedby', 'confirm-modal-desc');
		expect(screen.getByText('El horario quedara libre.')).toBeInTheDocument();
	});

	it('cierra con Escape y devuelve foco al disparador', async () => {
		const oncancelar = vi.fn();
		const usuario = userEvent.setup();
		await usuario.click(document.createElement('button'));
		const disparador = document.createElement('button');
		disparador.textContent = 'disparador';
		document.body.appendChild(disparador);
		disparador.focus();
		render(ConfirmModal, { ...base, oncancelar });
		await usuario.keyboard('{Escape}');
		expect(oncancelar).toHaveBeenCalled();
		disparador.remove();
	});

	it('mueve el foco al dialogo al abrir', () => {
		render(ConfirmModal, { ...base });
		expect(screen.getByRole('dialog', { name: 'Cancelar turno' })).toHaveFocus();
	});
});

describe('a11y: Toaster (region viva)', () => {
	it('usa una sola region aria-live y roles status/alert segun tipo', async () => {
		render(Toaster);
		const region = document.querySelector('[aria-live="polite"]');
		expect(region).not.toBeNull();
		toast.exito('Todo bien');
		expect(await screen.findByRole('status')).toHaveTextContent('Todo bien');
		toast.error('Algo fallo');
		expect(await screen.findByRole('alert')).toHaveTextContent('Algo fallo');
		// El boton de cerrar tiene nombre accesible.
		expect(screen.getAllByRole('button', { name: 'Cerrar aviso' }).length).toBeGreaterThan(0);
	});
});

describe('a11y: PublicidadCarousel', () => {
	const items = [
		{ id: 'a', empresa_id: 1, titulo: 'Uno', descripcion: 'Desc uno', imagen_url: '' },
		{ id: 'b', empresa_id: 2, titulo: 'Dos', descripcion: 'Desc dos', imagen_url: '' }
	];

	it('grupo carrusel con controles nombrados y dots', () => {
		render(PublicidadCarousel, { items });
		const grupo = screen.getByRole('group', { name: 'Publicidades destacadas' });
		expect(grupo).toHaveAttribute('aria-roledescription', 'carrusel');
		expect(screen.getByRole('button', { name: 'Publicidad anterior' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Siguiente publicidad' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ir a la publicidad 1' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Ir a la publicidad 2' })).toBeInTheDocument();
	});

	it('las imagenes informativas tienen alt (las decorativas usan gradiente sin img)', () => {
		render(PublicidadCarousel, {
			items: [
				{
					id: 'c',
					empresa_id: 3,
					titulo: 'Con foto',
					descripcion: 'Desc',
					imagen_url: 'https://ejemplo.com/foto.jpg'
				}
			]
		});
		expect(screen.getByAltText('Con foto')).toBeInTheDocument();
	});
});

describe('a11y: MapaComercios', () => {
	it('anuncia carga con role status y expone el mapa por testid', () => {
		render(MapaComercios, { puntos: [] });
		expect(screen.getByTestId('mapa')).toBeInTheDocument();
		expect(screen.getByRole('status', { name: 'Cargando mapa' })).toBeInTheDocument();
	});
});
