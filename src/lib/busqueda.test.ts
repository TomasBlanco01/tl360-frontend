import { describe, expect, it } from 'vitest';
import { coincideBusqueda, expandirConsulta, normalizar, relevanciaBusqueda } from './busqueda';

describe('normalizar', () => {
	it('ignora mayúsculas, tildes y espacios', () => {
		expect(normalizar('Peluquería')).toBe('peluqueria');
		expect(normalizar('  GIMNASIO   Fuerte ')).toBe('gimnasio fuerte');
	});
});

describe('expandirConsulta', () => {
	it('expande sinónimos de lenguaje natural', () => {
		expect(expandirConsulta('comida')).toContain('gastronomia');
		expect(expandirConsulta('gym')).toContain('gimnasio');
		expect(expandirConsulta('peluqueria')).toContain('barberia');
	});
	it('consulta vacía no expande', () => {
		expect(expandirConsulta('   ')).toEqual([]);
	});
});

describe('coincideBusqueda', () => {
	const pelu = { nombre: 'Estilo Urbano Peluquería', rubro: 'Peluquería' };
	const gym = { nombre: 'PowerFit', rubro: 'Gimnasio', etiquetas: ['Crossfit'] };
	const resto = { nombre: 'Lo de Juan', rubro: 'Gastronomía' };

	it('tolera tildes y mayúsculas', () => {
		expect(coincideBusqueda(pelu, 'peluqueria')).toBe(true);
		expect(coincideBusqueda(pelu, 'PELUQUERÍA')).toBe(true);
	});
	it('relaciona sinónimos', () => {
		expect(coincideBusqueda(resto, 'comida')).toBe(true);
		expect(coincideBusqueda(pelu, 'corte')).toBe(true);
		expect(coincideBusqueda(gym, 'gym')).toBe(true);
		expect(coincideBusqueda(gym, 'pesas')).toBe(true);
	});
	it('busca en etiquetas', () => {
		expect(coincideBusqueda(gym, 'crossfit')).toBe(true);
	});
	it('no da falsos positivos', () => {
		expect(coincideBusqueda(pelu, 'veterinaria')).toBe(false);
	});
	it('"comida" no trae barberías (por "bar") ni todo lo que diga "comercio" (por "comer")', () => {
		const barberia = {
			nombre: 'Barber Shop',
			rubro: 'Barberías',
			descripcion: 'El mejor comercio del barrio'
		};
		expect(coincideBusqueda(barberia, 'comida')).toBe(false);
		expect(coincideBusqueda({ nombre: 'La Esquina', rubro: 'Bares' }, 'comida')).toBe(true);
		expect(coincideBusqueda({ nombre: 'Don Pepe', rubro: 'Casas de Comidas' }, 'comida')).toBe(
			true
		);
	});
	it('los sinónimos no se buscan en la descripción (una herrería que hace parrillas)', () => {
		const herreria = {
			nombre: 'Herrería Jeremías',
			rubro: 'Herrerías',
			descripcion: 'Fabricamos parrillas'
		};
		expect(coincideBusqueda(herreria, 'comida')).toBe(false);
		expect(coincideBusqueda(herreria, 'parrilla')).toBe(true);
	});
	it('ignora palabras vacías como "de"', () => {
		expect(coincideBusqueda({ nombre: 'Lo de Juan', rubro: 'Gastronomía' }, 'corte de pelo')).toBe(
			false
		);
		expect(coincideBusqueda(pelu, 'corte de pelo')).toBe(true);
	});
	it('vacío coincide con todo', () => {
		expect(coincideBusqueda(pelu, '')).toBe(true);
	});
});

describe('búsqueda "comida" (devolución 6/11)', () => {
	it('no trae una carnicería solo porque hace delivery', () => {
		const carniceria = {
			nombre: 'Carnicería El Novillo',
			rubro: 'Carnicería',
			etiquetas: ['Delivery']
		};
		expect(coincideBusqueda(carniceria, 'comida')).toBe(false);
	});
	it('ordena primero lo que coincide en nombre o rubro', () => {
		expect(relevanciaBusqueda({ nombre: 'La Comida de Ana', rubro: 'Rotisería' }, 'comida')).toBe(
			0
		);
		expect(
			relevanciaBusqueda({ nombre: 'Parrilla El Fogón', rubro: 'Gastronomía' }, 'comida')
		).toBe(2);
		expect(relevanciaBusqueda({ nombre: 'Kiosco Pepe', rubro: 'Kiosco' }, 'comida')).toBe(3);
	});
});

describe('búsqueda: segunda pasada de la devolución', () => {
	const vete = {
		nombre: 'Veterinaria San Roque',
		rubro: 'Veterinaria',
		etiquetas: ['Vacunas', 'Peluquería canina']
	};
	const gym = { nombre: 'PowerFit', rubro: 'Gimnasio', etiquetas: ['Acepta mascotas'] };
	it('lo escrito se busca como comienzo de palabra ("uñas" no está en "vacunas")', () => {
		expect(coincideBusqueda(vete, 'uñas')).toBe(false);
		expect(coincideBusqueda({ nombre: 'Uñas & Detalles', rubro: 'Manicuría' }, 'uñas')).toBe(true);
		expect(coincideBusqueda(vete, 'vete')).toBe(true);
	});
	it('los sinónimos no se buscan en las etiquetas', () => {
		expect(coincideBusqueda(gym, 'perro')).toBe(false);
		expect(coincideBusqueda(vete, 'perro')).toBe(true);
		expect(coincideBusqueda(vete, 'pelo')).toBe(false);
	});
	it('lo escrito sí se busca en las etiquetas', () => {
		expect(coincideBusqueda(gym, 'mascotas')).toBe(true);
	});
	it('"carne" encuentra carnicerías', () => {
		expect(coincideBusqueda({ nombre: 'El Novillo', rubro: 'Carnicería' }, 'carne')).toBe(true);
	});
});

describe('búsqueda en etiquetas con signos', () => {
	const gym = { nombre: 'PowerFit', rubro: 'Gimnasio', etiquetas: ['Wi-Fi gratis'] };
	it('"wifi" y "wi-fi" encuentran "Wi-Fi gratis"', () => {
		expect(coincideBusqueda(gym, 'wifi')).toBe(true);
		expect(coincideBusqueda(gym, 'wi-fi')).toBe(true);
	});
});

describe('búsqueda: palabras conocidas y orden', () => {
	it('una palabra del diccionario se busca entera', () => {
		expect(coincideBusqueda({ nombre: 'Cámara de Comercio', rubro: 'Trámites' }, 'comer')).toBe(
			false
		);
		expect(coincideBusqueda({ nombre: 'Estudio Perroud', rubro: 'Arquitectos' }, 'perro')).toBe(
			false
		);
		expect(
			coincideBusqueda(
				{ nombre: 'Gestoría', rubro: 'Trámites', descripcion: 'Carnet de conducir' },
				'carne'
			)
		).toBe(false);
	});
	it('"bar": primero Bares, después Barberías', () => {
		expect(relevanciaBusqueda({ nombre: 'La Esquina', rubro: 'Bares' }, 'bar')).toBe(0);
		expect(relevanciaBusqueda({ nombre: 'Champú', rubro: 'Barberías' }, 'bar')).toBe(1);
	});
});
