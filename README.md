# Mira Turnos

Sistema de turnos online multi-tenant de **Mira Studio**. Primera demo: veterinaria.

La especificación completa está en [`docs/SPEC.md`](docs/SPEC.md). Decisiones en [`docs/DECISIONES.md`](docs/DECISIONES.md), avance en [`docs/PROGRESO.md`](docs/PROGRESO.md).

## Arrancar

```bash
npm install
cp .env.example .env.local   # y completar
npm run dev
```

La base es un proyecto de Supabase en la nube (no hace falta Docker).

## Scripts

| Script              | Qué hace                                                      |
| ------------------- | ------------------------------------------------------------- |
| `npm run dev`       | Servidor de desarrollo en http://localhost:3000               |
| `npm run lint`      | ESLint                                                        |
| `npm run format`    | Prettier sobre todo el repo                                   |
| `npm run typecheck` | Genera tipos de rutas y corre `tsc`                           |
| `npm test`          | Tests unitarios (Vitest)                                      |
| `npm run test:db`   | Tests contra la base de Supabase (necesita `SUPABASE_DB_URL`) |
| `npm run test:e2e`  | Tests end-to-end en viewport de celular (Playwright)          |
| `npm run db:push`   | Aplica `supabase/migrations/` al proyecto cloud               |
| `npm run db:types`  | Regenera `lib/supabase/database.types.ts`                     |
