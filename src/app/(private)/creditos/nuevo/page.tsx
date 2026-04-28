import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditoForm } from '@/modules/creditos/credito-form';
import { getCreditoFormCatalogs } from '@/modules/creditos/catalog-service';

export default async function NuevoCreditoPage() {
  await requirePermission(PERMISSIONS.CREDITOS_WRITE);
  const catalogs = await getCreditoFormCatalogs();

  if (!catalogs.promotorias.length || !catalogs.planes.length) {
    notFound();
  }

  return (
    <section>
      <PageHeader
        title="Nueva venta grupal"
        description="Originación semanal por promotoría, con lista temporal de clientes y control compartido."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Créditos', href: '/creditos' },
          { label: 'Nueva venta' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Originación grupal de venta</CardTitle>
        </CardHeader>
        <CardContent>
          <CreditoForm
            promotorias={catalogs.promotorias}
            planes={catalogs.planes}
          />
        </CardContent>
      </Card>
    </section>
  );
}
