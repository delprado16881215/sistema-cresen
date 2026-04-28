import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { PromotoriaForm } from '@/modules/promotorias/promotoria-form';
import { findPromotoriaById, getPromotoriaFormCatalogs } from '@/server/repositories/promotoria-repository';

export default async function EditarPromotoriaPage({ params }: { params: Promise<{ promotoriaId: string }> }) {
  await requirePermission(PERMISSIONS.PROMOTORIAS_WRITE);
  const { promotoriaId } = await params;
  const [promotoria, catalogs] = await Promise.all([
    findPromotoriaById(promotoriaId),
    getPromotoriaFormCatalogs(),
  ]);
  if (!promotoria) notFound();

  return (
    <section>
      <PageHeader
        title="Editar promotoría"
        description={promotoria.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Promotorías', href: '/promotorias' },
          { label: promotoria.code, href: `/promotorias/${promotoria.id}` },
          { label: 'Editar' },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Actualización de promotoría</CardTitle>
        </CardHeader>
        <CardContent>
          <PromotoriaForm
            mode="edit"
            promotoriaId={promotoria.id}
            supervisiones={catalogs.supervisiones}
            defaultValues={{
              code: promotoria.code,
              name: promotoria.name,
              supervisionId: promotoria.supervisionId ?? '',
              isActive: promotoria.isActive,
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
