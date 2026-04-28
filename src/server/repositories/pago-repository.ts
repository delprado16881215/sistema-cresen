import { Prisma } from '@prisma/client';
import {
  ACTIVE_LEGAL_CREDIT_STATUSES,
  GROUP_PAYMENTS_EXCLUDED_LEGAL_CREDIT_STATUSES,
} from '@/lib/legal-status';
import { prisma } from '@/lib/prisma';
import { normalizeToIsoDate, parseFlexibleDateInput } from '@/lib/date-input';

const OPEN_INSTALLMENT_CODES = ['PENDING', 'PARTIAL'] as const;

export type PromotoriaWeeklyCollectionRow = {
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

export type PromotoriaWeeklyCollectionResult = {
  mode: 'preview' | 'historical';
  rows: PromotoriaWeeklyCollectionRow[];
  groupCount: number | null;
  liquidation: {
    deAmount: number;
    failureAmount: number;
    recoveryAmount: number;
    subtotalAmount: number;
    incomingAdvanceAmount: number;
    outgoingAdvanceAmount: number;
    extraWeekAmount: number;
    totalToDeliver: number;
    saleAmount: number;
    bonusAmount: number;
    commissionBase: 'SALE' | 'TOTAL_TO_DELIVER';
    commissionRate: '10' | '12.5' | '15';
    commissionAmount: number;
    finalCashAmount: number;
    finalCashLabel: string;
    cumulative: {
      totalInvestmentAmount: number;
      totalCashAmount: number;
      finalCashAmount: number;
    };
  } | null;
};

type PromotoriaWeeklyCollectionLegalView = 'operational' | 'group_payments';

function normalizeCollectionScope(scope?: 'active' | 'active_with_extra_week' | 'overdue' | 'all') {
  return scope ?? 'active';
}

async function findGroupImpactAudit(input: {
  promotoriaId: string;
  occurredAt?: string;
  scope?: 'active' | 'active_with_extra_week' | 'overdue' | 'all';
}) {
  if (!input.occurredAt) return null;

  const expectedScope = normalizeCollectionScope(input.scope);
  const batchEntityId = [input.promotoriaId, input.occurredAt, expectedScope].join('|');

  const directMatch = await prisma.auditLog.findFirst({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      action: 'CREATE',
      entityId: batchEntityId,
    },
    select: { id: true, afterJson: true },
  });

  if (directMatch) return directMatch;

  const legacyImpacts = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      action: 'CREATE',
    },
    select: { afterJson: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const legacyMatch = legacyImpacts.find((entry) => {
    const payload = entry.afterJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

    const record = payload as Record<string, unknown>;
    return (
      record.promotoriaId === input.promotoriaId &&
      record.occurredAt === input.occurredAt &&
      normalizeCollectionScope(
        record.scope as 'active' | 'active_with_extra_week' | 'overdue' | 'all' | undefined,
      ) === expectedScope
    );
  });

  return legacyMatch ?? null;
}

async function findGroupLiquidationAudit(input: {
  promotoriaId: string;
  occurredAt?: string;
  scope?: 'active' | 'active_with_extra_week' | 'overdue' | 'all';
}) {
  if (!input.occurredAt) return null;

  const expectedScope = normalizeCollectionScope(input.scope);
  const entityId = [input.promotoriaId, input.occurredAt, expectedScope].join('|');

  return prisma.auditLog.findFirst({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      action: { in: ['CREATE', 'UPDATE'] },
      entityId,
    },
    select: { id: true, afterJson: true },
    orderBy: { createdAt: 'desc' },
  });
}

async function findPromotoriaLiquidationHistory(input: {
  promotoriaId: string;
  occurredAt?: string;
}) {
  if (!input.occurredAt) return [];

  const audits = await prisma.auditLog.findMany({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoLiquidacion',
      action: { in: ['CREATE', 'UPDATE'] },
    },
    select: { entityId: true, afterJson: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }],
  });

  const latestByEntityId = new Map<string, { occurredAt: string; finalCashAmount: number }>();

  for (const audit of audits) {
    const payload = audit.afterJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;

    const record = payload as Record<string, unknown>;
    if (record.promotoriaId !== input.promotoriaId) continue;

    const occurredAt =
      typeof record.occurredAt === 'string' && record.occurredAt
        ? record.occurredAt
        : null;
    const liquidation =
      record.liquidation && typeof record.liquidation === 'object' && !Array.isArray(record.liquidation)
        ? (record.liquidation as Record<string, unknown>)
        : null;

    if (!occurredAt || !liquidation || occurredAt > input.occurredAt) continue;

    latestByEntityId.set(audit.entityId, {
      occurredAt,
      finalCashAmount: Number(liquidation.finalCashAmount ?? 0),
    });
  }

  return [...latestByEntityId.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

async function findUnappliedGroupAttemptDates(input: {
  creditoId: string;
  startDate: Date;
}) {
  const [audits, payments] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        module: 'pagos',
        entity: 'PagoGrupoImpact',
        action: 'CREATE',
      },
      select: {
        entityId: true,
        afterJson: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.paymentEvent.findMany({
      where: { creditoId: input.creditoId },
      select: { receivedAt: true },
    }),
  ]);

  const creditStartDateKey = input.startDate.toISOString().slice(0, 10);
  const materializedPaymentDates = new Set(
    payments.map((payment) => payment.receivedAt.toISOString().slice(0, 10)),
  );
  const unappliedAttemptDates = new Set<string>();

  for (const audit of audits) {
    const payload = audit.afterJson;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;

    const record = payload as Record<string, unknown>;
    const occurredAt =
      typeof record.occurredAt === 'string' && record.occurredAt
        ? normalizeToIsoDate(record.occurredAt)
        : audit.entityId.split('|')[1] ?? null;

    if (!occurredAt || occurredAt < creditStartDateKey || materializedPaymentDates.has(occurredAt)) continue;

    const items = Array.isArray(record.items) ? (record.items as Array<Record<string, unknown>>) : [];
    const rowsSnapshot = Array.isArray(record.rowsSnapshot)
      ? (record.rowsSnapshot as Array<Record<string, unknown>>)
      : [];
    const matchingItem = items.find(
      (item) => item.creditoId === input.creditoId && item.action === 'PAY',
    );

    if (!matchingItem) continue;

    const matchingRow = rowsSnapshot.find((row) => row.creditoId === input.creditoId);
    const snapshotRequestedAmount =
      Number(matchingRow?.historicalCurrentPaymentAmount ?? 0) +
      Number(matchingRow?.historicalRecoveryAmount ?? 0) +
      Number(matchingRow?.historicalAdvanceIncomingAmount ?? 0) +
      Number(matchingRow?.historicalExtraWeekCollectedAmount ?? 0);
    const itemRequestedAmount =
      Number(matchingItem.recoveryAmount ?? 0) +
      Number(matchingItem.advanceAmount ?? 0) +
      Number(matchingItem.extraWeekAmount ?? 0);

    if (Math.max(snapshotRequestedAmount, itemRequestedAmount) <= 0.001) continue;

    unappliedAttemptDates.add(occurredAt);
  }

  return [...unappliedAttemptDates].sort((left, right) => left.localeCompare(right));
}

function toDateKey(dateInput: Date | string) {
  const date =
    dateInput instanceof Date
      ? dateInput
      : parseFlexibleDateInput(dateInput);
  if (!date || Number.isNaN(date.getTime())) throw new Error('Invalid date input');
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mazatlan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function getOperationalWeek(startDateKey: string, todayKey: string) {
  const start = new Date(`${startDateKey}T12:00:00`);
  const today = new Date(`${todayKey}T12:00:00`);
  const diffInDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveOperationalRowMode(input: {
  rowMode?: PromotoriaWeeklyCollectionRow['rowMode'] | null;
  collectibleAmount: number;
  deAmount: number;
  recoveryAmountAvailable: number;
  extraWeekAmount: number;
}) {
  if (input.rowMode && input.rowMode !== 'regular') {
    return input.rowMode;
  }

  const hasRegularBalance = input.collectibleAmount > 0.001 || input.deAmount > 0.001;
  if (hasRegularBalance) {
    return input.rowMode ?? 'regular';
  }

  const hasRecoveryBalance = input.recoveryAmountAvailable > 0.001;
  const hasPendingExtraWeek = input.extraWeekAmount > 0.001;

  if (hasRecoveryBalance && hasPendingExtraWeek) return 'final_closure';
  if (hasRecoveryBalance) return 'recovery_only';
  if (hasPendingExtraWeek) return 'extra_week_only';

  return input.rowMode ?? 'regular';
}

function buildOperationalInstallmentLabel(input: {
  rowMode: PromotoriaWeeklyCollectionRow['rowMode'];
  recoveryAnchorInstallmentNumber?: number | null;
  hasRecoveryBalance: boolean;
  hasPendingExtraWeek: boolean;
  fallbackLabel: string;
}) {
  if (input.rowMode === 'final_closure') {
    const parts: string[] = [];
    if (input.hasRecoveryBalance) {
      parts.push(`Recuperados pendientes · Semana ${input.recoveryAnchorInstallmentNumber ?? '-'}`);
    }
    if (input.hasPendingExtraWeek) {
      parts.push('Semana 13 pendiente');
    }
    return parts.length ? `Cierre operativo · ${parts.join(' + ')}` : 'Cierre operativo';
  }

  if (input.rowMode === 'recovery_only') {
    return `Recuperado final · Semana ${input.recoveryAnchorInstallmentNumber ?? '-'}`;
  }

  if (input.rowMode === 'extra_week_only') {
    return 'Semana 13 · Semana extra';
  }

  return input.fallbackLabel;
}

export async function findCreditsPendingPayment(input: { search?: string }) {
  const where: Prisma.CreditoWhereInput = {
    creditStatus: { code: 'ACTIVE' },
    ...(input.search
      ? {
          OR: [
            { folio: { contains: input.search, mode: 'insensitive' } },
            { loanNumber: { contains: input.search, mode: 'insensitive' } },
            { cliente: { code: { contains: input.search, mode: 'insensitive' } } },
            { cliente: { fullName: { contains: input.search, mode: 'insensitive' } } },
            { cliente: { phone: { contains: input.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  return prisma.credito.findMany({
    where,
    include: {
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          secondaryPhone: true,
          address: true,
          neighborhood: true,
          city: true,
          state: true,
          betweenStreets: true,
          referencesNotes: true,
          observations: true,
          placementStatus: true,
          placementBlockedAt: true,
          placementBlockReason: true,
          placementBlockSourceCreditoId: true,
        },
      },
      aval: { select: { id: true, code: true, fullName: true } },
      creditStatus: { select: { code: true, name: true } },
      legalEvents: {
        select: {
          id: true,
          eventType: true,
          previousStatus: true,
          nextStatus: true,
          effectiveDate: true,
          motivo: true,
          observaciones: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      },
      promotoria: {
        select: {
          id: true,
          name: true,
          supervision: { select: { id: true, name: true } },
        },
      },
      schedules: {
        where: {
          installmentStatus: { code: { in: [...OPEN_INSTALLMENT_CODES, 'FAILED'] as unknown as string[] } },
        },
        include: {
          installmentStatus: { select: { code: true, name: true } },
        },
        orderBy: [{ installmentNumber: 'asc' }],
      },
      defaults: {
        include: {
          schedule: { select: { installmentNumber: true } },
          recoveries: true,
        },
      },
      extraWeek: true,
      reversals: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export async function findCreditoForPayment(creditoId: string) {
  const credito = await prisma.credito.findFirst({
    where: { id: creditoId },
    include: {
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          secondaryPhone: true,
          address: true,
          neighborhood: true,
          city: true,
          state: true,
          betweenStreets: true,
          referencesNotes: true,
          observations: true,
          placementStatus: true,
          placementBlockedAt: true,
          placementBlockReason: true,
          placementBlockSourceCreditoId: true,
        },
      },
      aval: { select: { id: true, code: true, fullName: true } },
      creditStatus: { select: { code: true, name: true } },
      legalEvents: {
        select: {
          id: true,
          eventType: true,
          previousStatus: true,
          nextStatus: true,
          effectiveDate: true,
          motivo: true,
          observaciones: true,
          createdAt: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      },
      promotoria: {
        select: {
          id: true,
          name: true,
          supervision: { select: { id: true, name: true } },
        },
      },
      schedules: {
        include: {
          installmentStatus: { select: { code: true, name: true } },
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
          schedule: { select: { installmentNumber: true, dueDate: true } },
          recoveries: {
            include: {
              paymentEvent: { select: { receivedAt: true, isReversed: true } },
            },
          },
          penalties: {
            include: {
              penaltyStatus: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      },
      advances: {
        include: {
          paymentEvent: { select: { isReversed: true } },
          recordedOnInstallment: { select: { installmentNumber: true } },
          coversInstallment: { select: { installmentNumber: true, dueDate: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      },
      recoveries: {
        include: {
          paymentEvent: { select: { isReversed: true } },
          defaultEvent: {
            include: {
              schedule: { select: { installmentNumber: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      },
      penalties: {
        include: {
          defaultEvent: {
            include: {
              schedule: { select: { installmentNumber: true } },
            },
          },
          penaltyStatus: { select: { code: true, name: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
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
        orderBy: [{ reversedAt: 'desc' }],
      },
      payments: {
        include: {
          paymentStatus: { select: { code: true, name: true } },
          allocations: {
            include: {
              schedule: { select: { installmentNumber: true } },
              extraWeekEvent: { select: { id: true } },
              penaltyCharge: { select: { id: true } },
            },
            orderBy: [{ createdAt: 'asc' }],
          },
        },
        orderBy: [{ receivedAt: 'desc' }],
        take: 10,
      },
    },
  });

  if (!credito) {
    return null;
  }

  const unappliedGroupAttemptDates = await findUnappliedGroupAttemptDates({
    creditoId,
    startDate: credito.startDate,
  });

  return {
    ...credito,
    unappliedGroupAttemptDates,
  };
}

export async function findActivePromotoriasForCobranza() {
  return prisma.promotoria.findMany({
    where: { deletedAt: null, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      supervision: { select: { id: true, name: true } },
    },
    orderBy: [{ name: 'asc' }],
  });
}

export async function findPromotoriaWeeklyCollection(
  promotoriaId: string,
  options?: {
    occurredAt?: string;
    scope?: 'active' | 'active_with_extra_week' | 'overdue' | 'all';
    modeOverride?: 'preview' | 'historical';
    legalView?: PromotoriaWeeklyCollectionLegalView;
  },
): Promise<PromotoriaWeeklyCollectionResult> {
  const scope = normalizeCollectionScope(options?.scope);
  const legalView = options?.legalView ?? 'operational';
  const excludedLegalStatuses =
    legalView === 'group_payments'
      ? GROUP_PAYMENTS_EXCLUDED_LEGAL_CREDIT_STATUSES
      : ACTIVE_LEGAL_CREDIT_STATUSES;
  const [impactAudit, liquidationAudit, liquidationHistory] = await Promise.all([
    findGroupImpactAudit({ promotoriaId, occurredAt: options?.occurredAt, scope }),
    findGroupLiquidationAudit({ promotoriaId, occurredAt: options?.occurredAt, scope }),
    findPromotoriaLiquidationHistory({ promotoriaId, occurredAt: options?.occurredAt }),
  ]);
  const historicalMode =
    options?.modeOverride === 'preview'
      ? false
      : options?.modeOverride === 'historical'
        ? true
        : Boolean(impactAudit);
  const creditos = await prisma.credito.findMany({
      where: historicalMode
      ? {
          promotoriaId,
          cancelledAt: null,
          legalStatus: { notIn: excludedLegalStatuses },
          creditStatus: { code: { in: ['ACTIVE', 'COMPLETED'] } },
        }
      : {
          promotoriaId,
          cancelledAt: null,
          legalStatus: { notIn: excludedLegalStatuses },
          creditStatus: { code: { in: ['ACTIVE', 'COMPLETED'] } },
        },
    include: {
      cliente: {
        select: {
          id: true,
          code: true,
          fullName: true,
          phone: true,
          secondaryPhone: true,
          address: true,
          neighborhood: true,
          city: true,
          state: true,
        },
      },
      aval: { select: { id: true, code: true, fullName: true } },
      creditStatus: { select: { code: true, name: true } },
      promotoria: {
        select: {
          id: true,
          code: true,
          name: true,
          supervision: { select: { id: true, name: true } },
        },
      },
      schedules: {
        include: {
          installmentStatus: { select: { code: true, name: true } },
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
            include: {
              paymentEvent: { select: { receivedAt: true, isReversed: true } },
            },
          },
        },
      },
      recoveries: {
        include: {
          paymentEvent: { select: { receivedAt: true, isReversed: true } },
          defaultEvent: { select: { id: true } },
        },
      },
      advances: {
        include: {
          paymentEvent: { select: { receivedAt: true, isReversed: true } },
          coversInstallment: { select: { id: true } },
        },
      },
      reversals: {
        select: { sourceType: true, sourceId: true, reversedAt: true },
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
    },
    orderBy: [{ controlNumber: 'asc' }, { createdAt: 'asc' }],
  });

  const normalizedOccurredAt = normalizeToIsoDate(options?.occurredAt) ?? undefined;
  const selectedDate = normalizedOccurredAt ? parseFlexibleDateInput(normalizedOccurredAt)! : new Date();
  const selectedDateKey = toDateKey(selectedDate);
  const collectionWeekKey = selectedDateKey;
  const salesWindowEndDate = addDays(new Date(`${selectedDateKey}T12:00:00`), -7);
  const activeWindowEndKey = toDateKey(salesWindowEndDate);
  const cutoffEnd = new Date(`${selectedDateKey}T23:59:59.999`);
  const activeWindowStartDate = addDays(new Date(`${selectedDateKey}T12:00:00`), -84);
  const activeWindowStartKey = toDateKey(activeWindowStartDate);
  const impactAuditPayload =
    impactAudit?.afterJson && typeof impactAudit.afterJson === 'object' && !Array.isArray(impactAudit.afterJson)
      ? (impactAudit.afterJson as Record<string, unknown>)
      : null;
  const impactAuditItems = Array.isArray(impactAuditPayload?.items)
    ? impactAuditPayload.items
    : [];
  const historicalItemsByCreditoId = new Map<
    string,
    { action: 'PAY' | 'FAIL'; recoveryAmount: number; advanceAmount: number }
  >(
    impactAuditItems.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.creditoId !== 'string') return [];
      const action = record.action === 'FAIL' ? 'FAIL' : record.action === 'PAY' ? 'PAY' : null;
      if (!action) return [];
      return [[record.creditoId, {
        action,
        recoveryAmount: Number(record.recoveryAmount ?? 0),
        advanceAmount: Number(record.advanceAmount ?? 0),
      }] as const];
    }),
  );
  const snapshotRows = Array.isArray(impactAuditPayload?.rowsSnapshot)
    ? impactAuditPayload.rowsSnapshot
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const record = item as Record<string, unknown>;
          return {
            creditoId: String(record.creditoId ?? ''),
            scheduleId: record.scheduleId ? String(record.scheduleId) : null,
            extraWeekEventId: record.extraWeekEventId ? String(record.extraWeekEventId) : null,
            recoveryAnchorDefaultEventId: record.recoveryAnchorDefaultEventId
              ? String(record.recoveryAnchorDefaultEventId)
              : null,
            recoveryAnchorScheduleId: record.recoveryAnchorScheduleId
              ? String(record.recoveryAnchorScheduleId)
              : null,
            recoveryAnchorInstallmentNumber:
              record.recoveryAnchorInstallmentNumber == null
                ? null
                : Number(record.recoveryAnchorInstallmentNumber),
            folio: String(record.folio ?? ''),
            loanNumber: String(record.loanNumber ?? ''),
            controlNumber: record.controlNumber == null ? null : Number(record.controlNumber),
            clienteId: typeof record.clienteId === 'string' ? record.clienteId : '',
            clienteCode: typeof record.clienteCode === 'string' ? record.clienteCode : '',
            clienteName: typeof record.clienteName === 'string' ? record.clienteName : '',
            clientePhone: typeof record.clientePhone === 'string' ? record.clientePhone : null,
            clienteSecondaryPhone:
              typeof record.clienteSecondaryPhone === 'string' ? record.clienteSecondaryPhone : null,
            clienteAddress: typeof record.clienteAddress === 'string' ? record.clienteAddress : null,
            clienteNeighborhood:
              typeof record.clienteNeighborhood === 'string' ? record.clienteNeighborhood : null,
            clienteCity: typeof record.clienteCity === 'string' ? record.clienteCity : null,
            clienteState: typeof record.clienteState === 'string' ? record.clienteState : null,
            clienteLabel: String(record.clienteLabel ?? ''),
            avalLabel: record.avalLabel ? String(record.avalLabel) : null,
            promotoriaId: String(record.promotoriaId ?? ''),
            promotoriaName: String(record.promotoriaName ?? ''),
            supervisionName: record.supervisionName ? String(record.supervisionName) : null,
            operationalScope:
              record.operationalScope === 'active_with_extra_week' || record.operationalScope === 'overdue'
                ? record.operationalScope
                : 'active',
            operationalWeek: Number(record.operationalWeek ?? 0),
            creditStartDate: typeof record.creditStartDate === 'string' ? record.creditStartDate : null,
            scheduledDate: typeof record.scheduledDate === 'string' ? record.scheduledDate : null,
            weeklyAmount: Number(record.weeklyAmount ?? 0),
            collectibleAmount: Number(record.collectibleAmount ?? 0),
            deAmount: Number(record.deAmount ?? 0),
            recoveryAmountAvailable: Number(record.recoveryAmountAvailable ?? 0),
            advanceAmountAvailable: Number(record.advanceAmountAvailable ?? 0),
            outgoingAdvanceAmount: Number(record.outgoingAdvanceAmount ?? 0),
            extraWeekAmount: Number(record.extraWeekAmount ?? 0),
            rowMode:
              record.rowMode === 'recovery_only' ||
              record.rowMode === 'extra_week_only' ||
              record.rowMode === 'final_closure'
                ? record.rowMode
                : 'regular',
            historicalCurrentPaymentAmount: Number(record.historicalCurrentPaymentAmount ?? 0),
            historicalFailureAmount: Number(record.historicalFailureAmount ?? 0),
            historicalRecoveryAmount: Number(record.historicalRecoveryAmount ?? 0),
            historicalAdvanceIncomingAmount: Number(record.historicalAdvanceIncomingAmount ?? 0),
            historicalExtraWeekCollectedAmount: Number(record.historicalExtraWeekCollectedAmount ?? 0),
            installmentNumber: Number(record.installmentNumber ?? 0),
            installmentLabel: String(record.installmentLabel ?? ''),
            deEligible: Boolean(record.deEligible ?? false),
          } satisfies PromotoriaWeeklyCollectionRow;
        })
        .filter((row): row is PromotoriaWeeklyCollectionRow => Boolean(row))
    : null;
  const calculatedRows = creditos
    .map((credito) => {
      const firstSchedule = credito.schedules[0];
      const salesStartKey = toDateKey(credito.startDate);
      const scheduleWeekAnchorKey = firstSchedule
        ? toDateKey(firstSchedule.dueDate)
        : salesStartKey;
      const operationalWeek = getOperationalWeek(scheduleWeekAnchorKey, collectionWeekKey);
      const hasExtraWeekInCycle =
        operationalWeek === 13 &&
        Boolean(credito.extraWeek && !['PAID', 'EXEMPT', 'REVERSED'].includes(credito.extraWeek.status));

      const baseOperationalScope: 'active' | 'active_with_extra_week' | 'overdue' =
        operationalWeek >= 14
          ? 'overdue'
          : hasExtraWeekInCycle
            ? 'active_with_extra_week'
            : 'active';

      const isWithinActiveWindow = salesStartKey >= activeWindowStartKey && salesStartKey <= activeWindowEndKey;

      const reversedDefaultIds = new Set(
        credito.reversals
          .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT' && reversal.reversedAt <= cutoffEnd)
          .map((reversal) => reversal.sourceId),
      );

      const paidAsOf = (schedule: (typeof credito.schedules)[number]) =>
        schedule.allocations
          .filter((allocation) => !allocation.paymentEvent.isReversed && allocation.paymentEvent.receivedAt <= cutoffEnd)
          .reduce((sum, allocation) => sum + Number(allocation.amount), 0);

      const unpaidAsOf = (schedule: (typeof credito.schedules)[number]) =>
        Math.max(0, Number(schedule.expectedAmount) - paidAsOf(schedule));

      const firstHistoricalOverdueSchedule = credito.schedules.find((schedule) => {
        const dueDateKey = toDateKey(schedule.dueDate);
        return dueDateKey <= collectionWeekKey && unpaidAsOf(schedule) > 0;
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

      const targetDefault =
        targetSchedule &&
        credito.defaults.find((defaultEvent) => {
          if (defaultEvent.schedule.id !== targetSchedule.id) return false;
          if (defaultEvent.createdAt > cutoffEnd) return false;
          if (reversedDefaultIds.has(defaultEvent.id)) return false;
          const recoveredAmount = defaultEvent.recoveries
            .filter((recovery) => !recovery.paymentEvent.isReversed && recovery.paymentEvent.receivedAt <= cutoffEnd)
            .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);
          return recoveredAmount < Number(defaultEvent.amountMissed);
        });

      const unresolvedDefaultsSorted = credito.defaults
        .filter((defaultEvent) => {
          if (defaultEvent.createdAt > cutoffEnd) return false;
          if (reversedDefaultIds.has(defaultEvent.id)) return false;

          const recoveredAmount = defaultEvent.recoveries
            .filter((recovery) => !recovery.paymentEvent.isReversed && recovery.paymentEvent.receivedAt <= cutoffEnd)
            .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);

          return recoveredAmount < Number(defaultEvent.amountMissed);
        })
        .sort((left, right) => left.schedule.installmentNumber - right.schedule.installmentNumber);

      const unresolvedRecoveryAmount = unresolvedDefaultsSorted.reduce((sum, defaultEvent) => {
        const recoveredAmount = defaultEvent.recoveries
          .filter((recovery) => !recovery.paymentEvent.isReversed && recovery.paymentEvent.receivedAt <= cutoffEnd)
          .reduce((recoverySum, recovery) => recoverySum + Number(recovery.recoveredAmount), 0);
        const pendingRecoveryAmount = Math.max(0, Number(defaultEvent.amountMissed) - recoveredAmount);
        return sum + pendingRecoveryAmount;
      }, 0);
      const firstUnresolvedDefault = unresolvedDefaultsSorted[0] ?? null;

      const extraWeekCollectible =
        credito.extraWeek
          ? Math.max(
              0,
              Number(credito.extraWeek.expectedAmount) -
                credito.extraWeek.allocations
                  .filter(
                    (allocation) =>
                      !allocation.paymentEvent.isReversed &&
                      allocation.paymentEvent.receivedAt <= cutoffEnd,
                  )
                  .reduce((sum, allocation) => sum + Number(allocation.amount), 0),
            )
          : 0;

      const hasRecoverableBalance = unresolvedRecoveryAmount > 0;
      const hasPendingExtraWeek = extraWeekCollectible > 0;
      const hasOverdueBalance = Boolean(firstHistoricalOverdueSchedule && unpaidAsOf(firstHistoricalOverdueSchedule) > 0);
      const hasRelevantOperationalBalance = hasRecoverableBalance || hasPendingExtraWeek || hasOverdueBalance;

      const operationalScope: 'active' | 'active_with_extra_week' | 'overdue' =
        !isWithinActiveWindow && hasPendingExtraWeek
          ? 'active_with_extra_week'
          : !isWithinActiveWindow && (hasRecoverableBalance || hasOverdueBalance)
            ? 'overdue'
            : baseOperationalScope;

      const rowMode: PromotoriaWeeklyCollectionRow['rowMode'] =
        operationalScope === 'active'
          ? 'regular'
          : operationalScope === 'active_with_extra_week'
            ? hasRecoverableBalance
              ? 'final_closure'
              : 'extra_week_only'
            : 'recovery_only';

      const deEligible =
        isWithinActiveWindow &&
        operationalScope === 'active';

      if (scope === 'active' && !isWithinActiveWindow && !hasRelevantOperationalBalance) {
        return null;
      }

      if (scope !== 'all' && scope !== 'active' && operationalScope !== scope) {
        return null;
      }

      const deAmount =
        deEligible && targetSchedule ? Number(targetSchedule.expectedAmount) : 0;
      const outgoingAdvanceAmount =
        operationalScope === 'active' && targetSchedule
          ? Math.min(
              Number(targetSchedule.expectedAmount),
              credito.advances
                .filter(
                  (advance) =>
                    !advance.paymentEvent.isReversed &&
                    advance.coversInstallment.id === targetSchedule.id &&
                    advance.paymentEvent.receivedAt <= cutoffEnd,
                )
                .reduce((sum, advance) => sum + Number(advance.amount), 0),
            )
          : 0;
      const currentCollectibleAmount = targetSchedule ? unpaidAsOf(targetSchedule) : 0;
      const advanceAmountAvailable =
        operationalScope === 'active' && targetSchedule
          ? credito.schedules
              .filter((schedule) => schedule.installmentNumber > targetSchedule.installmentNumber)
              .reduce((sum, schedule) => sum + unpaidAsOf(schedule), 0)
          : 0;
      const weekExtraAmount = hasPendingExtraWeek ? extraWeekCollectible : 0;
      const isEventOnSelectedDate = (value: Date) => toDateKey(value) === selectedDateKey;
      const historicalCurrentPaymentAmount =
        operationalScope === 'active' && targetSchedule
          ? targetSchedule.allocations
              .filter(
                (allocation) =>
                  allocation.allocationType === 'CURRENT' &&
                  !allocation.paymentEvent.isReversed &&
                  isEventOnSelectedDate(allocation.paymentEvent.receivedAt),
              )
              .reduce((sum, allocation) => sum + Number(allocation.amount), 0)
          : 0;
      const expectedNormalForHistoricalDay =
        operationalScope === 'active' && targetSchedule
          ? Math.max(
              0,
              Number(targetSchedule.expectedAmount) -
                Math.min(
                  Number(targetSchedule.expectedAmount),
                  targetSchedule.allocations
                    .filter(
                      (allocation) =>
                        allocation.allocationType === 'ADVANCE' &&
                        !allocation.paymentEvent.isReversed,
                    )
                    .reduce((sum, allocation) => sum + Number(allocation.amount), 0),
                ),
            )
          : 0;
      const auditItem = historicalMode ? historicalItemsByCreditoId.get(credito.id) : undefined;
      const historicalRecoveryAmountFromEvents = credito.recoveries
        .filter(
          (recovery) =>
            !recovery.paymentEvent.isReversed &&
            isEventOnSelectedDate(recovery.paymentEvent.receivedAt),
        )
        .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);
      const historicalAdvanceIncomingAmountFromEvents = credito.advances
        .filter(
          (advance) =>
            !advance.paymentEvent.isReversed &&
            isEventOnSelectedDate(advance.paymentEvent.receivedAt),
        )
        .reduce((sum, advance) => sum + Number(advance.amount), 0);
      const historicalCurrentPaymentAmountResolved =
        auditItem?.action === 'PAY'
          ? expectedNormalForHistoricalDay
          : auditItem?.action === 'FAIL'
            ? 0
            : historicalCurrentPaymentAmount;
      const historicalFailureAmount =
        auditItem?.action === 'FAIL'
          ? expectedNormalForHistoricalDay
          : auditItem?.action === 'PAY'
            ? 0
            : operationalScope === 'active' &&
                expectedNormalForHistoricalDay > 0 &&
                historicalCurrentPaymentAmount <= 0
              ? expectedNormalForHistoricalDay
              : 0;
      const historicalRecoveryAmount =
        auditItem?.action === 'PAY'
          ? Number(auditItem.recoveryAmount ?? 0)
          : historicalRecoveryAmountFromEvents;
      const historicalAdvanceIncomingAmount =
        auditItem?.action === 'PAY'
          ? Number(auditItem.advanceAmount ?? 0)
          : historicalAdvanceIncomingAmountFromEvents;
      const historicalExtraWeekCollectedAmount =
        credito.extraWeek?.allocations
          .filter(
            (allocation) =>
              !allocation.paymentEvent.isReversed &&
              isEventOnSelectedDate(allocation.paymentEvent.receivedAt),
          )
          .reduce((sum, allocation) => sum + Number(allocation.amount), 0) ?? 0;

      const amountDue =
        operationalScope === 'active_with_extra_week'
          ? 0
          : operationalScope === 'overdue'
            ? 0
          : targetSchedule
            ? currentCollectibleAmount
            : 0;

      const shouldKeepZeroCollectibleRow =
        (operationalScope === 'active' && outgoingAdvanceAmount > 0) ||
        unresolvedRecoveryAmount > 0 ||
        extraWeekCollectible > 0;

      if (
        (amountDue <= 0 && !shouldKeepZeroCollectibleRow) ||
        (!targetSchedule && rowMode === 'regular')
      ) {
        return null;
      }

      const fallbackInstallmentLabel =
        operationalScope === 'active_with_extra_week'
          ? 'Semana 13 · Semana extra'
          : targetDefault
            ? `Semana ${targetSchedule?.installmentNumber ?? '-'} · Falla`
            : `Semana ${targetSchedule?.installmentNumber ?? '-'}`;
      const resolvedRowMode = resolveOperationalRowMode({
        rowMode,
        collectibleAmount: amountDue,
        deAmount,
        recoveryAmountAvailable: unresolvedRecoveryAmount,
        extraWeekAmount: weekExtraAmount,
      });

      return {
        creditoId: credito.id,
        scheduleId: resolvedRowMode === 'regular' ? targetSchedule?.id ?? null : null,
        extraWeekEventId: operationalScope === 'active_with_extra_week' ? credito.extraWeek?.id ?? null : null,
        recoveryAnchorDefaultEventId: firstUnresolvedDefault?.id ?? null,
        recoveryAnchorScheduleId: firstUnresolvedDefault?.schedule.id ?? null,
        recoveryAnchorInstallmentNumber: firstUnresolvedDefault?.schedule.installmentNumber ?? null,
        folio: credito.folio,
        loanNumber: credito.loanNumber,
        controlNumber: credito.controlNumber,
        clienteId: credito.cliente.id,
        clienteCode: credito.cliente.code,
        clienteName: credito.cliente.fullName,
        clientePhone: credito.cliente.phone,
        clienteSecondaryPhone: credito.cliente.secondaryPhone ?? null,
        clienteAddress: credito.cliente.address,
        clienteNeighborhood: credito.cliente.neighborhood ?? null,
        clienteCity: credito.cliente.city ?? null,
        clienteState: credito.cliente.state ?? null,
        clienteLabel: `${credito.cliente.code} · ${credito.cliente.fullName}`,
        avalLabel: credito.aval ? `${credito.aval.code} · ${credito.aval.fullName}` : null,
        promotoriaId: credito.promotoria.id,
        promotoriaName: credito.promotoria.name,
        supervisionName: credito.promotoria.supervision?.name ?? null,
        operationalScope,
        operationalWeek,
        creditStartDate: toDateKey(credito.startDate),
        scheduledDate:
          operationalScope === 'active_with_extra_week'
            ? credito.extraWeek
              ? toDateKey(credito.extraWeek.dueDate)
              : null
            : targetSchedule
              ? toDateKey(targetSchedule.dueDate)
              : null,
        weeklyAmount: Number(credito.weeklyAmount),
        collectibleAmount: amountDue,
        deAmount,
        recoveryAmountAvailable: unresolvedRecoveryAmount,
        advanceAmountAvailable,
        outgoingAdvanceAmount,
        extraWeekAmount: weekExtraAmount,
        rowMode: resolvedRowMode,
        historicalCurrentPaymentAmount: historicalCurrentPaymentAmountResolved,
        historicalFailureAmount,
        historicalRecoveryAmount,
        historicalAdvanceIncomingAmount,
        historicalExtraWeekCollectedAmount,
        installmentNumber: operationalScope === 'active_with_extra_week' ? 13 : (targetSchedule?.installmentNumber ?? 0),
        installmentLabel: buildOperationalInstallmentLabel({
          rowMode: resolvedRowMode,
          recoveryAnchorInstallmentNumber: firstUnresolvedDefault?.schedule.installmentNumber ?? null,
          hasRecoveryBalance: hasRecoverableBalance,
          hasPendingExtraWeek,
          fallbackLabel: fallbackInstallmentLabel,
        }),
        deEligible,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const calculatedRowsByCreditoId = new Map(calculatedRows.map((row) => [row.creditoId, row]));
  const rows =
    historicalMode && snapshotRows?.length
      ? snapshotRows.map((row) => {
          const fallbackRow = calculatedRowsByCreditoId.get(row.creditoId);
          const mergedRow = {
            ...row,
            clienteId: row.clienteId || fallbackRow?.clienteId || '',
            clienteCode: row.clienteCode || fallbackRow?.clienteCode || '',
            clienteName: row.clienteName || fallbackRow?.clienteName || '',
            clientePhone: row.clientePhone ?? fallbackRow?.clientePhone ?? null,
            clienteSecondaryPhone:
              row.clienteSecondaryPhone ?? fallbackRow?.clienteSecondaryPhone ?? null,
            clienteAddress: row.clienteAddress ?? fallbackRow?.clienteAddress ?? null,
            clienteNeighborhood: row.clienteNeighborhood ?? fallbackRow?.clienteNeighborhood ?? null,
            clienteCity: row.clienteCity ?? fallbackRow?.clienteCity ?? null,
            clienteState: row.clienteState ?? fallbackRow?.clienteState ?? null,
            creditStartDate: row.creditStartDate ?? fallbackRow?.creditStartDate ?? null,
            recoveryAnchorDefaultEventId:
              row.recoveryAnchorDefaultEventId ?? fallbackRow?.recoveryAnchorDefaultEventId ?? null,
            recoveryAnchorScheduleId:
              row.recoveryAnchorScheduleId ?? fallbackRow?.recoveryAnchorScheduleId ?? null,
            recoveryAnchorInstallmentNumber:
              row.recoveryAnchorInstallmentNumber ?? fallbackRow?.recoveryAnchorInstallmentNumber ?? null,
          };
          const resolvedRowMode = resolveOperationalRowMode({
            rowMode: row.rowMode ?? fallbackRow?.rowMode ?? null,
            collectibleAmount: mergedRow.collectibleAmount,
            deAmount: mergedRow.deAmount,
            recoveryAmountAvailable: mergedRow.recoveryAmountAvailable,
            extraWeekAmount: mergedRow.extraWeekAmount,
          });

          return {
            ...mergedRow,
            rowMode: resolvedRowMode,
            installmentLabel: buildOperationalInstallmentLabel({
              rowMode: resolvedRowMode,
              recoveryAnchorInstallmentNumber: mergedRow.recoveryAnchorInstallmentNumber,
              hasRecoveryBalance: mergedRow.recoveryAmountAvailable > 0.001,
              hasPendingExtraWeek: mergedRow.extraWeekAmount > 0.001,
              fallbackLabel: mergedRow.installmentLabel,
            }),
          };
        })
      : calculatedRows;

  const cumulativeLiquidation = liquidationHistory.reduce(
    (accumulator, item) => {
      const amount = Number(item.finalCashAmount ?? 0);
      if (amount < 0) accumulator.totalInvestmentAmount += Math.abs(amount);
      if (amount > 0) accumulator.totalCashAmount += amount;
      accumulator.finalCashAmount += amount;
      return accumulator;
    },
    {
      totalInvestmentAmount: 0,
      totalCashAmount: 0,
      finalCashAmount: 0,
    },
  );

  return {
    mode: historicalMode ? 'historical' : 'preview',
    rows,
    groupCount:
      historicalMode && impactAuditPayload
        ? Number(
            impactAuditPayload.groupCount ??
              impactAuditPayload.rowCount ??
              impactAuditPayload.expectedCount ??
              rows.length,
          )
        : rows.length,
    liquidation: (() => {
      const payload = liquidationAudit?.afterJson ?? impactAudit?.afterJson;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      const liquidation = (payload as Record<string, unknown>).liquidation;
      if (!liquidation || typeof liquidation !== 'object' || Array.isArray(liquidation)) return null;

      const record = liquidation as Record<string, unknown>;
      const commissionBase =
        record.commissionBase === 'TOTAL_TO_DELIVER' ? 'TOTAL_TO_DELIVER' : 'SALE';
      const commissionRateRaw = String(record.commissionRate ?? '10');
      const commissionRate: '10' | '12.5' | '15' =
        commissionRateRaw === '12.5' || commissionRateRaw === '15' ? commissionRateRaw : '10';

      return {
        deAmount: Number(record.deAmount ?? 0),
        failureAmount: Number(record.failureAmount ?? 0),
        recoveryAmount: Number(record.recoveryAmount ?? 0),
        subtotalAmount: Number(record.subtotalAmount ?? 0),
        incomingAdvanceAmount: Number(record.incomingAdvanceAmount ?? 0),
        outgoingAdvanceAmount: Number(record.outgoingAdvanceAmount ?? 0),
        extraWeekAmount: Number(record.extraWeekAmount ?? 0),
        totalToDeliver: Number(record.totalToDeliver ?? 0),
        saleAmount: Number(record.saleAmount ?? 0),
        bonusAmount: Number(record.bonusAmount ?? 0),
        commissionBase,
        commissionRate,
        commissionAmount: Number(record.commissionAmount ?? 0),
        finalCashAmount: Number(record.finalCashAmount ?? 0),
        finalCashLabel:
          typeof record.finalCashLabel === 'string' && record.finalCashLabel.trim()
            ? record.finalCashLabel
            : Number(record.finalCashAmount ?? 0) < 0
              ? 'Inversión'
              : 'Fondo para la siguiente semana',
        cumulative: {
          totalInvestmentAmount: Number(cumulativeLiquidation.totalInvestmentAmount.toFixed(2)),
          totalCashAmount: Number(cumulativeLiquidation.totalCashAmount.toFixed(2)),
          finalCashAmount: Number(cumulativeLiquidation.finalCashAmount.toFixed(2)),
        },
      };
    })(),
  };
}
