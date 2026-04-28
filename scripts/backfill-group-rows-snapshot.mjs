import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toDateKey(date) {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mazatlan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function getOperationType(row) {
  if (row.historicalFailureAmount > 0) return 'Falla';
  if (row.historicalCurrentPaymentAmount > 0 && row.historicalRecoveryAmount > 0 && row.historicalAdvanceIncomingAmount > 0) {
    return 'Pago + Recuperado + Adelanto';
  }
  if (row.historicalCurrentPaymentAmount > 0 && row.historicalRecoveryAmount > 0) return 'Pago + Recuperado';
  if (row.historicalCurrentPaymentAmount > 0 && row.historicalAdvanceIncomingAmount > 0) return 'Pago + Adelanto';
  if (row.historicalExtraWeekCollectedAmount > 0) return 'Semana extra';
  if (row.outgoingAdvanceAmount > 0 && row.collectibleAmount <= 0) return 'Adelanto saliente';
  if (row.historicalRecoveryAmount > 0 && row.historicalAdvanceIncomingAmount > 0) return 'Recuperado + Adelanto';
  if (row.historicalRecoveryAmount > 0) return 'Recuperado';
  if (row.historicalAdvanceIncomingAmount > 0) return 'Adelanto entrante';
  return 'Pago normal';
}

async function main() {
  const [, , promotoriaName, occurredAt] = process.argv;

  if (!promotoriaName || !occurredAt) {
    throw new Error('Uso: node scripts/backfill-group-rows-snapshot.mjs "VICKY EL NAYAR" 2024-08-12');
  }

  const promotoria = await prisma.promotoria.findFirst({
    where: { name: promotoriaName },
    select: { id: true, name: true },
  });

  if (!promotoria) {
    throw new Error(`No encontré la promotoria ${promotoriaName}`);
  }

  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      action: 'CREATE',
    },
    select: { id: true, entityId: true, afterJson: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }],
  });

  const audit = audits.find((entry) => {
    const payload = entry.afterJson;
    return (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      payload.promotoriaId === promotoria.id &&
      payload.occurredAt === occurredAt
    );
  });

  if (!audit) {
    throw new Error(`No encontré PagoGrupoImpact para ${promotoriaName} ${occurredAt}`);
  }

  const payload = audit.afterJson;
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    throw new Error('El impacto no tiene items para reconstruir.');
  }

  const creditoIds = [...new Set(items.map((item) => item.creditoId).filter(Boolean))];
  const selectedDateKey = occurredAt;

  const creditos = await prisma.credito.findMany({
    where: { id: { in: creditoIds } },
    include: {
      cliente: { select: { code: true, fullName: true } },
      aval: { select: { code: true, fullName: true } },
      promotoria: {
        select: {
          id: true,
          name: true,
          supervision: { select: { name: true } },
        },
      },
      schedules: {
        include: {
          allocations: {
            include: {
              paymentEvent: { select: { receivedAt: true, isReversed: true } },
            },
          },
        },
        orderBy: [{ installmentNumber: 'asc' }],
      },
      defaults: {
        include: {
          schedule: { select: { id: true, installmentNumber: true, dueDate: true } },
          recoveries: {
            include: { paymentEvent: { select: { receivedAt: true, isReversed: true } } },
          },
        },
      },
      advances: {
        include: {
          paymentEvent: { select: { receivedAt: true, isReversed: true } },
          recordedOnInstallment: { select: { installmentNumber: true, dueDate: true } },
          coversInstallment: { select: { id: true, installmentNumber: true, dueDate: true } },
        },
      },
      extraWeek: {
        include: {
          allocations: {
            include: { paymentEvent: { select: { receivedAt: true, isReversed: true } } },
          },
        },
      },
      reversals: {
        select: { sourceType: true, sourceId: true },
      },
    },
  });

  const creditosById = new Map(creditos.map((credito) => [credito.id, credito]));

  const rowsSnapshot = items.map((item) => {
    const credito = creditosById.get(item.creditoId);
    if (!credito) {
      return {
        creditoId: item.creditoId,
        controlNumber: null,
        clienteLabel: item.creditoId,
        avalLabel: null,
        installmentLabel: 'Sin crédito',
        operationalScope: 'active',
        deAmount: 0,
        historicalFailureAmount: 0,
        historicalRecoveryAmount: 0,
        historicalAdvanceIncomingAmount: 0,
        outgoingAdvanceAmount: 0,
        historicalExtraWeekCollectedAmount: 0,
        collectibleAmount: 0,
        weeklyAmount: 0,
        totalRow: 0,
        operationType: 'Sin crédito',
      };
    }

    const reversedDefaultIds = new Set(
      credito.reversals
        .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT')
        .map((reversal) => reversal.sourceId),
    );
    const isEventOnSelectedDate = (date) => toDateKey(date) === selectedDateKey;

    const currentAllocation = credito.schedules
      .flatMap((schedule) =>
        schedule.allocations
          .filter(
            (allocation) =>
              allocation.allocationType === 'CURRENT' &&
              !allocation.paymentEvent.isReversed &&
              isEventOnSelectedDate(allocation.paymentEvent.receivedAt),
          )
          .map((allocation) => ({ schedule, allocation })),
      )
      .sort((left, right) => left.schedule.installmentNumber - right.schedule.installmentNumber)[0];

    const currentSchedule = currentAllocation?.schedule ?? null;

    const defaultEvent = credito.defaults.find(
      (entry) => !reversedDefaultIds.has(entry.id) && isEventOnSelectedDate(entry.createdAt),
    );

    const outgoingTargetSchedule =
      currentSchedule ??
      defaultEvent?.schedule ??
      credito.advances
        .filter(
          (advance) =>
            !advance.paymentEvent.isReversed &&
            toDateKey(advance.coversInstallment.dueDate) === selectedDateKey,
        )
        .sort((left, right) => left.coversInstallment.installmentNumber - right.coversInstallment.installmentNumber)[0]
        ?.coversInstallment ??
      null;

    const outgoingAdvanceAmount = outgoingTargetSchedule
      ? credito.advances
          .filter(
            (advance) =>
              !advance.paymentEvent.isReversed &&
              advance.coversInstallment.id === outgoingTargetSchedule.id &&
              advance.paymentEvent.receivedAt <= new Date(`${selectedDateKey}T23:59:59.999`),
          )
          .reduce((sum, advance) => sum + Number(advance.amount), 0)
      : 0;

    const historicalCurrentPaymentAmount = currentAllocation ? Number(currentAllocation.allocation.amount) : 0;
    const historicalFailureAmount = defaultEvent ? Number(defaultEvent.amountMissed) : 0;
    const historicalRecoveryAmount = Math.max(0, Number(item.recoveryAmount ?? 0));
    const historicalAdvanceIncomingAmount = Math.max(0, Number(item.advanceAmount ?? 0));
    const historicalExtraWeekCollectedAmount =
      credito.extraWeek?.allocations
        .filter(
          (allocation) =>
            !allocation.paymentEvent.isReversed &&
            isEventOnSelectedDate(allocation.paymentEvent.receivedAt),
        )
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0) ?? 0;

    const operationalScope = historicalExtraWeekCollectedAmount > 0 ? 'active_with_extra_week' : 'active';
    const installmentNumber =
      historicalExtraWeekCollectedAmount > 0
        ? 13
        : outgoingTargetSchedule?.installmentNumber ?? 0;
    const installmentLabel =
      historicalExtraWeekCollectedAmount > 0
        ? 'Semana extra'
        : defaultEvent
          ? `Semana ${defaultEvent.schedule.installmentNumber} · Falla`
          : outgoingTargetSchedule
            ? `Semana ${outgoingTargetSchedule.installmentNumber}`
            : 'Sin semana';
    const deAmount = historicalExtraWeekCollectedAmount > 0 ? 0 : outgoingTargetSchedule ? Number(credito.weeklyAmount) : 0;
    const collectibleAmount = Math.max(0, deAmount - outgoingAdvanceAmount);
    const totalRow =
      historicalCurrentPaymentAmount +
      historicalRecoveryAmount +
      historicalAdvanceIncomingAmount +
      historicalExtraWeekCollectedAmount;

    const row = {
      creditoId: credito.id,
      scheduleId: currentSchedule?.id ?? defaultEvent?.schedule.id ?? outgoingTargetSchedule?.id ?? null,
      extraWeekEventId: historicalExtraWeekCollectedAmount > 0 ? credito.extraWeek?.id ?? null : null,
      folio: credito.folio,
      loanNumber: credito.loanNumber,
      controlNumber: credito.controlNumber ?? null,
      clienteLabel: `${credito.cliente.code} · ${credito.cliente.fullName}`,
      avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
      promotoriaId: credito.promotoria.id,
      promotoriaName: credito.promotoria.name,
      supervisionName: credito.promotoria.supervision?.name ?? null,
      operationalScope,
      operationalWeek: installmentNumber,
      weeklyAmount: Number(credito.weeklyAmount),
      collectibleAmount,
      deAmount,
      recoveryAmountAvailable: 0,
      outgoingAdvanceAmount,
      extraWeekAmount: historicalExtraWeekCollectedAmount > 0 ? Number(credito.weeklyAmount) : 0,
      historicalCurrentPaymentAmount,
      historicalFailureAmount,
      historicalRecoveryAmount,
      historicalAdvanceIncomingAmount,
      historicalExtraWeekCollectedAmount,
      installmentNumber,
      installmentLabel,
      totalRow,
    };

    return {
      ...row,
      operationType: getOperationType(row),
    };
  });

  const nextAfterJson = {
    ...payload,
    groupCount: payload.groupCount ?? payload.expectedCount ?? items.length,
    rowCount: payload.rowCount ?? payload.expectedCount ?? items.length,
    rowsSnapshot,
  };

  await prisma.auditLog.update({
    where: { id: audit.id },
    data: { afterJson: nextAfterJson },
  });

  console.log(
    JSON.stringify(
      {
        auditId: audit.id,
        entityId: audit.entityId,
        rowsSnapshotCount: rowsSnapshot.length,
        expectedCount: payload.expectedCount ?? items.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
