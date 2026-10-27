// Corre la CLI de Supabase con las variables de .env.local.
// Existe porque los scripts de npm en Windows corren en cmd.exe, donde `$VAR` no se expande.
//
//   node scripts/supabase.mjs push    → aplica supabase/migrations/ al proyecto cloud
//   node scripts/supabase.mjs types   → regenera lib/supabase/database.types.ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const { SUPABASE_DB_URL, SUPABASE_PROJECT_REF } = process.env;
const comando = process.argv[2];

function supabase(args, opciones = {}) {
  const r = spawnSync("npx", ["supabase", ...args], { shell: true, encoding: "utf8", ...opciones });
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? "");
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

if (comando === "push") {
  if (!SUPABASE_DB_URL) throw new Error("Falta SUPABASE_DB_URL en .env.local");
  supabase(["db", "push", "--db-url", `"${SUPABASE_DB_URL}"`, "--include-all"], {
    stdio: "inherit",
  });
} else if (comando === "types") {
  if (!SUPABASE_PROJECT_REF) throw new Error("Falta SUPABASE_PROJECT_REF en .env.local");
  const tipos = supabase([
    "gen",
    "types",
    "typescript",
    "--project-id",
    SUPABASE_PROJECT_REF,
    "--schema",
    "public",
  ]);
  writeFileSync("lib/supabase/database.types.ts", tipos);
  console.log("Tipos generados en lib/supabase/database.types.ts");
} else {
  console.error("Uso: node scripts/supabase.mjs <push|types>");
  process.exit(1);
}
