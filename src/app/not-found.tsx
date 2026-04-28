import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-soft">
        <h1 className="font-display text-3xl font-semibold text-primary">Página no encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground">El recurso que buscas no existe o fue movido.</p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Volver al dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
