import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { ClientesTable } from '@/modules/clientes/clientes-table';
import { listClientesSchema } from '@/server/validators/cliente';
import { findClientes } from '@/server/repositories/cliente-repository';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ClientesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.CLIENTES_READ);

  const raw = await searchParams;
  const parsed = listClientesSchema.parse({
    search: typeof raw.search === 'string' ? raw.search : undefined,
    isActive: typeof raw.isActive === 'string' ? raw.isActive : 'all',
    page: typeof raw.page === 'string' ? raw.page : '1',
    pageSize: typeof raw.pageSize === 'string' ? raw.pageSize : '10',
  });

  const isActive =
    parsed.isActive === 'all' ? undefined : parsed.isActive === 'true' ? true : false;

  const { rows, total } = await findClientes({
    search: parsed.search,
    isActive,
    page: parsed.page,
    pageSize: parsed.pageSize,
  });

  return (
    <section>
      <PageHeader
        title="Clientes"
        description="Gestión de cartera de clientes con búsqueda operativa y baja lógica."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Clientes' }]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/api/clientes/export?format=csv">Exportar CSV</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/api/clientes/export?format=xlsx">Exportar XLSX</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/api/clientes/export?format=vcf">Exportar para iPhone / Mac (VCF)</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/api/clientes/export?format=vcf-zip">Exportar VCF por bloques (ZIP)</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/clientes/importar">Importar clientes</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/clientes/nuevo">Nuevo cliente</Link>
            </Button>
          </div>
        }
      />

      <ClientesTable
        rows={rows.map((row) => ({
          id: row.id,
          code: row.code,
          fullName: row.fullName,
          phone: row.phone,
          postalCode: row.postalCode,
          city: row.city,
          state: row.state,
          isActive: row.isActive,
          promotoriaName: row.promotoria?.name ?? null,
          supervisionName: row.promotoria?.supervision?.name ?? null,
          clientTypeName: row.clientType?.name ?? null,
        }))}
        total={total}
        page={parsed.page}
        pageSize={parsed.pageSize}
        search={parsed.search ?? ''}
        isActive={parsed.isActive}
      />
    </section>
  );
}
