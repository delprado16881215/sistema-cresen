import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission, getServerSessionOrThrow, hasPermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CommunicationTemplateAdminCard } from '@/modules/comunicaciones/communication-template-admin-card';
import { JuridicoWorkbench } from '@/modules/juridico/juridico-workbench';
import { ReportMetricCard } from '@/modules/reportes/report-metric-card';
import { listMessageTemplates } from '@/server/services/communications-service';
import { getJuridicoWorkbenchData } from '@/server/services/juridico-service';
import { listJuridicoCasesSchema } from '@/server/validators/juridico';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getQueryValue(value: string | string[] | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export default async function JuridicoPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.CREDITOS_READ);
  const session = await getServerSessionOrThrow();

  const raw = await searchParams;
  const parsed = listJuridicoCasesSchema.safeParse({
    promotoriaId: getQueryValue(raw.promotoriaId),
    supervisionId: getQueryValue(raw.supervisionId),
    legalStatus: getQueryValue(raw.legalStatus),
    sentToLegalDate: getQueryValue(raw.sentToLegalDate),
  });
  const filters = parsed.success ? parsed.data : listJuridicoCasesSchema.parse({});
  const [data, templates] = await Promise.all([
    getJuridicoWorkbenchData(filters),
    listMessageTemplates({
      activeOnly: false,
    }),
  ]);
  const canWrite = hasPermission(
    PERMISSIONS.CREDITOS_WRITE,
    (session.user.permissions as string[]) ?? [],
  );

  return (
    <section>
      <PageHeader
        title="Jurídico"
        description="Bandeja jurídica activa basada en eventos append-only. Esta vista no recalcula pagos ni altera la lógica financiera."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Jurídico' }]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/creditos">Créditos</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/cobranza">Cobranza</Link>
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros jurídicos</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[240px_260px_240px_190px_auto] xl:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supervisión</label>
              <Select name="supervisionId" defaultValue={data.filters.supervisionId}>
                <option value="">Todas las supervisiones</option>
                {data.options.supervision.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Promotoría</label>
              <Select name="promotoriaId" defaultValue={data.filters.promotoriaId}>
                <option value="">Todas las promotorías</option>
                {data.options.promotoria.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} · {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Estado jurídico</label>
              <Select name="legalStatus" defaultValue={data.filters.legalStatus}>
                {data.options.legalStatus.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha de envío</label>
              <Input type="date" name="sentToLegalDate" defaultValue={data.filters.sentToLegalDate} />
            </div>
            <Button type="submit" variant="accent">
              Actualizar
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Continuidad validada</p>
            <p>
              La bandeja usa la capa jurídica separada. Pagos, cobranza operativa y cálculo financiero
              permanecen intactos.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard label="Casos activos" value={String(data.metrics.total)} />
        <ReportMetricCard label="Prejurídico" value={String(data.metrics.prelegal)} />
        <ReportMetricCard label="Revisión legal" value={String(data.metrics.legalReview)} />
        <ReportMetricCard label="En demanda" value={String(data.metrics.inLawsuit)} />
      </div>

      {canWrite ? <CommunicationTemplateAdminCard initialTemplates={templates} /> : null}

      <JuridicoWorkbench rows={data.rows} canWrite={canWrite} />
    </section>
  );
}
