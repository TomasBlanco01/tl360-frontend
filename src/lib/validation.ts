export type Validator = (value: string) => string | null;

export const required =
	(message = 'Este campo es obligatorio'): Validator =>
	(value) =>
		value.trim() === '' ? message : null;

export const email =
	(message = 'Ingresá un correo electrónico válido'): Validator =>
	(value) =>
		value.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : message;

export const phone =
	(message = 'Ingresá un teléfono válido'): Validator =>
	(value) =>
		value.trim() === '' || /^[\d\s()+-]{6,20}$/.test(value) ? null : message;

/**
 * Validación dura para guardar teléfonos (RF-02): solo dígitos, sin guiones,
 * espacios ni letras. El formato bonito (`2392-411234`) es solo para mostrar.
 * Acepta 6 a 15 dígitos (característica + número local, con o sin 0/54/549).
 */
export const telefonoSoloDigitos =
	(message = 'Usá solo números, sin espacios ni guiones'): Validator =>
	(value) => {
		const v = value.trim();
		if (v === '') return null;
		return /^[0-9]{6,15}$/.test(v) ? null : message;
	};

/** Parte corta (característica, 2 a 5 dígitos) del teléfono principal de dos campos. */
export const caracteristicaTelefono =
	(message = 'Usá solo números, sin espacios ni guiones'): Validator =>
	(value) => {
		const v = value.trim();
		if (v === '') return null;
		return /^[0-9]{2,5}$/.test(v) ? null : message;
	};

/**
 * Validador de CUIT argentino (11 dígitos, algoritmo Módulo 11 — RF-15).
 * Acepta con o sin guiones (`20-12345678-9` o `20123456789`), pero guarda solo dígitos.
 */
export function esCuitValido(cuit: string): boolean {
	const digitos = cuit.replace(/\D/g, '');
	if (!/^\d{11}$/.test(digitos)) return false;
	const nums = digitos.split('').map(Number);
	const verificador = nums[10];
	let suma = 0;
	const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
	for (let i = 0; i < 10; i++) suma += nums[i] * pesos[i];
	const resto = suma % 11;
	const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
	return verificador === esperado;
}

export const cuit =
	(message = 'Ingresá un CUIT válido de 11 dígitos'): Validator =>
	(value) => {
		const v = value.trim();
		if (v === '') return null;
		return esCuitValido(v) ? null : message;
	};

export const minLength =
	(min: number, message = `Debe tener al menos ${min} caracteres`): Validator =>
	(value) =>
		value.trim() === '' || value.trim().length >= min ? null : message;

export const numericPositive =
	(message = 'Debe ser un número mayor a 0'): Validator =>
	(value) =>
		value.trim() === '' || (Number(value) > 0 && !Number.isNaN(Number(value))) ? null : message;

/** Corre una lista de validadores sobre un valor; devuelve el primer error o null. */
export function validate(value: string, validators: Validator[]): string | null {
	// Los inputs type="number" guardan un número (o null si están vacíos): se validan como texto.
	const texto = value === null || value === undefined ? '' : String(value);
	for (const v of validators) {
		const error = v(texto);
		if (error) return error;
	}
	return null;
}

/** Valida un objeto de campos contra un objeto de reglas; devuelve un objeto de errores. */
export function validateForm<T extends Record<string, string>>(
	values: T,
	rules: Partial<Record<keyof T, Validator[]>>
): Partial<Record<keyof T, string>> {
	const errors: Partial<Record<keyof T, string>> = {};
	for (const key in rules) {
		const validators = rules[key];
		if (!validators) continue;
		const error = validate(values[key], validators);
		if (error) errors[key] = error;
	}
	return errors;
}

/**
 * Fecha "2026-10-13" → "lunes 13 de octubre" en zona Argentina, sin el hack
 * `new Date(fecha + 'T00:00:00')` (ese constructor usa UTC y en UTC-3 puede
 * correr el día). Usa medianoche local + timeZone explícito.
 */
export function formatearFechaAR(fechaISO: string): string {
	const [a, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
	if (!a || !m || !d) return fechaISO;
	const fecha = new Date(a, m - 1, d);
	return fecha.toLocaleDateString('es-AR', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		timeZone: 'America/Argentina/Buenos_Aires'
	});
}

/** "2026-10-13" + "14:30" ya pasó respecto a hoy (comparación por calendario local). */
export function esTurnoPasado(fechaISO: string, hoyISO: string): boolean {
	return fechaISO.slice(0, 10) < hoyISO.slice(0, 10);
}

const EXTENSIONES_CONSTANCIA = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

/**
 * Valida la URL de constancia de CUIT: http(s), extensión permitida y largo
 * razonable. No valida el contenido (eso lo hace el backend al recibir el archivo).
 */
export function esConstanciaValida(url: string): boolean {
	const v = url.trim();
	if (v === '') return true;
	if (v.length > 2000) return false;
	let parsed: URL;
	try {
		parsed = new URL(v);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
	const path = parsed.pathname.toLowerCase();
	return EXTENSIONES_CONSTANCIA.some((ext) => path.endsWith(ext));
}

export const constanciaCuit =
	(message = 'Pegá un enlace http(s) a PDF o imagen (pdf, jpg, png, webp)'): Validator =>
	(value) =>
		esConstanciaValida(value) ? null : message;

/** Valida un File de constancia antes de subirlo (tipo + 5MB máx). */
export function validarArchivoConstancia(file: File): string | null {
	const tipos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
	if (!tipos.includes(file.type)) return 'Subí un PDF o una imagen (JPG, PNG, WEBP).';
	if (file.size > 5 * 1024 * 1024) return 'El archivo no puede superar 5 MB.';
	return null;
}
