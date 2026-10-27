import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Mira Turnos</h1>
      <p className="text-muted-foreground">
        Una página donde tus clientes sacan turno solos, con recordatorio automático.
      </p>
      <Button size="lg" className="h-11 px-6">
        Próximamente
      </Button>
      <footer className="mt-8 text-xs text-muted-foreground">Hecho por Mira Studio</footer>
    </main>
  );
}
