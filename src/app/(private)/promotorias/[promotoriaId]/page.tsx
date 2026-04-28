import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { findPromotoriaById } from '@/server/repositories/promotoria-repository';

function formatCurrency(value: string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(value));
}

export default async function PromotoriaDetailPage({ params }: { params: Promise<{ promotoriaId: string }> }) {
  await requirePermission(PERMISSIONS.PROMOTORIAS_READ);
  const { promotoriaId } = await params;
  const promotoria = await findPromotoriaById(promotoriaId);
  if (!promotoria) notFound();

  return (
    <section>
      <PageHeader
        title={promotoria.name}
        description={`Clave: ${promotoria.code}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Promotorías', href: '/promotorias' },
          { label: promotoria.code },
        ]}
        action={
          <Button asChild variant="secondary">
            <Link href={`/promotorias/${promotoria.id}/editar`}>Editar</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Detalle de promotoría</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Item label="Clave">{promotoria.code}</Item>
          <Item label="Estado">{promotoria.isActive ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</Item>
          <Item label="Supervisión">{promotoria.supervision?.name ?? 'Sin supervisión'}</Item>
          <Item label="Clientes asignados">{String(promotoria.clientes.length)}</Item>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Clientes vinculados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {promotoria.clientes.length ? promotoria.clientes.map((cliente) => (
            <div key={cliente.id} className="rounded-xl border border-border/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{cliente.fullName}</p>
                  <p className="text-sm text-muted-foreground">{cliente.code}</p>
                </div>
                <Badge variant={cliente.isActive ? 'success' : 'secondary'}>
                  {cliente.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No hay clientes asignados a esta promotoría.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Créditos recientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {promotoria.creditos.length ? promotoria.creditos.map((credito) => (
            <div key={credito.id} className="rounded-xl border border-border/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-primary">{credito.folio}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(String(credito.principalAmount))} · semanal {formatCurrency(String(credito.weeklyAmount))}
                  </p>
                </div>
              </div>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No hay créditos recientes en esta promotoría.</p>
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
