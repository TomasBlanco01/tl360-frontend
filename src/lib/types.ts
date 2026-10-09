export interface Usuario {
	id: number;
	nombre: string;
	email: string;
	rol: 'cliente' | 'admin' | 'superadmin';
}

export interface Categoria {
	id: number;
	nombre: string;
	/** Si los comercios de este rubro suelen ofrecer reserva de turnos. Ausente/true = sí (compat). */
	turnos_habilitados?: boolean;
	/** Agrupación de rubros (ej. "Salud y bienestar"). Solo la informa el backend real. */
	super_rubro?: string | null;
	/** Cantidad de comercios del rubro. Solo la informa el backend real. */
	cantidad?: number;
}

export interface TelefonoEmpresa {
	id?: number;
	numero: string;
	etiqueta?: string;
	/** Canal preferido de ese número; si falta, manda el `modo_contacto` del comercio. */
	modo_contacto?: 'llamada' | 'mensaje' | 'ambos';
}

export interface Empresa {
	id: number;
	nombre: string;
	direccion: string;
	telefono: string;
	slogan: string;
	/** Requerido solo si `turnos_habilitados` es true; se ignora para comercios que no reservan turno. */
	duracion_turno_min?: number;
	categoria_id: number;
	categoria?: string;
	admin_id: number | null;
	// Campos que el backend actual no expone todavía; se renderizan solo si vienen presentes.
	descripcion?: string;
	etiquetas?: string[];
	calificacion_promedio?: number;
	calificacion_cantidad?: number;
	verificado?: boolean;
	/** Flujo de acreditación comercial (RF-15). En PostgreSQL: enum + columnas cuit/constancia. */
	verificado_estado?: 'verificado' | 'pendiente' | 'rechazado' | 'sin_solicitar';
	/** CUIT argentino de 11 dígitos (solo dígitos, sin guiones). */
	cuit?: string;
	/** URL del comprobante / constancia fiscal adjuntada por el dueño. */
	constancia_cuit_url?: string;
	/** Slug SEO-friendly único (`estilo-urbano-peluqueria`). Cae a `id` si falta. */
	slug?: string;
	/** Coordenadas (WGS84) para el mapa; null/ausente si el comercio todavía no está geolocalizado. */
	lat?: number | null;
	lng?: number | null;
	modo_contacto?: 'llamada' | 'mensaje' | 'ambos';
	/** Si el comercio ofrece reserva de turnos online. Ausente/true = habilitado (compat con datos viejos). */
	turnos_habilitados?: boolean;
	// Lista completa de teléfonos (uno o varios barberos/profesionales de un mismo comercio).
	// Si no viene o está vacía, se usa `telefono` como único número.
	telefonos?: TelefonoEmpresa[];
	instagram?: string;
	facebook?: string;
	/** URLs de fotos del local, cargadas a mano por el dueño (mismo patrón que imagen_url de Publicidad). */
	fotos?: string[];
}

export interface Publicidad {
	id: string;
	empresa_id: number;
	/** Slug SEO del comercio (si se conoce); el carrusel prefiere slug y cae a id. */
	empresa_slug?: string;
	titulo: string;
	descripcion: string;
	imagen_url: string;
}

/** Horarios agrupados por día: { "Lunes": ["09:00-13:00", "14:00-18:00"], ... } */
export type HorariosPorDia = Record<string, string[]>;

export interface TurnoOcupado {
	hora: string;
}

export interface MiTurno {
	id: number;
	fecha: string;
	hora: string;
	estado: string;
	empresa_nombre: string;
	/** Para enlazar a la ficha sin otro fetch. Opcional por compat con backend viejo. */
	empresa_id?: number;
	empresa_slug?: string;
}

/** Turno visto desde el panel del comercio (con el nombre del cliente). */
export interface TurnoRecibido {
	id: number;
	fecha: string;
	hora: string;
	estado: string;
	cliente_nombre: string;
}

export interface LoginResponse {
	message: string;
	token: string;
	user: Usuario;
}

export interface Resena {
	usuario_nombre: string;
	puntaje: number;
	comentario: string | null;
	creado_en: string;
}

export interface ReporteAdmin {
	id: number;
	empresa_id: number;
	empresa_nombre: string;
	usuario_nombre: string | null;
	motivo: string;
	resuelto: boolean;
	creado_en: string;
}

export interface PuntoMapa {
	id: number;
	nombre: string;
	lat: number;
	lng: number;
	/** Slug SEO para popup/enlace; cae a id si falta. */
	slug?: string;
	verificado?: boolean;
}
