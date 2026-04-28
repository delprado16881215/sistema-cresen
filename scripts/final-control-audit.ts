import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ImpactItem = {
  action?: string;
  creditoId?: string;
  recoveryAmount?: number;
  extraWeekAmount?: number;
  advanceAmount?: number;
  partialFailureAmount?: number;
};

type IntendedMovement = {
  creditoId: string;
  occurredAt: string;
  auditId: string;
  entityId: string;
  intendedRecovery: number;
  intendedExtraWeek: number;
};

function toMoney(value: Prisma.Decimal | string | number | null | undefined) {
  return Number(value ?? 0);
}

function sameDayRange(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

function almostEqual(left: number, right: number) {
  return Math.abs(left - right) <= 0.001;
}

async function buildIntendedMovements() {
  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      action: 'CREATE',
    },
    select: {
      id: true,
      entityId: true,
      afterJson: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const movements = new Map<string, IntendedMovement>();

  for (const audit of audits) {
    const after = (audit.afterJson ?? {}) as Record<string, unknown>;
    const occurredAt = typeof after.occurredAt === 'string' ? after.occurredAt.slice(0, 10) : null;
    const items = Array.isArray(after.items) ? (after.items as ImpactItem[]) : [];
    if (!occurredAt) continue;

    for (const item of items) {
      if (item.action !== 'PAY' || !item.creditoId) continue;
      const intendedRecovery = Math.max(0, Number(item.recoveryAmount ?? 0));
      const intendedExtraWeek = Math.max(0, Number(item.extraWeekAmount ?? 0));
      if (intendedRecovery <= 0 && intendedExtraWeek <= 0) continue;

      const key = `${item.creditoId}|${occurredAt}`;
      const existing = movements.get(key);
      if (existing) {
        existing.intendedRecovery += intendedRecovery;
        existing.intendedExtraWeek += intendedExtraWeek;
      } else {
        movements.set(key, {
          creditoId: item.creditoId,
          occurredAt,
          auditId: audit.id,
          entityId: audit.entityId,
          intendedRecovery,
          intendedExtraWeek,
        });
      }
    }
  }

  return [...movements.values()];
}

async function auditSnapshotAgainstBase(movement: IntendedMovement) {
  const { start, end } = sameDayRange(movement.occurredAt);

  const [credito, payments] = await Promise.all([
    prisma.credito.findUnique({
      where: { id: movement.creditoId },
      select: {
        id: true,
        folio: true,
        loanNumber: true,
        cliente: { select: { fullName: true, code: true } },
      },
    }),
    prisma.paymentEvent.findMany({
      where: {
        creditoId: movement.creditoId,
        isReversed: false,
        receivedAt: { gte: start, lte: end },
      },
      orderBy: { receivedAt: 'asc' },
      select: {
        id: true,
        receivedAt: true,
        amountReceived: true,
        allocations: {
          select: {
            id: true,
            amount: true,
            allocationType: true,
            scheduleId: true,
            defaultEventId: true,
            extraWeekEventId: true,
          },
        },
      },
    }),
  ]);

  const paymentIds = payments.map((payment) => payment.id);
  const recoveryEvents = paymentIds.length
    ? await prisma.recoveryEvent.findMany({
        where: { paymentEventId: { in: paymentIds } },
        select: {
          id: true,
          recoveredAmount: true,
          defaultEventId: true,
          paymentEventId: true,
        },
      })
    : [];

  const actualRecovery = payments.reduce((sum, payment) => {
    return (
      sum +
      payment.allocations
        .filter((allocation) => allocation.allocationType === 'RECOVERY')
        .reduce((allocationSum, allocation) => allocationSum + toMoney(allocation.amount), 0)
    );
  }, 0);

  const actualExtraWeek = payments.reduce((sum, payment) => {
    return (
      sum +
      payment.allocations
        .filter((allocation) => allocation.allocationType === 'EXTRA_WEEK')
        .reduce((allocationSum, allocation) => allocationSum + toMoney(allocation.amount), 0)
    );
  }, 0);

  const actualRecoveryEvents = recoveryEvents.reduce((sum, event) => sum + toMoney(event.recoveredAmount), 0);

  const issues: string[] = [];
  if (!payments.length) {
    issues.push('snapshot_without_payment_event');
  }
  if (!almostEqual(actualRecovery, movement.intendedRecovery)) {
    issues.push('recovery_allocation_mismatch');
  }
  if (!almostEqual(actualExtraWeek, movement.intendedExtraWeek)) {
    issues.push('extra_week_allocation_mismatch');
  }
  if (!almostEqual(actualRecoveryEvents, actualRecovery)) {
    issues.push('recovery_event_mismatch');
  }

  return {
    creditoId: movement.creditoId,
    folio: credito?.folio ?? null,
    loanNumber: credito?.loanNumber ?? null,
    clientName: credito?.cliente.fullName ?? null,
    occurredAt: movement.occurredAt,
    auditId: movement.auditId,
    entityId: movement.entityId,
    intendedRecovery: movement.intendedRecovery,
    intendedExtraWeek: movement.intendedExtraWeek,
    paymentEventIds: paymentIds,
    actualRecovery,
    actualExtraWeek,
    actualRecoveryEvents,
    issues,
  };
}

async function auditRecoveredSchedulesState() {
  const reversedDefaultIds = new Set(
    (
      await prisma.financialReversal.findMany({
        where: { sourceType: 'DEFAULT_EVENT' },
        select: { sourceId: true },
      })
    ).map((row) => row.sourceId),
  );

  const defaults = await prisma.defaultEvent.findMany({
    select: {
      id: true,
      amountMissed: true,
      creditoId: true,
      credito: {
        select: {
          folio: true,
          loanNumber: true,
          cliente: { select: { fullName: true, code: true } },
          schedules: {
            select: { id: true },
            take: 1,
          },
        },
      },
      schedule: {
        select: {
          id: true,
          installmentNumber: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
        },
      },
      recoveries: {
        select: {
          recoveredAmount: true,
          paymentEvent: { select: { isReversed: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const staleSchedules = defaults
    .filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id))
    .map((defaultEvent) => {
      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
      const fullyRecovered = recoveredAmount >= toMoney(defaultEvent.amountMissed) - 0.001;
      const scheduleShouldBePaid =
        fullyRecovered &&
        (defaultEvent.schedule.installmentStatus.code !== 'PAID' ||
          Math.abs(toMoney(defaultEvent.schedule.paidAmount) - toMoney(defaultEvent.schedule.expectedAmount)) > 0.001);

      return scheduleShouldBePaid
        ? {
            creditoId: defaultEvent.creditoId,
            folio: defaultEvent.credito.folio,
            loanNumber: defaultEvent.credito.loanNumber,
            clientName: defaultEvent.credito.cliente.fullName,
            installmentNumber: defaultEvent.schedule.installmentNumber,
            recoveredAmount,
            amountMissed: toMoney(defaultEvent.amountMissed),
            scheduleStatus: defaultEvent.schedule.installmentStatus.code,
            paidAmount: toMoney(defaultEvent.schedule.paidAmount),
            expectedAmount: toMoney(defaultEvent.schedule.expectedAmount),
          }
        : null;
    })
    .filter(Boolean);

  const creditsWithHistoricalFailures = new Map<string, { folio: string; clientName: string; loanNumber: string | null; schedulesCount: number }>();
  for (const defaultEvent of defaults) {
    if (reversedDefaultIds.has(defaultEvent.id)) continue;
    const info = creditsWithHistoricalFailures.get(defaultEvent.creditoId);
    if (!info) {
      creditsWithHistoricalFailures.set(defaultEvent.creditoId, {
        folio: defaultEvent.credito.folio,
        clientName: defaultEvent.credito.cliente.fullName,
        loanNumber: defaultEvent.credito.loanNumber,
        schedulesCount: defaultEvent.credito.schedules.length,
      });
    }
  }

  const week13RenderIssues = [...creditsWithHistoricalFailures.entries()]
    .filter(([, info]) => info.schedulesCount === 0)
    .map(([creditoId, info]) => ({
      creditoId,
      folio: info.folio,
      loanNumber: info.loanNumber,
      clientName: info.clientName,
      issue: 'no_regular_schedules_to_derive_week13',
    }));

  return {
    staleSchedules,
    creditsWithHistoricalFailuresCount: creditsWithHistoricalFailures.size,
    week13RenderIssues,
  };
}

async function validateNamedCase(folio: string, expectedDates: string[]) {
  const credito = await prisma.credito.findFirst({
    where: { folio },
    select: {
      id: true,
      folio: true,
      cliente: { select: { fullName: true } },
      extraWeek: {
        select: {
          id: true,
          paidAmount: true,
          status: true,
        },
      },
      defaults: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amountMissed: true,
          schedule: { select: { installmentNumber: true, paidAmount: true, installmentStatus: { select: { code: true } } } },
          recoveries: {
            select: {
              recoveredAmount: true,
              paymentEvent: { select: { isReversed: true, receivedAt: true } },
            },
          },
        },
      },
      payments: {
        where: { isReversed: false },
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          allocations: {
            select: {
              allocationType: true,
              amount: true,
              scheduleId: true,
              defaultEventId: true,
              extraWeekEventId: true,
            },
          },
        },
      },
    },
  });

  if (!credito) {
    return { folio, found: false };
  }

  const paymentDates = credito.payments.map((payment) => payment.receivedAt.toISOString().slice(0, 10));
  const unresolvedDefaults = credito.defaults
    .map((defaultEvent) => {
      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
      return {
        installmentNumber: defaultEvent.schedule.installmentNumber,
        pending: Math.max(0, toMoney(defaultEvent.amountMissed) - recoveredAmount),
        scheduleStatus: defaultEvent.schedule.installmentStatus.code,
      };
    })
    .filter((item) => item.pending > 0.001);

  return {
    folio,
    found: true,
    clientName: credito.cliente.fullName,
    expectedDates,
    paymentDatesFound: expectedDates.filter((date) => paymentDates.includes(date)),
    missingExpectedDates: expectedDates.filter((date) => !paymentDates.includes(date)),
    unresolvedDefaults,
    extraWeek: credito.extraWeek
      ? {
          status: credito.extraWeek.status,
          paidAmount: toMoney(credito.extraWeek.paidAmount),
        }
      : null,
  };
}

async function main() {
  const totalCredits = await prisma.credito.count();
  const intendedMovements = await buildIntendedMovements();
  const reviewedCredits = new Set(intendedMovements.map((item) => item.creditoId)).size;

  const snapshotResults = [] as Awaited<ReturnType<typeof auditSnapshotAgainstBase>>[];
  for (const movement of intendedMovements) {
    snapshotResults.push(await auditSnapshotAgainstBase(movement));
  }

  const snapshotIssues = snapshotResults.filter((result) => result.issues.length > 0);
  const recoveredScheduleAudit = await auditRecoveredSchedulesState();

  const namedCases = await Promise.all([
    validateNamedCase('CRED-20240916-0095', ['2024-12-30', '2025-01-06']),
    validateNamedCase('CRED-20240617-0030', ['2024-09-23']),
    validateNamedCase('CRED-20240729-0056', ['2024-11-04']),
    validateNamedCase('CRED-20240916-0098', ['2024-12-16', '2024-12-30']),
  ]);

  console.log(
    JSON.stringify(
      {
        totalCredits,
        reviewedCredits,
        snapshotIntentCount: intendedMovements.length,
        snapshotIssuesCount: snapshotIssues.length,
        snapshotIssues,
        staleRecoveredSchedulesCount: recoveredScheduleAudit.staleSchedules.length,
        staleRecoveredSchedules: recoveredScheduleAudit.staleSchedules,
        creditsWithHistoricalFailuresCount: recoveredScheduleAudit.creditsWithHistoricalFailuresCount,
        week13RenderIssuesCount: recoveredScheduleAudit.week13RenderIssues.length,
        week13RenderIssues: recoveredScheduleAudit.week13RenderIssues,
        namedCases,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
