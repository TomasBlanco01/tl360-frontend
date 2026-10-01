import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estaAbiertoAhora, FERIADOS, generarSlots, nombreDia, slotsDelDia } from './turnos';

describe('nombreDia', () => {
	it('devuelve el día de la semana en español', () => {
		expect(nombreDia('2026-10-05')).toBe('Lunes');
		expect(nombreDia('2026-10-07')).toBe('Miércoles');
		expect(nombreDia('2026-10-10')).toBe('Sábado');
		expect(nombreDia('2026-10-11')).toBe('Domingo');
	});
});

describe('generarSlots', () => {
	it('arranca al inicio de la franja y avanza de a 30 minutos por defecto', () => {
		expect(generarSlots('09:00-11:00')).toEqual(['09:00', '09:30', '10:00', '10:30']);
	});
	it('el cierre no es un horario reservable', () => {
		expect(generarSlots('09:00-10:00')).not.toContain('10:00');
	});
	it('respeta la duración del turno del comercio', () => {
		expect(generarSlots('09:00-10:00', 15)).toEqual(['09:00', '09:15', '09:30', '09:45']);
		expect(generarSlots('09:00-12:00', 45)).toEqual(['09:00', '09:45', '10:30', '11:15']);
	});
	it('el último turno debe entrar completo antes del cierre', () => {
		// con 45 min desde las 09:00, 11:15 termina justo a las 12:00 y 12:00 ya no entra
		expect(generarSlots('09:00-12:00', 45).at(-1)).toBe('11:15');
		expect(generarSlots('09:00-11:50', 45).at(-1)).toBe('10:30');
	});
	it('la grilla arranca en el inicio de cada franja, no a las 00:00', () => {
		expect(generarSlots('16:20-17:20', 30)).toEqual(['16:20', '16:50']);
	});
	it('franjas vacías o invertidas no generan horarios', () => {
		expect(generarSlots('10:00-10:00')).toEqual([]);
		expect(generarSlots('12:00-09:00')).toEqual([]);
		expect(generarSlots('09:00-09:20')).toEqual([]);
	});
	it('formatea con dos dígitos', () => {
		expect(generarSlots('08:00-08:30')).toEqual(['08:00']);
	});
});

describe('slotsDelDia', () => {
	const horarios = {
		Lunes: ['09:00-10:00', '16:00-17:00'],
		Sábado: ['09:00-10:00', '15:00-16:00'],
		Domingo: ['11:00-12:00']
	};

	it('junta todas las franjas del día', () => {
		expect(slotsDelDia('2026-10-12', horarios)).toEqual(['09:00', '09:30', '16:00', '16:30']);
	});
	it('usa TODAS las franjas también los sábados', () => {
		expect(slotsDelDia('2026-10-10', horarios)).toEqual(['09:00', '09:30', '15:00', '15:30']);
	});
	it('los domingos se ofrecen si el comercio carga horario', () => {
		expect(slotsDelDia('2026-10-11', horarios)).toEqual(['11:00', '11:30']);
	});
	it('un día sin horario no ofrece turnos', () => {
		expect(slotsDelDia('2026-10-13', horarios)).toEqual([]);
	});
	it('sin fecha no ofrece nada', () => {
		expect(slotsDelDia('', horarios)).toEqual([]);
	});
	it('los feriados no ofrecen turnos', () => {
		const feriado = FERIADOS[0];
		const dia = nombreDia(feriado);
		expect(slotsDelDia(feriado, { [dia]: ['09:00-12:00'] })).toEqual([]);
	});
	it('usa la duración del turno como paso', () => {
		expect(slotsDelDia('2026-10-12', { Lunes: ['09:00-10:00'] }, 15)).toHaveLength(4);
	});

	describe('el día de hoy', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('solo ofrece los horarios que todavía no pasaron', () => {
			// lunes 2026-10-12, 09:45 hora local
			vi.setSystemTime(new Date(2026, 9, 12, 9, 45));
			const hoy = new Date().toISOString().split('T')[0];
			const dia = nombreDia(hoy);
			const slots = slotsDelDia(hoy, { [dia]: ['09:00-11:00'] });
			expect(slots.every((h) => h > '09:45')).toBe(true);
			expect(slots).not.toContain('09:00');
		});
	});
});

describe('estaAbiertoAhora', () => {
	afterEach(() => vi.useRealTimers());

	const abrir = (h: number, m: number) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 12, h, m)); // lunes
	};
	const dia = () => nombreDia(new Date().toISOString().split('T')[0]);

	it('está abierto dentro de una franja y cerrado fuera de ella', () => {
		abrir(10, 0);
		const horarios = { [dia()]: ['09:00-12:00', '16:00-20:00'] };
		expect(estaAbiertoAhora(horarios)).toBe(true);
		abrir(14, 0);
		expect(estaAbiertoAhora({ [dia()]: ['09:00-12:00', '16:00-20:00'] })).toBe(false);
		abrir(17, 30);
		expect(estaAbiertoAhora({ [dia()]: ['09:00-12:00', '16:00-20:00'] })).toBe(true);
	});
	it('abre a la hora de inicio y cierra a la hora de cierre', () => {
		abrir(9, 0);
		expect(estaAbiertoAhora({ [dia()]: ['09:00-12:00'] })).toBe(true);
		abrir(12, 0);
		expect(estaAbiertoAhora({ [dia()]: ['09:00-12:00'] })).toBe(false);
	});
	it('sin horarios para hoy está cerrado', () => {
		abrir(10, 0);
		expect(estaAbiertoAhora({})).toBe(false);
	});
});
