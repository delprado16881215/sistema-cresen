import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { getServerSessionOrThrow } from '@/lib/rbac';
import { OfflineModeProvider } from '@/offline/offline-mode-provider';

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSessionOrThrow();

  const permissions = session.user.permissions ?? [];

  return (
    <div className="min-h-screen bg-transparent md:grid md:grid-cols-[18rem_1fr]">
      <Sidebar permissions={permissions} />
      <div className="min-w-0">
        <OfflineModeProvider
          currentUser={{
            id: session.user.id,
            name: session.user.name ?? null,
          }}
        >
          <Topbar />
          <main className="p-6 lg:p-8">{children}</main>
        </OfflineModeProvider>
      </div>
    </div>
  );
}
