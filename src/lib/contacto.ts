/**
 * WhatsApp necesita el número en formato internacional. Para celulares argentinos es
 * 549 + característica + número, sin el 0 inicial. Los números del directorio se guardan sin
 * código de país (ej. "2392411234"), así que `wa.me/2392411234` no abriría ningún chat.
 */
export function numeroWhatsApp(numero: string): string {
	const digitos = numero.replace(/\D/g, '');
	if (digitos.startsWith('549')) return digitos;
	if (digitos.startsWith('54')) return '549' + digitos.slice(2).replace(/^0+/, '');
	return '549' + digitos.replace(/^0+/, '');
}

export const enlaceWhatsApp = (numero: string) => `https://wa.me/${numeroWhatsApp(numero)}`;

/** Solo los dígitos: lo que espera el esquema `tel:`. */
export const enlaceLlamada = (numero: string) => `tel:${numero.replace(/\D/g, '')}`;

/** "2392411234" → "2392-411234" (característica de 4 dígitos + número), solo para mostrar. */
export function formatearTelefono(numero: string): string {
	const digitos = numero.replace(/\D/g, '');
	if (digitos.length <= 4) return numero;
	return `${digitos.slice(0, 4)}-${digitos.slice(4)}`;
}

/** Separa un número guardado en característica + resto, para precargar el formulario de dos campos. */
export function separarTelefono(numero: string): { caracteristica: string; numero: string } {
	const digitos = numero.replace(/\D/g, '');
	if (digitos.length <= 4) return { caracteristica: '', numero: digitos };
	return { caracteristica: digitos.slice(0, 4), numero: digitos.slice(4) };
}
