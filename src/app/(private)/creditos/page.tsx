import Link from 'next/link';
import { ReversalSourceType } from '@prisma/client';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { listCreditosSchema } from '@/server/validators/credito';
import { findCreditos } from '@/server/repositories/credito-repository';
import { CreditosTable, type CreditoRow } from '@/modules/creditos/creditos-table';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type WeeklyOperationalStatus = CreditoRow['weeklyOperationalStatus'];
type OperationalCreditStatus = CreditoRow['operationalCreditStatus'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(value);
}

function toDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mazatlan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function getWeeklyStatusLabel(status: WeeklyOperationalStatus) {
  if (status === 'OVERDUE') return 'Vencido';
  if (status === 'FAILED') return 'Fallo';
  if (status === 'PENDING') return 'Pendiente';
  if (status === 'ADVANCED') return 'Adelantado';
  return 'Pagado';
}

function getOperationalCreditStatusLabel(status: OperationalCreditStatus) {
  if (status === 'OVERDUE') return 'Vencido';
  if (status === 'ACTIVE_WITH_EXTRA_WEEK') return 'Activo con SE';
  return 'Activo';
}

function buildFilterHref(
  filter: 'all' | 'active' | 'with_failures' | 'pending_today' | 'paid' | 'overdue',
  saleDate?: string,
) {
  const params = new URLSearchParams();
  if (filter !== 'all') {
    params.set('filter', filter);
  }
  if (saleDate) {
    params.set('saleDate', saleDate);
  }
  const query = params.toString();
  return query ? `/creditos?${query}` : '/creditos';
}

function getOperationalWeek(startDateKey: string, todayKey: string) {
  const start = new Date(`${startDateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  const diffInDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

export default async function CreditosPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.CREDITOS_READ);

  const raw = await searchParams;
  const parsed = listCreditosSchema.parse({
    page: typeof raw.page === 'string' ? raw.page : '1',
    pageSize: typeof raw.pageSize === 'string' ? raw.pageSize : '10',
    filter: typeof raw.filter === 'string' ? raw.filter : 'all',
    saleDate: typeof raw.saleDate === 'string' ? raw.saleDate : undefined,
  });

  const { rows, total, totals } = await findCreditos({
    page: parsed.page,
    pageSize: parsed.pageSize,
    saleDate: parsed.saleDate,
  });

  const todayKey = toDateKey(new Date());

  const operationalRows = rows.map((row) => {
    const reversedDefaultIds = new Set(
      row.reversals
        .filter((reversal) => reversal.sourceType === ReversalSourceType.DEFAULT_EVENT)
        .map((reversal) => reversal.sourceId),
    );

    const activeDefaults = row.defaults.filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id));
    const activeFailureAmount = activeDefaults.reduce((sum, defaultEvent) => {
      const recovered = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((recoverySum, recovery) => recoverySum + toNumber(recovery.recoveredAmount), 0);
      return sum + Math.max(0, toNumber(defaultEvent.amountMissed) - recovered);
    }, 0);

    const dueTodayOutstanding = row.schedules.reduce((sum, schedule) => {
      const scheduleDateKey = toDateKey(schedule.dueDate);
      const scheduleOutstanding = Math.max(0, toNumber(schedule.expectedAmount) - toNumber(schedule.paidAmount));
      if (scheduleDateKey <= todayKey && ['PENDING', 'PARTIAL'].includes(schedule.installmentStatus.code)) {
        return sum + scheduleOutstanding;
      }
      return sum;
    }, 0);

    const extraWeekOutstanding =
      row.extraWeek &&
      !['PAID', 'EXEMPT'].includes(row.extraWeek.status) &&
      toDateKey(row.extraWeek.dueDate) <= todayKey
        ? Math.max(0, toNumber(row.extraWeek.expectedAmount) - toNumber(row.extraWeek.paidAmount))
        : 0;

    const totalScheduleOutstanding = row.schedules.reduce((sum, schedule) => {
      return sum + Math.max(0, toNumber(schedule.expectedAmount) - toNumber(schedule.paidAmount));
    }, 0);

    const totalExtraWeekOutstanding =
      row.extraWeek && !['PAID', 'EXEMPT'].includes(row.extraWeek.status)
        ? Math.max(0, toNumber(row.extraWeek.expectedAmount) - toNumber(row.extraWeek.paidAmount))
        : 0;

    const totalOutstanding = totalScheduleOutstanding + totalExtraWeekOutstanding;
    const oldestCollectibleSchedule = row.schedules.find((schedule) => {
      const outstanding = Math.max(0, toNumber(schedule.expectedAmount) - toNumber(schedule.paidAmount));
      return (
        ['PENDING', 'PARTIAL', 'FAILED'].includes(schedule.installmentStatus.code) &&
        toDateKey(schedule.dueDate) <= todayKey &&
        outstanding > 0
      );
    });
    const collectibleTodayAmount = oldestCollectibleSchedule
      ? Math.max(0, toNumber(oldestCollectibleSchedule.expectedAmount) - toNumber(oldestCollectibleSchedule.paidAmount))
      : row.extraWeek &&
          !['PAID', 'EXEMPT'].includes(row.extraWeek.status) &&
          toDateKey(row.extraWeek.dueDate) <= todayKey
        ? Math.max(0, toNumber(row.extraWeek.expectedAmount) - toNumber(row.extraWeek.paidAmount))
        : 0;

    const hasFutureAdvance = row.schedules.some(
      (schedule) => toDateKey(schedule.dueDate) > todayKey && schedule.installmentStatus.code === 'ADVANCED',
    );

    const startDateKey = row.startDate.toISOString().slice(0, 10);
    const operationalWeek = getOperationalWeek(startDateKey, todayKey);
    const operationalCreditStatus: OperationalCreditStatus =
      operationalWeek >= 14 ? 'OVERDUE' : operationalWeek === 13 ? 'ACTIVE_WITH_EXTRA_WEEK' : 'ACTIVE';

    let weeklyOperationalStatus: WeeklyOperationalStatus = operationalCreditStatus === 'OVERDUE' ? 'OVERDUE' : 'PAID';
    let weeklyOperationalAmount = operationalCreditStatus === 'OVERDUE' ? totalOutstanding : 0;

    if (operationalCreditStatus !== 'OVERDUE' && activeFailureAmount > 0) {
      weeklyOperationalStatus = 'FAILED';
      weeklyOperationalAmount = activeFailureAmount;
    } else if (operationalCreditStatus !== 'OVERDUE' && (dueTodayOutstanding > 0 || extraWeekOutstanding > 0)) {
      weeklyOperationalStatus = 'PENDING';
      weeklyOperationalAmount = dueTodayOutstanding + extraWeekOutstanding;
    } else if (operationalCreditStatus !== 'OVERDUE' && hasFutureAdvance) {
      weeklyOperationalStatus = 'ADVANCED';
    }

    const paidToday = row.payments.reduce((sum, payment) => {
      if (payment.isReversed) return sum;
      return toDateKey(payment.receivedAt) === todayKey ? sum + toNumber(payment.amountReceived) : sum;
    }, 0);

    return {
      id: row.id,
      folio: row.folio,
      loanNumber: row.loanNumber,
      controlNumber: row.controlNumber,
      clienteName: row.cliente.fullName,
      avalName: row.aval?.fullName ?? null,
      principalAmountValue: toNumber(row.principalAmount),
      weeklyAmountValue: toNumber(row.weeklyAmount),
      principalAmount: formatCurrency(toNumber(row.principalAmount)),
      weeklyAmount: formatCurrency(toNumber(row.weeklyAmount)),
      totalWeeks: row.totalWeeks,
      promotoriaName: row.promotoria.name,
      supervisionName: row.promotoria.supervision?.name ?? null,
      statusName: row.creditStatus.name,
      creditStatusCode: row.creditStatus.code,
      startDate: startDateKey,
      weeklyOperationalStatus,
      weeklyOperationalLabel: getWeeklyStatusLabel(weeklyOperationalStatus),
      weeklyOperationalAmountValue: weeklyOperationalAmount,
      weeklyOperationalAmount: formatCurrency(weeklyOperationalAmount),
      totalOutstandingValue: totalOutstanding,
      totalOutstanding: formatCurrency(totalOutstanding),
      collectibleTodayAmount,
      paidToday,
      operationalCreditStatus,
      operationalCreditStatusLabel: getOperationalCreditStatusLabel(operationalCreditStatus),
    };
  });

  const filteredRows = operationalRows.filter((row) => {
    if (parsed.filter === 'active') return row.operationalCreditStatus !== 'OVERDUE';
    if (parsed.filter === 'with_failures') return row.weeklyOperationalStatus === 'FAILED';
    if (parsed.filter === 'pending_today') return row.weeklyOperationalStatus === 'PENDING';
    if (parsed.filter === 'paid') return ['PAID', 'ADVANCED'].includes(row.weeklyOperationalStatus);
    if (parsed.filter === 'overdue') return row.operationalCreditStatus === 'OVERDUE';
    return true;
  });

  const activeCycleRows = filteredRows.filter((row) => row.operationalCreditStatus !== 'OVERDUE');
  const overdueRows = filteredRows.filter((row) => row.operationalCreditStatus === 'OVERDUE');

  const expectedToday = filteredRows.reduce((sum, row) => sum + row.collectibleTodayAmount, 0);
  const collectedToday = filteredRows.reduce((sum, row) => sum + row.paidToday, 0);
  const differenceToday = expectedToday - collectedToday;
  const overduePortfolioTotal = overdueRows.reduce((sum, row) => sum + row.totalOutstandingValue, 0);
  const visiblePrincipal = filteredRows.reduce((sum, row) => sum + row.principalAmountValue, 0);
  const debeDeEntregar = activeCycleRows.reduce((sum, row) => sum + row.weeklyAmountValue, 0);
  const overdueCount = filteredRows.filter((row) => row.operationalCreditStatus === 'OVERDUE').length;

  return (
    <section>
      <PageHeader
        title="Créditos"
        description="Cartera operativa de cobranza por control semanal, estado de pago y promotoría."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Créditos' }]}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/creditos/importar">Importar ventas</Link>
            </Button>
            <Button asChild variant="accent">
              <Link href="/creditos/nuevo">Nuevo crédito</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cobro esperado hoy</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-amber-700">
            {formatCurrency(expectedToday)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cobrado hoy</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-emerald-700">
            {formatCurrency(collectedToday)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Diferencia (DE)</CardTitle>
          </CardHeader>
          <CardContent className={`text-3xl font-semibold ${differenceToday > 0 ? 'text-red-700' : 'text-primary'}`}>
            {formatCurrency(differenceToday)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cartera vencida total</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-red-700">
            {formatCurrency(overduePortfolioTotal)}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Créditos visibles</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-primary">{filteredRows.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Monto colocado visible</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-primary">
            {formatCurrency(visiblePrincipal)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Debe de Entregar</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-primary">
            {formatCurrency(debeDeEntregar)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Vencidos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-red-700">{overdueCount}</CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros operativos</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap items-end gap-3" method="GET" action="/creditos">
            {parsed.filter !== 'all' ? <input type="hidden" name="filter" value={parsed.filter} /> : null}
            <div className="w-full max-w-xs space-y-2">
              <label htmlFor="saleDate" className="text-sm font-medium text-foreground">
                Fecha de venta
              </label>
              <Input id="saleDate" name="saleDate" type="date" defaultValue={parsed.saleDate ?? ''} />
            </div>
            <Button type="submit" variant="accent">
              Aplicar fecha
            </Button>
            {parsed.saleDate ? (
              <Button asChild type="button" variant="outline">
                <Link href={buildFilterHref(parsed.filter)}>Limpiar fecha</Link>
              </Button>
            ) : null}
          </form>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant={parsed.filter === 'all' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('all', parsed.saleDate)}>Todos</Link>
            </Button>
            <Button asChild variant={parsed.filter === 'active' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('active', parsed.saleDate)}>Activos</Link>
            </Button>
            <Button asChild variant={parsed.filter === 'with_failures' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('with_failures', parsed.saleDate)}>Con fallas</Link>
            </Button>
            <Button asChild variant={parsed.filter === 'pending_today' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('pending_today', parsed.saleDate)}>Pendientes hoy</Link>
            </Button>
            <Button asChild variant={parsed.filter === 'paid' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('paid', parsed.saleDate)}>Pagados</Link>
            </Button>
            <Button asChild variant={parsed.filter === 'overdue' ? 'accent' : 'outline'} size="sm">
              <Link href={buildFilterHref('overdue', parsed.saleDate)}>Vencidos</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {parsed.saleDate ? 'Base filtrada por fecha' : 'Base total'}: {total} créditos · Monto colocado {parsed.saleDate ? 'visible' : 'total'}: {formatCurrency(totals.principalAmount)} · Cobro semanal {parsed.saleDate ? 'visible' : 'total'}: {formatCurrency(totals.weeklyAmount)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Herramienta de cobranza</CardTitle>
        </CardHeader>
        <CardContent>
          <CreditosTable rows={filteredRows} />
        </CardContent>
      </Card>
    </section>
  );
}
