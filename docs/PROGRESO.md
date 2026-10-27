# Progreso

## Fase 1 — Setup ✅ (2026-10-27)

- Next.js 16.4 (App Router, TS estricto, React Compiler, Cache Components) + Tailwind 4 + shadcn/ui (base-nova, Base UI).
- Variable `--color-marca` (default verde azulado) conectada a `--primary` y `--ring`: botones y foco toman el color de cada negocio.
- ESLint + Prettier (con orden de clases de Tailwind), Vitest (proyectos `unit` y `db`), Playwright (viewport Pixel 7).
- Supabase: proyecto cloud `mira-turnos` en lugar de CLI local con Docker (ver DECISIONES). `supabase init` para versionar migraciones; `scripts/supabase.mjs` para `db:push` y `db:types`.
- Clientes de Supabase en `lib/supabase/server.ts` y `client.ts` (`@supabase/ssr`).
- Estructura de carpetas de la sección 13 y `.env.example`.

**Tests**: `npm test` 1/1 · `npm run test:db` 1/1 (la app llega a Supabase cloud) · `npm run test:e2e` 1/1 (home en celular, levanta `npm run dev`) · `lint` y `typecheck` limpios.
