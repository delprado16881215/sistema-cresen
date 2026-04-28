import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { CreditosImportPage } from '@/modules/creditos/import/creditos-import-page';

export default async function ImportarCreditosPage() {
  await requirePermission(PERMISSIONS.CREDITOS_WRITE);

  return (
    <section>
      <PageHeader
        title="Importar ventas / créditos"
        description="Carga masiva de créditos históricos o de colocación desde Excel con validación previa."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Créditos', href: '/creditos' },
          { label: 'Importar' },
        ]}
      />
      <CreditosImportPage />
    </section>
  );
}
