import Link from 'next/link';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { normalizeToIsoDate } from '@/lib/date-input';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CobranzaAlertasCard } from '@/modules/cobranza/cobranza-alertas-card';
import { CobranzaTable } from '@/modules/cobranza/cobranza-table';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import { PromotoriaReportTable } from '@/modules/reportes/promotoria-report-table';
import { ReportMetricCard } from '@/modules/reportes/report-metric-card';
import { SupervisionReportTable } from '@/modules/reportes/supervision-report-table';
import {
  listExpedienteAlertas,
  syncExpedienteAlertasForPortfolio,
} from '@/server/services/expediente-alert-engine';
import {
  getCobranzaWorkbenchData,
  type CobranzaCycleFilter,
  type CobranzaRowModeFilter,
} from '@/server/services/cobranza-service';
import type { CollectionScope } from '@/server/services/reportes-service';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROW_MODE_OPTIONS: Array<{ value: CobranzaRowModeFilter; label: string }> = [
  { value: 'all', label: 'Toda la cartera operativa' },
  { value: 'regular', label: 'Cobranza regular' },
  { value: 'final_closure', label: 'Cierre operativo' },
  { value: 'recovery_only', label: 'Solo recuperado' },
  { value: 'extra_week_only', label: 'Solo semana 13' },
];

const CYCLE_OPTIONS: Array<{ value: CobranzaCycleFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'in_cycle', label: 'En ciclo' },
  { value: 'outside_cycle', label: 'Fuera de ciclo' },
];

function getDefaultDate() {
  return normalizeToIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
}

function parseRowMode(value: string | undefined): CobranzaRowModeFilter {
  return ROW_MODE_OPTIONS.some((option) => option.value === value)
    ? (value as CobranzaRowModeFilter)
    : 'all';
}

function parseCycle(value: string | undefined): CobranzaCycleFilter {
  return CYCLE_OPTIONS.some((option) => option.value === value)
    ? (value as CobranzaCycleFilter)
    : 'all';
}

export default async function CobranzaPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.PAGOS_READ);

  const raw = await searchParams;
  const occurredAt = normalizeToIsoDate(typeof raw.occurredAt === 'string' ? raw.occurredAt : undefined) ?? getDefaultDate();
  const scope: CollectionScope = 'all';
  const supervisionId =
    typeof raw.supervisionId === 'string' && raw.supervisionId.trim()
      ? raw.supervisionId
      : undefined;
  const promotoriaId =
    typeof raw.promotoriaId === 'string' && raw.promotoriaId.trim()
      ? raw.promotoriaId
      : undefined;
  const rowMode = parseRowMode(typeof raw.rowMode === 'string' ? raw.rowMode : undefined);
  const cycle = parseCycle(typeof raw.cycle === 'string' ? raw.cycle : undefined);
  const search = typeof raw.search === 'string' ? raw.search.trim() : '';
  const refreshAlertas =
    (typeof raw.refreshAlertas === 'string' && raw.refreshAlertas === '1') ||
    raw.refreshAlertas === 'true';

  const data = await getCobranzaWorkbenchData({
    occurredAt,
    scope,
    supervisionId,
    promotoriaId,
    rowMode,
    cycle,
    search,
  });

  if (refreshAlertas) {
    await syncExpedienteAlertasForPortfolio({
      occurredAt,
      supervisionId,
      promotoriaId,
    });
  }

  const promotoriaScopeIds = new Set(
    (promotoriaId ? [promotoriaId] : data.options.promotoria.map((option) => option.id)).filter(Boolean),
  );
  const portfolioAlerts = (
    await listExpedienteAlertas({
      ...(promotoriaId ? { promotoriaId } : {}),
      tipoAlerta: 'CLUSTERED_RISK_BY_PROMOTORIA',
      isCurrent: true,
    })
  ).filter((alert) => (alert.promotoriaId ? promotoriaScopeIds.has(alert.promotoriaId) : false));
  const refreshAlertasHref = `/cobranza?${new URLSearchParams({
    occurredAt,
    ...(supervisionId ? { supervisionId } : {}),
    ...(promotoriaId ? { promotoriaId } : {}),
    ...(rowMode !== 'all' ? { rowMode } : {}),
    ...(cycle !== 'all' ? { cycle } : {}),
    ...(search ? { search } : {}),
    refreshAlertas: '1',
  }).toString()}`;

  return (
    <section>
      <PageHeader
        title="Cobranza"
        description="Cartera operativa de cobranza basada en saldo accionable real, construida sobre la fuente vigente de Pagos Grupales y Reportes."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Cobranza' }]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="accent">
              <Link href={`/cobranza/rutas?occurredAt=${data.filters.occurredAt}`}>Rutas de campo</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={refreshAlertasHref}>Recalcular alertas</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/pagos">Pagos grupales</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reportes">Reportes operativos</Link>
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros operativos</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[190px_220px_240px_240px_220px_1fr_auto] xl:items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Fecha operativa</label>
              <Input type="date" name="occurredAt" defaultValue={data.filters.occurredAt} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tipo de cartera</label>
              <Select name="rowMode" defaultValue={data.filters.rowMode}>
                {ROW_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
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
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ciclo técnico</label>
              <Select name="cycle" defaultValue={data.filters.cycle}>
                {CYCLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Buscar</label>
              <Input
                name="search"
                defaultValue={data.filters.search}
                placeholder="Cliente, teléfono, control, folio o dirección"
              />
            </div>
            <Button type="submit" variant="accent">
              Actualizar
            </Button>
          </form>

          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Continuidad operativa validada</p>
            <p>
              La bandeja principal muestra solo saldo accionable real. “Fuera de ciclo” queda como
              lectura técnica secundaria para distinguir cartera que ya salió del ciclo semanal regular.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          label="Cartera accionable"
          value={String(data.daily.creditRows)}
          helper={`${formatCurrency(data.daily.actionableAmount)} · ${data.daily.promotorias} promotorías`}
        />
        <ReportMetricCard
          label="Cobranza regular"
          value={String(data.daily.categories.regular.rows)}
          helper={formatCurrency(data.daily.categories.regular.amount)}
        />
        <ReportMetricCard
          label="Cierre operativo"
          value={String(data.daily.categories.finalClosure.rows)}
          helper={formatCurrency(data.daily.categories.finalClosure.amount)}
        />
        <ReportMetricCard
          label="Solo recuperado"
          value={String(data.daily.categories.recoveryOnly.rows)}
          helper={formatCurrency(data.daily.categories.recoveryOnly.amount)}
        />
        <ReportMetricCard
          label="Solo semana 13"
          value={String(data.daily.categories.extraWeekOnly.rows)}
          helper={formatCurrency(data.daily.categories.extraWeekOnly.amount)}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard
          label="DE regular"
          value={formatCurrency(data.daily.deTotal)}
        />
        <ReportMetricCard
          label="Recup. pendiente"
          value={formatCurrency(data.daily.recoveryPendingAmount)}
        />
        <ReportMetricCard
          label="Semana 13 pendiente"
          value={formatCurrency(data.daily.extraWeekPendingAmount)}
        />
        <ReportMetricCard
          label="Fuera de ciclo"
          value={String(data.daily.outsideCycleRows)}
          helper="Indicador técnico secundario"
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumen por supervisión</CardTitle>
          </CardHeader>
          <CardContent>
            <SupervisionReportTable
              rows={data.bySupervision.map((row) => ({
                supervisionId: row.supervisionId,
                supervisionCode: null,
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

        <Card>
          <CardHeader>
            <CardTitle>Resumen por promotoría</CardTitle>
          </CardHeader>
          <CardContent>
            <PromotoriaReportTable
              rows={data.byPromotoria.map((row) => ({
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
      </div>

      <div className="mb-6">
        <CobranzaAlertasCard
          alerts={portfolioAlerts}
          title="Alertas de revisión por promotoría"
          description="Concentraciones anómalas de expedientes débiles o sospechosos detectadas sobre la cartera operativa actual."
          emptyMessage="No hay alertas activas de concentración anómala para las promotorías filtradas."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bandeja operativa</CardTitle>
        </CardHeader>
        <CardContent>
          <CobranzaTable
            occurredAt={data.filters.occurredAt}
            scope={data.filters.scope}
            rows={data.rows}
          />
        </CardContent>
      </Card>
    </section>
  );
}
