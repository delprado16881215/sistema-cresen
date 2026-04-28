import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { OfflineConnectionIndicator } from '@/offline/offline-connection-indicator';

export async function Topbar() {
  const session = await auth();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white/80 px-6 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Operación financiera</p>
        <p className="font-medium text-primary">Panel administrativo</p>
      </div>
      <div className="flex items-center gap-3">
        <OfflineConnectionIndicator />
        <div className="text-right">
          <p className="text-sm font-semibold text-primary">{session?.user?.name ?? 'Usuario'}</p>
          <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
        >
          <Button variant="outline" size="sm" type="submit">
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
