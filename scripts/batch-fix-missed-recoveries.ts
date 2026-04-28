import { PaymentStatusCatalog, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recalculateCreditoState } from '@/server/services/pagos-service';

type ImpactItem = {
  action?: string;
  creditoId?: string;
  recoveryAmount?: number;
  advanceAmount?: number;
  extraWeekAmount?: number;
  partialFailureAmount?: number;
};

type SnapshotRow = {
  creditoId?: string;
  collectibleAmount?: number;
  operationalScope?: string;
};

type Candidate = {
  creditoId: string;
  occurredAt: string;
  recoveryAmount: number;
  auditId: string;
  entityId: string;
  clientName?: string;
  folio?: string;
  loanNumber?: string;
  pureRecovery: boolean;
  reason: string;
};

type RepairResult =
  | {
      status: 'corrected';
      creditoId: string;
      folio: string;
      clientName: string;
      occurredAt: string;
      paymentEventId: string;
      recoveredSchedules: number[];
    }
  | {
      status: 'skipped';
      creditoId: string;
      folio?: string;
      clientName?: string;
      occurredAt: string;
      reason: string;
    };

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMoney(value: Prisma.Decimal | string | number) {
  return Number(value);
}

function money(value: number) {
  return value.toFixed(2);
}

async function findExistingRecoveryPayment(creditoId: string, occurredAt: string) {
  const start = new Date(`${occurredAt}T00:00:00.000Z`);
  const end = new Date(`${occurredAt}T23:59:59.999Z`);

  return prisma.paymentEvent.findFirst({
    where: {
      creditoId,
      isReversed: false,
      receivedAt: { gte: start, lte: end },
      allocations: {
        some: {
          allocationType: 'RECOVERY',
        },
      },
    },
    select: {
      id: true,
      receivedAt: true,
      amountReceived: true,
      allocations: {
        select: {
          allocationType: true,
          defaultEventId: true,
          scheduleId: true,
          amount: true,
        },
      },
    },
  });
}

async function buildCandidates() {
  const [totalCredits, audits] = await Promise.all([
    prisma.credito.count(),
    prisma.auditLog.findMany({
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
    }),
  ]);

  const candidates: Candidate[] = [];
  const reviewedCreditIds = new Set<string>();

  for (const audit of audits) {
    const after = (audit.afterJson ?? {}) as Record<string, unknown>;
    const occurredAt = typeof after.occurredAt === 'string' ? after.occurredAt.slice(0, 10) : null;
    const items = Array.isArray(after.items) ? (after.items as ImpactItem[]) : [];
    const rowsSnapshot = Array.isArray(after.rowsSnapshot) ? (after.rowsSnapshot as SnapshotRow[]) : [];
    const rowsByCredito = new Map(rowsSnapshot.map((row) => [String(row.creditoId ?? ''), row]));

    for (const item of items) {
      if (item.action !== 'PAY') continue;
      const creditoId = item.creditoId;
      const recoveryAmount = Math.max(0, Number(item.recoveryAmount ?? 0));
      if (!creditoId || !occurredAt || recoveryAmount <= 0) continue;

      reviewedCreditIds.add(creditoId);
      const row = rowsByCredito.get(creditoId);
      const pureRecovery =
        Math.max(0, Number(item.advanceAmount ?? 0)) <= 0.001 &&
        Math.max(0, Number(item.extraWeekAmount ?? 0)) <= 0.001 &&
        Math.max(0, Number(item.partialFailureAmount ?? 0)) <= 0.001 &&
        Math.max(0, Number(row?.collectibleAmount ?? 0)) <= 0.001;

      const existingPayment = await findExistingRecoveryPayment(creditoId, occurredAt);
      if (existingPayment) continue;

      const credito = await prisma.credito.findUnique({
        where: { id: creditoId },
        select: {
          folio: true,
          loanNumber: true,
          cliente: { select: { fullName: true } },
        },
      });

      candidates.push({
        creditoId,
        occurredAt,
        recoveryAmount,
        auditId: audit.id,
        entityId: audit.entityId,
        clientName: credito?.cliente.fullName,
        folio: credito?.folio,
        loanNumber: credito?.loanNumber,
        pureRecovery,
        reason: pureRecovery ? 'missing_recovery_payment' : 'not_pure_recovery_pattern',
      });
    }
  }

  return {
    totalCredits,
    reviewedCredits: reviewedCreditIds.size,
    candidates,
  };
}

async function repairCandidate(candidate: Candidate, capturedStatus: PaymentStatusCatalog, fallbackUserId: string): Promise<RepairResult> {
  if (!candidate.pureRecovery) {
    return {
      status: 'skipped',
      creditoId: candidate.creditoId,
      folio: candidate.folio,
      clientName: candidate.clientName,
      occurredAt: candidate.occurredAt,
      reason: 'El impacto no es de recuperado puro; requiere revisión manual.',
    };
  }

  const duplicate = await findExistingRecoveryPayment(candidate.creditoId, candidate.occurredAt);
  if (duplicate) {
    return {
      status: 'skipped',
      creditoId: candidate.creditoId,
      folio: candidate.folio,
      clientName: candidate.clientName,
      occurredAt: candidate.occurredAt,
      reason: 'Ya existe un PaymentEvent de recuperación para esa fecha.',
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const credito = await tx.credito.findUnique({
        where: { id: candidate.creditoId },
        select: {
          id: true,
          folio: true,
          createdByUserId: true,
          cliente: { select: { fullName: true } },
          defaults: {
            select: {
              id: true,
              scheduleId: true,
              amountMissed: true,
              createdAt: true,
              schedule: { select: { installmentNumber: true } },
              recoveries: {
                select: {
                  recoveredAmount: true,
                  paymentEvent: { select: { isReversed: true } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          reversals: {
            where: { sourceType: 'DEFAULT_EVENT' },
            select: { sourceId: true },
          },
        },
      });

      if (!credito) {
        throw new Error('Crédito no encontrado.');
      }

      const reversedDefaultIds = new Set(credito.reversals.map((item) => item.sourceId));
      const unresolvedDefaults = credito.defaults.filter((defaultEvent) => {
        if (reversedDefaultIds.has(defaultEvent.id)) return false;
        const recoveredAmount = defaultEvent.recoveries
          .filter((recovery) => !recovery.paymentEvent.isReversed)
          .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
        return recoveredAmount < toMoney(defaultEvent.amountMissed);
      });

      if (!unresolvedDefaults.length) {
        throw new Error('No quedan fallas pendientes para recuperar.');
      }

      let remaining = candidate.recoveryAmount;
      const userId = credito.createdByUserId ?? fallbackUserId;
      const paymentEvent = await tx.paymentEvent.create({
        data: {
          creditoId: credito.id,
          paymentStatusId: capturedStatus.id,
          receivedAt: new Date(`${candidate.occurredAt}T00:00:00.000Z`),
          amountReceived: money(candidate.recoveryAmount),
          notes: `REPROCESO MASIVO RECUPERADO OMITIDO ${candidate.occurredAt}`,
          capturedByUserId: userId,
        },
      });

      const recoveredSchedules: number[] = [];

      for (const defaultEvent of unresolvedDefaults) {
        if (remaining <= 0) break;
        const recoveredAmount = defaultEvent.recoveries
          .filter((recovery) => !recovery.paymentEvent.isReversed)
          .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
        const pendingRecovery = Math.max(0, toMoney(defaultEvent.amountMissed) - recoveredAmount);
        if (pendingRecovery <= 0) continue;

        const applied = Math.min(remaining, pendingRecovery);
        remaining -= applied;

        await tx.paymentAllocation.create({
          data: {
            paymentEventId: paymentEvent.id,
            scheduleId: defaultEvent.scheduleId,
            defaultEventId: defaultEvent.id,
            allocationType: 'RECOVERY',
            amount: money(applied),
          },
        });

        await tx.recoveryEvent.create({
          data: {
            creditoId: credito.id,
            paymentEventId: paymentEvent.id,
            defaultEventId: defaultEvent.id,
            recoveredAmount: money(applied),
            createdByUserId: userId,
          },
        });

        recoveredSchedules.push(defaultEvent.schedule.installmentNumber);
      }

      if (remaining > 0.001) {
        throw new Error(`No se pudo aplicar completo el recuperado; sobran ${money(remaining)}.`);
      }

      await recalculateCreditoState(tx, credito.id);

      return {
        paymentEventId: paymentEvent.id,
        recoveredSchedules,
        folio: credito.folio,
        clientName: credito.cliente.fullName,
      };
    });

    return {
      status: 'corrected',
      creditoId: candidate.creditoId,
      folio: result.folio,
      clientName: result.clientName,
      occurredAt: candidate.occurredAt,
      paymentEventId: result.paymentEventId,
      recoveredSchedules: result.recoveredSchedules,
    };
  } catch (error) {
    return {
      status: 'skipped',
      creditoId: candidate.creditoId,
      folio: candidate.folio,
      clientName: candidate.clientName,
      occurredAt: candidate.occurredAt,
      reason: error instanceof Error ? error.message : 'Error desconocido durante el reproceso.',
    };
  }
}

async function fixStaleRecoveredSchedules() {
  const staleDefaults = await prisma.defaultEvent.findMany({
    select: {
      creditoId: true,
      scheduleId: true,
      amountMissed: true,
      credito: {
        select: {
          folio: true,
          cliente: { select: { fullName: true } },
        },
      },
      schedule: {
        select: {
          installmentNumber: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true } },
        },
      },
      recoveries: {
        select: {
          recoveredAmount: true,
          paymentEvent: { select: { isReversed: true } },
        },
      },
    },
  });

  const staleCreditIds = new Map<string, { folio: string; clientName: string }>();

  for (const defaultEvent of staleDefaults) {
    const recoveredAmount = defaultEvent.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
    const fullyRecovered = recoveredAmount >= toMoney(defaultEvent.amountMissed) - 0.001;
    const scheduleStale =
      defaultEvent.schedule.installmentStatus.code !== 'PAID' ||
      Math.abs(toMoney(defaultEvent.schedule.paidAmount) - toMoney(defaultEvent.schedule.expectedAmount)) > 0.001;

    if (fullyRecovered && scheduleStale) {
      staleCreditIds.set(defaultEvent.creditoId, {
        folio: defaultEvent.credito.folio,
        clientName: defaultEvent.credito.cliente.fullName,
      });
    }
  }

  const recalculated: Array<{ creditoId: string; folio: string; clientName: string }> = [];
  for (const [creditoId, info] of staleCreditIds.entries()) {
    await prisma.$transaction(async (tx) => {
      await recalculateCreditoState(tx, creditoId);
    });
    recalculated.push({ creditoId, ...info });
  }

  return recalculated;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { totalCredits, reviewedCredits, candidates } = await buildCandidates();
  const affected = candidates.filter((candidate) => candidate.reason === 'missing_recovery_payment');
  const notAutoFixable = candidates.filter((candidate) => candidate.reason !== 'missing_recovery_payment');

  const fallbackUser = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!fallbackUser) {
    throw new Error('No encontré un usuario activo para ejecutar correcciones.');
  }

  const capturedStatus = await prisma.paymentStatusCatalog.findUnique({
    where: { code: 'CAPTURED' },
  });
  if (!capturedStatus) {
    throw new Error('No existe PaymentStatus CAPTURED.');
  }

  const repairResults: RepairResult[] = [];
  if (apply) {
    const grouped = [...affected].sort((a, b) => {
      if (a.creditoId === b.creditoId) return a.occurredAt.localeCompare(b.occurredAt);
      return a.creditoId.localeCompare(b.creditoId);
    });

    for (const candidate of grouped) {
      const result = await repairCandidate(candidate, capturedStatus, fallbackUser.id);
      repairResults.push(result);
    }
  }

  const recalculatedCredits = apply ? await fixStaleRecoveredSchedules() : [];

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'audit',
        totalCredits,
        reviewedCredits,
        affectedCount: affected.length,
        affected,
        notAutoFixableCount: notAutoFixable.length,
        notAutoFixable,
        correctedCount: repairResults.filter((result) => result.status === 'corrected').length,
        corrected: repairResults.filter((result) => result.status === 'corrected'),
        skippedCount: repairResults.filter((result) => result.status === 'skipped').length,
        skipped: repairResults.filter((result) => result.status === 'skipped'),
        recalculatedCreditsCount: recalculatedCredits.length,
        recalculatedCredits,
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
