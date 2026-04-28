import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { findSupervisiones } from '@/server/repositories/supervision-repository';
import { SupervisionesTable } from '@/modules/supervisiones/supervisiones-table';
import { listSupervisionesSchema } from '@/server/validators/supervision';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SupervisionesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.SUPERVISIONES_READ);

  const raw = await searchParams;
  const parsed = listSupervisionesSchema.parse({
    search: typeof raw.search === 'string' ? raw.search : undefined,
    isActive: typeof raw.isActive === 'string' ? raw.isActive : 'all',
  });

  const isActive = parsed.isActive === 'all' ? undefined : parsed.isActive === 'true';
  const rows = await findSupervisiones({ search: parsed.search, isActive });

  return (
    <section>
      <PageHeader
        title="Supervisiones"
        description="Catálogo jerárquico superior para ordenar promotorías."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Supervisiones' }]}
        action={
          <Button asChild variant="accent">
            <Link href="/supervisiones/nuevo">Nueva supervisión</Link>
          </Button>
        }
      />
      <SupervisionesTable
        rows={rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          isActive: row.isActive,
          promotoriasCount: row.promotorias.length,
        }))}
        search={parsed.search ?? ''}
        isActive={parsed.isActive}
      />
    </section>
  );
}
