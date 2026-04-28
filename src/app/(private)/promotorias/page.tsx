import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { findPromotorias } from '@/server/repositories/promotoria-repository';
import { listPromotoriasSchema } from '@/server/validators/promotoria';
import { PromotoriasTable } from '@/modules/promotorias/promotorias-table';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PromotoriasPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.PROMOTORIAS_READ);

  const raw = await searchParams;
  const parsed = listPromotoriasSchema.parse({
    search: typeof raw.search === 'string' ? raw.search : undefined,
    isActive: typeof raw.isActive === 'string' ? raw.isActive : 'all',
  });
  const isActive = parsed.isActive === 'all' ? undefined : parsed.isActive === 'true';
  const rows = await findPromotorias({ search: parsed.search, isActive });

  return (
    <section>
      <PageHeader
        title="Promotorías"
        description="Catálogo operativo donde se agrupan clientes y créditos."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Promotorías' }]}
        action={
          <Button asChild variant="accent">
            <Link href="/promotorias/nuevo">Nueva promotoría</Link>
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Promotorías registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <PromotoriasTable
            rows={rows.map((row) => ({
              id: row.id,
              code: row.code,
              name: row.name,
              supervisionName: row.supervision?.name ?? null,
              clientesCount: row.clientes.length,
              isActive: row.isActive,
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}
