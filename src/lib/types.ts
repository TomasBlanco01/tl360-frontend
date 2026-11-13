export interface Usuario {
	id: number;
	nombre: string;
	email: string;
	rol: 'cliente' | 'admin' | 'superadmin';
	/** RF-01: obligatorio para reservar/cancelar turnos. Ausente = verificado (compat con sesiones viejas). */
	email_verificado?: boolean;
}

export interface Rubro {
	id: number;
	nombre: string;
	/** Si los comercios de este rubro suelen ofrecer reserva de turnos. Ausente/true = sí (compat). */
	turnos_habilitados?: boolean;
	/** Cantidad de comercios del rubro. Solo la informa el backend real. */
	cantidad?: number;
}

/** Fila de telefono_empresa. */
export interface TelefonoEmpresa {
	id?: number;
	numero: string;
	/** Para qué es ese número (por ejemplo, "Turnos" o "Consultas"). */
	descripcion?: string;
	/** Canal preferido de ese número; si falta, manda el `modo_contacto` del comercio. */
	canal?: 'llamada' | 'mensaje' | 'ambos';
	es_whatsapp?: boolean;
	/** El número que se muestra primero (uno por comercio). Si ninguno lo es, el primero de la lista. */
	principal?: boolean;
}

/** Tipos que admite la tabla red_social. */
export type TipoRedSocial = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube' | 'web';

/** Fila de red_social: una por tipo y comercio. */
export interface RedSocial {
	tipo: TipoRedSocial;
	url: string;
}

/** Comercio tal como lo devuelve GET /empresas y GET /empresas/:id. */
export interface Empresa {
	id: number;
	nombre: string;
	direccion: string;
	slogan: string | null;
	/** Requerido solo si `turnos_habilitados` es true; se ignora para comercios que no reservan turno. */
	duracion_turno_min?: number;
	rubro_id: number;
	rubro?: string;
	usuario_id: number | null;
	/** Solo en la ficha individual (el listado no la trae para ser liviano). */
	descripcion?: string;
	etiquetas?: string[];
	calificacion_promedio?: number;
	calificacion_cantidad?: number;
	verificado?: boolean;
	/** RF-15: el público solo ve 'verificado' o 'sin_solicitar'; el detalle lo ven el dueño y el superadmin. */
	verificado_estado?: 'verificado' | 'pendiente' | 'rechazado' | 'sin_solicitar';
	/** CUIT argentino de 11 dígitos (solo dígitos). Solo para el dueño y el superadmin. */
	cuit?: string;
	/** URL de la constancia fiscal. Solo para el dueño y el superadmin. */
	url_cuit?: string;
	/** RF-15: por qué se rechazó la verificación (solo mientras está rechazada). */
	motivo_rechazo?: string;
	/** Slug SEO-friendly único (`estilo-urbano-peluqueria`). Cae a `id` si falta. */
	slug?: string;
	/** Coordenadas (WGS84) para el mapa; null si el comercio todavía no está geolocalizado. */
	lat?: number | null;
	lng?: number | null;
	/** RF-07: distancia al usuario en km; solo la informa el backend al buscar con lat/lng. */
	distancia_km?: number;
	/** RF-07: si está abierto en este momento; el backend lo informa al buscar por cercanía. */
	abierto_ahora?: boolean;
	modo_contacto?: 'llamada' | 'mensaje' | 'ambos';
	/** Si el comercio ofrece reserva de turnos online. */
	turnos_habilitados?: boolean;
	/** telefono_empresa: el principal primero. */
	telefonos?: TelefonoEmpresa[];
	/** red_social: una por tipo. */
	redes_sociales?: RedSocial[];
	/** foto_empresa: URLs en el orden de la galería. */
	fotos?: string[];
}

/** RF-06: publicidad de un comercio; nace pendiente y se muestra cuando el superadmin la aprueba. */
export interface Publicidad {
	id: string;
	empresa_id: number;
	empresa_nombre?: string;
	/** Slug SEO del comercio (si se conoce); el carrusel prefiere slug y cae a id. */
	empresa_slug?: string;
	titulo: string;
	descripcion: string;
	url_imagen: string;
	estado?: EstadoAprobacion;
	fecha_inicio?: string | null;
	fecha_fin?: string | null;
}

/** RF-06: circuito de aprobación de publicidades y difusiones (tabla estado_aprobacion). */
export type EstadoAprobacion = 'pendiente' | 'aprobada' | 'rechazada' | 'finalizada';

/** RF-06: difusión de una colecta o evento solidario; se pide sin cuenta y requiere aprobación. */
export interface Difusion {
	id: number;
	tipo: 'colecta' | 'evento';
	titulo: string;
	descripcion: string;
	url_imagen?: string | null;
	/** Solo en la bandeja del superadmin (y en la respuesta al crearla): la portada no los trae. */
	solicitante_nombre?: string;
	solicitante_contacto?: string;
	estado: EstadoAprobacion;
	fecha_inicio?: string | null;
	fecha_fin?: string | null;
	creado_en: string;
}

/** Lo que muestra el carrusel de portada: publicidades de comercios y difusiones (sin comercio). */
export interface ItemCarrusel {
	id: string;
	/** `null` = difusión de una colecta o evento, sin ficha de comercio. */
	empresa_id: number | null;
	empresa_slug?: string;
	titulo: string;
	descripcion: string;
	url_imagen: string;
}

/** Resumen de actividad del comercio para un período (se calcula a pedido y se descarga en PDF). */
export interface ResumenComercio {
	empresa_id: number;
	empresa_nombre: string;
	desde: string;
	hasta: string;
	turnos: {
		turnos: number;
		online: number;
		mostrador: number;
		confirmados: number;
		completados: number;
		cancelados: number;
		no_asistio: number;
	};
	calificaciones: number;
	calificacion_promedio: number | null;
	favoritos_nuevos: number;
	por_dia: { fecha: string; turnos: number; cancelados: number }[];
}

/** Horarios agrupados por día: { "Lunes": ["09:00-13:00", "14:00-18:00"], ... } */
export type HorariosPorDia = Record<string, string[]>;

export interface MiTurno {
	id: number;
	fecha: string;
	hora: string;
	estado: string;
	empresa_nombre: string;
	/** Para enlazar a la ficha sin otro fetch. Opcional por compat con backend viejo. */
	empresa_id?: number;
	empresa_slug?: string;
	/** Para agregar el turno al calendario. */
	empresa_direccion?: string;
	duracion_min?: number | null;
	/** RF-13: el turno ya tiene su calificación (solo se califica una vez). */
	calificado?: boolean;
}

/** Turno visto desde el panel del comercio (con el nombre del cliente). */
export interface TurnoRecibido {
	id: number;
	fecha: string;
	hora: string;
	estado: string;
	cliente_nombre: string;
	/** Canal de contacto: correo de la cuenta o el que dejó quien no tiene cuenta. */
	cliente_email?: string | null;
	/** true si el comercio lo agendó a mano para alguien sin cuenta. */
	sin_cuenta?: boolean;
	/** 'online' (reserva del cliente) o 'mostrador' (lo cargó el comercio). */
	origen?: 'online' | 'mostrador';
	nota?: string | null;
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
	descripcion: string;
	resuelto: boolean;
	creado_en: string;
}

export interface PuntoMapa {
	id: number;
	nombre: string;
	lat: number;
	lng: number;
	rubro_id?: number;
	/** Slug SEO para popup/enlace; cae a id si falta. */
	slug?: string;
	verificado?: boolean;
}
