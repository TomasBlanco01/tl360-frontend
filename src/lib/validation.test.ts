import { describe, expect, it } from 'vitest';
import {
	email,
	minLength,
	numericPositive,
	phone,
	required,
	validate,
	validateForm
} from './validation';

describe('required', () => {
	it('rechaza vacío y solo espacios', () => {
		expect(required()('')).toBe('Este campo es obligatorio');
		expect(required()('   ')).toBe('Este campo es obligatorio');
	});
	it('acepta texto y permite un mensaje propio', () => {
		expect(required()('hola')).toBeNull();
		expect(required('Falta el nombre')('')).toBe('Falta el nombre');
	});
});

describe('email', () => {
	it.each(['ana@test.com', 'a.b@dominio.com.ar', 'x+tag@y.io'])('acepta %s', (v) => {
		expect(email()(v)).toBeNull();
	});
	it.each(['sin-arroba', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com'])('rechaza %s', (v) => {
		expect(email()(v)).toBe('Ingresá un correo electrónico válido');
	});
	it('un valor vacío no es error (lo decide required)', () => {
		expect(email()('')).toBeNull();
	});
});

describe('phone', () => {
	it.each(['2392411234', '(2392) 41-1234', '+54 9 2392 411234'])('acepta %s', (v) => {
		expect(phone()(v)).toBeNull();
	});
	it.each(['123', 'abc123456', '1'.repeat(21)])('rechaza %s', (v) => {
		expect(phone()(v)).toBe('Ingresá un teléfono válido');
	});
});

describe('minLength', () => {
	it('exige el mínimo sobre el texto sin espacios de los bordes', () => {
		expect(minLength(6)('12345')).toBe('Debe tener al menos 6 caracteres');
		expect(minLength(6)('123456')).toBeNull();
		expect(minLength(6)('  12345  ')).toBe('Debe tener al menos 6 caracteres');
	});
	it('vacío no es error', () => {
		expect(minLength(6)('')).toBeNull();
	});
});

describe('numericPositive', () => {
	it.each(['1', '30', '0.5'])('acepta %s', (v) => expect(numericPositive()(v)).toBeNull());
	it.each(['0', '-5', 'abc'])('rechaza %s', (v) =>
		expect(numericPositive()(v)).toBe('Debe ser un número mayor a 0')
	);
});

describe('validate', () => {
	it('devuelve el primer error de la lista', () => {
		expect(validate('', [required('A'), email('B')])).toBe('A');
		expect(validate('mal', [required('A'), email('B')])).toBe('B');
		expect(validate('a@b.com', [required('A'), email('B')])).toBeNull();
	});
});

describe('valores numéricos (inputs type="number")', () => {
	it('un número no rompe las validaciones', () => {
		expect(() => validate(30 as unknown as string, [required(), numericPositive()])).not.toThrow();
		expect(validate(30 as unknown as string, [required(), numericPositive()])).toBeNull();
		expect(validate(0 as unknown as string, [numericPositive()])).toBe(
			'Debe ser un número mayor a 0'
		);
	});
	it('un campo numérico vacío (null) cuenta como vacío', () => {
		expect(validate(null as unknown as string, [required()])).toBe('Este campo es obligatorio');
		expect(validate(undefined as unknown as string, [required()])).toBe(
			'Este campo es obligatorio'
		);
	});
	it('validateForm acepta números en los valores', () => {
		const errores = validateForm(
			{ duracion: 45, categoria: null } as unknown as Record<string, string>,
			{
				duracion: [required(), numericPositive()],
				categoria: [required()]
			}
		);
		expect(errores).toEqual({ categoria: 'Este campo es obligatorio' });
	});
});

describe('validateForm', () => {
	const reglas = {
		nombre: [required()],
		email: [required(), email()],
		contraseña: [required(), minLength(6)]
	};

	it('devuelve un error por campo inválido', () => {
		const errores = validateForm({ nombre: '', email: 'mal', contraseña: '123' }, reglas);
		expect(Object.keys(errores).sort()).toEqual(['contraseña', 'email', 'nombre']);
	});
	it('no devuelve nada si todo es válido', () => {
		expect(validateForm({ nombre: 'Ana', email: 'a@b.com', contraseña: '123456' }, reglas)).toEqual(
			{}
		);
	});
	it('ignora campos sin reglas y tolera los que faltan', () => {
		expect(validateForm({ extra: 'x' } as Record<string, string>, { extra: [] })).toEqual({});
		expect(validateForm({} as Record<string, string>, { nombre: [required()] })).toEqual({
			nombre: 'Este campo es obligatorio'
		});
	});
});
