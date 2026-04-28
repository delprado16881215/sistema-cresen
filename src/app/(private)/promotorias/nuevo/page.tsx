import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { PromotoriaForm } from '@/modules/promotorias/promotoria-form';
import { getPromotoriaFormCatalogs } from '@/server/repositories/promotoria-repository';

export default async function NuevaPromotoriaPage() {
  await requirePermission(PERMISSIONS.PROMOTORIAS_WRITE);
  const catalogs = await getPromotoriaFormCatalogs();

  return (
    <section>
      <PageHeader
        title="Nueva promotoría"
        description="Alta de promotoría vinculada a una supervisión."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Promotorías', href: '/promotorias' },
          { label: 'Nuevo' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
        </CardHeader>
        <CardContent>
          <PromotoriaForm mode="create" supervisiones={catalogs.supervisiones} />
        </CardContent>
      </Card>
    </section>
  );
}
