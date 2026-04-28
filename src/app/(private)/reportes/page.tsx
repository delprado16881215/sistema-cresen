import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import { PromotoriaCollectionDetailTable } from '@/modules/reportes/promotoria-collection-detail-table';
import { PromotoriaReportTable } from '@/modules/reportes/promotoria-report-table';
import { ReportMetricCard } from '@/modules/reportes/report-metric-card';
import { SupervisionReportTable } from '@/modules/reportes/supervision-report-table';
import {
  getCollectionReportsByDay,
  type CollectionScope,
} from '@/server/services/reportes-service';
import { normalizeToIsoDate } from '@/lib/date-input';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SCOPE_OPTIONS: Array<{ value: CollectionScope; label: string }> = [
  { value: 'active', label: 'Solo activos' },
  { value: 'active_with_extra_week', label: 'Activos con SE' },
  { value: 'overdue', label: 'Vencidos' },
  { value: 'all', label: 'Todos' },
];

function getDefaultDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function parseScope(value: string | undefined): CollectionScope {
  return SCOPE_OPTIONS.some((option) => option.value === value)
    ? (value as CollectionScope)
    : 'active';
}

export default async function ReportesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.REPORTES_READ);

  const raw = await searchParams;
  const rawDate = typeof raw.date === 'string' && raw.date ? raw.date : undefined;
  const rawPromotoriaId =
    typeof raw.promotoriaId === 'string' && raw.promotoriaId.trim()
      ? raw.promotoriaId
      : undefined;
  const selectedDate = normalizeToIsoDate(rawDate) ?? getDefaultDate();
  const scope = parseScope(typeof raw.scope === 'string' ? raw.scope : undefined);
  const reports = await getCollectionReportsByDay({ occurredAt: selectedDate, scope });
  const selectedPromotoria =
    reports.byPromotoria.find((row) => row.promotoriaId === rawPromotoriaId) ??
    reports.byPromotoria.find((row) => row.creditRows > 0) ??
    reports.byPromotoria[0] ??
    null;

  return (
    <section>
      <PageHeader
        title="Reportes operativos"
        description="Resumen de cobranza construido sobre la misma fuente operativa que Pagos Grupales."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reportes' }]}
        action={
          <Button asChild variant="outline">
            <Link href="/reportes/hoja-pagos">Hoja de pagos por venta</Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros operativos</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[220px_220px_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha operativa</label>
              <Input type="date" name="date" defaultValue={selectedDate} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Alcance</label>
              <Select name="scope" defaultValue={scope}>
                {SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Detalle de promotoría</label>
              <Select name="promotoriaId" defaultValue={selectedPromotoria?.promotoriaId ?? ''}>
                <option value="">Seleccionar automáticamente</option>
                {reports.byPromotoria.map((row) => (
                  <option key={row.promotoriaId} value={row.promotoriaId}>
                    {row.promotoriaName}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="accent">
              Actualizar reporte
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Fuente de verdad: Pagos Grupales</p>
            <p>
              Cada promotoría se arma desde la misma consulta que usa Pagos para `preview` e
              `historical`, incluyendo cierre operativo, recuperado final y semana 13.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          label="Promotorías históricas"
          value={String(reports.daily.promotoriasHistorical)}
          helper="Ya existe impacto registrado para la fecha."
        />
        <ReportMetricCard
          label="Promotorías preview"
          value={String(reports.daily.promotoriasPreview)}
          helper="Aún no existe impacto registrado para la fecha."
        />
        <ReportMetricCard
          label="Créditos en grupo"
          value={String(reports.daily.creditRows)}
          helper="Filas operativas devueltas por el alcance seleccionado."
        />
        <ReportMetricCard label="DE operativo" value={formatCurrency(reports.daily.deTotal)} />
        <ReportMetricCard
          label="Entrega histórica"
          value={formatCurrency(reports.daily.totalToDeliver)}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ReportMetricCard
          label="Fallas históricas"
          value={formatCurrency(reports.daily.failureAmount)}
        />
        <ReportMetricCard
          label="Recuperado histórico"
          value={formatCurrency(reports.daily.recoveryAmount)}
        />
        <ReportMetricCard
          label="Recuperado pendiente"
          value={formatCurrency(reports.daily.recoveryPendingAmount)}
        />
        <ReportMetricCard
          label="Adelanto disponible"
          value={formatCurrency(reports.daily.advanceAvailableAmount)}
        />
        <ReportMetricCard
          label="Semana 13 pendiente"
          value={formatCurrency(reports.daily.extraWeekPendingAmount)}
        />
        <ReportMetricCard
          label="Caja final histórica"
          value={formatCurrency(reports.daily.finalCashAmount)}
        />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumen por promotoría</CardTitle>
          </CardHeader>
          <CardContent>
            <PromotoriaReportTable
              rows={reports.byPromotoria.map((row) => ({
                promotoriaId: row.promotoriaId,
                promotoriaCode: row.promotoriaCode,
                promotoriaName: row.promotoriaName,
                supervisionName: row.supervisionName,
                mode: row.mode,
                creditRows: row.creditRows,
                deTotal: row.deTotal,
                failureAmount: row.failureAmount,
                recoveryAmount: row.recoveryAmount,
                incomingAdvanceAmount: row.incomingAdvanceAmount,
                outgoingAdvanceAmount: row.outgoingAdvanceAmount,
                extraWeekCollectedAmount: row.extraWeekCollectedAmount,
                recoveryPendingAmount: row.recoveryPendingAmount,
                extraWeekPendingAmount: row.extraWeekPendingAmount,
                totalToDeliver: row.totalToDeliver,
                finalCashAmount: row.finalCashAmount,
                finalClosureRows: row.finalClosureRows,
                recoveryOnlyRows: row.recoveryOnlyRows,
                extraWeekOnlyRows: row.extraWeekOnlyRows,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen por supervisión</CardTitle>
          </CardHeader>
          <CardContent>
            <SupervisionReportTable
              rows={reports.bySupervision.map((row) => ({
                supervisionId: row.supervisionId,
                supervisionCode: row.supervisionCode,
                supervisionName: row.supervisionName,
                promotorias: row.promotorias,
                promotoriasHistorical: row.promotoriasHistorical,
                promotoriasPreview: row.promotoriasPreview,
                creditRows: row.creditRows,
                deTotal: row.deTotal,
                failureAmount: row.failureAmount,
                recoveryAmount: row.recoveryAmount,
                recoveryPendingAmount: row.recoveryPendingAmount,
                extraWeekPendingAmount: row.extraWeekPendingAmount,
                totalToDeliver: row.totalToDeliver,
                finalCashAmount: row.finalCashAmount,
              }))}
            />
          </CardContent>
        </Card>

        {selectedPromotoria ? (
          <Card>
            <CardHeader>
              <CardTitle>Detalle de promotoría</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedPromotoria.promotoriaName}
                </span>
                <Badge variant={selectedPromotoria.mode === 'historical' ? 'success' : 'warning'}>
                  {selectedPromotoria.mode === 'historical' ? 'Histórico' : 'Preview'}
                </Badge>
                <span>{selectedPromotoria.supervisionName ?? 'Sin supervisión'}</span>
                <span>·</span>
                <span>{selectedPromotoria.creditRows} filas</span>
                {selectedPromotoria.mode === 'historical' ? (
                  <>
                    <span>·</span>
                    <span>Entrega {formatCurrency(selectedPromotoria.totalToDeliver)}</span>
                    <span>·</span>
                    <span>Caja final {formatCurrency(selectedPromotoria.finalCashAmount)}</span>
                  </>
                ) : (
                  <>
                    <span>·</span>
                    <span>
                      Recuperado pendiente {formatCurrency(selectedPromotoria.recoveryPendingAmount)}
                    </span>
                    <span>·</span>
                    <span>
                      Semana 13 pendiente {formatCurrency(selectedPromotoria.extraWeekPendingAmount)}
                    </span>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <PromotoriaCollectionDetailTable collection={selectedPromotoria.collection} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
