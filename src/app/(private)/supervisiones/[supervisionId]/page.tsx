import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { findSupervisionById } from '@/server/repositories/supervision-repository';

export default async function SupervisionDetailPage({ params }: { params: Promise<{ supervisionId: string }> }) {
  await requirePermission(PERMISSIONS.SUPERVISIONES_READ);
  const { supervisionId } = await params;
  const supervision = await findSupervisionById(supervisionId);
  if (!supervision) notFound();

  return (
    <section>
      <PageHeader
        title={supervision.name}
        description={`Clave: ${supervision.code}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Supervisiones', href: '/supervisiones' },
          { label: supervision.code },
        ]}
        action={
          <Button asChild variant="secondary">
            <Link href={`/supervisiones/${supervision.id}/editar`}>Editar</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Detalle de supervisión</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Item label="Clave">{supervision.code}</Item>
          <Item label="Estado">{supervision.isActive ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</Item>
          <Item label="Promotorías">{String(supervision.promotorias.length)}</Item>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Promotorías relacionadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {supervision.promotorias.length ? supervision.promotorias.map((promotoria) => (
            <div key={promotoria.id} className="rounded-xl border border-border/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{promotoria.name}</p>
                  <p className="text-sm text-muted-foreground">{promotoria.code}</p>
                </div>
                <Badge variant={promotoria.isActive ? 'success' : 'secondary'}>
                  {promotoria.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Aún no hay promotorías asignadas a esta supervisión.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
