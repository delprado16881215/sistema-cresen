import type {
  PromotoriaWeeklyCollectionResult,
  PromotoriaWeeklyCollectionRow,
} from '@/server/repositories/pago-repository';

const METRIC_KEYS = [
  'creditRows',
  'deTotal',
  'failureAmount',
  'recoveryAmount',
  'incomingAdvanceAmount',
  'outgoingAdvanceAmount',
  'extraWeekCollectedAmount',
  'totalToDeliver',
  'finalCashAmount',
  'recoveryPendingAmount',
  'advanceAvailableAmount',
  'extraWeekPendingAmount',
  'finalClosureRows',
  'recoveryOnlyRows',
  'extraWeekOnlyRows',
] as const;

export type CollectionMetrics = {
  creditRows: number;
  deTotal: number;
  failureAmount: number;
  recoveryAmount: number;
  incomingAdvanceAmount: number;
  outgoingAdvanceAmount: number;
  extraWeekCollectedAmount: number;
  totalToDeliver: number;
  finalCashAmount: number;
  recoveryPendingAmount: number;
  advanceAvailableAmount: number;
  extraWeekPendingAmount: number;
  finalClosureRows: number;
  recoveryOnlyRows: number;
  extraWeekOnlyRows: number;
};

export function roundAmount(value: number) {
  return Number(value.toFixed(2));
}

function sumRows(
  rows: PromotoriaWeeklyCollectionRow[],
  selector: (row: PromotoriaWeeklyCollectionRow) => number,
) {
  return roundAmount(rows.reduce((sum, row) => sum + selector(row), 0));
}

export function createCollectionMetrics(): CollectionMetrics {
  return {
    creditRows: 0,
    deTotal: 0,
    failureAmount: 0,
    recoveryAmount: 0,
    incomingAdvanceAmount: 0,
    outgoingAdvanceAmount: 0,
    extraWeekCollectedAmount: 0,
    totalToDeliver: 0,
    finalCashAmount: 0,
    recoveryPendingAmount: 0,
    advanceAvailableAmount: 0,
    extraWeekPendingAmount: 0,
    finalClosureRows: 0,
    recoveryOnlyRows: 0,
    extraWeekOnlyRows: 0,
  };
}

export function addCollectionMetrics(target: CollectionMetrics, source: CollectionMetrics) {
  for (const key of METRIC_KEYS) {
    target[key] = roundAmount(target[key] + source[key]);
  }
}

export function buildFallbackHistoricalTotals(
  metrics: Pick<
    CollectionMetrics,
    | 'deTotal'
    | 'failureAmount'
    | 'recoveryAmount'
    | 'incomingAdvanceAmount'
    | 'outgoingAdvanceAmount'
    | 'extraWeekCollectedAmount'
  >,
) {
  return roundAmount(
    metrics.deTotal -
      metrics.failureAmount +
      metrics.recoveryAmount +
      metrics.incomingAdvanceAmount -
      metrics.outgoingAdvanceAmount +
      metrics.extraWeekCollectedAmount,
  );
}

export function summarizeCollectionRows(
  rows: PromotoriaWeeklyCollectionRow[],
  mode: PromotoriaWeeklyCollectionResult['mode'],
  liquidation?: PromotoriaWeeklyCollectionResult['liquidation'],
  creditRowsOverride?: number,
): CollectionMetrics {
  const isHistorical = mode === 'historical';
  const fallback = createCollectionMetrics();

  fallback.creditRows = creditRowsOverride ?? rows.length;
  fallback.deTotal = sumRows(rows, (row) => row.deAmount);
  fallback.failureAmount = isHistorical ? sumRows(rows, (row) => row.historicalFailureAmount) : 0;
  fallback.recoveryAmount = isHistorical ? sumRows(rows, (row) => row.historicalRecoveryAmount) : 0;
  fallback.incomingAdvanceAmount = isHistorical
    ? sumRows(rows, (row) => row.historicalAdvanceIncomingAmount)
    : 0;
  fallback.outgoingAdvanceAmount = sumRows(rows, (row) => row.outgoingAdvanceAmount);
  fallback.extraWeekCollectedAmount = isHistorical
    ? sumRows(rows, (row) => row.historicalExtraWeekCollectedAmount)
    : 0;
  fallback.recoveryPendingAmount = sumRows(rows, (row) => row.recoveryAmountAvailable);
  fallback.advanceAvailableAmount = sumRows(rows, (row) => row.advanceAmountAvailable);
  fallback.extraWeekPendingAmount = sumRows(rows, (row) => row.extraWeekAmount);
  fallback.finalClosureRows = rows.filter((row) => row.rowMode === 'final_closure').length;
  fallback.recoveryOnlyRows = rows.filter((row) => row.rowMode === 'recovery_only').length;
  fallback.extraWeekOnlyRows = rows.filter((row) => row.rowMode === 'extra_week_only').length;

  if (!isHistorical) {
    return fallback;
  }

  return {
    ...fallback,
    deTotal: roundAmount(liquidation?.deAmount ?? fallback.deTotal),
    failureAmount: roundAmount(liquidation?.failureAmount ?? fallback.failureAmount),
    recoveryAmount: roundAmount(liquidation?.recoveryAmount ?? fallback.recoveryAmount),
    incomingAdvanceAmount: roundAmount(
      liquidation?.incomingAdvanceAmount ?? fallback.incomingAdvanceAmount,
    ),
    outgoingAdvanceAmount: roundAmount(
      liquidation?.outgoingAdvanceAmount ?? fallback.outgoingAdvanceAmount,
    ),
    extraWeekCollectedAmount: roundAmount(
      liquidation?.extraWeekAmount ?? fallback.extraWeekCollectedAmount,
    ),
    totalToDeliver: roundAmount(
      liquidation?.totalToDeliver ?? buildFallbackHistoricalTotals(fallback),
    ),
    finalCashAmount: roundAmount(liquidation?.finalCashAmount ?? 0),
  };
}

export function summarizeCollection(collection: PromotoriaWeeklyCollectionResult): CollectionMetrics {
  return summarizeCollectionRows(
    collection.rows,
    collection.mode,
    collection.liquidation,
    collection.groupCount ?? collection.rows.length,
  );
}
