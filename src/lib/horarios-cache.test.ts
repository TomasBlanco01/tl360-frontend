import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheHorarios } from './horarios-cache';

beforeEach(() => cacheHorarios.invalidate());

describe('cacheHorarios con TTL', () => {
	it('memoiza y lee lo guardado', () => {
		cacheHorarios.set(1, { Lunes: ['09:00-13:00'] });
		expect(cacheHorarios.get(1)).toEqual({ Lunes: ['09:00-13:00'] });
	});

	it('expira después del TTL', () => {
		vi.useFakeTimers();
		cacheHorarios.set(2, { Martes: [] });
		vi.advanceTimersByTime(6 * 60 * 1000);
		expect(cacheHorarios.get(2)).toBeUndefined();
		vi.useRealTimers();
	});

	it('invalidate borra uno o todo', () => {
		cacheHorarios.set(1, {});
		cacheHorarios.set(2, {});
		cacheHorarios.invalidate(1);
		expect(cacheHorarios.get(1)).toBeUndefined();
		expect(cacheHorarios.get(2)).toEqual({});
		cacheHorarios.invalidate();
		expect(cacheHorarios.get(2)).toBeUndefined();
	});
});
