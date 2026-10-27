import { describe, expect, it } from "vitest";

// Reemplaza el criterio "supabase start anda" (no usamos Docker; ver docs/DECISIONES.md):
// la app llega al proyecto cloud con la publishable key.
describe("conexión a Supabase", () => {
  it("la API de Auth responde con la clave pública", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(url, "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local").toBeTruthy();
    expect(key, "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local").toBeTruthy();

    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key! } });
    expect(res.status).toBe(200);
  });
});
