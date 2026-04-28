import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { ClientesImportPage } from '@/modules/clientes/import/clientes-import-page';

export default async function ImportarClientesPage() {
  await requirePermission(PERMISSIONS.CLIENTES_WRITE);

  return (
    <section>
      <PageHeader
        title="Importar clientes"
        description="Carga masiva con validación previa, detección de duplicados y confirmación controlada."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Clientes', href: '/clientes' },
          { label: 'Importar' },
        ]}
      />
      <ClientesImportPage />
    </section>
  );
}
