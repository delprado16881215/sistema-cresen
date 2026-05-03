import { ReversalSourceType } from '@prisma/client';
import type { AdvanceStatus, AllocationType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { writeAuditLog } from '@/lib/audit';
import { findPromotoriaWeeklyCollection } from '@/server/repositories/pago-repository';
import type {
  CreateFallaInput,
  CreatePagoInput,
  ImpactPagoGrupoInput,
  ReverseFallaInput,
  ReversePagoInput,
  SaveGrupoLiquidacionInput,
} from '@/server/validators/pago';

const OPEN_INSTALLMENT_CODES = ['PENDING', 'PARTIAL'] as const;
const CLOSED_INSTALLMENT_CODES = ['PAID', 'ADVANCED'] as const;
const PAYMENT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

type GroupPaymentProtection = {
  expectedScheduleId?: string | null;
  expectedExtraWeekEventId?: string | null;
  expectedRecoveryDefaultEventId?: string | null;
  expectedRecoveryScheduleId?: string | null;
  expectedInstallmentNumber?: number | null;
  expectedRecoveryInstallmentNumber?: number | null;
  requiresRegularScheduleMatch?: boolean;
  requiresRecoveryTargetMatch?: boolean;
  requiresExtraWeekTargetMatch?: boolean;
  requestedCurrentAmount?: number;
  requestedRecoveryAmount?: number;
  requestedAdvanceAmount?: number;
  requestedExtraWeekAmount?: number;
  rowMode?: 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
  occurredAt?: string;
};

type GroupFailureProtection = {
  expectedScheduleId?: string | null;
  occurredAt?: string;
};

type PaymentRegistrationResult = {
  id: string | null;
  creditoId: string;
  duplicateSkipped?: boolean;
  duplicateReason?: string;
};

type FailureRegistrationResult = {
  id: string | null;
  creditoId: string;
  duplicateSkipped?: boolean;
  duplicateReason?: string;
};

type FailureTransactionResult =
  | FailureRegistrationResult
  | {
      id: string;
      creditoId: string;
      clienteName: string;
      installmentNumber: number;
      amountMissed: string;
      penaltyAmount: string;
      duplicateSkipped?: false;
    };

type PaymentTransactionResult =
  | PaymentRegistrationResult
  | {
      id: string;
      creditoId: string;
      clienteName: string;
      avalName: string | null;
      receivedAt: Date;
      amountReceived: Prisma.Decimal | string | number;
      allocations: Array<{
        installmentNumber?: number;
        amount: string;
        allocationType: AllocationType;
        penaltyChargeId: string | null;
        resultingStatus: string | null;
      }>;
      duplicateSkipped?: false;
    };

type GroupRowValidationTarget = {
  creditoId: string;
  recoveryAmountAvailable: number;
  advanceAmountAvailable: number;
  extraWeekAmount: number;
};

function toDecimalNumber(value: Prisma.Decimal | string | number) {
  return Number(value);
}

function toDecimalString(value: number) {
  return value.toFixed(2);
}

function getDayRange(value: string) {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function formatCurrencyValue(value: number) {
  return roundCurrency(value).toFixed(2);
}

function elapsedMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function logGroupPaymentTiming(
  label: string,
  input: {
    creditoId?: string;
    promotoriaId?: string;
    occurredAt?: string;
    scope?: string;
    itemCount?: number;
    durationMs: number;
  },
) {
  console.info(`[pagos-grupo] ${label}`, input);
}

function logGroupPaymentError(
  label: string,
  input: {
    creditoId?: string;
    promotoriaId?: string;
    occurredAt?: string;
    scope?: string;
    durationMs: number;
    error: unknown;
  },
) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  const isTransactionTimeout =
    message.includes('Transaction already closed') ||
    message.includes('expired transaction') ||
    message.includes('The timeout for this transaction');

  console.error(`[pagos-grupo] ${label}`, {
    creditoId: input.creditoId,
    promotoriaId: input.promotoriaId,
    occurredAt: input.occurredAt,
    scope: input.scope,
    durationMs: input.durationMs,
    isTransactionTimeout,
    errorName: input.error instanceof Error ? input.error.name : 'UnknownError',
    errorMessage: message,
  });
}

function normalizeGroupPaymentSplit(
  row: GroupRowValidationTarget,
  item: ImpactPagoGrupoInput['items'][number],
) {
  const requestedRecoveryAmount = roundCurrency(Math.max(0, item.recoveryAmount ?? 0));
  const requestedAdvanceAmount = roundCurrency(Math.max(0, item.advanceAmount ?? 0));
  const requestedExtraWeekAmount = roundCurrency(Math.max(0, item.extraWeekAmount ?? 0));
  const recoveryAvailable = roundCurrency(row.recoveryAmountAvailable);
  const advanceAvailable = roundCurrency(row.advanceAmountAvailable);
  const extraWeekAvailable = roundCurrency(row.extraWeekAmount);

  let recoveryAmount = requestedRecoveryAmount;
  let advanceAmount = requestedAdvanceAmount;
  let extraWeekAmount = requestedExtraWeekAmount;

  if (recoveryAmount > recoveryAvailable + 0.001) {
    const overflowToExtraWeek = roundCurrency(recoveryAmount - recoveryAvailable);
    const normalizedExtraWeekAmount = roundCurrency(extraWeekAmount + overflowToExtraWeek);
    const canAutoDistribute =
      extraWeekAvailable > 0 &&
      normalizedExtraWeekAmount <= extraWeekAvailable + 0.001;

    if (canAutoDistribute) {
      recoveryAmount = recoveryAvailable;
      extraWeekAmount = normalizedExtraWeekAmount;
    } else {
      const guidance =
        extraWeekAvailable > 0
          ? ` Solo ${formatCurrencyValue(recoveryAvailable)} corresponden a recuperado y ${formatCurrencyValue(extraWeekAvailable)} deben ir a semana extra.`
          : ` Solo tiene ${formatCurrencyValue(recoveryAvailable)} de recuperado disponible.`;
      throw new AppError(
        `El crédito ${item.creditoId} capturó ${formatCurrencyValue(recoveryAmount)} como recuperado.${guidance}`,
        'INVALID_GROUP_RECOVERY_SPLIT',
        422,
      );
    }
  }

  if (advanceAmount > advanceAvailable + 0.001) {
    const overflowToExtraWeek = roundCurrency(advanceAmount - advanceAvailable);
    const normalizedExtraWeekAmount = roundCurrency(extraWeekAmount + overflowToExtraWeek);
    const canAutoDistribute =
      extraWeekAvailable > 0 &&
      normalizedExtraWeekAmount <= extraWeekAvailable + 0.001;

    if (canAutoDistribute) {
      advanceAmount = advanceAvailable;
      extraWeekAmount = normalizedExtraWeekAmount;
    } else {
      const guidance =
        extraWeekAvailable > 0
          ? ` Solo ${formatCurrencyValue(advanceAvailable)} corresponden a adelanto y ${formatCurrencyValue(extraWeekAvailable)} deben ir a semana extra.`
          : ` Solo tiene ${formatCurrencyValue(advanceAvailable)} de adelanto disponible.`;
      throw new AppError(
        `El crédito ${item.creditoId} capturó ${formatCurrencyValue(advanceAmount)} como adelanto.${guidance}`,
        'INVALID_GROUP_ADVANCE_SPLIT',
        422,
      );
    }
  }

  if (extraWeekAmount > extraWeekAvailable + 0.001) {
    throw new AppError(
      `El crédito ${item.creditoId} capturó ${formatCurrencyValue(extraWeekAmount)} como semana extra, pero solo tiene ${formatCurrencyValue(extraWeekAvailable)} disponible.`,
      'INVALID_GROUP_EXTRA_WEEK_AMOUNT',
      422,
    );
  }

  return {
    ...item,
    recoveryAmount,
    advanceAmount,
    extraWeekAmount,
  };
}

function buildGroupExecutionKey(input: {
  promotoriaId: string;
  occurredAt: string;
  scope?: 'active' | 'active_with_extra_week' | 'overdue' | 'all';
}) {
  return [input.promotoriaId, input.occurredAt, input.scope ?? 'active'].join('|');
}

function hasPositiveRequestedAmount(value?: number) {
  return (value ?? 0) > 0.001;
}

function describeGroupPaymentTarget(protection?: GroupPaymentProtection) {
  switch (protection?.rowMode) {
    case 'final_closure':
      return 'el cierre operativo del crédito';
    case 'recovery_only':
      return 'el recuperado final del crédito';
    case 'extra_week_only':
      return 'la semana 13 del crédito';
    default:
      return 'la semana abierta del crédito';
  }
}

function buildGroupPaymentProtection(input: {
  row: {
    scheduleId: string | null;
    extraWeekEventId: string | null;
    recoveryAnchorDefaultEventId: string | null;
    recoveryAnchorScheduleId: string | null;
    recoveryAnchorInstallmentNumber: number | null;
    rowMode: 'regular' | 'recovery_only' | 'extra_week_only' | 'final_closure';
  };
  occurredAt: string;
  requestedRecoveryAmount: number;
  requestedAdvanceAmount: number;
  requestedExtraWeekAmount: number;
}) {
  const { row } = input;

  return {
    expectedScheduleId: row.scheduleId,
    expectedExtraWeekEventId: row.extraWeekEventId,
    expectedRecoveryDefaultEventId: row.recoveryAnchorDefaultEventId,
    expectedRecoveryScheduleId: row.recoveryAnchorScheduleId,
    expectedRecoveryInstallmentNumber: row.recoveryAnchorInstallmentNumber,
    requiresRegularScheduleMatch: row.rowMode === 'regular',
    requiresRecoveryTargetMatch:
      hasPositiveRequestedAmount(input.requestedRecoveryAmount) &&
      Boolean(row.recoveryAnchorDefaultEventId),
    requiresExtraWeekTargetMatch:
      hasPositiveRequestedAmount(input.requestedExtraWeekAmount) &&
      Boolean(row.extraWeekEventId),
    requestedRecoveryAmount: input.requestedRecoveryAmount,
    requestedAdvanceAmount: input.requestedAdvanceAmount,
    requestedExtraWeekAmount: input.requestedExtraWeekAmount,
    rowMode: row.rowMode,
    occurredAt: input.occurredAt,
  } satisfies GroupPaymentProtection;
}

async function acquireTransactionalLock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

function sumDefaultRecoveries(defaultEvent: {
  recoveries: Array<{ recoveredAmount: Prisma.Decimal | string | number }>;
}) {
  return defaultEvent.recoveries.reduce((sum, recovery) => sum + toDecimalNumber(recovery.recoveredAmount), 0);
}

async function getOperationalRules() {
  const [penaltyRule, extraWeekRule] = await Promise.all([
    prisma.businessRule.findUnique({ where: { key: 'FAILURE_PENALTY_AMOUNT' } }),
    prisma.businessRule.findUnique({ where: { key: 'ENABLE_EXTRA_WEEK' } }),
  ]);

  return {
    failurePenaltyAmount: Number(penaltyRule?.valueNumber ?? 50),
    enableExtraWeek: extraWeekRule?.valueBoolean ?? true,
  };
}

export async function recalculateCreditoState(tx: Prisma.TransactionClient, creditoId: string) {
  const [
    schedules,
    paymentEvents,
    paymentAllocations,
    defaultEvents,
    penalties,
    extraWeek,
    reversals,
    paidInstallmentStatus,
    pendingInstallmentStatus,
    partialInstallmentStatus,
    failedInstallmentStatus,
    advancedInstallmentStatus,
    completedCreditStatus,
    activeCreditStatus,
    pendingPenaltyStatus,
    paidPenaltyStatus,
    reversedPenaltyStatus,
  ] = await Promise.all([
    tx.creditSchedule.findMany({
      where: { creditoId },
      include: { installmentStatus: true },
      orderBy: [{ installmentNumber: 'asc' }],
    }),
    tx.paymentEvent.findMany({
      where: { creditoId },
      include: { allocations: true },
    }),
    tx.paymentAllocation.findMany({
      where: {
        paymentEvent: {
          creditoId,
          isReversed: false,
        },
      },
    }),
    tx.defaultEvent.findMany({
      where: { creditoId },
      include: { recoveries: { include: { paymentEvent: true } } },
    }),
    tx.penaltyCharge.findMany({
      where: { creditoId },
      include: {
        defaultEvent: true,
      },
    }),
    tx.extraWeekEvent.findUnique({ where: { creditoId } }),
    tx.financialReversal.findMany({ where: { creditoId } }),
    tx.installmentStatusCatalog.findUnique({ where: { code: 'PAID' } }),
    tx.installmentStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
    tx.installmentStatusCatalog.findUnique({ where: { code: 'PARTIAL' } }),
    tx.installmentStatusCatalog.findUnique({ where: { code: 'FAILED' } }),
    tx.installmentStatusCatalog.findUnique({ where: { code: 'ADVANCED' } }),
    tx.creditStatusCatalog.findUnique({ where: { code: 'COMPLETED' } }),
    tx.creditStatusCatalog.findUnique({ where: { code: 'ACTIVE' } }),
    tx.penaltyStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
    tx.penaltyStatusCatalog.findUnique({ where: { code: 'PAID' } }),
    tx.penaltyStatusCatalog.findUnique({ where: { code: 'REVERSED' } }),
  ]);

  if (
    !paidInstallmentStatus ||
    !pendingInstallmentStatus ||
    !partialInstallmentStatus ||
    !failedInstallmentStatus ||
    !advancedInstallmentStatus ||
    !completedCreditStatus ||
    !activeCreditStatus ||
    !pendingPenaltyStatus ||
    !paidPenaltyStatus ||
    !reversedPenaltyStatus
  ) {
    throw new AppError('Faltan catálogos base para recalcular el crédito.', 'CONFIGURATION_ERROR', 500);
  }

  const reversedDefaultIds = new Set(
    reversals
      .filter((item) => item.sourceType === ReversalSourceType.DEFAULT_EVENT)
      .map((item) => item.sourceId),
  );

  const activeDefaults = defaultEvents.filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id));
  const activeAllocations = paymentAllocations.filter((allocation) => {
    const payment = paymentEvents.find((event) => event.id === allocation.paymentEventId);
    return payment && !payment.isReversed;
  });

  for (const penalty of penalties) {
    const isDefaultReversed = penalty.defaultEventId
      ? reversedDefaultIds.has(penalty.defaultEventId)
      : false;
    const paidAmount = activeAllocations
      .filter((allocation) => allocation.penaltyChargeId === penalty.id)
      .reduce((sum, allocation) => sum + toDecimalNumber(allocation.amount), 0);

    await tx.penaltyCharge.update({
      where: { id: penalty.id },
      data: {
        penaltyStatusId: isDefaultReversed
          ? reversedPenaltyStatus.id
          : paidAmount >= toDecimalNumber(penalty.amount)
            ? paidPenaltyStatus.id
            : pendingPenaltyStatus.id,
        collectedAt:
          !isDefaultReversed && paidAmount >= toDecimalNumber(penalty.amount) ? new Date() : null,
      },
    });
  }

  for (const schedule of schedules) {
    const scheduleAllocations = activeAllocations.filter((allocation) => allocation.scheduleId === schedule.id);
    const paidAmount = scheduleAllocations.reduce((sum, allocation) => sum + toDecimalNumber(allocation.amount), 0);
    const expectedAmount = toDecimalNumber(schedule.expectedAmount);
    const defaultEvent = activeDefaults.find((item) => item.scheduleId === schedule.id);

    let installmentStatusId = pendingInstallmentStatus.id;

    if (defaultEvent) {
      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + toDecimalNumber(recovery.recoveredAmount), 0);

      if (recoveredAmount >= toDecimalNumber(defaultEvent.amountMissed) && paidAmount >= expectedAmount) {
        installmentStatusId = paidInstallmentStatus.id;
      } else {
        installmentStatusId = failedInstallmentStatus.id;
      }
    } else if (paidAmount <= 0) {
      installmentStatusId = pendingInstallmentStatus.id;
    } else if (paidAmount < expectedAmount) {
      installmentStatusId = partialInstallmentStatus.id;
    } else {
      const hasAdvance = scheduleAllocations.some((allocation) => allocation.allocationType === 'ADVANCE');
      installmentStatusId = hasAdvance ? advancedInstallmentStatus.id : paidInstallmentStatus.id;
    }

    await tx.creditSchedule.update({
      where: { id: schedule.id },
      data: {
        paidAmount: toDecimalString(paidAmount),
        installmentStatusId,
      },
    });
  }

  if (extraWeek) {
    const paidAmount = activeAllocations
      .filter((allocation) => allocation.extraWeekEventId === extraWeek.id)
      .reduce((sum, allocation) => sum + toDecimalNumber(allocation.amount), 0);
    const hasActiveDefaults = activeDefaults.length > 0;

    const status =
      paidAmount <= 0
        ? hasActiveDefaults
          ? 'PENDING'
          : 'EXEMPT'
        : paidAmount >= toDecimalNumber(extraWeek.expectedAmount)
          ? 'PAID'
          : 'PARTIAL';

    await tx.extraWeekEvent.update({
      where: { id: extraWeek.id },
      data: {
        paidAmount: toDecimalString(paidAmount),
        status,
        paidAt: status === 'PAID' ? new Date() : null,
        paymentEventId: null,
      },
    });
  }

  const refreshedSchedules = await tx.creditSchedule.findMany({
    where: { creditoId },
    include: { installmentStatus: true },
  });
  const hasOpenSchedules = refreshedSchedules.some(
    (schedule) =>
      !CLOSED_INSTALLMENT_CODES.includes(
        schedule.installmentStatus.code as (typeof CLOSED_INSTALLMENT_CODES)[number],
      ) && schedule.installmentStatus.code !== 'FAILED',
  );
  const hasActiveDefaults = activeDefaults.some((defaultEvent) => {
    const recoveredAmount = defaultEvent.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((sum, recovery) => sum + toDecimalNumber(recovery.recoveredAmount), 0);
    return recoveredAmount < toDecimalNumber(defaultEvent.amountMissed);
  });
  const refreshedExtraWeek = await tx.extraWeekEvent.findUnique({ where: { creditoId } });
  const hasPendingExtraWeek = refreshedExtraWeek && !['PAID', 'EXEMPT'].includes(refreshedExtraWeek.status);

  await tx.credito.update({
    where: { id: creditoId },
    data: {
      creditStatusId:
        !hasOpenSchedules && !hasActiveDefaults && !hasPendingExtraWeek
          ? completedCreditStatus.id
          : activeCreditStatus.id,
      closedAt: !hasOpenSchedules && !hasActiveDefaults && !hasPendingExtraWeek ? new Date() : null,
    },
  });
}

export async function registerFalla(
  input: CreateFallaInput,
  userId: string,
  protection?: GroupFailureProtection,
): Promise<FailureRegistrationResult> {
  const startedAt = performance.now();
  const occurredAt = new Date(input.occurredAt);
  const rules = await getOperationalRules();

  let result: FailureTransactionResult;
  try {
    result = await prisma.$transaction(async (tx) => {
    const lockScope = protection?.expectedScheduleId
      ? `group-failure:${input.creditoId}:${protection.expectedScheduleId}:${input.occurredAt.slice(0, 10)}`
      : `manual-failure:${input.creditoId}:${input.occurredAt.slice(0, 10)}`;
    await acquireTransactionalLock(tx, lockScope);

    const [credito, pendingPenaltyStatus, failedInstallmentStatus] = await Promise.all([
      tx.credito.findFirst({
        where: { id: input.creditoId },
        include: {
          cliente: { select: { fullName: true } },
          creditStatus: { select: { code: true } },
          schedules: {
            include: { installmentStatus: { select: { code: true } } },
            orderBy: [{ installmentNumber: 'asc' }],
          },
          extraWeek: true,
        },
      }),
      tx.penaltyStatusCatalog.findUnique({ where: { code: 'PENDING' } }),
      tx.installmentStatusCatalog.findUnique({ where: { code: 'FAILED' } }),
    ]);

    if (!credito) throw new AppError('No encontramos el crédito seleccionado.', 'CREDITO_NOT_FOUND', 404);
    if (credito.creditStatus.code !== 'ACTIVE') {
      throw new AppError('Solo se pueden registrar fallas en créditos activos.', 'INVALID_CREDIT_STATUS', 422);
    }
    if (!pendingPenaltyStatus) {
      throw new AppError('No existe el estado PENDING para multas.', 'CONFIGURATION_ERROR', 500);
    }
    if (!failedInstallmentStatus) {
      throw new AppError('No existe el estado FAILED en el cronograma.', 'CONFIGURATION_ERROR', 500);
    }

    const currentSchedule = credito.schedules.find((schedule) =>
      OPEN_INSTALLMENT_CODES.includes(schedule.installmentStatus.code as (typeof OPEN_INSTALLMENT_CODES)[number]),
    );
    if (!currentSchedule) {
      throw new AppError('No hay una semana activa para marcar como falla.', 'NO_CURRENT_INSTALLMENT', 422);
    }

    if (protection?.expectedScheduleId && currentSchedule.id !== protection.expectedScheduleId) {
      return {
        id: null,
        creditoId: credito.id,
        duplicateSkipped: true,
        duplicateReason: 'La semana ya cambió y el grupo ya fue impactado previamente para este crédito.',
      };
    }

    const existingDefault = await tx.defaultEvent.findUnique({
      where: { scheduleId: currentSchedule.id },
    });
    if (existingDefault) {
      return {
        id: null,
        creditoId: credito.id,
        duplicateSkipped: true,
        duplicateReason: 'La falla de esta semana ya estaba registrada para la fecha seleccionada.',
      };
    }

    const amountMissed =
      toDecimalNumber(currentSchedule.expectedAmount) - toDecimalNumber(currentSchedule.paidAmount);
    if (amountMissed <= 0) {
      throw new AppError('La semana actual ya no tiene saldo para marcar como falla.', 'NO_MISSED_AMOUNT', 422);
    }

    const defaultEvent = await tx.defaultEvent.create({
      data: {
        creditoId: credito.id,
        scheduleId: currentSchedule.id,
        amountMissed: toDecimalString(amountMissed),
        notes: input.notes ?? null,
        createdByUserId: userId,
        createdAt: occurredAt,
      },
    });

    await tx.penaltyCharge.create({
      data: {
        creditoId: credito.id,
        defaultEventId: defaultEvent.id,
        amount: toDecimalString(rules.failurePenaltyAmount),
        penaltyStatusId: pendingPenaltyStatus.id,
        notes: 'MULTA GENERADA AUTOMATICAMENTE POR FALLA',
        createdByUserId: userId,
        createdAt: occurredAt,
      },
    });

    await tx.creditSchedule.update({
      where: { id: currentSchedule.id },
      data: { installmentStatusId: failedInstallmentStatus.id },
    });

    if (!credito.extraWeek && rules.enableExtraWeek) {
      const lastDueDate = credito.schedules[credito.schedules.length - 1]?.dueDate ?? credito.startDate;
      const dueDate = new Date(lastDueDate);
      dueDate.setDate(dueDate.getDate() + 7);

      await tx.extraWeekEvent.create({
        data: {
          creditoId: credito.id,
          extraWeekNumber: 1,
          dueDate,
          expectedAmount: credito.weeklyAmount,
          paidAmount: '0.00',
          status: 'PENDING',
          generatedByUserId: userId,
          notes: 'SEMANA EXTRA GENERADA POR FALLA',
        },
      });
    }

    await recalculateCreditoState(tx, credito.id);

    return {
      id: defaultEvent.id,
      creditoId: credito.id,
      clienteName: credito.cliente.fullName,
      installmentNumber: currentSchedule.installmentNumber,
      amountMissed: toDecimalString(amountMissed),
      penaltyAmount: toDecimalString(rules.failurePenaltyAmount),
    };
    }, PAYMENT_TRANSACTION_OPTIONS);
  } catch (error) {
    logGroupPaymentError('registerFalla failed', {
      creditoId: input.creditoId,
      occurredAt: input.occurredAt,
      durationMs: elapsedMs(startedAt),
      error,
    });
    throw error;
  }

  logGroupPaymentTiming('registerFalla completed', {
    creditoId: input.creditoId,
    occurredAt: input.occurredAt,
    durationMs: elapsedMs(startedAt),
  });

  if (result.duplicateSkipped) {
    return result;
  }
  if (!result.id) {
    throw new AppError('La falla no pudo registrarse correctamente.', 'DEFAULT_NOT_CREATED', 500);
  }

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'DefaultEvent',
    entityId: result.id,
    action: 'CREATE',
    afterJson: {
      creditoId: result.creditoId,
      clienteName: 'clienteName' in result ? result.clienteName : null,
      installmentNumber: 'installmentNumber' in result ? result.installmentNumber : null,
      amountMissed: 'amountMissed' in result ? result.amountMissed : null,
      penaltyAmount: 'penaltyAmount' in result ? result.penaltyAmount : null,
    },
  });

  return { id: result.id, creditoId: result.creditoId };
}

export async function registerPago(
  input: CreatePagoInput,
  userId: string,
  protection?: GroupPaymentProtection,
): Promise<PaymentRegistrationResult> {
  const startedAt = performance.now();
  const receivedAt = new Date(input.receivedAt);
  const selectedPenaltyIds = Array.from(new Set(input.penaltyChargeIds));
  const { start, end } = getDayRange(input.receivedAt.slice(0, 10));

  let result: PaymentTransactionResult;
  try {
    result = await prisma.$transaction(async (tx) => {
    const lockTarget =
      protection?.expectedScheduleId
        ? `schedule:${protection.expectedScheduleId}`
        : protection?.expectedRecoveryDefaultEventId
          ? `recovery:${protection.expectedRecoveryDefaultEventId}`
        : protection?.expectedExtraWeekEventId
          ? `extra:${protection.expectedExtraWeekEventId}`
          : `manual:${input.creditoId}`;
    await acquireTransactionalLock(tx, `payment:${lockTarget}:${input.receivedAt.slice(0, 10)}`);

    if (protection?.requiresRegularScheduleMatch && protection.expectedScheduleId) {
      const existingCurrentDuplicate = await tx.paymentAllocation.findFirst({
        where: {
          scheduleId: protection.expectedScheduleId,
          allocationType: 'CURRENT',
          paymentEvent: {
            creditoId: input.creditoId,
            isReversed: false,
            receivedAt: { gte: start, lt: end },
          },
        },
        select: { id: true },
      });

      if (existingCurrentDuplicate) {
        return {
          id: null,
          creditoId: input.creditoId,
          duplicateSkipped: true,
          duplicateReason: 'El pago grupal de la semana abierta ya estaba registrado para este crédito.',
        };
      }
    }

    if (protection?.requiresRecoveryTargetMatch && protection.expectedRecoveryDefaultEventId) {
      const existingRecoveryDuplicate = await tx.paymentAllocation.findFirst({
        where: {
          defaultEventId: protection.expectedRecoveryDefaultEventId,
          allocationType: 'RECOVERY',
          paymentEvent: {
            creditoId: input.creditoId,
            isReversed: false,
            receivedAt: { gte: start, lt: end },
          },
        },
        select: { id: true },
      });

      if (existingRecoveryDuplicate) {
        return {
          id: null,
          creditoId: input.creditoId,
          duplicateSkipped: true,
          duplicateReason: 'El recuperado grupal ya estaba registrado para este crédito en la fecha seleccionada.',
        };
      }
    }

    if (protection?.requiresExtraWeekTargetMatch && protection.expectedExtraWeekEventId) {
      const existingExtraWeekDuplicate = await tx.paymentAllocation.findFirst({
        where: {
          extraWeekEventId: protection.expectedExtraWeekEventId,
          allocationType: 'EXTRA_WEEK',
          paymentEvent: {
            creditoId: input.creditoId,
            isReversed: false,
            receivedAt: { gte: start, lt: end },
          },
        },
        select: { id: true },
      });

      if (existingExtraWeekDuplicate) {
        return {
          id: null,
          creditoId: input.creditoId,
          duplicateSkipped: true,
          duplicateReason: 'La semana extra grupal ya estaba registrada para este crédito en la fecha seleccionada.',
        };
      }
    }

    const credito = await tx.credito.findFirst({
      where: { id: input.creditoId },
      include: {
        cliente: { select: { id: true, code: true, fullName: true } },
        aval: { select: { id: true, code: true, fullName: true } },
        creditStatus: { select: { id: true, code: true, name: true } },
        promotoria: {
          select: {
            id: true,
            name: true,
            supervision: { select: { id: true, name: true } },
          },
        },
        schedules: {
          include: {
            installmentStatus: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ installmentNumber: 'asc' }],
        },
        defaults: {
          include: {
            schedule: { select: { installmentNumber: true, id: true } },
            recoveries: {
              include: {
                paymentEvent: { select: { isReversed: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        penalties: {
          include: {
            defaultEvent: { select: { id: true } },
            penaltyStatus: { select: { code: true, name: true } },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        extraWeek: true,
      },
    });

    if (!credito) throw new AppError('No encontramos el crédito seleccionado.', 'CREDITO_NOT_FOUND', 404);
    if (!['ACTIVE', 'COMPLETED'].includes(credito.creditStatus.code)) {
      throw new AppError('Solo se pueden registrar pagos en créditos operativos.', 'INVALID_CREDIT_STATUS', 422);
    }

    const currentSchedule = credito.schedules.find((schedule) =>
      OPEN_INSTALLMENT_CODES.includes(schedule.installmentStatus.code as (typeof OPEN_INSTALLMENT_CODES)[number]),
    );

    if (protection?.requiresRegularScheduleMatch && protection.expectedScheduleId && currentSchedule?.id !== protection.expectedScheduleId) {
      return {
        id: null,
        creditoId: credito.id,
        duplicateSkipped: true,
        duplicateReason: 'La semana abierta del crédito ya cambió y este pago grupal ya no corresponde al mismo destino.',
      };
    }

    const unresolvedDefaults = credito.defaults.filter((defaultEvent) => {
      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + toDecimalNumber(recovery.recoveredAmount), 0);
      return recoveredAmount < toDecimalNumber(defaultEvent.amountMissed);
    });
    const firstUnresolvedDefault = unresolvedDefaults[0] ?? null;
    const selectedPenalties = credito.penalties.filter((penalty) => selectedPenaltyIds.includes(penalty.id));
    if (selectedPenalties.length !== selectedPenaltyIds.length) {
      throw new AppError('Una o más multas seleccionadas ya no están disponibles.', 'PENALTY_NOT_FOUND', 422);
    }
    const invalidPenalty = selectedPenalties.find((penalty) => penalty.penaltyStatus.code !== 'PENDING');
    if (invalidPenalty) {
      throw new AppError('Solo se pueden cobrar multas pendientes.', 'PENALTY_NOT_PENDING', 422);
    }
    const futureSchedules = credito.schedules.filter((schedule) => {
      if (!currentSchedule) {
        return OPEN_INSTALLMENT_CODES.includes(
          schedule.installmentStatus.code as (typeof OPEN_INSTALLMENT_CODES)[number],
        );
      }
      return (
        schedule.installmentNumber > currentSchedule.installmentNumber &&
        OPEN_INSTALLMENT_CODES.includes(
          schedule.installmentStatus.code as (typeof OPEN_INSTALLMENT_CODES)[number],
        )
      );
    });
    const extraWeekPending = credito.extraWeek && credito.extraWeek.status !== 'PAID' ? credito.extraWeek : null;

    if (protection?.expectedExtraWeekEventId && extraWeekPending?.id !== protection.expectedExtraWeekEventId) {
      return {
        id: null,
        creditoId: credito.id,
        duplicateSkipped: true,
        duplicateReason: 'La semana extra ya cambió y este pago grupal ya fue procesado.',
      };
    }

    if (
      protection?.requiresRecoveryTargetMatch &&
      protection.expectedRecoveryDefaultEventId &&
      firstUnresolvedDefault?.id !== protection.expectedRecoveryDefaultEventId
    ) {
      return {
        id: null,
        creditoId: credito.id,
        duplicateSkipped: true,
        duplicateReason: 'El recuperado final ya cambió de destino y este pago grupal ya no corresponde a la misma falla pendiente.',
      };
    }

    const totalOutstanding =
      [...(currentSchedule ? [currentSchedule] : []), ...futureSchedules].reduce(
        (sum, schedule) => sum + (toDecimalNumber(schedule.expectedAmount) - toDecimalNumber(schedule.paidAmount)),
        0,
      ) +
      unresolvedDefaults.reduce(
        (sum, defaultEvent) => sum + (toDecimalNumber(defaultEvent.amountMissed) - sumDefaultRecoveries(defaultEvent)),
        0,
      ) +
      selectedPenalties.reduce((sum, penalty) => sum + toDecimalNumber(penalty.amount), 0) +
      (extraWeekPending
        ? toDecimalNumber(extraWeekPending.expectedAmount) - toDecimalNumber(extraWeekPending.paidAmount)
        : 0);

    if (totalOutstanding <= 0) {
      throw new AppError('Este crédito ya no tiene saldo operativo por cobrar.', 'NO_OUTSTANDING_BALANCE', 422);
    }
    if (input.amountReceived > totalOutstanding) {
      throw new AppError(
        `El pago excede el saldo pendiente operativo del crédito (${toDecimalString(totalOutstanding)}).`,
        'PAYMENT_EXCEEDS_OUTSTANDING',
        422,
      );
    }

    const [
      capturedStatus,
      partialStatus,
      paidInstallmentStatus,
      partialInstallmentStatus,
      advancedInstallmentStatus,
      completedCreditStatus,
    ] = await Promise.all([
      tx.paymentStatusCatalog.findUnique({ where: { code: 'CAPTURED' } }),
      tx.paymentStatusCatalog.findUnique({ where: { code: 'PARTIAL' } }),
      tx.installmentStatusCatalog.findUnique({ where: { code: 'PAID' } }),
      tx.installmentStatusCatalog.findUnique({ where: { code: 'PARTIAL' } }),
      tx.installmentStatusCatalog.findUnique({ where: { code: 'ADVANCED' } }),
      tx.creditStatusCatalog.findUnique({ where: { code: 'COMPLETED' } }),
    ]);

    if (
      !capturedStatus ||
      !partialStatus ||
      !paidInstallmentStatus ||
      !partialInstallmentStatus ||
      !advancedInstallmentStatus ||
      !completedCreditStatus
    ) {
      throw new AppError('Faltan catálogos base para registrar pagos.', 'CONFIGURATION_ERROR', 500);
    }

    let remaining = input.amountReceived;
    const allocationPlan: Array<{
      scheduleId?: string;
      defaultEventId?: string;
      penaltyChargeId?: string;
      extraWeekEventId?: string;
      installmentNumber?: number;
      amount: number;
      allocationType: AllocationType;
      newPaidAmount?: number;
      newStatusId?: string;
      newStatusCode?: string;
      isAdvance?: boolean;
    }> = [];

    const recordedOnInstallmentId = currentSchedule?.id ?? futureSchedules[0]?.id;

    if (currentSchedule && remaining > 0) {
      const pending =
        toDecimalNumber(currentSchedule.expectedAmount) - toDecimalNumber(currentSchedule.paidAmount);
      if (pending > 0) {
        const applied = Math.min(remaining, pending);
        remaining -= applied;
        const newPaidAmount = toDecimalNumber(currentSchedule.paidAmount) + applied;
        const fullyCovered = applied === pending;
        allocationPlan.push({
          scheduleId: currentSchedule.id,
          installmentNumber: currentSchedule.installmentNumber,
          amount: applied,
          allocationType: 'CURRENT',
          newPaidAmount,
          newStatusId: fullyCovered ? paidInstallmentStatus.id : partialInstallmentStatus.id,
          newStatusCode: fullyCovered ? 'PAID' : 'PARTIAL',
        });
      }
    }

    for (const defaultEvent of unresolvedDefaults) {
      if (remaining <= 0) break;
      const pendingRecovery =
        toDecimalNumber(defaultEvent.amountMissed) - sumDefaultRecoveries(defaultEvent);
      if (pendingRecovery <= 0) continue;
      const applied = Math.min(remaining, pendingRecovery);
      remaining -= applied;
      const fullyRecovered =
        applied + sumDefaultRecoveries(defaultEvent) === toDecimalNumber(defaultEvent.amountMissed);
      allocationPlan.push({
        scheduleId: defaultEvent.schedule.id,
        defaultEventId: defaultEvent.id,
        installmentNumber: defaultEvent.schedule.installmentNumber,
        amount: applied,
        allocationType: 'RECOVERY',
        newPaidAmount: fullyRecovered ? toDecimalNumber(defaultEvent.amountMissed) : undefined,
        newStatusId: fullyRecovered ? paidInstallmentStatus.id : undefined,
        newStatusCode: fullyRecovered ? 'PAID' : undefined,
      });
    }

    for (const penalty of selectedPenalties) {
      if (remaining <= 0) break;
      const penaltyAmount = toDecimalNumber(penalty.amount);
      if (remaining < penaltyAmount) {
        throw new AppError(
          'El monto recibido no alcanza para cubrir las multas seleccionadas.',
          'PENALTY_PAYMENT_INSUFFICIENT',
          422,
        );
      }

      remaining -= penaltyAmount;
      allocationPlan.push({
        amount: penaltyAmount,
        allocationType: 'PENALTY',
        newStatusCode: 'PAID',
        penaltyChargeId: penalty.id,
      });
    }

    for (const futureSchedule of futureSchedules) {
      if (remaining <= 0) break;
      const pending =
        toDecimalNumber(futureSchedule.expectedAmount) - toDecimalNumber(futureSchedule.paidAmount);
      if (pending <= 0) continue;
      const applied = Math.min(remaining, pending);
      remaining -= applied;
      const newPaidAmount = toDecimalNumber(futureSchedule.paidAmount) + applied;
      const fullyCovered = applied === pending;
      allocationPlan.push({
        scheduleId: futureSchedule.id,
        installmentNumber: futureSchedule.installmentNumber,
        amount: applied,
        allocationType: 'ADVANCE',
        newPaidAmount,
        newStatusId: fullyCovered ? advancedInstallmentStatus.id : partialInstallmentStatus.id,
        newStatusCode: fullyCovered ? 'ADVANCED' : 'PARTIAL',
        isAdvance: true,
      });
    }

    if (extraWeekPending && remaining > 0) {
      const pending =
        toDecimalNumber(extraWeekPending.expectedAmount) - toDecimalNumber(extraWeekPending.paidAmount);
      if (pending > 0) {
        const applied = Math.min(remaining, pending);
        remaining -= applied;
        const newPaidAmount = toDecimalNumber(extraWeekPending.paidAmount) + applied;
        allocationPlan.push({
          extraWeekEventId: extraWeekPending.id,
          amount: applied,
          allocationType: 'EXTRA_WEEK',
          newPaidAmount,
          newStatusCode:
            newPaidAmount >= toDecimalNumber(extraWeekPending.expectedAmount) ? 'PAID' : 'PARTIAL',
        });
      }
    }

    if (!allocationPlan.length) {
      throw new AppError('No fue posible aplicar el pago al cronograma.', 'PAYMENT_NOT_APPLIED', 422);
    }

    if (protection?.requiresRegularScheduleMatch && protection.expectedScheduleId) {
      const currentAllocation = allocationPlan.find((item) => item.allocationType === 'CURRENT');
      const recoveryAllocation = allocationPlan.find((item) => item.allocationType === 'RECOVERY');
      const protectedScheduleId = currentAllocation?.scheduleId ?? recoveryAllocation?.scheduleId;

      if (protectedScheduleId !== protection.expectedScheduleId) {
        return {
          id: null,
          creditoId: credito.id,
          duplicateSkipped: true,
          duplicateReason: 'La aplicación del pago ya no corresponde a la misma semana abierta del grupo original.',
        };
      }
    }

    if (protection?.requiresRecoveryTargetMatch && protection.expectedRecoveryDefaultEventId) {
      const recoveryAllocations = allocationPlan.filter((item) => item.allocationType === 'RECOVERY');
      const hasRequestedRecovery = hasPositiveRequestedAmount(protection.requestedRecoveryAmount);

      if (hasRequestedRecovery && !recoveryAllocations.length) {
        return {
          id: null,
          creditoId: credito.id,
          duplicateSkipped: true,
          duplicateReason: 'El recuperado final capturado ya no encontró una falla pendiente compatible para aplicar.',
        };
      }

      if (
        hasRequestedRecovery &&
        recoveryAllocations[0]?.defaultEventId !== protection.expectedRecoveryDefaultEventId
      ) {
        return {
          id: null,
          creditoId: credito.id,
          duplicateSkipped: true,
          duplicateReason: 'La aplicación del recuperado final ya no corresponde a la misma falla pendiente del grupo original.',
        };
      }
    }

    if (protection?.requiresExtraWeekTargetMatch && protection.expectedExtraWeekEventId) {
      const extraAllocation = allocationPlan.find((item) => item.allocationType === 'EXTRA_WEEK');
      const hasRequestedExtraWeek = hasPositiveRequestedAmount(protection.requestedExtraWeekAmount);

      if (hasRequestedExtraWeek && !extraAllocation) {
        return {
          id: null,
          creditoId: credito.id,
          duplicateSkipped: true,
          duplicateReason: 'La semana 13 capturada ya no tiene saldo pendiente para aplicar en este crédito.',
        };
      }

      if (hasRequestedExtraWeek && extraAllocation?.extraWeekEventId !== protection.expectedExtraWeekEventId) {
        return {
          id: null,
          creditoId: credito.id,
          duplicateSkipped: true,
          duplicateReason: 'La aplicación de la semana 13 ya no corresponde al mismo destino del grupo original.',
        };
      }
    }

    const paymentStatusId = allocationPlan.some((item) => item.newStatusCode === 'PARTIAL')
      ? partialStatus.id
      : capturedStatus.id;

    const createdPayment = await tx.paymentEvent.create({
      data: {
        creditoId: credito.id,
        paymentStatusId,
        receivedAt,
        amountReceived: toDecimalString(input.amountReceived),
        notes: input.notes ?? null,
        capturedByUserId: userId,
      },
    });

    for (const item of allocationPlan) {
      await tx.paymentAllocation.create({
        data: {
          paymentEventId: createdPayment.id,
          scheduleId: item.scheduleId,
          defaultEventId: item.defaultEventId,
          penaltyChargeId: item.penaltyChargeId,
          extraWeekEventId: item.extraWeekEventId,
          allocationType: item.allocationType,
          amount: toDecimalString(item.amount),
        },
      });

      if (item.defaultEventId) {
        await tx.recoveryEvent.create({
          data: {
            creditoId: credito.id,
            paymentEventId: createdPayment.id,
            defaultEventId: item.defaultEventId,
            recoveredAmount: toDecimalString(item.amount),
            createdByUserId: userId,
          },
        });
      }

      if (item.isAdvance && item.scheduleId && recordedOnInstallmentId) {
        await tx.advanceEvent.create({
          data: {
            creditoId: credito.id,
            paymentEventId: createdPayment.id,
            recordedOnInstallmentId,
            coversInstallmentId: item.scheduleId,
            amount: toDecimalString(item.amount),
            status: 'PENDING' as AdvanceStatus,
            isApplied: false,
            registeredByUserId: userId,
          },
        });
      }
    }

    await recalculateCreditoState(tx, credito.id);

    return {
      id: createdPayment.id,
      creditoId: credito.id,
      clienteName: credito.cliente.fullName,
      avalName: credito.aval?.fullName ?? null,
      receivedAt: createdPayment.receivedAt,
      amountReceived: createdPayment.amountReceived,
      allocations: allocationPlan.map((item) => ({
        installmentNumber: item.installmentNumber,
        amount: toDecimalString(item.amount),
        allocationType: item.allocationType,
        penaltyChargeId: item.penaltyChargeId ?? null,
        resultingStatus: item.newStatusCode ?? null,
      })),
    };
    }, PAYMENT_TRANSACTION_OPTIONS);
  } catch (error) {
    logGroupPaymentError('registerPago failed', {
      creditoId: input.creditoId,
      occurredAt: input.receivedAt,
      durationMs: elapsedMs(startedAt),
      error,
    });
    throw error;
  }

  logGroupPaymentTiming('registerPago completed', {
    creditoId: input.creditoId,
    occurredAt: input.receivedAt,
    durationMs: elapsedMs(startedAt),
  });

  if (result.duplicateSkipped) {
    return result;
  }
  if (!result.id) {
    throw new AppError('El pago no pudo registrarse correctamente.', 'PAYMENT_NOT_CREATED', 500);
  }

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'PaymentEvent',
    entityId: result.id,
    action: 'CREATE',
    afterJson: {
      creditoId: result.creditoId,
      clienteName: 'clienteName' in result ? result.clienteName : null,
      avalName: 'avalName' in result ? result.avalName : null,
      receivedAt: 'receivedAt' in result ? result.receivedAt : null,
      amountReceived: 'amountReceived' in result ? result.amountReceived : null,
      allocations: 'allocations' in result ? result.allocations : [],
    },
  });

  return { id: result.id, creditoId: result.creditoId };
}

export async function reversePago(input: ReversePagoInput, userId: string) {
  const payment = await prisma.paymentEvent.findFirst({
    where: { id: input.paymentEventId },
    include: { credito: true, paymentStatus: true },
  });

  if (!payment) throw new AppError('No encontramos el pago seleccionado.', 'PAYMENT_NOT_FOUND', 404);
  if (payment.isReversed) {
    throw new AppError('Este pago ya fue revertido previamente.', 'PAYMENT_ALREADY_REVERSED', 422);
  }

  await prisma.$transaction(async (tx) => {
    const reversedStatus = await tx.paymentStatusCatalog.findUnique({ where: { code: 'REVERSED' } });

    await tx.paymentEvent.update({
      where: { id: payment.id },
      data: {
        isReversed: true,
        reversedAt: new Date(),
        reversedByUserId: userId,
        reversalReason: input.reason,
        paymentStatusId: reversedStatus?.id ?? payment.paymentStatusId,
      },
    });

    await tx.financialReversal.create({
      data: {
        sourceType: ReversalSourceType.PAYMENT_EVENT,
        sourceId: payment.id,
        creditoId: payment.creditoId,
        reason: input.reason,
        notes: input.notes ?? null,
        reversedByUserId: userId,
      },
    });

    await recalculateCreditoState(tx, payment.creditoId);
  });

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'PaymentEvent',
    entityId: payment.id,
    action: 'REVERSE',
    beforeJson: {
      amountReceived: payment.amountReceived,
      creditoId: payment.creditoId,
    },
    afterJson: {
      reason: input.reason,
      notes: input.notes ?? null,
    },
  });

  return { creditoId: payment.creditoId };
}

export async function reverseFalla(input: ReverseFallaInput, userId: string) {
  const defaultEvent = await prisma.defaultEvent.findFirst({
    where: { id: input.defaultEventId },
    include: {
      penalties: true,
      recoveries: { include: { paymentEvent: true } },
    },
  });

  if (!defaultEvent) throw new AppError('No encontramos la falla seleccionada.', 'DEFAULT_NOT_FOUND', 404);

  const existingReversal = await prisma.financialReversal.findUnique({
    where: {
      sourceType_sourceId: {
        sourceType: ReversalSourceType.DEFAULT_EVENT,
        sourceId: defaultEvent.id,
      },
    },
  });
  if (existingReversal) {
    throw new AppError('Esta falla ya fue corregida previamente.', 'DEFAULT_ALREADY_REVERSED', 422);
  }

  const hasActiveRecoveries = defaultEvent.recoveries.some((recovery) => !recovery.paymentEvent.isReversed);
  if (hasActiveRecoveries) {
    throw new AppError('Primero debes revertir los pagos que recuperaron esta falla.', 'DEFAULT_HAS_ACTIVE_RECOVERIES', 422);
  }

  await prisma.$transaction(async (tx) => {
    const reversedPenaltyStatus = await tx.penaltyStatusCatalog.findUnique({ where: { code: 'REVERSED' } });
    if (!reversedPenaltyStatus) {
      throw new AppError('No existe el estado REVERSED para multas.', 'CONFIGURATION_ERROR', 500);
    }

    await tx.financialReversal.create({
      data: {
        sourceType: ReversalSourceType.DEFAULT_EVENT,
        sourceId: defaultEvent.id,
        creditoId: defaultEvent.creditoId,
        reason: input.reason,
        notes: input.notes ?? null,
        reversedByUserId: userId,
      },
    });

    for (const penalty of defaultEvent.penalties) {
      await tx.penaltyCharge.update({
        where: { id: penalty.id },
        data: {
          penaltyStatusId: reversedPenaltyStatus.id,
          notes: `${penalty.notes ?? ''} REVERSADA: ${input.reason}`.trim(),
        },
      });
    }

    await recalculateCreditoState(tx, defaultEvent.creditoId);
  });

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'DefaultEvent',
    entityId: defaultEvent.id,
    action: 'REVERSE',
    beforeJson: {
      creditoId: defaultEvent.creditoId,
      scheduleId: defaultEvent.scheduleId,
      amountMissed: defaultEvent.amountMissed,
    },
    afterJson: {
      reason: input.reason,
      notes: input.notes ?? null,
    },
  });

  return { creditoId: defaultEvent.creditoId };
}

export async function impactPagoGrupo(input: ImpactPagoGrupoInput, userId: string) {
  const groupStartedAt = performance.now();
  const collection = await findPromotoriaWeeklyCollection(input.promotoriaId, {
    occurredAt: input.occurredAt,
    scope: input.scope,
    legalView: 'group_payments',
  });
  if (collection.mode === 'historical') {
    return {
      paidCount: 0,
      failedCount: 0,
      skippedPayments: 0,
      skippedFailures: 0,
      expectedCount: input.items.length,
      issues: ['La fecha seleccionada ya tiene movimientos registrados. El grupo está en modo histórico y no puede reimpactarse.'],
    };
  }
  const groupRows = collection.rows;
  const rowsByCredito = new Map(groupRows.map((row) => [row.creditoId, row]));
  const validatedSortedItems = [...input.items]
    .sort((left, right) => left.creditoId.localeCompare(right.creditoId))
    .map((item) => {
      const row = rowsByCredito.get(item.creditoId);
      if (!row || item.action !== 'PAY') return item;
      return normalizeGroupPaymentSplit(row, item);
    });
  const groupExecutionKey = buildGroupExecutionKey(input);
  const groupFingerprint = [
    input.promotoriaId,
    input.occurredAt,
    input.scope,
    ...validatedSortedItems.map((item) => {
      const row = rowsByCredito.get(item.creditoId);
      return `${item.creditoId}:${item.action}:${row?.scheduleId ?? row?.extraWeekEventId ?? 'none'}:${item.recoveryAmount ?? 0}:${item.advanceAmount ?? 0}:${item.extraWeekAmount ?? 0}:${item.partialFailureAmount ?? 0}`;
    }),
  ].join('|');
  const itemsByCredito = new Map(validatedSortedItems.map((item) => [item.creditoId, item]));

  let paidCount = 0;
  let failedCount = 0;
  let skippedPayments = 0;
  let skippedFailures = 0;
  const issues: string[] = [];
  const saleAmount = Math.max(0, input.liquidation.saleAmount ?? 0);
  const bonusAmount = Math.max(0, input.liquidation.bonusAmount ?? 0);
  const commissionBase = input.liquidation.commissionBase;
  const commissionRate = Number(input.liquidation.commissionRate);

  for (const item of validatedSortedItems) {
    const rowStartedAt = performance.now();
    const logRowProcessed = () =>
      logGroupPaymentTiming('row processed', {
        creditoId: item.creditoId,
        promotoriaId: input.promotoriaId,
        occurredAt: input.occurredAt,
        scope: input.scope,
        durationMs: elapsedMs(rowStartedAt),
      });
    const row = rowsByCredito.get(item.creditoId);
    if (!row) {
      if (item.action === 'PAY') skippedPayments += 1;
      else skippedFailures += 1;
      issues.push(`El crédito ${item.creditoId} ya no estaba disponible en el grupo semanal al momento de impactar.`);
      logRowProcessed();
      continue;
    }

    if (item.action === 'PAY') {
      const requestedRecoveryAmount = Math.max(0, item.recoveryAmount ?? 0);
      const requestedAdvanceAmount = Math.max(0, item.advanceAmount ?? 0);
      const requestedExtraWeekAmount = Math.max(0, item.extraWeekAmount ?? 0);
      if (requestedRecoveryAmount > row.recoveryAmountAvailable + 0.001) {
        skippedPayments += 1;
        issues.push(`El crédito ${item.creditoId} pidió recuperar ${requestedRecoveryAmount.toFixed(2)} y solo tiene ${row.recoveryAmountAvailable.toFixed(2)} disponible.`);
        logRowProcessed();
        continue;
      }
      if (requestedAdvanceAmount > row.advanceAmountAvailable + 0.001) {
        skippedPayments += 1;
        issues.push(`El crédito ${item.creditoId} pidió adelantar ${requestedAdvanceAmount.toFixed(2)} y solo tiene ${row.advanceAmountAvailable.toFixed(2)} disponible.`);
        logRowProcessed();
        continue;
      }
      if (requestedExtraWeekAmount > row.extraWeekAmount + 0.001) {
        skippedPayments += 1;
        issues.push(`El crédito ${item.creditoId} pidió semana extra ${requestedExtraWeekAmount.toFixed(2)} y solo tiene ${row.extraWeekAmount.toFixed(2)} disponible.`);
        logRowProcessed();
        continue;
      }

      const baseCollectibleAmount = row.operationalScope === 'active_with_extra_week' ? 0 : row.collectibleAmount;
      const paymentAmount = baseCollectibleAmount + requestedRecoveryAmount + requestedAdvanceAmount + requestedExtraWeekAmount;
      if (paymentAmount <= 0) {
        skippedPayments += 1;
        logRowProcessed();
        continue;
      }

      const paymentProtection = buildGroupPaymentProtection({
        row,
        occurredAt: input.occurredAt,
        requestedRecoveryAmount,
        requestedAdvanceAmount,
        requestedExtraWeekAmount,
      });

      const paymentResult = await registerPago(
        {
          creditoId: item.creditoId,
          receivedAt: input.occurredAt,
          amountReceived: paymentAmount,
          penaltyChargeIds: [],
          notes: input.notes ?? null,
        },
        userId,
        paymentProtection,
      );

      if (paymentResult.duplicateSkipped) {
        skippedPayments += 1;
        if (paymentResult.duplicateReason) issues.push(paymentResult.duplicateReason);
      } else {
        paidCount += 1;
      }
      logRowProcessed();
      continue;
    }

    if (!row.scheduleId) {
      skippedFailures += 1;
      issues.push(`El crédito ${item.creditoId} está en ${describeGroupPaymentTarget({ rowMode: row.rowMode })} y no tiene una semana regular disponible para registrar falla.`);
      logRowProcessed();
      continue;
    }
    const partialFailureAmount = Math.max(0, item.partialFailureAmount ?? 0);
    if (partialFailureAmount > row.collectibleAmount + 0.001) {
      skippedFailures += 1;
      issues.push(`El crédito ${item.creditoId} pidió un abono parcial de ${partialFailureAmount.toFixed(2)} y solo tiene ${row.collectibleAmount.toFixed(2)} disponibles en la semana.`);
      logRowProcessed();
      continue;
    }
    if ((item.recoveryAmount ?? 0) > 0 || (item.advanceAmount ?? 0) > 0 || (item.extraWeekAmount ?? 0) > 0) {
      issues.push(`El crédito ${item.creditoId} fue marcado como falla, así que se ignoraron recuperados, adelantos y semana extra capturados en esa fila.`);
    }

    if (partialFailureAmount > 0) {
      const partialPaymentResult = await registerPago(
        {
          creditoId: item.creditoId,
          receivedAt: input.occurredAt,
          amountReceived: partialFailureAmount,
          penaltyChargeIds: [],
          notes: input.notes ?? null,
        },
        userId,
        {
          expectedScheduleId: row.scheduleId,
          occurredAt: input.occurredAt,
        },
      );

      if (partialPaymentResult.duplicateSkipped) {
        skippedFailures += 1;
        if (partialPaymentResult.duplicateReason) issues.push(partialPaymentResult.duplicateReason);
        logRowProcessed();
        continue;
      }
    }

    const fallaResult = await registerFalla(
      {
        creditoId: item.creditoId,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null,
      },
      userId,
      {
        expectedScheduleId: row.scheduleId,
        occurredAt: input.occurredAt,
      },
    );

    if (fallaResult.duplicateSkipped) {
      skippedFailures += 1;
      if (fallaResult.duplicateReason) issues.push(fallaResult.duplicateReason);
    } else {
      failedCount += 1;
    }
    logRowProcessed();
  }

  const deAmount = groupRows.reduce((sum, row) => sum + row.deAmount, 0);
  const failureAmount = validatedSortedItems.reduce((sum, item) => {
    if (item.action !== 'FAIL') return sum;
    const row = rowsByCredito.get(item.creditoId);
    const partialFailureAmount = Math.max(0, item.partialFailureAmount ?? 0);
    return sum + Math.max(0, (row?.collectibleAmount ?? 0) - partialFailureAmount);
  }, 0);
  const recoveryAmount = validatedSortedItems.reduce((sum, item) => {
    if (item.action !== 'PAY') return sum;
    return sum + Math.max(0, item.recoveryAmount ?? 0);
  }, 0);
  const subtotalAmount = deAmount - failureAmount + recoveryAmount;
  const incomingAdvanceAmount = validatedSortedItems.reduce((sum, item) => {
    if (item.action !== 'PAY') return sum;
    return sum + Math.max(0, item.advanceAmount ?? 0);
  }, 0);
  const outgoingAdvanceAmount = groupRows.reduce((sum, row) => sum + row.outgoingAdvanceAmount, 0);
  const extraWeekAmount = validatedSortedItems.reduce((sum, item) => {
    if (item.action !== 'PAY') return sum;
    return sum + Math.max(0, item.extraWeekAmount ?? 0);
  }, 0);
  const totalToDeliver = subtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekAmount;
  const commissionBaseAmount = commissionBase === 'SALE' ? saleAmount : subtotalAmount;
  const commissionAmount = Number(((commissionBaseAmount * commissionRate) / 100).toFixed(2));
  const finalCashAmount = Number((totalToDeliver - saleAmount - commissionAmount - bonusAmount).toFixed(2));
  const finalCashLabel = finalCashAmount < 0 ? 'Inversión' : 'Fondo para la siguiente semana';
  const rowsSnapshot = groupRows.map((row) => {
    const item = itemsByCredito.get(row.creditoId);
    const action = item?.action ?? 'PAY';
    const recoveryAmount = action === 'PAY' ? Math.max(0, item?.recoveryAmount ?? 0) : 0;
    const advanceAmount = action === 'PAY' ? Math.max(0, item?.advanceAmount ?? 0) : 0;
    const extraWeekAmount = action === 'PAY' ? Math.max(0, item?.extraWeekAmount ?? 0) : 0;
    const partialFailureAmount = action === 'FAIL' ? Math.max(0, item?.partialFailureAmount ?? 0) : 0;
    const baseCollectibleAmount = row.operationalScope === 'active_with_extra_week' ? 0 : row.collectibleAmount;

    return {
      ...row,
      historicalCurrentPaymentAmount: action === 'PAY' ? baseCollectibleAmount : partialFailureAmount,
      historicalFailureAmount: action === 'FAIL' ? Math.max(0, row.collectibleAmount - partialFailureAmount) : 0,
      historicalRecoveryAmount: recoveryAmount,
      historicalAdvanceIncomingAmount: advanceAmount,
      historicalExtraWeekCollectedAmount: extraWeekAmount,
    };
  });

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'PagoGrupoImpact',
    entityId: groupExecutionKey,
    action: 'CREATE',
    afterJson: {
      groupExecutionKey,
      groupFingerprint,
      promotoriaId: input.promotoriaId,
      occurredAt: input.occurredAt,
      scope: input.scope,
      paidCount,
      failedCount,
      skippedPayments,
      skippedFailures,
      groupCount: input.items.length,
      rowCount: input.items.length,
      expectedCount: input.items.length,
      items: validatedSortedItems,
      rowsSnapshot,
      liquidation: {
        saleAmount,
        bonusAmount,
        commissionBase,
        commissionRate,
        deAmount,
        failureAmount,
        recoveryAmount,
        subtotalAmount,
        incomingAdvanceAmount,
        outgoingAdvanceAmount,
        extraWeekAmount,
        totalToDeliver,
        commissionBaseAmount,
        commissionAmount,
        finalCashAmount,
        finalCashLabel,
      },
    },
  });

  if (paidCount === 0 && failedCount === 0 && input.items.length > 0) {
    issues.unshift('Este grupo ya había sido impactado previamente o ya no tenía movimientos válidos por aplicar.');
  }

  logGroupPaymentTiming('group completed', {
    promotoriaId: input.promotoriaId,
    occurredAt: input.occurredAt,
    scope: input.scope,
    itemCount: input.items.length,
    durationMs: elapsedMs(groupStartedAt),
  });

  return {
    paidCount,
    failedCount,
    skippedPayments,
    skippedFailures,
    expectedCount: input.items.length,
    issues,
  };
}

export async function savePagoGrupoLiquidacion(input: SaveGrupoLiquidacionInput, userId: string) {
  const collection = await findPromotoriaWeeklyCollection(input.promotoriaId, {
    occurredAt: input.occurredAt,
    scope: input.scope,
    legalView: 'group_payments',
  });

  const entityId = buildGroupExecutionKey(input);
  const saleAmount = Math.max(0, input.saleAmount ?? 0);
  const bonusAmount = Math.max(0, input.bonusAmount ?? 0);
  const commissionBase = input.commissionBase;
  const commissionRate = Number(input.commissionRate);
  const deAmount = collection.rows.reduce((sum, row) => sum + row.deAmount, 0);
  const failureAmount = collection.rows.reduce((sum, row) => sum + row.historicalFailureAmount, 0);
  const recoveryAmount = collection.rows.reduce((sum, row) => sum + row.historicalRecoveryAmount, 0);
  const subtotalAmount = deAmount - failureAmount + recoveryAmount;
  const incomingAdvanceAmount = collection.rows.reduce((sum, row) => sum + row.historicalAdvanceIncomingAmount, 0);
  const outgoingAdvanceAmount = collection.rows.reduce((sum, row) => sum + row.outgoingAdvanceAmount, 0);
  const extraWeekAmount = collection.rows.reduce((sum, row) => sum + row.historicalExtraWeekCollectedAmount, 0);
  const totalToDeliver = subtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekAmount;
  const commissionBaseAmount = commissionBase === 'SALE' ? saleAmount : subtotalAmount;
  const commissionAmount = Number(((commissionBaseAmount * commissionRate) / 100).toFixed(2));
  const finalCashAmount = Number((totalToDeliver - saleAmount - commissionAmount - bonusAmount).toFixed(2));
  const finalCashLabel = finalCashAmount < 0 ? 'Inversión' : 'Fondo para la siguiente semana';

  const previousAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      entityId,
      action: { in: ['CREATE', 'UPDATE'] },
    },
    select: { afterJson: true },
    orderBy: { createdAt: 'desc' },
  });

  const liquidation = {
    saleAmount,
    bonusAmount,
    commissionBase,
    commissionRate: input.commissionRate,
    deAmount,
    failureAmount,
    recoveryAmount,
    subtotalAmount,
    incomingAdvanceAmount,
    outgoingAdvanceAmount,
    extraWeekAmount,
    totalToDeliver,
    commissionBaseAmount,
    commissionAmount,
    finalCashAmount,
    finalCashLabel,
  };

  await writeAuditLog({
    userId,
    module: 'pagos',
    entity: 'PagoGrupoLiquidacion',
    entityId,
    action: previousAudit ? 'UPDATE' : 'CREATE',
    beforeJson: previousAudit?.afterJson ?? null,
    afterJson: {
      promotoriaId: input.promotoriaId,
      occurredAt: input.occurredAt,
      scope: input.scope,
      liquidation,
    },
  });

  return {
    entityId,
    liquidation,
  };
}
