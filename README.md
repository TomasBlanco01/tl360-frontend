# TL360 — Directorio Comercial y Turnos de Trenque Lauquen

Proyecto final universitario — **Frontend Web Moderno** del directorio comercial y sistema de reserva de turnos de la ciudad de Trenque Lauquen.

Plataforma que conecta vecinos con comercios locales: búsqueda por rubro, fichas con contacto multicanal, mapa, y agenda online con turnero por franjas horarias.

> **Entrega evaluable 100% standalone:** este repositorio es autónomo. No requiere backend ni base de datos para su corrección gracias al **Modo Mock** en memoria.

---

## Guía Rápida de Inicio (Quickstart)

Requisitos: **Node.js 20+** y **npm 10+**.

```bash
git clone https://github.com/TomasBlanco01/tl360-frontend.git
cd tl360-frontend
npm install
npm run dev
```

Abrir **http://localhost:5173** — la aplicación carga con datos de ejemplo completos sin configuración adicional.

Otros comandos:

```bash
npm run build        # Build de producción (SvelteKit + Vite)
npm run preview      # Previsualizar build
npm run check        # Verificación de tipos (svelte-check + TypeScript)
npm test             # Tests unitarios y de integración (Vitest + Testing Library)
npm run test:coverage # Cobertura (reporte HTML en coverage/)
```

> **Nota Windows:** el adapter Vercel crea symlinks en `.vercel/output/functions` al empaquetar. En Windows sin Modo Desarrollador puede fallar con `EPERM` solo en esa fase final; el build de SvelteKit (`vite build`) completa correctamente. En CI/CD Linux (Vercel) no ocurre.

---

## Modo Mock — Evaluación sin Dependencias Externas

Con `PUBLIC_MOCK_MODE=true` (valor por defecto documentado en `.env.example`), el frontend **emula el 100% de las respuestas de API en memoria** sin tocar ningún backend ni base de datos.

*   **Implementación:** `src/lib/api.ts` delega a `src/lib/mock/handler.ts` + datos seed en `src/lib/mock/data.ts` (27 rubros, 54 comercios, horarios, teléfonos, fotos, turnos).
*   **Activación:** copiar `.env.example` a `.env` — ya viene con `PUBLIC_MOCK_MODE=true`. No se requiere configurar `PUBLIC_API_URL`.
*   **Datos en memoria:** viven solo en la pestaña del navegador; **se resetean al recargar** la página. Ideal para recorrer todas las pantallas con contenido realista.
*   **Backend real (opcional):** para consumir el backend Rust/Axum o Express, poner `PUBLIC_MOCK_MODE=false` y apuntar `PUBLIC_API_URL=http://localhost:3001` con el backend corriendo.

Variables de entorno (ver `.env.example`):

```ini
PUBLIC_API_URL=http://localhost:3001
PUBLIC_MOCK_MODE=true
```

---

## Cuentas Demo para la Corrección

En modo mock **cualquier contraseña es válida** (no se valida). Usar estos emails para probar cada rol:

| Email | Rol | Qué probar |
|---|---|---|
| `cliente@demo.com` | Cliente | Buscar comercios, reservar turnos, favoritos, historial en `/cuenta`, mapa |
| `negocio@demo.com` | Comercio | Gestionar ficha, horarios, colaboradores, teléfonos múltiples, fotos, redes sociales, publicidades en `/negocio` (ficha pre-cargada: "Estilo Urbano Peluquería") |
| `admin@demo.com` | Superadmin | ABM de rubros/categorías y moderación en `/admin` |

También funciona cualquier otro email no listado — ingresará como `cliente`.

---

## Funcionalidades Implementadas

*   **Directorio:** listado con búsqueda por nombre, filtro por rubro (17 rubros con reserva + 10 solo-contacto), tarjetas con calificación y badge de estado.
*   **Ficha de comercio:** horarios semanales, teléfonos múltiples con Llamar/WhatsApp, fotos, Instagram/Facebook, mapa embebido, indicador abierto/cerrado, favoritos.
*   **Turnero:** selección de fecha → grilla de slots por duración configurable → confirmación; maneja solapamientos (409), feriados y filtrado de horas pasadas.
*   **Dashboards:** Cliente (`/cuenta` — Mis Turnos / Favoritos), Comercio (`/negocio` — Mi Ficha / Horarios / Turnos recibidos / Publicidades), Superadmin (`/admin` — ABM categorías).
*   **Extras:** tema claro/oscuro + color de acento personalizable, autenticación JWT (mock), validaciones consistentes, manejo de errores y 401 con logout automático.

**Estructura de rutas:**

```
src/routes/
  +page.svelte                         # Home: hero, buscador, categorías, comercios
  auth/login, auth/register            # Autenticación
  auth/recuperar, auth/reset           # Recuperación de contraseña
  comercios/+page.svelte               # Listado y búsqueda
  comercios/[id]/+page.svelte          # Ficha de comercio
  comercios/[id]/reservar/+page.svelte # Turnero
  cuenta/+page.svelte                  # Dashboard cliente
  negocio/+page.svelte                 # Dashboard comercio
  admin/+page.svelte                   # Panel superadmin
  mapa/+page.svelte                    # Mapa de comercios
```

---

## Stack Tecnológico

| Tecnología | Versión / Uso |
|---|---|
| **Svelte 5** | Runes (`$state`, `$derived`) — reactividad moderna |
| **SvelteKit 2** | Framework full-stack, SSR deshabilitado (`ssr=false`) por auth en localStorage |
| **Tailwind CSS v4** | Estilos con tokens de marca en `src/routes/layout.css` (`@theme`) |
| **TypeScript** | Tipado estricto |
| **Lucide Icons** | Iconografía (`@lucide/svelte`) |
| **Vite 8** | Bundler y dev server |
| **Vitest + Testing Library** | Tests unitarios, de componentes y de pantallas (`jsdom`) |
| **SweetAlert2** | Diálogos de confirmación |

---

## Desarrollo y Tests

```bash
npm run check         # svelte-check
npm test              # una corrida (Vitest)
npm run test:watch    # modo interactivo
npm run test:coverage # reporte HTML en coverage/
```

Los tests no dependen del `.env` local: `src/tests/setup.ts` mockea `PUBLIC_API_URL` y `PUBLIC_MOCK_MODE`, y cada pantalla se prueba contra `api` simulado (`vi.mock('$lib/api')`). Cobertura incluye `src/lib/**` y `src/routes/**`.

---

## Autor

Proyecto Final — Desarrollo de Software — UTN FRTL — Trenque Lauquen (2026).

Frontend por **Tomas Blanco** — [tl360-frontend](https://github.com/TomasBlanco01/tl360-frontend).

> Backend en Rust/Axum (`tl360-backend`) se entrega en etapa posterior y no forma parte de este repositorio.
