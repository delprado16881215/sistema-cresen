import { notFound } from 'next/navigation';
import { PERMISSIONS } from '@/config/permissions';
import { requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { findCreditoForPayment } from '@/server/repositories/pago-repository';
import { PagoForm } from '@/modules/pagos/pago-form';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NuevoPagoPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission(PERMISSIONS.PAGOS_WRITE);

  const raw = await searchParams;
  const creditoId = typeof raw.creditoId === 'string' ? raw.creditoId : undefined;

  if (!creditoId) {
    notFound();
  }

  const credito = await findCreditoForPayment(creditoId);
  if (!credito) {
    notFound();
  }

  const openSchedules = credito.schedules.filter((schedule) =>
    ['PENDING', 'PARTIAL'].includes(schedule.installmentStatus.code),
  );
  const nextSchedule = openSchedules[0] ?? null;
  const reversedDefaultIds = new Set(
    credito.reversals
      .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT')
      .map((reversal) => reversal.sourceId),
  );
  const failureHistory = credito.defaults.filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id));
  const shouldShowExtraWeek = Boolean(credito.extraWeek && failureHistory.length > 0);
  const pendingPenalties = credito.penalties
    .filter(
      (penalty) =>
        penalty.penaltyStatus.code === 'PENDING' &&
        (!penalty.defaultEventId || !reversedDefaultIds.has(penalty.defaultEventId)),
    )
    .map((penalty) => ({
      id: penalty.id,
      amount: Number(penalty.amount),
      label: penalty.defaultEvent
        ? `Semana ${penalty.defaultEvent.schedule.installmentNumber} · ${credito.cliente.fullName}`
        : 'Multa operativa',
      status: penalty.penaltyStatus.name,
    }));

  if (!nextSchedule && !pendingPenalties.length && !shouldShowExtraWeek) {
    notFound();
  }

  const totalOutstanding = openSchedules.reduce(
    (sum, schedule) => sum + (Number(schedule.expectedAmount) - Number(schedule.paidAmount)),
    0,
  );
  const nextOutstanding = nextSchedule
    ? Number(nextSchedule.expectedAmount) - Number(nextSchedule.paidAmount)
    : shouldShowExtraWeek && credito.extraWeek
      ? Number(credito.extraWeek.expectedAmount) - Number(credito.extraWeek.paidAmount)
    : 0;

  const activeDefaultByScheduleId = new Map(
    failureHistory.map((defaultEvent) => [defaultEvent.scheduleId, defaultEvent]),
  );

  const estadoCuenta = [
    ...credito.schedules.map((schedule) => {
      const directPaidEvents = schedule.allocations
        .filter((allocation) => !allocation.paymentEvent.isReversed)
        .map((allocation) => allocation.paymentEvent.receivedAt)
        .sort((a, b) => a.getTime() - b.getTime());
      const relatedDefault = activeDefaultByScheduleId.get(schedule.id);
      const recoveryEvents = relatedDefault
        ? relatedDefault.recoveries
            .filter((recovery) => !recovery.paymentEvent.isReversed)
            .map((recovery) => recovery.paymentEvent.receivedAt)
            .sort((a, b) => a.getTime() - b.getTime())
        : [];
      const paidEvents = [...directPaidEvents, ...recoveryEvents].sort((a, b) => a.getTime() - b.getTime());
      const isPaid =
        ['PAID', 'ADVANCED'].includes(schedule.installmentStatus.code) ||
        (relatedDefault
          ? relatedDefault.recoveries
              .filter((recovery) => !recovery.paymentEvent.isReversed)
              .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0) >= Number(relatedDefault.amountMissed)
          : false);
      return {
        id: schedule.id,
        kind: 'REGULAR' as const,
        label: `Semana ${schedule.installmentNumber}`,
        dueDate: schedule.dueDate.toISOString().slice(0, 10),
        expectedAmount: Number(schedule.expectedAmount),
        paidAmount: Number(schedule.paidAmount),
        paidAt: isPaid && paidEvents.length ? paidEvents.at(-1)?.toISOString().slice(0, 10) ?? null : null,
        isPaid,
      };
    }),
    ...(credito.extraWeek
      && shouldShowExtraWeek
      ? [
          (() => {
            const paidEvents = credito.extraWeek.allocations
              .filter((allocation) => !allocation.paymentEvent.isReversed)
              .map((allocation) => allocation.paymentEvent.receivedAt)
              .sort((a, b) => a.getTime() - b.getTime());
            const isPaid = credito.extraWeek?.status === 'PAID';
            return {
              id: credito.extraWeek.id,
              kind: 'EXTRA' as const,
              label: 'Semana 13 · Semana extra',
              dueDate: credito.extraWeek.dueDate.toISOString().slice(0, 10),
              expectedAmount: Number(credito.extraWeek.expectedAmount),
              paidAmount: Number(credito.extraWeek.paidAmount),
              paidAt: isPaid && paidEvents.length ? paidEvents.at(-1)?.toISOString().slice(0, 10) ?? null : null,
              isPaid,
            };
          })(),
        ]
      : []),
  ];

  return (
    <section>
      <PageHeader
        title="Registrar pago"
        description="Aplicación de pago semanal sobre el cronograma activo del crédito."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Pagos', href: '/pagos' },
          { label: 'Nuevo' },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Cobranza del crédito</CardTitle>
        </CardHeader>
        <CardContent>
          {credito.unappliedGroupAttemptDates.length ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">
                Este crédito tiene intentos de pago grupal previos que no fueron aplicados en base. Puedes capturar el pago correctamente aquí.
              </p>
              <p className="mt-1 text-amber-800">
                Fechas detectadas: {credito.unappliedGroupAttemptDates.join(', ')}.
              </p>
            </div>
          ) : null}
          <PagoForm
            credito={{
              id: credito.id,
              folio: credito.folio,
              clienteLabel: `${credito.cliente.code} · ${credito.cliente.fullName}`,
              avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
              promotoriaName: credito.promotoria.name,
              supervisionName: credito.promotoria.supervision?.name ?? null,
              weeklyAmount: Number(credito.weeklyAmount),
              totalOutstanding: totalOutstanding + pendingPenalties.reduce((sum, penalty) => sum + penalty.amount, 0),
              nextInstallmentLabel: nextSchedule
                ? `Semana ${nextSchedule.installmentNumber} · ${nextSchedule.dueDate.toISOString().slice(0, 10)}`
                : shouldShowExtraWeek && credito.extraWeek
                  ? `Semana 13 · ${credito.extraWeek.dueDate.toISOString().slice(0, 10)}`
                  : 'Sin semana abierta',
              nextInstallmentOutstanding: nextOutstanding,
              pendingPenalties,
              estadoCuenta,
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
