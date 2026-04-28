import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReversalSourceType } from '@prisma/client';
import { PERMISSIONS } from '@/config/permissions';
import {
  buildLegalEventSummary,
  getLegalCreditStatusLabel,
  isActiveLegalCreditStatus,
} from '@/lib/legal-status';
import { getServerSessionOrThrow, hasPermission, requirePermission } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { findCreditoForPayment } from '@/server/repositories/pago-repository';
import { CommunicationComposerCard } from '@/modules/comunicaciones/communication-composer-card';
import { CommunicationHistoryCard } from '@/modules/comunicaciones/communication-history-card';
import { formatCurrency } from '@/modules/creditos/credit-calculations';
import { CreditoLegalPanel } from '@/modules/creditos/credito-legal-panel';
import { ReversalButton } from '@/modules/pagos/reversal-button';
import { CorrectCreditPartyButton } from '@/modules/creditos/correct-credit-party-button';
import { listCommunicationHistory } from '@/server/services/communications-service';

type Params = Promise<{ creditoId: string }>;

export default async function CreditoDetailPage({ params }: { params: Params }) {
  await requirePermission(PERMISSIONS.CREDITOS_READ);
  const session = await getServerSessionOrThrow();
  const userRoles = (session.user.roles as string[]) ?? [];
  const userPermissions = (session.user.permissions as string[]) ?? [];
  const canCorrectHolder =
    hasPermission(PERMISSIONS.CREDITOS_WRITE, userPermissions) &&
    userRoles.some((role) => role === 'SUPER_ADMIN' || role === 'ADMIN_FINANCIERA');
  const canSendToLegal = hasPermission(PERMISSIONS.CREDITOS_WRITE, userPermissions);

  const { creditoId } = await params;
  const credito = await findCreditoForPayment(creditoId);
  if (!credito) {
    notFound();
  }
  const communicationHistory = await listCommunicationHistory({
    clienteId: credito.cliente.id,
    creditoId: credito.id,
    limit: 10,
  });

  const reversedDefaultIds = new Set(
    credito.reversals
      .filter((reversal) => reversal.sourceType === ReversalSourceType.DEFAULT_EVENT)
      .map((reversal) => reversal.sourceId),
  );
  const activeDefaults = credito.defaults.filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id));
  const hasFailureHistory = activeDefaults.length > 0;
  const lastRegularSchedule = credito.schedules[credito.schedules.length - 1] ?? null;
  const derivedExtraWeekDueDate = (() => {
    if (credito.extraWeek?.dueDate) return credito.extraWeek.dueDate;
    if (!lastRegularSchedule) return null;
    const dueDate = new Date(lastRegularSchedule.dueDate);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate;
  })();
  const virtualExtraWeek = hasFailureHistory && derivedExtraWeekDueDate
    ? {
        dueDate: derivedExtraWeekDueDate,
        expectedAmount: credito.extraWeek?.expectedAmount ?? credito.weeklyAmount,
        paidAmount: credito.extraWeek?.paidAmount ?? 0,
        status: credito.extraWeek?.status ?? 'PENDING',
      }
    : null;
  const activeRecoveries = credito.recoveries.filter((recovery) => !recovery.paymentEvent.isReversed);
  const activeAdvances = credito.advances.filter((advance) => !advance.paymentEvent.isReversed);
  const paidPenalties = credito.penalties.filter((penalty) => penalty.penaltyStatus.code === 'PAID');
  const pendingPenalties = credito.penalties.filter((penalty) => penalty.penaltyStatus.code === 'PENDING');
  const activeDefaultByScheduleId = new Map(
    activeDefaults.map((defaultEvent) => [defaultEvent.scheduleId, defaultEvent]),
  );

  const totalPaid = credito.schedules.reduce((sum, schedule) => sum + Number(schedule.paidAmount), 0);
  const totalExpected = credito.schedules.reduce((sum, schedule) => sum + Number(schedule.expectedAmount), 0);
  const extraWeekPending =
    virtualExtraWeek && !['PAID', 'EXEMPT', 'REVERSED'].includes(virtualExtraWeek.status)
      ? Number(virtualExtraWeek.expectedAmount) - Number(virtualExtraWeek.paidAmount)
      : 0;
  const totalOutstanding = totalExpected - totalPaid + extraWeekPending;
  const openSchedule = credito.schedules.find((schedule) => ['PENDING', 'PARTIAL'].includes(schedule.installmentStatus.code));
  const activeFailureAmount = activeDefaults.reduce((sum, item) => {
    const recovered = item.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((recoverySum, recovery) => recoverySum + Number(recovery.recoveredAmount), 0);
    return sum + Math.max(0, Number(item.amountMissed) - recovered);
  }, 0);
  const historicalFailureAmount = activeDefaults.reduce((sum, item) => sum + Number(item.amountMissed), 0);
  const recoveredAmount = activeRecoveries.reduce((sum, item) => sum + Number(item.recoveredAmount), 0);
  const advanceIncomingAmount = activeAdvances.reduce((sum, item) => sum + Number(item.amount), 0);
  const currentPendingInstallment = openSchedule?.installmentNumber ?? Number.MAX_SAFE_INTEGER;
  const advanceOutgoingAmount = activeAdvances.reduce((sum, item) => {
    return item.coversInstallment.installmentNumber < currentPendingInstallment ? sum + Number(item.amount) : sum;
  }, 0);
  const extraWeekCollected = virtualExtraWeek ? Number(virtualExtraWeek.paidAmount) : 0;
  const paidPenaltyAmount = paidPenalties.reduce((sum, penalty) => sum + Number(penalty.amount), 0);
  const deAmount = openSchedule
    ? Number(openSchedule.expectedAmount) - Number(openSchedule.paidAmount)
    : virtualExtraWeek && virtualExtraWeek.status !== 'PAID'
      ? Number(virtualExtraWeek.expectedAmount) - Number(virtualExtraWeek.paidAmount)
      : 0;
  const cobradoOperativo =
    deAmount - activeFailureAmount + recoveredAmount + advanceIncomingAmount - advanceOutgoingAmount + extraWeekCollected;
  const cronogramaRows = [
    ...credito.schedules.map((schedule) => {
      const pending = Number(schedule.expectedAmount) - Number(schedule.paidAmount);
      const relatedDefault = activeDefaultByScheduleId.get(schedule.id);
      const directPaidEvents = schedule.allocations
        .filter((allocation) => !allocation.paymentEvent.isReversed)
        .map((allocation) => allocation.paymentEvent.receivedAt)
        .sort((a, b) => a.getTime() - b.getTime());
      const recoveryEvents = relatedDefault
        ? relatedDefault.recoveries
            .filter((recovery) => !recovery.paymentEvent.isReversed)
            .map((recovery) => recovery.paymentEvent.receivedAt)
            .sort((a, b) => a.getTime() - b.getTime())
        : [];
      const paidEvents = [...directPaidEvents, ...recoveryEvents].sort((a, b) => a.getTime() - b.getTime());
      const paidAt = paidEvents.length ? paidEvents.at(-1)?.toISOString().slice(0, 10) ?? '-' : '-';

      return {
        id: schedule.id,
        weekLabel: String(schedule.installmentNumber),
        dueDate: schedule.dueDate.toISOString().slice(0, 10),
        paidAt,
        expectedAmount: Number(schedule.expectedAmount),
        paidAmount: Number(schedule.paidAmount),
        pendingAmount: pending,
        statusLabel: schedule.installmentStatus.name,
      };
    }),
    ...(virtualExtraWeek
      ? [
          {
            id: 'virtual-extra-week',
            weekLabel: '13',
            dueDate: virtualExtraWeek.dueDate.toISOString().slice(0, 10),
            paidAt:
              Number(virtualExtraWeek.paidAmount) > 0 && credito.extraWeek
                ? credito.extraWeek.allocations
                    .filter((allocation) => !allocation.paymentEvent.isReversed)
                    .map((allocation) => allocation.paymentEvent.receivedAt)
                    .sort((a, b) => a.getTime() - b.getTime())
                    .at(-1)
                    ?.toISOString()
                    .slice(0, 10) ?? '-'
                : '-',
            expectedAmount: Number(virtualExtraWeek.expectedAmount),
            paidAmount: Number(virtualExtraWeek.paidAmount),
            pendingAmount: Math.max(
              0,
              Number(virtualExtraWeek.expectedAmount) - Number(virtualExtraWeek.paidAmount),
            ),
            statusLabel: `Semana extra · ${virtualExtraWeek.status}`,
          },
        ]
      : []),
  ];

  return (
    <section>
      <PageHeader
        title={`Estado del crédito ${credito.folio}`}
        description="Consulta operativa del crédito, cronograma y últimos pagos registrados."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Créditos', href: '/creditos' },
          { label: credito.folio },
        ]}
        action={
          openSchedule || (virtualExtraWeek && extraWeekPending > 0) || canCorrectHolder ? (
            <div className="flex flex-wrap items-center gap-3">
              {canCorrectHolder ? (
                <>
                  <CorrectCreditPartyButton
                    mode="holder"
                    creditoId={credito.id}
                    folio={credito.folio}
                    currentHolder={{
                      id: credito.cliente.id,
                      code: credito.cliente.code,
                      fullName: credito.cliente.fullName,
                      phone: credito.cliente.phone,
                    }}
                    currentAval={
                      credito.aval
                        ? {
                            id: credito.aval.id,
                            code: credito.aval.code,
                            fullName: credito.aval.fullName,
                            phone: null,
                          }
                        : null
                    }
                  />
                  <CorrectCreditPartyButton
                    mode="aval"
                    creditoId={credito.id}
                    folio={credito.folio}
                    currentHolder={{
                      id: credito.cliente.id,
                      code: credito.cliente.code,
                      fullName: credito.cliente.fullName,
                      phone: credito.cliente.phone,
                    }}
                    currentAval={
                      credito.aval
                        ? {
                            id: credito.aval.id,
                            code: credito.aval.code,
                            fullName: credito.aval.fullName,
                            phone: null,
                          }
                        : null
                    }
                  />
                </>
              ) : null}
              {openSchedule || (virtualExtraWeek && extraWeekPending > 0) ? (
                <Button asChild variant="accent">
                  <Link href={`/pagos/nuevo?creditoId=${credito.id}`}>Registrar pago</Link>
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="mb-6">
        <CreditoLegalPanel
          creditoId={credito.id}
          canSendToLegal={canSendToLegal}
          legal={{
            status: credito.legalStatus,
            statusLabel: getLegalCreditStatusLabel(credito.legalStatus),
            isInLegalProcess: isActiveLegalCreditStatus(credito.legalStatus),
            sentToLegalAt: credito.sentToLegalAt?.toISOString().slice(0, 10) ?? null,
            legalStatusChangedAt: credito.legalStatusChangedAt?.toISOString().slice(0, 10) ?? null,
            reason: credito.legalStatusReason ?? null,
            notes: credito.legalStatusNotes ?? null,
            latestEvent: credito.legalEvents[0]
              ? {
                  id: credito.legalEvents[0].id,
                  eventType: credito.legalEvents[0].eventType,
                  effectiveDate: credito.legalEvents[0].effectiveDate.toISOString().slice(0, 10),
                  motivo: credito.legalEvents[0].motivo,
                  observaciones: credito.legalEvents[0].observaciones ?? null,
                  createdAt: credito.legalEvents[0].createdAt.toISOString(),
                  createdByName: credito.legalEvents[0].createdByUser.name,
                  summary: buildLegalEventSummary({
                    eventType: credito.legalEvents[0].eventType,
                    previousStatus: credito.legalEvents[0].previousStatus,
                    nextStatus: credito.legalEvents[0].nextStatus,
                    motivo: credito.legalEvents[0].motivo,
                  }),
                }
              : null,
            events: credito.legalEvents.map((event) => ({
              id: event.id,
              eventType: event.eventType,
              effectiveDate: event.effectiveDate.toISOString().slice(0, 10),
              motivo: event.motivo,
              observaciones: event.observaciones ?? null,
              createdAt: event.createdAt.toISOString(),
              createdByName: event.createdByUser.name,
              summary: buildLegalEventSummary({
                eventType: event.eventType,
                previousStatus: event.previousStatus,
                nextStatus: event.nextStatus,
                motivo: event.motivo,
              }),
            })),
            customerPlacementStatusLabel:
              credito.cliente.placementStatus === 'BLOCKED_LEGAL'
                ? 'Bloqueado por jurídico'
                : 'Colocable',
            customerPlacementBlockedAt: credito.cliente.placementBlockedAt?.toISOString().slice(0, 10) ?? null,
            customerPlacementBlockReason: credito.cliente.placementBlockReason ?? null,
            isCustomerPlacementBlocked: credito.cliente.placementStatus === 'BLOCKED_LEGAL',
            operationalHoldMessage: isActiveLegalCreditStatus(credito.legalStatus)
              ? 'Este crédito quedó fuera de la cobranza operativa normal y del trabajo de campo por proceso jurídico.'
              : null,
          }}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <CommunicationComposerCard
          sourceContext="CREDITO"
          title="Comunicaciones del crédito"
          description="Envía mensajes operativos desde el expediente del crédito con preview y trazabilidad central."
          cliente={{
            id: credito.cliente.id,
            code: credito.cliente.code,
            fullName: credito.cliente.fullName,
            phone: credito.cliente.phone,
            secondaryPhone: credito.cliente.secondaryPhone,
          }}
          credito={{
            id: credito.id,
            folio: credito.folio,
            loanNumber: credito.loanNumber,
          }}
          canSend={canSendToLegal}
          notice={
            isActiveLegalCreditStatus(credito.legalStatus)
              ? 'El crédito está en proceso jurídico. El módulo sigue permitiendo trazabilidad y comunicación manual sin tocar saldos ni cronogramas.'
              : null
          }
        />
        <CommunicationHistoryCard
          logs={communicationHistory}
          emptyMessage="Aún no hay mensajes registrados para este crédito."
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <MetricCard label="Acreditado" value={`${credito.cliente.code} · ${credito.cliente.fullName}`} />
        <MetricCard label="Aval" value={credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : 'Sin aval'} />
        <MetricCard label="Estado" value={credito.creditStatus.name} />
        <MetricCard
          label="Saldo pendiente"
          value={formatCurrency(totalOutstanding)}
          helper={extraWeekPending > 0 ? `Incluye semana extra pendiente: ${formatCurrency(extraWeekPending)}` : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="Pago semanal" value={formatCurrency(Number(credito.weeklyAmount))} />
        <MetricCard label="Monto colocado" value={formatCurrency(Number(credito.principalAmount))} />
        <MetricCard
          label="Próxima semana"
          value={
            openSchedule
              ? `Semana ${openSchedule.installmentNumber} · ${openSchedule.dueDate.toISOString().slice(0, 10)}`
              : virtualExtraWeek && extraWeekPending > 0
                ? `Semana 13 · ${virtualExtraWeek.dueDate.toISOString().slice(0, 10)}`
                : 'Sin pendientes'
          }
        />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="DE" value={formatCurrency(deAmount)} />
        <MetricCard
          label="Fallas activas"
          value={formatCurrency(activeFailureAmount)}
          helper="Saldo vencido pendiente de recuperar."
        />
        <MetricCard label="Recuperado" value={formatCurrency(recoveredAmount)} />
        <MetricCard label="Adel. entrantes" value={formatCurrency(advanceIncomingAmount)} />
        <MetricCard label="Adel. salientes" value={formatCurrency(advanceOutgoingAmount)} />
        <MetricCard label="SE cobrada" value={formatCurrency(extraWeekCollected)} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="Cobrado total operativo" value={formatCurrency(cobradoOperativo)} />
        <MetricCard label="Multas cobradas" value={formatCurrency(paidPenaltyAmount)} />
        <MetricCard
          label="Fallas históricas"
          value={formatCurrency(historicalFailureAmount)}
          helper="Monto total de fallas registradas en el crédito."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cronograma</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semana</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Fecha de pago</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cronogramaRows.map((row) => {
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.weekLabel}</TableCell>
                      <TableCell>{row.dueDate}</TableCell>
                      <TableCell>{row.paidAt}</TableCell>
                      <TableCell>{formatCurrency(row.expectedAmount)}</TableCell>
                      <TableCell>{formatCurrency(row.paidAmount)}</TableCell>
                      <TableCell>{formatCurrency(row.pendingAmount)}</TableCell>
                      <TableCell>{row.statusLabel}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {credito.payments.length ? (
              credito.payments.map((payment) => (
                <div key={payment.id} className="rounded-xl border border-border/70 p-4">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <span className="font-medium">{payment.receivedAt.toISOString().slice(0, 10)}</span>
                    <span className="text-sm text-primary">
                      {formatCurrency(Number(payment.amountReceived))}
                      {payment.isReversed ? ' · REVERTIDO' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{payment.paymentStatus.name}</p>
                  {payment.allocations.length ? (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {payment.allocations.map((allocation) => (
                        <p key={allocation.id}>
                          {allocation.penaltyChargeId
                            ? 'MULTA'
                            : allocation.extraWeekEvent
                              ? 'Semana 13'
                            : allocation.schedule
                              ? `Semana ${allocation.schedule.installmentNumber}`
                              : 'Sin semana'}
                          {' · '}
                          {allocation.allocationType}
                          {' · '}
                          {formatCurrency(Number(allocation.amount))}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {!payment.isReversed ? (
                    <div className="mt-3">
                      <ReversalButton
                        endpoint="/api/pagos/reversa"
                        payload={{ paymentEventId: payment.id }}
                        label="Revertir pago"
                        confirmMessage="Motivo de la reversa del pago"
                      />
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay pagos registrados en este crédito.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Fallas y multas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
              <p className="font-medium text-foreground">Resumen de multas</p>
              <p className="text-muted-foreground">Pendientes: {formatCurrency(pendingPenalties.reduce((sum, penalty) => sum + Number(penalty.amount), 0))}</p>
              <p className="text-muted-foreground">Cobradas: {formatCurrency(paidPenaltyAmount)}</p>
            </div>
            {credito.defaults.length ? (
              credito.defaults.map((defaultEvent) => {
                const recovered = defaultEvent.recoveries
                  .filter((item) => !item.paymentEvent.isReversed)
                  .reduce((sum, item) => sum + Number(item.recoveredAmount), 0);
                const penalty = defaultEvent.penalties[0];
                const isReversed = credito.reversals.some(
                  (reversal) =>
                    reversal.sourceType === ReversalSourceType.DEFAULT_EVENT &&
                    reversal.sourceId === defaultEvent.id,
                );
                return (
                  <div key={defaultEvent.id} className="rounded-xl border border-border/70 p-4 text-sm">
                    <p className="font-medium">Semana {defaultEvent.schedule.installmentNumber}</p>
                    <p className="text-muted-foreground">Falla: {formatCurrency(Number(defaultEvent.amountMissed))}</p>
                    <p className="text-muted-foreground">Recuperado: {formatCurrency(recovered)}</p>
                    <p className="text-muted-foreground">
                      Multa: {penalty ? `${formatCurrency(Number(penalty.amount))} · ${penalty.penaltyStatus.name}` : 'Sin multa'}
                    </p>
                    <div className="mt-3">
                      {isReversed ? (
                        <p className="text-xs text-muted-foreground">Falla corregida</p>
                      ) : (
                        <ReversalButton
                          endpoint="/api/pagos/falla/reversa"
                          payload={{ defaultEventId: defaultEvent.id }}
                          label="Quitar falla"
                          confirmMessage="Motivo de la corrección de la falla"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Este crédito aún no registra fallas.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adelantos y recuperaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeRecoveries.length ? (
              activeRecoveries.map((recovery) => (
                <div key={recovery.id} className="rounded-xl border border-border/70 p-4 text-sm">
                  <p className="font-medium">Recuperación semana {recovery.defaultEvent.schedule.installmentNumber}</p>
                  <p className="text-muted-foreground">{formatCurrency(Number(recovery.recoveredAmount))}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay recuperaciones registradas.</p>
            )}

            {activeAdvances.length ? (
              activeAdvances.map((advance) => (
                <div key={advance.id} className="rounded-xl border border-border/70 p-4 text-sm">
                  <p className="font-medium">
                    Adelanto semana {advance.recordedOnInstallment.installmentNumber} {'→'} {advance.coversInstallment.installmentNumber}
                  </p>
                  <p className="text-muted-foreground">{formatCurrency(Number(advance.amount))}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay adelantos registrados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Semana extra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {virtualExtraWeek ? (
              <>
                <p className="font-medium">Semana 13 · Semana extra</p>
                <p className="text-muted-foreground">Vence: {virtualExtraWeek.dueDate.toISOString().slice(0, 10)}</p>
                <p className="text-muted-foreground">Esperado: {formatCurrency(Number(virtualExtraWeek.expectedAmount))}</p>
                <p className="text-muted-foreground">Pagado: {formatCurrency(Number(virtualExtraWeek.paidAmount))}</p>
                <p className="text-muted-foreground">Estado: {virtualExtraWeek.status}</p>
              </>
            ) : (
              <p className="text-muted-foreground">Este crédito no tiene semana extra generada.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-semibold text-primary">{value}</div>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
