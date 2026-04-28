import type { PromotoriaWeeklyCollectionResult } from '@/server/repositories/pago-repository';
import {
  findActivePromotoriasForCobranza,
  findPromotoriaWeeklyCollection,
} from '@/server/repositories/pago-repository';
import {
  addCollectionMetrics,
  createCollectionMetrics,
  summarizeCollection,
  type CollectionMetrics,
} from '@/server/services/collection-metrics';

export type CollectionScope = 'active' | 'active_with_extra_week' | 'overdue' | 'all';

export type DailyCollectionReport = CollectionMetrics & {
  occurredAt: string;
  scope: CollectionScope;
  promotorias: number;
  promotoriasHistorical: number;
  promotoriasPreview: number;
};

export type PromotoriaCollectionRow = CollectionMetrics & {
  promotoriaId: string;
  promotoriaCode: string;
  promotoriaName: string;
  supervisionId: string | null;
  supervisionName: string | null;
  mode: PromotoriaWeeklyCollectionResult['mode'];
  collection: PromotoriaWeeklyCollectionResult;
};

export type SupervisionCollectionRow = CollectionMetrics & {
  supervisionId: string | null;
  supervisionCode: string | null;
  supervisionName: string;
  promotorias: number;
  promotoriasHistorical: number;
  promotoriasPreview: number;
};

export async function getCollectionReportsByDay(input: {
  occurredAt: string;
  scope?: CollectionScope;
}): Promise<{
  daily: DailyCollectionReport;
  byPromotoria: PromotoriaCollectionRow[];
  bySupervision: SupervisionCollectionRow[];
}> {
  const scope = input.scope ?? 'active';
  const promotorias = await findActivePromotoriasForCobranza();

  const byPromotoria = await Promise.all(
    promotorias.map(async (promotoria) => {
      const collection = await findPromotoriaWeeklyCollection(promotoria.id, {
        occurredAt: input.occurredAt,
        scope,
      });
      const metrics = summarizeCollection(collection);

      return {
        promotoriaId: promotoria.id,
        promotoriaCode: promotoria.code,
        promotoriaName: promotoria.name,
        supervisionId: promotoria.supervision?.id ?? null,
        supervisionName: promotoria.supervision?.name ?? null,
        mode: collection.mode,
        collection,
        ...metrics,
      } satisfies PromotoriaCollectionRow;
    }),
  );

  const operativePromotorias = byPromotoria.filter((row) => row.creditRows > 0);

  operativePromotorias.sort((left, right) => {
    if (left.mode !== right.mode) {
      return left.mode === 'historical' ? -1 : 1;
    }

    if (left.creditRows !== right.creditRows) {
      return right.creditRows - left.creditRows;
    }

    if (left.totalToDeliver !== right.totalToDeliver) {
      return right.totalToDeliver - left.totalToDeliver;
    }

    return left.promotoriaName.localeCompare(right.promotoriaName);
  });

  const dailyMetrics = createCollectionMetrics();
  for (const row of operativePromotorias) {
    addCollectionMetrics(dailyMetrics, row);
  }

  const bySupervisionMap = new Map<string, SupervisionCollectionRow>();
  for (const row of operativePromotorias) {
    const supervisionKey = row.supervisionId ?? '__NO_SUPERVISION__';
    const supervisionName = row.supervisionName ?? 'Sin supervisión';
    const existing = bySupervisionMap.get(supervisionKey);

    if (existing) {
      existing.promotorias += 1;
      if (row.mode === 'historical') existing.promotoriasHistorical += 1;
      if (row.mode === 'preview') existing.promotoriasPreview += 1;
      addCollectionMetrics(existing, row);
      continue;
    }

    bySupervisionMap.set(supervisionKey, {
      supervisionId: row.supervisionId,
      supervisionCode: null,
      supervisionName,
      promotorias: 1,
      promotoriasHistorical: row.mode === 'historical' ? 1 : 0,
      promotoriasPreview: row.mode === 'preview' ? 1 : 0,
      creditRows: row.creditRows,
      deTotal: row.deTotal,
      failureAmount: row.failureAmount,
      recoveryAmount: row.recoveryAmount,
      incomingAdvanceAmount: row.incomingAdvanceAmount,
      outgoingAdvanceAmount: row.outgoingAdvanceAmount,
      extraWeekCollectedAmount: row.extraWeekCollectedAmount,
      totalToDeliver: row.totalToDeliver,
      finalCashAmount: row.finalCashAmount,
      recoveryPendingAmount: row.recoveryPendingAmount,
      advanceAvailableAmount: row.advanceAvailableAmount,
      extraWeekPendingAmount: row.extraWeekPendingAmount,
      finalClosureRows: row.finalClosureRows,
      recoveryOnlyRows: row.recoveryOnlyRows,
      extraWeekOnlyRows: row.extraWeekOnlyRows,
    });
  }

  const bySupervision = [...bySupervisionMap.values()].sort((left, right) => {
      if (left.promotoriasHistorical !== right.promotoriasHistorical) {
        return right.promotoriasHistorical - left.promotoriasHistorical;
      }

      if (left.creditRows !== right.creditRows) {
        return right.creditRows - left.creditRows;
      }

      return left.supervisionName.localeCompare(right.supervisionName);
    });

  return {
    daily: {
      occurredAt: input.occurredAt,
      scope,
      promotorias: operativePromotorias.length,
      promotoriasHistorical: operativePromotorias.filter((row) => row.mode === 'historical').length,
      promotoriasPreview: operativePromotorias.filter((row) => row.mode === 'preview').length,
      ...dailyMetrics,
    },
    byPromotoria: operativePromotorias,
    bySupervision,
  };
}
