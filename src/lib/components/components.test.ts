import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { empresa, texto } from '../../tests/helpers';
import EmpresaCard from './EmpresaCard.svelte';
import FormField from './FormField.svelte';
import Avatar from './ui/Avatar.svelte';
import Badge from './ui/Badge.svelte';
import Button from './ui/Button.svelte';
import EmptyState from './ui/EmptyState.svelte';
import RatingStars from './ui/RatingStars.svelte';
import Tabs from './ui/Tabs.svelte';

describe('EmpresaCard', () => {
	it('muestra nombre, rubro y slogan, y enlaza a la ficha', () => {
		render(EmpresaCard, { empresa: empresa({ id: 42 }) });
		expect(screen.getByText('Peluquería Central')).toBeInTheDocument();
		expect(screen.getByText('Peluquerías')).toBeInTheDocument();
		expect(screen.getByText('Cortes y color')).toBeInTheDocument();
		expect(screen.getByRole('link')).toHaveAttribute('href', '/comercios/42');
	});

	it('sin calificaciones lo dice; con calificaciones muestra el promedio', () => {
		const { unmount } = render(EmpresaCard, { empresa: empresa() });
		expect(screen.getByText('Sin calificaciones aún')).toBeInTheDocument();
		unmount();
		render(EmpresaCard, {
			empresa: empresa({ calificacion_promedio: 4.5, calificacion_cantidad: 12 })
		});
		expect(screen.getByText('4.5 (12)')).toBeInTheDocument();
		expect(screen.queryByText('Sin calificaciones aún')).not.toBeInTheDocument();
	});

	it('el sello Verificado solo aparece si corresponde', () => {
		const { unmount } = render(EmpresaCard, { empresa: empresa({ verificado: true }) });
		expect(screen.getByText('Verificado')).toBeInTheDocument();
		unmount();
		render(EmpresaCard, { empresa: empresa({ verificado: false }) });
		expect(screen.queryByText('Verificado')).not.toBeInTheDocument();
	});

	it('marca "Solo contacto" únicamente cuando el comercio no toma turnos', () => {
		const { unmount } = render(EmpresaCard, { empresa: empresa({ turnos_habilitados: false }) });
		expect(screen.getByText('Solo contacto')).toBeInTheDocument();
		unmount();
		render(EmpresaCard, { empresa: empresa({ turnos_habilitados: true }) });
		expect(screen.queryByText('Solo contacto')).not.toBeInTheDocument();
	});

	it('oculta el rubro y el slogan si no vienen', () => {
		render(EmpresaCard, { empresa: empresa({ categoria: undefined, slogan: '' }) });
		expect(screen.queryByText('Peluquerías')).not.toBeInTheDocument();
		expect(screen.queryByText('Cortes y color')).not.toBeInTheDocument();
	});
});

describe('FormField', () => {
	it('asocia la etiqueta con el campo', () => {
		render(FormField, { label: 'Correo electrónico', type: 'email' });
		const campo = screen.getByLabelText('Correo electrónico');
		expect(campo).toHaveAttribute('type', 'email');
		expect(campo).toHaveAttribute('id', 'correo-electrónico');
	});

	it('marca los obligatorios y permite un id propio', () => {
		render(FormField, { label: 'Nombre', required: true, id: 'mi-id' });
		expect(screen.getByText('*')).toBeInTheDocument();
		expect(screen.getByLabelText(/Nombre/)).toHaveAttribute('id', 'mi-id');
	});

	it('con error lo muestra y lo marca como inválido y descrito', () => {
		render(FormField, { label: 'Nombre', error: 'Este campo es obligatorio' });
		const campo = screen.getByLabelText('Nombre');
		expect(screen.getByText('Este campo es obligatorio')).toBeInTheDocument();
		expect(campo).toHaveAttribute('aria-invalid', 'true');
		expect(campo).toHaveAttribute('aria-describedby', 'nombre-error');
	});

	it('sin error no marca nada', () => {
		render(FormField, { label: 'Nombre' });
		const campo = screen.getByLabelText('Nombre');
		expect(campo).toHaveAttribute('aria-invalid', 'false');
		expect(campo).not.toHaveAttribute('aria-describedby');
	});

	it('lo que se escribe queda en el campo', async () => {
		render(FormField, { label: 'Nombre' });
		const campo = screen.getByLabelText('Nombre') as HTMLInputElement;
		await userEvent.type(campo, 'Ana');
		expect(campo.value).toBe('Ana');
	});
});

describe('Button', () => {
	it('dispara onclick', async () => {
		const onclick = vi.fn();
		render(Button, { onclick, children: texto('Reservar') });
		await userEvent.click(screen.getByRole('button', { name: 'Reservar' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('deshabilitado no dispara onclick', async () => {
		const onclick = vi.fn();
		render(Button, { onclick, disabled: true, children: texto('Reservar') });
		await userEvent.click(screen.getByRole('button'));
		expect(onclick).not.toHaveBeenCalled();
	});

	it('con href es un enlace', () => {
		render(Button, { href: '/comercios', children: texto('Ver todos') });
		expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/comercios');
	});

	it('puede ser de tipo submit', () => {
		render(Button, { type: 'submit', children: texto('Enviar') });
		expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
	});
});

describe('RatingStars', () => {
	it('muestra el valor con un decimal y la cantidad', () => {
		render(RatingStars, { value: 4, count: 8 });
		expect(screen.getByText('4.0 (8)')).toBeInTheDocument();
	});
	it('sin cantidad muestra solo el valor', () => {
		render(RatingStars, { value: 3.26 });
		expect(screen.getByText('3.3')).toBeInTheDocument();
	});
	it('pinta tantas estrellas como el valor redondeado', () => {
		const { container } = render(RatingStars, { value: 3.6 });
		const llenas = [...container.querySelectorAll('svg')].filter(
			(s) => s.getAttribute('fill') === 'currentColor'
		);
		expect(container.querySelectorAll('svg')).toHaveLength(5);
		expect(llenas).toHaveLength(4);
	});
});

describe('Badge, EmptyState y Avatar', () => {
	it('Badge muestra su contenido', () => {
		render(Badge, { tone: 'brand', children: texto('Verificado') });
		expect(screen.getByText('Verificado')).toBeInTheDocument();
	});

	it('EmptyState muestra título y descripción opcional', () => {
		const { unmount } = render(EmptyState, {
			title: 'Sin resultados',
			description: 'Probá otra búsqueda'
		});
		expect(screen.getByText('Sin resultados')).toBeInTheDocument();
		expect(screen.getByText('Probá otra búsqueda')).toBeInTheDocument();
		unmount();
		render(EmptyState, { title: 'Vacío' });
		expect(screen.queryByText('Probá otra búsqueda')).not.toBeInTheDocument();
	});

	it('Avatar usa las iniciales de las dos primeras palabras', () => {
		const { unmount } = render(Avatar, { name: 'estilo urbano peluquería' });
		expect(screen.getByText('EU')).toBeInTheDocument();
		unmount();
		render(Avatar, { name: '  Ana  ' });
		expect(screen.getByText('A')).toBeInTheDocument();
	});

	it('Avatar mantiene un color estable para el mismo nombre', () => {
		const color = (nombre: string) => {
			const { container, unmount } = render(Avatar, { name: nombre });
			const c = (container.firstElementChild as HTMLElement).style.background;
			unmount();
			return c;
		};
		expect(color('Peluquería Central')).toBe(color('Peluquería Central'));
	});
});

describe('Tabs', () => {
	const tabs = [
		{ id: 'turnos', label: 'Mis turnos' },
		{ id: 'favoritos', label: 'Favoritos' }
	];

	it('muestra las pestañas y cambia la activa al tocar', async () => {
		render(Tabs, { tabs });
		expect(screen.getByRole('button', { name: 'Mis turnos' }).className).toContain(
			'border-brand-500'
		);
		await userEvent.click(screen.getByRole('button', { name: 'Favoritos' }));
		expect(screen.getByRole('button', { name: 'Favoritos' }).className).toContain(
			'border-brand-500'
		);
		expect(screen.getByRole('button', { name: 'Mis turnos' }).className).not.toContain(
			'border-brand-500'
		);
	});
});
