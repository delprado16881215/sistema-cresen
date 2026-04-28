import { normalizeText } from '@/lib/utils';
import type {
  PromotoriaWeeklyCollectionResult,
  PromotoriaWeeklyCollectionRow,
} from '@/server/repositories/pago-repository';
import {
  findActivePromotoriasForCobranza,
  findCreditoForPayment,
  findPromotoriaWeeklyCollection,
} from '@/server/repositories/pago-repository';
import {
  addCollectionMetrics,
  createCollectionMetrics,
  summarizeCollectionRows,
  type CollectionMetrics,
} from '@/server/services/collection-metrics';
import { getCollectionReportsByDay, type CollectionScope } from '@/server/services/reportes-service';

export type CobranzaRowModeFilter = 'all' | PromotoriaWeeklyCollectionRow['rowMode'];
export type CobranzaCycleFilter = 'all' | 'in_cycle' | 'outside_cycle';

export type CobranzaWorkbenchRow = PromotoriaWeeklyCollectionRow & {
  mode: PromotoriaWeeklyCollectionResult['mode'];
  promotoriaCode: string;
  supervisionId: string | null;
};

export type CobranzaPromotoriaSummary = CollectionMetrics & {
  promotoriaId: string;
  promotoriaCode: string;
  promotoriaName: string;
  supervisionId: string | null;
  supervisionName: string | null;
  mode: PromotoriaWeeklyCollectionResult['mode'];
};

export type CobranzaSupervisionSummary = CollectionMetrics & {
  supervisionId: string | null;
  supervisionName: string;
  promotorias: number;
  promotoriasHistorical: number;
  promotoriasPreview: number;
};

export type CobranzaDailySummary = CollectionMetrics & {
  occurredAt: string;
  scope: CollectionScope;
  promotorias: number;
  promotoriasHistorical: number;
  promotoriasPreview: number;
  supervisiones: number;
  regularRows: number;
  outsideCycleRows: number;
  actionableAmount: number;
  categories: {
    regular: { rows: number; amount: number };
    finalClosure: { rows: number; amount: number };
    recoveryOnly: { rows: number; amount: number };
    extraWeekOnly: { rows: number; amount: number };
  };
};

type CobranzaCreditoDetail = NonNullable<Awaited<ReturnType<typeof findCreditoForPayment>>>;

export type CobranzaCaseDetail = {
  occurredAt: string;
  collectionMode: PromotoriaWeeklyCollectionResult['mode'];
  row: CobranzaWorkbenchRow | null;
  credito: CobranzaCreditoDetail;
  caseLabel: 'Cobranza regular' | 'Cierre operativo' | 'Solo recuperado' | 'Solo semana 13' | 'Sin saldo accionable';
  technicalCycleLabel: 'En ciclo' | 'Fuera de ciclo' | 'Sin cartera accionable';
  actionable: {
    regularAmount: number;
    recoveryAmount: number;
    extraWeekAmount: number;
    totalAmount: number;
  };
  pendingFailures: Array<{
    id: string;
    installmentNumber: number;
    dueDate: string;
    amountMissed: number;
    recoveredAmount: number;
    pendingAmount: number;
  }>;
  extraWeek: {
    dueDate: string;
    expectedAmount: number;
    paidAmount: number;
    pendingAmount: number;
    status: string;
  } | null;
  lastPayment: {
    id: string;
    receivedAt: string;
    amountReceived: number;
    statusName: string;
    notes: string | null;
    breakdown: Array<{ label: string; amount: number }>;
  } | null;
  links: {
    creditHref: string;
    clientHref: string;
    paymentHref: string;
    groupHref: string;
    saleSheetHref: string;
  };
};

type CobranzaWorkbenchInput = {
  occurredAt: string;
  scope?: CollectionScope;
  supervisionId?: string;
  promotoriaId?: string;
  rowMode?: CobranzaRowModeFilter;
  cycle?: CobranzaCycleFilter;
  search?: string;
};

const ROW_MODE_ORDER: Record<PromotoriaWeeklyCollectionRow['rowMode'], number> = {
  final_closure: 0,
  recovery_only: 1,
  extra_week_only: 2,
  regular: 3,
};

function buildSearchText(row: CobranzaWorkbenchRow) {
  return normalizeText(
    [
      row.controlNumber == null ? null : String(row.controlNumber),
      row.folio,
      row.loanNumber,
      row.clienteCode,
      row.clienteName,
      row.clientePhone,
      row.clienteSecondaryPhone,
      row.clienteAddress,
      row.clienteNeighborhood,
      row.clienteCity,
      row.clienteState,
      row.promotoriaName,
      row.supervisionName,
      row.creditStartDate,
      row.scheduledDate,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function matchesSearch(row: CobranzaWorkbenchRow, normalizedSearch: string) {
  if (!normalizedSearch) return true;

  const haystack = buildSearchText(row);
  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);

  return tokens.every((token) => haystack.includes(token));
}

function getRegularActionableAmount(row: CobranzaWorkbenchRow) {
  if (row.mode === 'historical') {
    return row.historicalCurrentPaymentAmount + row.historicalFailureAmount;
  }

  return row.collectibleAmount;
}

function getClosureActionableAmount(row: CobranzaWorkbenchRow) {
  if (row.mode === 'historical') {
    return row.historicalRecoveryAmount + row.historicalExtraWeekCollectedAmount;
  }

  return row.recoveryAmountAvailable + row.extraWeekAmount;
}

function getRecoveryOnlyActionableAmount(row: CobranzaWorkbenchRow) {
  if (row.mode === 'historical') {
    return row.historicalRecoveryAmount;
  }

  return row.recoveryAmountAvailable;
}

function getExtraWeekOnlyActionableAmount(row: CobranzaWorkbenchRow) {
  if (row.mode === 'historical') {
    return row.historicalExtraWeekCollectedAmount;
  }

  return row.extraWeekAmount;
}

function getActionableRowAmount(row: CobranzaWorkbenchRow) {
  if (row.rowMode === 'final_closure') return getClosureActionableAmount(row);
  if (row.rowMode === 'recovery_only') return getRecoveryOnlyActionableAmount(row);
  if (row.rowMode === 'extra_week_only') return getExtraWeekOnlyActionableAmount(row);
  return getRegularActionableAmount(row);
}

export function getCobranzaActionableBreakdownFromRow(row: CobranzaWorkbenchRow) {
  const regularAmount = row.rowMode === 'regular' ? getRegularActionableAmount(row) : 0;
  const recoveryAmount =
    row.rowMode === 'final_closure' || row.rowMode === 'recovery_only'
      ? getRecoveryOnlyActionableAmount(row)
      : 0;
  const extraWeekAmount =
    row.rowMode === 'final_closure' || row.rowMode === 'extra_week_only'
      ? getExtraWeekOnlyActionableAmount(row)
      : 0;

  return {
    regularAmount: Number(regularAmount.toFixed(2)),
    recoveryAmount: Number(recoveryAmount.toFixed(2)),
    extraWeekAmount: Number(extraWeekAmount.toFixed(2)),
    totalAmount: Number(getActionableRowAmount(row).toFixed(2)),
  };
}

function getCaseLabel(row: CobranzaWorkbenchRow | null): CobranzaCaseDetail['caseLabel'] {
  if (!row) return 'Sin saldo accionable';
  if (row.rowMode === 'final_closure') return 'Cierre operativo';
  if (row.rowMode === 'recovery_only') return 'Solo recuperado';
  if (row.rowMode === 'extra_week_only') return 'Solo semana 13';
  return 'Cobranza regular';
}

function getTechnicalCycleLabel(row: CobranzaWorkbenchRow | null): CobranzaCaseDetail['technicalCycleLabel'] {
  if (!row) return 'Sin cartera accionable';
  return row.operationalScope === 'active' ? 'En ciclo' : 'Fuera de ciclo';
}

export function getCobranzaCaseLabelFromRow(row: CobranzaWorkbenchRow | null) {
  return getCaseLabel(row);
}

export function getCobranzaTechnicalCycleLabelFromRow(row: CobranzaWorkbenchRow | null) {
  return getTechnicalCycleLabel(row);
}

function isActionableRow(row: CobranzaWorkbenchRow) {
  return getActionableRowAmount(row) > 0.001;
}

export function isCobranzaActionableRow(row: CobranzaWorkbenchRow) {
  return isActionableRow(row);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function matchesCycle(row: CobranzaWorkbenchRow, cycle: CobranzaCycleFilter) {
  if (cycle === 'all') return true;
  if (cycle === 'outside_cycle') return row.operationalScope !== 'active';
  return row.operationalScope === 'active';
}

function sortRows(rows: CobranzaWorkbenchRow[]) {
  return [...rows].sort((left, right) => {
    if (left.mode !== right.mode) {
      return left.mode === 'historical' ? -1 : 1;
    }

    const rowModeDiff = ROW_MODE_ORDER[left.rowMode] - ROW_MODE_ORDER[right.rowMode];
    if (rowModeDiff !== 0) return rowModeDiff;

    const leftIsAdvanceOnly =
      left.rowMode === 'regular' && left.collectibleAmount <= 0.001 && left.deAmount <= 0.001;
    const rightIsAdvanceOnly =
      right.rowMode === 'regular' && right.collectibleAmount <= 0.001 && right.deAmount <= 0.001;
    if (leftIsAdvanceOnly !== rightIsAdvanceOnly) {
      return leftIsAdvanceOnly ? 1 : -1;
    }

    const scheduledDateDiff = (left.scheduledDate ?? '').localeCompare(right.scheduledDate ?? '');
    if (scheduledDateDiff !== 0) return scheduledDateDiff;

    const controlDiff = (left.controlNumber ?? Number.MAX_SAFE_INTEGER) - (right.controlNumber ?? Number.MAX_SAFE_INTEGER);
    if (controlDiff !== 0) return controlDiff;

    return left.clienteLabel.localeCompare(right.clienteLabel);
  });
}

function buildPromotoriaSummaries(rows: CobranzaWorkbenchRow[]): CobranzaPromotoriaSummary[] {
  const byPromotoria = new Map<string, CobranzaWorkbenchRow[]>();

  for (const row of rows) {
    const current = byPromotoria.get(row.promotoriaId) ?? [];
    current.push(row);
    byPromotoria.set(row.promotoriaId, current);
  }

  return [...byPromotoria.entries()]
    .map(([promotoriaId, groupedRows]) => {
      const firstRow = groupedRows[0];
      if (!firstRow) return null;

      return {
        promotoriaId,
        promotoriaCode: firstRow.promotoriaCode,
        promotoriaName: firstRow.promotoriaName,
        supervisionId: firstRow.supervisionId,
        supervisionName: firstRow.supervisionName,
        mode: firstRow.mode,
        ...summarizeCollectionRows(groupedRows, firstRow.mode),
      } satisfies CobranzaPromotoriaSummary;
    })
    .filter((row): row is CobranzaPromotoriaSummary => Boolean(row))
    .sort((left, right) => {
      if (left.mode !== right.mode) {
        return left.mode === 'historical' ? -1 : 1;
      }

      if (left.creditRows !== right.creditRows) {
        return right.creditRows - left.creditRows;
      }

      if (left.recoveryPendingAmount !== right.recoveryPendingAmount) {
        return right.recoveryPendingAmount - left.recoveryPendingAmount;
      }

      return left.promotoriaName.localeCompare(right.promotoriaName);
    });
}

function buildSupervisionSummaries(
  promotoriaSummaries: CobranzaPromotoriaSummary[],
): CobranzaSupervisionSummary[] {
  const bySupervision = new Map<string, CobranzaSupervisionSummary>();

  for (const summary of promotoriaSummaries) {
    const key = summary.supervisionId ?? '__NO_SUPERVISION__';
    const supervisionName = summary.supervisionName ?? 'Sin supervisión';
    const existing = bySupervision.get(key);

    if (existing) {
      existing.promotorias += 1;
      if (summary.mode === 'historical') existing.promotoriasHistorical += 1;
      if (summary.mode === 'preview') existing.promotoriasPreview += 1;
      addCollectionMetrics(existing, summary);
      continue;
    }

    bySupervision.set(key, {
      supervisionId: summary.supervisionId,
      supervisionName,
      promotorias: 1,
      promotoriasHistorical: summary.mode === 'historical' ? 1 : 0,
      promotoriasPreview: summary.mode === 'preview' ? 1 : 0,
      creditRows: summary.creditRows,
      deTotal: summary.deTotal,
      failureAmount: summary.failureAmount,
      recoveryAmount: summary.recoveryAmount,
      incomingAdvanceAmount: summary.incomingAdvanceAmount,
      outgoingAdvanceAmount: summary.outgoingAdvanceAmount,
      extraWeekCollectedAmount: summary.extraWeekCollectedAmount,
      totalToDeliver: summary.totalToDeliver,
      finalCashAmount: summary.finalCashAmount,
      recoveryPendingAmount: summary.recoveryPendingAmount,
      advanceAvailableAmount: summary.advanceAvailableAmount,
      extraWeekPendingAmount: summary.extraWeekPendingAmount,
      finalClosureRows: summary.finalClosureRows,
      recoveryOnlyRows: summary.recoveryOnlyRows,
      extraWeekOnlyRows: summary.extraWeekOnlyRows,
    });
  }

  return [...bySupervision.values()].sort((left, right) => {
    if (left.promotoriasHistorical !== right.promotoriasHistorical) {
      return right.promotoriasHistorical - left.promotoriasHistorical;
    }

    if (left.creditRows !== right.creditRows) {
      return right.creditRows - left.creditRows;
    }

    return left.supervisionName.localeCompare(right.supervisionName);
  });
}

export async function getCobranzaWorkbenchData(input: CobranzaWorkbenchInput) {
  const scope = input.scope ?? 'all';
  const rowMode = input.rowMode ?? 'all';
  const cycle = input.cycle ?? 'all';
  const normalizedSearch = normalizeText(input.search);

  const [reports, activePromotorias] = await Promise.all([
    getCollectionReportsByDay({ occurredAt: input.occurredAt, scope }),
    findActivePromotoriasForCobranza(),
  ]);

  const supervisionOptions = [...new Map(
    activePromotorias
      .filter((promotoria) => promotoria.supervision)
      .map((promotoria) => [
        promotoria.supervision!.id,
        {
          id: promotoria.supervision!.id,
          name: promotoria.supervision!.name,
        },
      ]),
  ).values()].sort((left, right) => left.name.localeCompare(right.name));

  const promotoriaOptions = activePromotorias
    .filter((promotoria) =>
      input.supervisionId ? promotoria.supervision?.id === input.supervisionId : true,
    )
    .map((promotoria) => ({
      id: promotoria.id,
      code: promotoria.code,
      name: promotoria.name,
      supervisionId: promotoria.supervision?.id ?? null,
      supervisionName: promotoria.supervision?.name ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const scopedPromotorias = reports.byPromotoria.filter((promotoria) => {
    if (input.supervisionId && promotoria.supervisionId !== input.supervisionId) return false;
    if (input.promotoriaId && promotoria.promotoriaId !== input.promotoriaId) return false;
    return true;
  });

  const flattenedRows = scopedPromotorias.flatMap((promotoria) =>
    promotoria.collection.rows.map((row) => ({
      ...row,
      mode: promotoria.mode,
      promotoriaCode: promotoria.promotoriaCode,
      supervisionId: promotoria.supervisionId,
    }) satisfies CobranzaWorkbenchRow),
  );

  const filteredRows = sortRows(
    flattenedRows.filter((row) => {
      if (!isActionableRow(row)) return false;
      if (rowMode !== 'all' && row.rowMode !== rowMode) return false;
      if (!matchesCycle(row, cycle)) return false;
      if (!matchesSearch(row, normalizedSearch)) return false;
      return true;
    }),
  );

  const promotoriaSummaries = buildPromotoriaSummaries(filteredRows);
  const supervisionSummaries = buildSupervisionSummaries(promotoriaSummaries);
  const metrics = createCollectionMetrics();

  for (const summary of promotoriaSummaries) {
    addCollectionMetrics(metrics, summary);
  }

  const regularRows = filteredRows.filter((row) => row.rowMode === 'regular').length;
  const outsideCycleRows = filteredRows.filter((row) => row.operationalScope !== 'active').length;
  const categories = {
    regular: {
      rows: filteredRows.filter((row) => row.rowMode === 'regular').length,
      amount: Number(
        filteredRows
          .filter((row) => row.rowMode === 'regular')
          .reduce((sum, row) => sum + getRegularActionableAmount(row), 0)
          .toFixed(2),
      ),
    },
    finalClosure: {
      rows: filteredRows.filter((row) => row.rowMode === 'final_closure').length,
      amount: Number(
        filteredRows
          .filter((row) => row.rowMode === 'final_closure')
          .reduce((sum, row) => sum + getClosureActionableAmount(row), 0)
          .toFixed(2),
      ),
    },
    recoveryOnly: {
      rows: filteredRows.filter((row) => row.rowMode === 'recovery_only').length,
      amount: Number(
        filteredRows
          .filter((row) => row.rowMode === 'recovery_only')
          .reduce((sum, row) => sum + getRecoveryOnlyActionableAmount(row), 0)
          .toFixed(2),
      ),
    },
    extraWeekOnly: {
      rows: filteredRows.filter((row) => row.rowMode === 'extra_week_only').length,
      amount: Number(
        filteredRows
          .filter((row) => row.rowMode === 'extra_week_only')
          .reduce((sum, row) => sum + getExtraWeekOnlyActionableAmount(row), 0)
          .toFixed(2),
      ),
    },
  };
  const actionableAmount = Number(
    filteredRows.reduce((sum, row) => sum + getActionableRowAmount(row), 0).toFixed(2),
  );

  return {
    baseDaily: reports.daily,
    daily: {
      occurredAt: input.occurredAt,
      scope,
      promotorias: promotoriaSummaries.length,
      promotoriasHistorical: promotoriaSummaries.filter((row) => row.mode === 'historical').length,
      promotoriasPreview: promotoriaSummaries.filter((row) => row.mode === 'preview').length,
      supervisiones: supervisionSummaries.length,
      regularRows,
      outsideCycleRows,
      actionableAmount,
      categories,
      ...metrics,
    } satisfies CobranzaDailySummary,
    rows: filteredRows,
    byPromotoria: promotoriaSummaries,
    bySupervision: supervisionSummaries,
    filters: {
      occurredAt: input.occurredAt,
      scope,
      supervisionId: input.supervisionId ?? '',
      promotoriaId: input.promotoriaId ?? '',
      rowMode,
      cycle,
      search: input.search ?? '',
    },
    options: {
      supervision: supervisionOptions,
      promotoria: promotoriaOptions,
    },
  };
}

export async function getCobranzaCaseDetail(input: {
  creditoId: string;
  occurredAt: string;
}): Promise<CobranzaCaseDetail | null> {
  const credito = await findCreditoForPayment(input.creditoId);
  if (!credito) return null;

  const collection = await findPromotoriaWeeklyCollection(credito.promotoria.id, {
    occurredAt: input.occurredAt,
    scope: 'all',
  });

  const rowMatch = collection.rows.find((item) => item.creditoId === credito.id);
  const row = rowMatch
    ? ({
        ...rowMatch,
        mode: collection.mode,
        promotoriaCode: '',
        supervisionId: credito.promotoria.supervision?.id ?? null,
      } satisfies CobranzaWorkbenchRow)
    : null;

  const reversedDefaultIds = new Set(
    credito.reversals
      .filter((reversal) => reversal.sourceType === 'DEFAULT_EVENT')
      .map((reversal) => reversal.sourceId),
  );

  const pendingFailures = credito.defaults
    .filter((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id))
    .map((defaultEvent) => {
      const recoveredAmount = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + Number(recovery.recoveredAmount), 0);
      const pendingAmount = Math.max(0, Number(defaultEvent.amountMissed) - recoveredAmount);

      return {
        id: defaultEvent.id,
        installmentNumber: defaultEvent.schedule.installmentNumber,
        dueDate: toIsoDate(defaultEvent.schedule.dueDate),
        amountMissed: Number(defaultEvent.amountMissed),
        recoveredAmount: Number(recoveredAmount.toFixed(2)),
        pendingAmount: Number(pendingAmount.toFixed(2)),
      };
    })
    .filter((defaultEvent) => defaultEvent.pendingAmount > 0.001)
    .sort((left, right) => left.installmentNumber - right.installmentNumber);

  const hasFailureHistory = credito.defaults.some((defaultEvent) => !reversedDefaultIds.has(defaultEvent.id));
  const lastRegularSchedule = credito.schedules[credito.schedules.length - 1] ?? null;
  const derivedExtraWeekDueDate = (() => {
    if (credito.extraWeek?.dueDate) return credito.extraWeek.dueDate;
    if (!lastRegularSchedule) return null;
    const dueDate = new Date(lastRegularSchedule.dueDate);
    dueDate.setDate(dueDate.getDate() + 7);
    return dueDate;
  })();
  const virtualExtraWeek =
    hasFailureHistory && derivedExtraWeekDueDate
      ? {
          dueDate: derivedExtraWeekDueDate,
          expectedAmount: Number(credito.extraWeek?.expectedAmount ?? credito.weeklyAmount),
          paidAmount: Number(credito.extraWeek?.paidAmount ?? 0),
          status: credito.extraWeek?.status ?? 'PENDING',
        }
      : null;

  const extraWeek = virtualExtraWeek
    ? {
        dueDate: toIsoDate(virtualExtraWeek.dueDate),
        expectedAmount: Number(virtualExtraWeek.expectedAmount),
        paidAmount: Number(virtualExtraWeek.paidAmount),
        pendingAmount: Number(
          Math.max(0, Number(virtualExtraWeek.expectedAmount) - Number(virtualExtraWeek.paidAmount)).toFixed(2),
        ),
        status: virtualExtraWeek.status,
      }
    : null;

  const latestPayment = credito.payments.find((payment) => !payment.isReversed) ?? null;
  const lastPayment = latestPayment
    ? (() => {
        const buckets = {
          base: 0,
          recovery: 0,
          advance: 0,
          extraWeek: 0,
          penalty: 0,
        };

        for (const allocation of latestPayment.allocations) {
          const amount = Number(allocation.amount);
          if (allocation.penaltyChargeId || allocation.allocationType === 'PENALTY') {
            buckets.penalty += amount;
          } else if (allocation.extraWeekEvent || allocation.allocationType === 'EXTRA_WEEK') {
            buckets.extraWeek += amount;
          } else if (allocation.allocationType === 'RECOVERY') {
            buckets.recovery += amount;
          } else if (allocation.allocationType === 'ADVANCE') {
            buckets.advance += amount;
          } else {
            buckets.base += amount;
          }
        }

        const breakdown = [
          buckets.base ? { label: 'Cobranza regular', amount: Number(buckets.base.toFixed(2)) } : null,
          buckets.recovery ? { label: 'Recuperado', amount: Number(buckets.recovery.toFixed(2)) } : null,
          buckets.advance ? { label: 'Adelanto', amount: Number(buckets.advance.toFixed(2)) } : null,
          buckets.extraWeek ? { label: 'Semana 13', amount: Number(buckets.extraWeek.toFixed(2)) } : null,
          buckets.penalty ? { label: 'Multa', amount: Number(buckets.penalty.toFixed(2)) } : null,
        ].filter((bucket): bucket is { label: string; amount: number } => Boolean(bucket));

        return {
          id: latestPayment.id,
          receivedAt: toIsoDate(latestPayment.receivedAt),
          amountReceived: Number(latestPayment.amountReceived),
          statusName: latestPayment.paymentStatus.name,
          notes: latestPayment.notes ?? null,
          breakdown,
        };
      })()
    : null;

  const actionable = {
    regularAmount: Number((row?.rowMode === 'regular' ? getRegularActionableAmount(row) : 0).toFixed(2)),
    recoveryAmount: Number(
      ((row?.rowMode === 'final_closure' || row?.rowMode === 'recovery_only')
        ? row.recoveryAmountAvailable
        : 0).toFixed(2),
    ),
    extraWeekAmount: Number(
      ((row?.rowMode === 'final_closure' || row?.rowMode === 'extra_week_only')
        ? row.extraWeekAmount
        : 0).toFixed(2),
    ),
    totalAmount: Number((row ? getActionableRowAmount(row) : 0).toFixed(2)),
  };

  const saleDate = toIsoDate(credito.startDate);
  const saleSheetParams = new URLSearchParams({
    promotoriaId: credito.promotoria.id,
    saleDate,
  });
  if (credito.controlNumber != null) {
    saleSheetParams.set('controlNumber', String(credito.controlNumber));
  }

  return {
    occurredAt: input.occurredAt,
    collectionMode: collection.mode,
    row,
    credito,
    caseLabel: getCaseLabel(row),
    technicalCycleLabel: getTechnicalCycleLabel(row),
    actionable,
    pendingFailures,
    extraWeek,
    lastPayment,
    links: {
      creditHref: `/creditos/${credito.id}`,
      clientHref: `/clientes/${credito.cliente.id}`,
      paymentHref: `/pagos/nuevo?creditoId=${credito.id}`,
      groupHref: `/pagos?${new URLSearchParams({
        promotoriaId: credito.promotoria.id,
        occurredAt: input.occurredAt,
        scope: 'all',
      }).toString()}`,
      saleSheetHref: `/reportes/hoja-pagos?${saleSheetParams.toString()}`,
    },
  };
}
