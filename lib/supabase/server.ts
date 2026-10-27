import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components, Server Actions y Route Handlers.
// Actúa con la sesión del usuario (cookies), así que RLS se aplica normalmente.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component: no puede escribir cookies.
            // Lo resuelve el proxy que refresca la sesión (Fase 6).
          }
        },
      },
    },
  );
}
