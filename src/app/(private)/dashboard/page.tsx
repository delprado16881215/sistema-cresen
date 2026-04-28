import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/modules/dashboard/kpi-card';
import { getDashboardMetrics } from '@/modules/dashboard/dashboard-service';

export default async function DashboardPage() {
  await requirePermission(PERMISSIONS.DASHBOARD_READ);
  const metrics = await getDashboardMetrics();

  return (
    <section>
      <PageHeader
        title="Dashboard Ejecutivo"
        description="Vista rápida de operación y accesos directos a módulos clave."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Clientes activos" value={metrics.clientesActivos} hint="Base vigente" />
        <KpiCard label="Clientes inactivos" value={metrics.clientesInactivos} hint="Baja lógica" />
        <KpiCard label="Usuarios activos" value={metrics.usuariosActivos} hint="Operadores habilitados" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-between" variant="secondary">
              <Link href="/clientes">
                Gestionar clientes
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="w-full justify-between" variant="outline">
              <Link href="/clientes/nuevo">
                Registrar cliente
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild className="w-full justify-between" variant="outline">
              <Link href="/creditos/nuevo">
                Originar crédito
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas métricas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Espacio reservado para DE, mora, multas, recuperaciones y productividad por promotoría en fases 2-4.
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
