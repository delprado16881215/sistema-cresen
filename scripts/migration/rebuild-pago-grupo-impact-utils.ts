import { Prisma, type PrismaClient } from '@prisma/client';
import {
  assertProductionAdmin,
  assertSupabaseDatabase,
  createClient,
  getRequiredEnv,
  redactDatabaseUrl,
} from './migration-utils';

export const REBUILD_PAGO_GRUPO_TARGET = {
  promotoriaId: 'cmmjj2gi10010yuv572tdpu2e',
  occurredAt: '2026-04-27',
  scope: 'active',
} as const;

export type PagoGrupoRebuildTarget = typeof REBUILD_PAGO_GRUPO_TARGET;

type PagoGrupoScope = 'active' | 'active_with_extra_week' | 'overdue' | 'all';

type RebuildRowSnapshot = {
  creditoId: string;
  scheduleId: string | null;
  extraWeekEventId: string | null;
  recoveryAnchorDefaultEventId: string | null;
  recoveryAnchorScheduleId: string | null;
  recoveryAnchorInstallmentNumber: number | null;
  folio: string;
  loanNumber: string;
  controlNumber: number | null;
  clienteId: string;
  clienteCode: string;
  clienteName: string;
  clientePhone: string | null;
  clienteSecondaryPhone: string | null;
  clienteAddress: string | null;
  clienteNeighborhood: string | null;
  clienteCity: string | null;
  clienteState: string | null;
  clienteLabel: string;
  avalLabel: string | null;
  promotoriaId: string;
  promotoriaName: string;
  supervisionName: string | null;
  operationalScope: 'active' | 'active_with_extra_week' | 'overdue';
  operationalWeek: number;
  creditStartDate: string | null;
  scheduledDate: string | null;
  weeklyAmount: number;
  collectibleAmount: number;
  deAmount: number;
  recoveryAmountAvailable: number;
  advanceAmountAvailable: number;
  outgoingAdvanceAmount: number;
  extraWeekAmount: number;
  rowMode: 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
  historicalCurrentPaymentAmount: number;
  historicalFailureAmount: number;
  historicalRecoveryAmount: number;
  historicalAdvanceIncomingAmount: number;
  historicalExtraWeekCollectedAmount: number;
  installmentNumber: number;
  installmentLabel: string;
  deEligible: boolean;
};

type RebuildImpactItem = {
  creditoId: string;
  action: 'PAY' | 'FAIL';
  recoveryAmount: number;
  advanceAmount: number;
  extraWeekAmount: number;
  partialFailureAmount: number;
};

export type PagoGrupoImpactRebuild = {
  target: PagoGrupoRebuildTarget & { entityId: string };
  counts: Record<string, number>;
  sums: Record<string, number>;
  existingImpactAudit: { id: string; createdAt: Date } | null;
  existingLiquidationAudit: { id: string; createdAt: Date } | null;
  rowsSnapshot: RebuildRowSnapshot[];
  items: RebuildImpactItem[];
  paidCount: number;
  failedCount: number;
  liquidation: {
    deAmount: number;
    saleAmount: number;
    bonusAmount: number;
    failureAmount: number;
    commissionBase: 'SALE' | 'TOTAL_TO_DELIVER';
    commissionRate: number;
    finalCashLabel: string;
    recoveryAmount: number;
    subtotalAmount: number;
    totalToDeliver: number;
    extraWeekAmount: number;
    finalCashAmount: number;
    commissionAmount: number;
    commissionBaseAmount: number;
    incomingAdvanceAmount: number;
    outgoingAdvanceAmount: number;
  };
  canCreateImpact: boolean;
  canCreateLiquidation: boolean;
  warnings: string[];
};

export function buildPagoGrupoEntityId(target: {
  promotoriaId: string;
  occurredAt: string;
  scope?: PagoGrupoScope;
}) {
  return [target.promotoriaId, target.occurredAt, target.scope ?? 'active'].join('|');
}

export function createProductionClientFromEnv() {
  const productionUrl = getRequiredEnv('PROD_DATABASE_URL');
  assertSupabaseDatabase(productionUrl);
  console.log(`PROD_DATABASE_URL: ${redactDatabaseUrl(productionUrl)}`);
  return createClient(productionUrl);
}

export async function assertProductionAdminId(client: PrismaClient) {
  const admin = await assertProductionAdmin(client);
  return admin.id;
}

function getUtcDayRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function toDateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toMoney(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

function sumMoney<T>(rows: T[], pick: (row: T) => Prisma.Decimal | string | number | null | undefined) {
  return toMoney(rows.reduce((sum, row) => sum + Number(pick(row) ?? 0), 0));
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

export async function buildPagoGrupoImpactRebuild(
  client: PrismaClient,
  target: PagoGrupoRebuildTarget = REBUILD_PAGO_GRUPO_TARGET,
): Promise<PagoGrupoImpactRebuild> {
  const entityId = buildPagoGrupoEntityId(target);
  const { start, end } = getUtcDayRange(target.occurredAt);

  const [existingImpactAudit, existingLiquidationAudit, creditos] = await Promise.all([
    client.auditLog.findFirst({
      where: {
        module: 'pagos',
        entity: 'PagoGrupoImpact',
        action: 'CREATE',
        entityId,
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    client.auditLog.findFirst({
      where: {
        module: 'pagos',
        entity: 'PagoGrupoLiquidacion',
        action: { in: ['CREATE', 'UPDATE'] },
        entityId,
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    client.credito.findMany({
      where: {
        promotoriaId: target.promotoriaId,
        cancelledAt: null,
      },
      include: {
        cliente: true,
        aval: true,
        promotoria: { include: { supervision: true } },
      },
      orderBy: [{ controlNumber: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const creditoIds = creditos.map((credito) => credito.id);
  const creditoById = new Map(creditos.map((credito) => [credito.id, credito]));

  const [paymentEvents, defaultEvents, penaltyCharges] = await Promise.all([
    client.paymentEvent.findMany({
      where: {
        creditoId: { in: creditoIds },
        receivedAt: { gte: start, lt: end },
        isReversed: false,
      },
      include: { allocations: true },
      orderBy: { createdAt: 'asc' },
    }),
    client.defaultEvent.findMany({
      where: {
        creditoId: { in: creditoIds },
        createdAt: { gte: start, lt: end },
      },
      include: { schedule: true },
      orderBy: { createdAt: 'asc' },
    }),
    client.penaltyCharge.findMany({
      where: {
        creditoId: { in: creditoIds },
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const paymentIds = paymentEvents.map((payment) => payment.id);
  const paymentAllocations = paymentEvents.flatMap((payment) => payment.allocations);

  const [recoveryEvents, advanceEvents, extraWeekEvents] = await Promise.all([
    paymentIds.length
      ? client.recoveryEvent.findMany({
          where: { paymentEventId: { in: paymentIds } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    paymentIds.length
      ? client.advanceEvent.findMany({
          where: { paymentEventId: { in: paymentIds } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    client.extraWeekEvent.findMany({
      where: {
        creditoId: { in: creditoIds },
        OR: [
          { createdAt: { gte: start, lt: end } },
          { allocations: { some: { paymentEventId: { in: paymentIds } } } },
        ],
      },
      include: {
        allocations: {
          where: { paymentEventId: { in: paymentIds } },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const scheduleIds = [
    ...new Set([
      ...paymentAllocations.map((allocation) => allocation.scheduleId).filter((value): value is string => Boolean(value)),
      ...defaultEvents.map((event) => event.scheduleId),
    ]),
  ];

  const schedules = scheduleIds.length
    ? await client.creditSchedule.findMany({
        where: { id: { in: scheduleIds } },
        include: { installmentStatus: true },
      })
    : [];
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));

  const outgoingAdvanceEvents = scheduleIds.length
    ? await client.advanceEvent.findMany({
        where: {
          coversInstallmentId: { in: scheduleIds },
          paymentEvent: {
            isReversed: false,
            receivedAt: { lt: end },
          },
        },
        include: { paymentEvent: true },
      })
    : [];

  const paymentsByCreditoId = groupBy(paymentEvents, (payment) => payment.creditoId);
  const defaultsByCreditoId = groupBy(defaultEvents, (event) => event.creditoId);
  const allocationsByCreditoId = groupBy(paymentAllocations, (allocation) => {
    const payment = paymentEvents.find((event) => event.id === allocation.paymentEventId);
    return payment?.creditoId;
  });
  const outgoingAdvancesByScheduleId = groupBy(outgoingAdvanceEvents, (advance) => advance.coversInstallmentId);

  const impactedCreditoIds = [
    ...new Set([
      ...paymentEvents.map((payment) => payment.creditoId),
      ...defaultEvents.map((event) => event.creditoId),
    ]),
  ].filter((creditoId) => creditoById.has(creditoId));

  const rowsSnapshot: RebuildRowSnapshot[] = impactedCreditoIds.map((creditoId) => {
    const credito = creditoById.get(creditoId)!;
    const allocations = allocationsByCreditoId.get(creditoId) ?? [];
    const defaults = defaultsByCreditoId.get(creditoId) ?? [];
    const currentAllocations = allocations.filter((allocation) => allocation.allocationType === 'CURRENT');
    const recoveryAllocations = allocations.filter((allocation) => allocation.allocationType === 'RECOVERY');
    const advanceAllocations = allocations.filter((allocation) => allocation.allocationType === 'ADVANCE');
    const extraWeekAllocations = allocations.filter((allocation) => allocation.allocationType === 'EXTRA_WEEK');
    const currentAmount = sumMoney(currentAllocations, (allocation) => allocation.amount);
    const failureAmount = sumMoney(defaults, (event) => event.amountMissed);
    const recoveryAmount = sumMoney(recoveryAllocations, (allocation) => allocation.amount);
    const advanceAmount = sumMoney(advanceAllocations, (allocation) => allocation.amount);
    const extraWeekAmount = sumMoney(extraWeekAllocations, (allocation) => allocation.amount);
    const primaryScheduleId =
      currentAllocations[0]?.scheduleId ??
      defaults[0]?.scheduleId ??
      recoveryAllocations[0]?.scheduleId ??
      null;
    const schedule = primaryScheduleId ? scheduleById.get(primaryScheduleId) : null;
    const outgoingAdvanceAmount = primaryScheduleId
      ? sumMoney(outgoingAdvancesByScheduleId.get(primaryScheduleId) ?? [], (advance) => advance.amount)
      : 0;
    const deAmount = toMoney(currentAmount + failureAmount);
    const rowMode =
      deAmount <= 0 && extraWeekAmount > 0
        ? 'extra_week_only'
        : deAmount <= 0 && recoveryAmount > 0
          ? 'recovery_only'
          : 'regular';
    const recoveryAnchorDefault = defaults[0] ?? null;

    return {
      creditoId,
      scheduleId: rowMode === 'regular' ? primaryScheduleId : null,
      extraWeekEventId: extraWeekAllocations[0]?.extraWeekEventId ?? null,
      recoveryAnchorDefaultEventId: recoveryAnchorDefault?.id ?? recoveryAllocations[0]?.defaultEventId ?? null,
      recoveryAnchorScheduleId: recoveryAnchorDefault?.scheduleId ?? recoveryAllocations[0]?.scheduleId ?? null,
      recoveryAnchorInstallmentNumber:
        recoveryAnchorDefault?.schedule.installmentNumber ??
        (recoveryAllocations[0]?.scheduleId ? scheduleById.get(recoveryAllocations[0].scheduleId)?.installmentNumber : null) ??
        null,
      folio: credito.folio,
      loanNumber: credito.loanNumber,
      controlNumber: credito.controlNumber,
      clienteId: credito.cliente.id,
      clienteCode: credito.cliente.code,
      clienteName: credito.cliente.fullName,
      clientePhone: credito.cliente.phone,
      clienteSecondaryPhone: credito.cliente.secondaryPhone,
      clienteAddress: credito.cliente.address,
      clienteNeighborhood: credito.cliente.neighborhood,
      clienteCity: credito.cliente.city,
      clienteState: credito.cliente.state,
      clienteLabel: `${credito.cliente.code} · ${credito.cliente.fullName}`,
      avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
      promotoriaId: credito.promotoria.id,
      promotoriaName: credito.promotoria.name,
      supervisionName: credito.promotoria.supervision?.name ?? null,
      operationalScope: 'active',
      operationalWeek: schedule?.installmentNumber ?? 0,
      creditStartDate: toDateKey(credito.startDate),
      scheduledDate: toDateKey(schedule?.dueDate),
      weeklyAmount: toMoney(credito.weeklyAmount),
      collectibleAmount: deAmount,
      deAmount,
      recoveryAmountAvailable: 0,
      advanceAmountAvailable: 0,
      outgoingAdvanceAmount,
      extraWeekAmount: 0,
      rowMode,
      historicalCurrentPaymentAmount: currentAmount,
      historicalFailureAmount: failureAmount,
      historicalRecoveryAmount: recoveryAmount,
      historicalAdvanceIncomingAmount: advanceAmount,
      historicalExtraWeekCollectedAmount: extraWeekAmount,
      installmentNumber: schedule?.installmentNumber ?? 0,
      installmentLabel: schedule?.installmentNumber ? `Semana ${schedule.installmentNumber}` : 'Reconstruido',
      deEligible: deAmount > 0,
    };
  });

  const items: RebuildImpactItem[] = rowsSnapshot.map((row) => ({
    creditoId: row.creditoId,
    action: row.historicalFailureAmount > 0 ? 'FAIL' : 'PAY',
    recoveryAmount: row.historicalFailureAmount > 0 ? 0 : row.historicalRecoveryAmount,
    advanceAmount: row.historicalFailureAmount > 0 ? 0 : row.historicalAdvanceIncomingAmount,
    extraWeekAmount: row.historicalFailureAmount > 0 ? 0 : row.historicalExtraWeekCollectedAmount,
    partialFailureAmount: row.historicalFailureAmount > 0 ? row.historicalCurrentPaymentAmount : 0,
  }));

  const deAmount = sumMoney(rowsSnapshot, (row) => row.deAmount);
  const failureAmount = sumMoney(rowsSnapshot, (row) => row.historicalFailureAmount);
  const recoveryAmount = sumMoney(rowsSnapshot, (row) => row.historicalRecoveryAmount);
  const incomingAdvanceAmount = sumMoney(rowsSnapshot, (row) => row.historicalAdvanceIncomingAmount);
  const outgoingAdvanceAmount = sumMoney(rowsSnapshot, (row) => row.outgoingAdvanceAmount);
  const extraWeekAmount = sumMoney(rowsSnapshot, (row) => row.historicalExtraWeekCollectedAmount);
  const subtotalAmount = toMoney(deAmount - failureAmount + recoveryAmount);
  const totalToDeliver = toMoney(subtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekAmount);

  const counts = {
    PaymentEvent: paymentEvents.length,
    PaymentAllocation: paymentAllocations.length,
    DefaultEvent: defaultEvents.length,
    PenaltyCharge: penaltyCharges.length,
    RecoveryEvent: recoveryEvents.length,
    AdvanceEvent: advanceEvents.length,
    ExtraWeekEvent: extraWeekEvents.length,
    PagoGrupoImpact: existingImpactAudit ? 1 : 0,
    PagoGrupoLiquidacion: existingLiquidationAudit ? 1 : 0,
  };

  const warnings: string[] = [];
  if (existingImpactAudit) {
    warnings.push(`Ya existe PagoGrupoImpact ${existingImpactAudit.id}; no se debe reconstruir otro cierre.`);
  }
  if (!rowsSnapshot.length) {
    warnings.push('No hay filas financieras suficientes para reconstruir rowsSnapshot.');
  }
  warnings.push(
    'La reconstrucción se basa en eventos financieros ya materializados; no recupera filas que nunca alcanzaron a impactarse.',
  );
  warnings.push(
    'PagoGrupoLiquidacion queda pendiente porque venta, bono y selección final de comisión no son inferibles desde pagos/fallas.',
  );

  return {
    target: { ...target, entityId },
    counts,
    sums: {
      PaymentEvent_amountReceived: sumMoney(paymentEvents, (payment) => payment.amountReceived),
      PaymentAllocation_total: sumMoney(paymentAllocations, (allocation) => allocation.amount),
      DefaultEvent_amountMissed: failureAmount,
      PenaltyCharge_amount: sumMoney(penaltyCharges, (penalty) => penalty.amount),
      RecoveryEvent_recoveredAmount: sumMoney(recoveryEvents, (recovery) => recovery.recoveredAmount),
      AdvanceEvent_amount: sumMoney(advanceEvents, (advance) => advance.amount),
      deAmount,
      failureAmount,
      recoveryAmount,
      advanceIncomingAmount: incomingAdvanceAmount,
      advanceOutgoingAmount: outgoingAdvanceAmount,
      extraWeekAmount,
      total1: subtotalAmount,
      totalToDeliver,
    },
    existingImpactAudit,
    existingLiquidationAudit,
    rowsSnapshot,
    items,
    paidCount: items.filter((item) => item.action === 'PAY').length,
    failedCount: items.filter((item) => item.action === 'FAIL').length,
    liquidation: {
      deAmount,
      saleAmount: 0,
      bonusAmount: 0,
      failureAmount,
      commissionBase: 'SALE',
      commissionRate: 10,
      finalCashLabel: totalToDeliver < 0 ? 'Inversión' : 'Fondo para la siguiente semana',
      recoveryAmount,
      subtotalAmount,
      totalToDeliver,
      extraWeekAmount,
      finalCashAmount: totalToDeliver,
      commissionAmount: 0,
      commissionBaseAmount: 0,
      incomingAdvanceAmount,
      outgoingAdvanceAmount,
    },
    canCreateImpact: !existingImpactAudit && rowsSnapshot.length > 0,
    canCreateLiquidation: false,
    warnings,
  };
}

export function buildPagoGrupoImpactAuditPayload(rebuild: PagoGrupoImpactRebuild) {
  const groupFingerprint = [
    'rebuild',
    rebuild.target.entityId,
    rebuild.counts.PaymentEvent,
    rebuild.counts.DefaultEvent,
    rebuild.sums.PaymentEvent_amountReceived,
  ].join('|');

  return {
    groupExecutionKey: rebuild.target.entityId,
    groupFingerprint,
    reconstruction: {
      source: 'rebuild-pago-grupo-impact',
      reason: 'Cierre reconstruido desde eventos financieros existentes por impacto parcial.',
      warnings: rebuild.warnings,
      counts: rebuild.counts,
      sums: rebuild.sums,
    },
    promotoriaId: rebuild.target.promotoriaId,
    occurredAt: rebuild.target.occurredAt,
    scope: rebuild.target.scope,
    paidCount: rebuild.paidCount,
    failedCount: rebuild.failedCount,
    skippedPayments: 0,
    skippedFailures: 0,
    groupCount: rebuild.rowsSnapshot.length,
    rowCount: rebuild.rowsSnapshot.length,
    expectedCount: rebuild.rowsSnapshot.length,
    items: rebuild.items,
    rowsSnapshot: rebuild.rowsSnapshot,
    liquidation: rebuild.liquidation,
  } satisfies Prisma.InputJsonObject;
}

export function printRebuildSummary(rebuild: PagoGrupoImpactRebuild) {
  console.log('\nTarget');
  console.table([rebuild.target]);

  console.log('\nConteos');
  console.table([rebuild.counts]);

  console.log('\nSumas reconstruidas');
  console.table([rebuild.sums]);

  console.log('\nEstado');
  console.table([
    {
      canCreateImpact: rebuild.canCreateImpact,
      canCreateLiquidation: rebuild.canCreateLiquidation,
      rowsSnapshot: rebuild.rowsSnapshot.length,
      items: rebuild.items.length,
      existingImpactAuditId: rebuild.existingImpactAudit?.id ?? null,
      existingLiquidationAuditId: rebuild.existingLiquidationAudit?.id ?? null,
    },
  ]);

  console.log('\nPrimeras filas reconstruidas');
  console.table(
    rebuild.rowsSnapshot.slice(0, 12).map((row) => ({
      creditoId: row.creditoId,
      controlNumber: row.controlNumber,
      loanNumber: row.loanNumber,
      installmentNumber: row.installmentNumber,
      deAmount: row.deAmount,
      failureAmount: row.historicalFailureAmount,
      recoveryAmount: row.historicalRecoveryAmount,
      advanceIncomingAmount: row.historicalAdvanceIncomingAmount,
      outgoingAdvanceAmount: row.outgoingAdvanceAmount,
      extraWeekAmount: row.historicalExtraWeekCollectedAmount,
    })),
  );

  console.log('\nAdvertencias');
  for (const warning of rebuild.warnings) {
    console.log(`- ${warning}`);
  }
}
