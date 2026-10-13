import { describe, expect, it } from 'vitest';
import {
	caracteristicaTelefono,
	constanciaCuit,
	cuit,
	email,
	esConstanciaValida,
	esCuitValido,
	esPasswordSegura,
	esTurnoPasado,
	formatearFechaAR,
	minLength,
	numericPositive,
	passwordSegura,
	phone,
	required,
	telefonoSoloDigitos,
	validate,
	validateForm,
	validarArchivoConstancia
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

describe('telefonoSoloDigitos (RF-02, guardar ficha)', () => {
	it.each(['2392411234', '2392000000', '000000'])('acepta %s', (v) => {
		expect(telefonoSoloDigitos()(v)).toBeNull();
	});
	it.each(['2392-411234', '2392 411234', '(2392)411234', '+5492392', 'abc123456', '123'])(
		'rechaza %s',
		(v) => {
			expect(telefonoSoloDigitos()(v)).toBe('Usá solo números, sin espacios ni guiones');
		}
	);
	it('vacío no es error (lo decide required)', () => {
		expect(telefonoSoloDigitos()('')).toBeNull();
	});
});

describe('caracteristicaTelefono (2 a 5 dígitos)', () => {
	it.each(['2392', '11', '02392'])('acepta %s', (v) => {
		expect(caracteristicaTelefono()(v)).toBeNull();
	});
	it.each(['1', '123456', '23a2', '23 92'])('rechaza %s', (v) => {
		expect(caracteristicaTelefono()(v)).toBe('Usá solo números, sin espacios ni guiones');
	});
});

describe('CUIT argentino (RF-15, módulo 11)', () => {
	it.each(['20123456786', '27234567816', '20987654334', '30567891255', '20-12345678-6'])(
		'acepta %s',
		(v) => {
			expect(esCuitValido(v)).toBe(true);
			expect(cuit()(v)).toBeNull();
		}
	);
	it.each(['20123456789', '12345678901', '123', 'abcdefghijk'])('rechaza %s', (v) => {
		expect(esCuitValido(v)).toBe(false);
		expect(cuit()(v)).toBe('Ingresá un CUIT válido de 11 dígitos');
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

describe('esPasswordSegura (mínimo 8 con mayúscula, minúscula y número)', () => {
	it.each(['Clave123', 'Segura99X', 'Abcdef1G'])('acepta %s', (v) => {
		expect(esPasswordSegura(v)).toBe(true);
		expect(passwordSegura()(v)).toBeNull();
	});
	it.each(['clave123', 'CLAVE123', 'ClaveABC', 'Cla1', '12345678', 'abcdefgh'])(
		'rechaza %s',
		(v) => {
			expect(esPasswordSegura(v)).toBe(false);
			expect(passwordSegura()(v)).not.toBeNull();
		}
	);
	it('vacío no es error (lo decide required)', () => {
		expect(passwordSegura()('')).toBeNull();
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

describe('formatearFechaAR (zona Argentina, sin hack UTC)', () => {
	it('formatea YYYY-MM-DD en español', () => {
		const texto = formatearFechaAR('2026-10-13');
		expect(texto).toContain('13');
		expect(texto).toContain('octubre');
	});

	it('devuelve el input si no es fecha válida', () => {
		expect(formatearFechaAR('no-fecha')).toBe('no-fecha');
	});
});

describe('esTurnoPasado', () => {
	it('ayer es pasado, hoy y mañana no', () => {
		expect(esTurnoPasado('2026-10-12', '2026-10-13')).toBe(true);
		expect(esTurnoPasado('2026-10-13', '2026-10-13')).toBe(false);
		expect(esTurnoPasado('2026-10-14', '2026-10-13')).toBe(false);
	});
});

describe('constancia de CUIT', () => {
	it('acepta vacío (opcional) y URLs http(s) con extensión válida', () => {
		expect(esConstanciaValida('')).toBe(true);
		expect(esConstanciaValida('https://ejemplo.com/constancia.pdf')).toBe(true);
		expect(esConstanciaValida('http://x.com/a.JPG')).toBe(true);
	});

	it('rechaza no-URL, ftp y extensiones raras', () => {
		expect(esConstanciaValida('no-es-url')).toBe(false);
		expect(esConstanciaValida('ftp://x.com/a.pdf')).toBe(false);
		expect(esConstanciaValida('https://x.com/a.exe')).toBe(false);
	});

	it('el validador de formulario respeta lo mismo', () => {
		expect(constanciaCuit()('https://x.com/a.pdf')).toBeNull();
		expect(constanciaCuit()('https://x.com/a.exe')).not.toBeNull();
	});

	it('el archivo no puede ser otro tipo ni mayor a 5MB', () => {
		const pdf = new File(['x'], 'c.pdf', { type: 'application/pdf' });
		expect(validarArchivoConstancia(pdf)).toBeNull();
		const exe = new File(['x'], 'c.exe', { type: 'application/x-msdownload' });
		expect(validarArchivoConstancia(exe)).not.toBeNull();
		const grande = new File([new Uint8Array(6 * 1024 * 1024)], 'c.pdf', {
			type: 'application/pdf'
		});
		expect(validarArchivoConstancia(grande)).not.toBeNull();
	});
});
