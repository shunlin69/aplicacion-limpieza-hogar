# Casa Limpia

App web instalable (PWA) para repartir los turnos de limpieza de la casa de forma
automática, justa y visible para toda la familia.

- **Frontend:** React + Vite + TypeScript, publicada en GitHub Pages.
- **Backend:** Supabase (autenticación, base de datos Postgres con RLS, tiempo real y Edge Functions).

> Este README es provisional. La versión completa (instalar, ejecutar e invitar a la
> familia) se escribe en la Fase 8.

## Desarrollo local

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas automáticas (Vitest)
npm run build    # compila a dist/
```

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `src/core` | Lógica pura y probada (rotación, fechas, puntos, códigos) |
| `src/features` | Una carpeta por pestaña: hoy, semana, ranking, tareas, ajustes |
| `src/lib` | Cliente de Supabase, notificaciones push, plataforma |
| `src/state` | Estado global (sesión, hogar, integrantes) |
| `src/ui` | Estilos, tema pastel/oscuro y componentes visuales |
| `src/sw.ts` | Service worker: modo sin conexión y notificaciones |
| `supabase/migrations` | Tablas, políticas RLS y funciones, en orden |
| `supabase/functions` | Edge Functions: `signup` (crear cuenta) y `push` (notificaciones) |
