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
