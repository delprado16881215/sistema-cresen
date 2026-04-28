import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { SupervisionForm } from '@/modules/supervisiones/supervision-form';
import { findSupervisionById } from '@/server/repositories/supervision-repository';

export default async function EditarSupervisionPage({ params }: { params: Promise<{ supervisionId: string }> }) {
  await requirePermission(PERMISSIONS.SUPERVISIONES_WRITE);
  const { supervisionId } = await params;
  const supervision = await findSupervisionById(supervisionId);
  if (!supervision) notFound();

  return (
    <section>
      <PageHeader
        title="Editar supervisión"
        description={supervision.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Supervisiones', href: '/supervisiones' },
          { label: supervision.code, href: `/supervisiones/${supervision.id}` },
          { label: 'Editar' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Actualización de supervisión</CardTitle>
        </CardHeader>
        <CardContent>
          <SupervisionForm
            mode="edit"
            supervisionId={supervision.id}
            defaultValues={{
              code: supervision.code,
              name: supervision.name,
              isActive: supervision.isActive,
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
