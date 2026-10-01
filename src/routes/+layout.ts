// Fase puente: el backend Express actual solo maneja JWT vía localStorage
// (sin cookies de sesión), así que este frontend se sirve 100% client-side,
// igual que la SPA de Vite/React que reemplaza.
export const ssr = false;
