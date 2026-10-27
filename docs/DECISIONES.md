# Decisiones

Registro de decisiones que la spec no define o que la ajustan. Cada una con su porqué.

## Fase 1 — Setup

### Supabase en la nube en lugar de Supabase CLI local

- **Decisión**: no usamos `supabase start` (requiere Docker). Desarrollo y tests corren contra un proyecto de Supabase en la nube (`mira-turnos`, ref `dzvfctgpuswwptvfbhmw`, región us-east-2).
- **Por qué**: pedido explícito; evita instalar Docker Desktop. La CLI se sigue usando para versionar migraciones (`supabase/migrations/`), aplicarlas (`supabase db push`) y generar tipos (`supabase gen types --project-id`), que no necesitan Docker.
- **Consecuencia**: el criterio "`supabase start` anda" de la Fase 1 se reemplaza por "la app se conecta al proyecto cloud". Los tests de base corren dentro de transacciones que se revierten (`rollback`), así no dejan basura.
- **A futuro**: cuando haya clientes reales en producción, crear un segundo proyecto (`mira-turnos-dev`) para desarrollo y tests. El plan gratuito permite dos.

### Estructura sin `src/`

- La sección 13 pone `app/`, `lib/`, `components/` en la raíz; seguimos eso.
