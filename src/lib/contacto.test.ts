import { describe, expect, it } from 'vitest';
import { enlaceLlamada, enlaceWhatsApp, numeroWhatsApp } from './contacto';

describe('numeroWhatsApp', () => {
	it('agrega el código de país 549 a los números locales', () => {
		expect(numeroWhatsApp('2392411234')).toBe('5492392411234');
	});
	it('ignora espacios, guiones y paréntesis', () => {
		expect(numeroWhatsApp('(2392) 41-1234')).toBe('5492392411234');
	});
	it('saca el 0 de la característica', () => {
		expect(numeroWhatsApp('02392411234')).toBe('5492392411234');
	});
	it('no duplica el código si ya viene completo', () => {
		expect(numeroWhatsApp('5492392411234')).toBe('5492392411234');
		expect(numeroWhatsApp('+54 9 2392 411234')).toBe('5492392411234');
	});
	it('completa el 9 si viene con 54 pero sin él', () => {
		expect(numeroWhatsApp('542392411234')).toBe('5492392411234');
	});
});

describe('enlaces', () => {
	it('WhatsApp usa wa.me con el número internacional', () => {
		expect(enlaceWhatsApp('2392411234')).toBe('https://wa.me/5492392411234');
	});
	it('la llamada usa tel: solo con dígitos', () => {
		expect(enlaceLlamada('(2392) 41-1234')).toBe('tel:2392411234');
	});
});
