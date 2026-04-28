import pkg from '@prisma/client';

const { PrismaClient } = pkg;

const prisma = new PrismaClient();

function toDateKey(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mazatlan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getOperationalWeek(startDateKey, todayKey) {
  const start = new Date(`${startDateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  const diffInDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

async function main() {
  const promotoria = await prisma.promotoria.findFirst({
    where: { name: 'VICKY EL NAYAR' },
    select: { id: true, name: true },
  });

  if (!promotoria) {
    throw new Error('Promotoria not found');
  }

  const selectedDateKey = '2024-09-23';
  const selectedDate = new Date(`${selectedDateKey}T12:00:00`);
  const salesWindowStartDate = new Date(`${selectedDateKey}T12:00:00`);
  salesWindowStartDate.setDate(salesWindowStartDate.getDate() - 84);
  const salesWindowEndDate = new Date(`${selectedDateKey}T12:00:00`);
  salesWindowEndDate.setDate(salesWindowEndDate.getDate() - 7);
  const activeWindowStartKey = toDateKey(salesWindowStartDate);
  const activeWindowEndKey = toDateKey(salesWindowEndDate);
  const cutoffEnd = new Date(`${selectedDateKey}T23:59:59.999`);

  const creditos = await prisma.credito.findMany({
    where: {
      promotoriaId: promotoria.id,
      cancelledAt: null,
      creditStatus: { code: { in: ['ACTIVE', 'COMPLETED'] } },
    },
    include: {
      creditStatus: { select: { code: true } },
      cliente: { select: { code: true, fullName: true } },
      schedules: {
        include: {
          installmentStatus: { select: { code: true } },
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
          schedule: { select: { id: true } },
          recoveries: {
            include: {
              paymentEvent: { select: { receivedAt: true, isReversed: true } },
            },
          },
        },
      },
      extraWeek: {
        include: {
          allocations: {
            include: {
              paymentEvent: { select: { receivedAt: true, isReversed: true } },
            },
          },
        },
      },
      reversals: {
        select: { sourceType: true, sourceId: true, reversedAt: true },
      },
    },
    orderBy: [{ controlNumber: 'desc' }, { createdAt: 'asc' }],
  });

  const rows = [];

  for (const credito of creditos) {
    const firstSchedule = credito.schedules[0];
    const salesStartKey = toDateKey(credito.startDate);
    const scheduleWeekAnchorKey = firstSchedule ? toDateKey(firstSchedule.dueDate) : salesStartKey;
    const operationalWeek = getOperationalWeek(scheduleWeekAnchorKey, selectedDateKey);
    const hasExtraWeekInCycle =
      operationalWeek === 13 &&
      Boolean(credito.extraWeek && !['PAID', 'EXEMPT', 'REVERSED'].includes(credito.extraWeek.status));

    const baseOperationalScope =
      operationalWeek >= 14 ? 'overdue' : hasExtraWeekInCycle ? 'active_with_extra_week' : 'active';

    const isWithinActiveWindow = salesStartKey >= activeWindowStartKey && salesStartKey <= activeWindowEndKey;

    const reversedDefaultIds = new Set(
      credito.reversals
        .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT' && reversal.reversedAt <= cutoffEnd)
        .map((reversal) => reversal.sourceId),
    );

    const paidAsOf = (schedule) =>
      schedule.allocations
        .filter((allocation) => !allocation.paymentEvent.isReversed && allocation.paymentEvent.receivedAt <= cutoffEnd)
        .reduce((sum, allocation) => sum + Number(allocation.amount), 0);

    const unpaidAsOf = (schedule) => Math.max(0, Number(schedule.expectedAmount) - paidAsOf(schedule));

    const firstHistoricalOverdueSchedule = credito.schedules.find((schedule) => {
      const dueDateKey = toDateKey(schedule.dueDate);
      return dueDateKey <= selectedDateKey && unpaidAsOf(schedule) > 0;
    });

    const targetScheduleForSelectedDate =
      baseOperationalScope === 'active'
        ? credito.schedules.find((schedule) => toDateKey(schedule.dueDate) === selectedDateKey)
        : null;

    const targetScheduleForOperationalWeek =
      baseOperationalScope === 'active'
        ? credito.schedules.find(
            (schedule) =>
              schedule.installmentNumber === operationalWeek &&
              toDateKey(schedule.dueDate) <= selectedDateKey,
          )
        : null;

    const targetSchedule =
      baseOperationalScope === 'active'
        ? targetScheduleForSelectedDate ?? targetScheduleForOperationalWeek
        : baseOperationalScope === 'overdue'
          ? firstHistoricalOverdueSchedule
          : null;

    const unresolvedRecoveryAmount = credito.defaults.reduce((sum, defaultEvent) => {
      if (defaultEvent.createdAt > cutoffEnd) return sum;
      if (reversedDefaultIds.has(defaultEvent.id)) return sum;

      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed && recovery.paymentEvent.receivedAt <= cutoffEnd)
        .reduce((recoverySum, recovery) => recoverySum + Number(recovery.recoveredAmount), 0);

      const pendingRecoveryAmount = Math.max(0, Number(defaultEvent.amountMissed) - recoveredAmount);
      return sum + pendingRecoveryAmount;
    }, 0);

    const extraWeekCollectible = credito.extraWeek
      ? Math.max(
          0,
          Number(credito.extraWeek.expectedAmount) -
            credito.extraWeek.allocations
              .filter(
                (allocation) =>
                  !allocation.paymentEvent.isReversed && allocation.paymentEvent.receivedAt <= cutoffEnd,
              )
              .reduce((sum, allocation) => sum + Number(allocation.amount), 0),
        )
      : 0;

    const hasRecoverableBalance = unresolvedRecoveryAmount > 0;
    const hasPendingExtraWeek = extraWeekCollectible > 0;
    const hasOverdueBalance = Boolean(firstHistoricalOverdueSchedule && unpaidAsOf(firstHistoricalOverdueSchedule) > 0);
    const hasRelevantOperationalBalance = hasRecoverableBalance || hasPendingExtraWeek || hasOverdueBalance;

    const operationalScope = hasPendingExtraWeek
      ? 'active_with_extra_week'
      : !isWithinActiveWindow && (hasRecoverableBalance || hasOverdueBalance)
        ? 'overdue'
        : baseOperationalScope;

    if (!isWithinActiveWindow && !hasRelevantOperationalBalance) continue;

    const deEligible = isWithinActiveWindow && operationalScope === 'active';
    const deAmount = deEligible && targetSchedule ? Number(targetSchedule.expectedAmount) : 0;

    rows.push({
      controlNumber: credito.controlNumber,
      cliente: `${credito.cliente.code} · ${credito.cliente.fullName}`,
      status: credito.creditStatus.code,
      salesStartKey,
      operationalWeek,
      isWithinActiveWindow,
      baseOperationalScope,
      operationalScope,
      installmentNumber: targetSchedule?.installmentNumber ?? null,
      dueDate: targetSchedule ? toDateKey(targetSchedule.dueDate) : null,
      deEligible,
      deAmount,
      unresolvedRecoveryAmount,
      extraWeekCollectible,
    });
  }

  const deRows = rows.filter((row) => row.deAmount > 0);
  const operationalOnlyRows = rows.filter((row) => row.deAmount <= 0 && (row.unresolvedRecoveryAmount > 0 || row.extraWeekCollectible > 0));

  console.log(JSON.stringify({
    promotoria,
    selectedDateKey,
    activeWindowStartKey,
    activeWindowEndKey,
    deTotal: deRows.reduce((sum, row) => sum + row.deAmount, 0),
    deCount: deRows.length,
    deRows,
    operationalOnlyCount: operationalOnlyRows.length,
    operationalOnlyRows,
  }, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
