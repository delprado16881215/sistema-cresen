import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { ClienteForm } from '@/modules/clientes/cliente-form';

export default async function NuevoClientePage() {
  await requirePermission(PERMISSIONS.CLIENTES_WRITE);

  return (
    <section>
      <PageHeader
        title="Nuevo cliente"
        description="Registro completo de datos operativos y clasificación comercial."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Clientes', href: '/clientes' },
          { label: 'Nuevo' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Información general</CardTitle>
        </CardHeader>
        <CardContent>
          <ClienteForm mode="create" />
        </CardContent>
      </Card>
    </section>
  );
}
