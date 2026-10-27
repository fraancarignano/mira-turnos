import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Dos proyectos:
// - unit: lógica pura, rápida, sin red.
// - db: contra el proyecto de Supabase en la nube (lee .env.local). Cada test corre
//   en una transacción que se revierte, así no deja datos.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          env: loadEnv("test", process.cwd(), ""),
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // Una sola conexión a la vez: los archivos no compiten por el pooler.
          fileParallelism: false,
        },
      },
    ],
  },
});
