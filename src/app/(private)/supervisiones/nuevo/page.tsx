import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { SupervisionForm } from '@/modules/supervisiones/supervision-form';

export default async function NuevaSupervisionPage() {
  await requirePermission(PERMISSIONS.SUPERVISIONES_WRITE);

  return (
    <section>
      <PageHeader
        title="Nueva supervisión"
        description="Alta del catálogo de supervisiones."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Supervisiones', href: '/supervisiones' },
          { label: 'Nuevo' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
        </CardHeader>
        <CardContent>
          <SupervisionForm mode="create" />
        </CardContent>
      </Card>
    </section>
  );
}
