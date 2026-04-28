import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
        <h1 className="font-display text-3xl font-semibold text-primary">Acceso denegado</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Tu usuario no tiene permisos para ingresar a este módulo.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/dashboard">Volver al dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
