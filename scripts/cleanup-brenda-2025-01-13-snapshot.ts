import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const AUDIT_ID = 'cmndl5m3t08shvmtfw3dgabwn';
const CREDITO_ID = 'cmn6f6mgv017b63ia7nru4qu8';

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
  scheduleId?: string | null;
  extraWeekEventId?: string | null;
  historicalRecoveryAmount?: number;
  [key: string]: unknown;
};

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function buildGroupFingerprint(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.items) ? ([...payload.items] as ImpactItem[]) : [];
  const rowsSnapshot = Array.isArray(payload.rowsSnapshot) ? (payload.rowsSnapshot as SnapshotRow[]) : [];
  const rowsByCredito = new Map(rowsSnapshot.map((row) => [String(row.creditoId ?? ''), row]));

  const sortedItems = items.sort((left, right) =>
    String(left.creditoId ?? '').localeCompare(String(right.creditoId ?? '')),
  );

  return [
    String(payload.promotoriaId ?? ''),
    String(payload.occurredAt ?? ''),
    String(payload.scope ?? 'active'),
    ...sortedItems.map((item) => {
      const row = rowsByCredito.get(String(item.creditoId ?? ''));
      return `${String(item.creditoId ?? '')}:${String(item.action ?? 'PAY')}:${String(row?.scheduleId ?? row?.extraWeekEventId ?? 'none')}:${toMoney(item.recoveryAmount)}:${toMoney(item.advanceAmount)}:${toMoney(item.extraWeekAmount)}:${toMoney(item.partialFailureAmount)}`;
    }),
  ].join('|');
}

async function main() {
  const audit = await prisma.auditLog.findUnique({
    where: { id: AUDIT_ID },
    select: {
      id: true,
      entityId: true,
      afterJson: true,
    },
  });

  if (!audit) {
    throw new Error(`No encontré el AuditLog ${AUDIT_ID}.`);
  }

  if (!audit.afterJson || typeof audit.afterJson !== 'object' || Array.isArray(audit.afterJson)) {
    throw new Error('El afterJson del impacto no tiene estructura válida.');
  }

  const after = structuredClone(audit.afterJson as Record<string, unknown>);
  const items = Array.isArray(after.items) ? ([...after.items] as ImpactItem[]) : [];
  const rowsSnapshot = Array.isArray(after.rowsSnapshot) ? ([...after.rowsSnapshot] as SnapshotRow[]) : [];
  const liquidation =
    after.liquidation && typeof after.liquidation === 'object' && !Array.isArray(after.liquidation)
      ? ({ ...(after.liquidation as Record<string, unknown>) } as Record<string, unknown>)
      : null;

  const itemIndex = items.findIndex((item) => String(item.creditoId ?? '') === CREDITO_ID);
  if (itemIndex === -1) {
    throw new Error('No encontré el item histórico de Brenda dentro del impacto.');
  }

  const originalItem = items[itemIndex]!;
  const originalRecoveryAmount = toMoney(originalItem.recoveryAmount);
  if (originalRecoveryAmount <= 0) {
    throw new Error('El item histórico de Brenda ya no tiene recoveryAmount pendiente de limpiar.');
  }

  items[itemIndex] = {
    ...originalItem,
    recoveryAmount: 0,
  };

  const rowIndex = rowsSnapshot.findIndex((row) => String(row.creditoId ?? '') === CREDITO_ID);
  if (rowIndex !== -1) {
    rowsSnapshot[rowIndex] = {
      ...rowsSnapshot[rowIndex],
      historicalRecoveryAmount: 0,
    };
  }

  if (liquidation) {
    const deAmount = toMoney(liquidation.deAmount);
    const failureAmount = toMoney(liquidation.failureAmount);
    const incomingAdvanceAmount = toMoney(liquidation.incomingAdvanceAmount);
    const outgoingAdvanceAmount = toMoney(liquidation.outgoingAdvanceAmount);
    const extraWeekAmount = toMoney(liquidation.extraWeekAmount);
    const saleAmount = toMoney(liquidation.saleAmount);
    const bonusAmount = toMoney(liquidation.bonusAmount);
    const commissionRate = toMoney(liquidation.commissionRate);
    const commissionBase = String(liquidation.commissionBase ?? 'SALE');

    const recoveryAmount = roundMoney(Math.max(0, toMoney(liquidation.recoveryAmount) - originalRecoveryAmount));
    const subtotalAmount = roundMoney(deAmount - failureAmount + recoveryAmount);
    const totalToDeliver = roundMoney(
      subtotalAmount + incomingAdvanceAmount - outgoingAdvanceAmount + extraWeekAmount,
    );
    const commissionBaseAmount = roundMoney(
      commissionBase === 'TOTAL_TO_DELIVER' ? subtotalAmount : saleAmount,
    );
    const commissionAmount = roundMoney((commissionBaseAmount * commissionRate) / 100);
    const finalCashAmount = roundMoney(totalToDeliver - saleAmount - commissionAmount - bonusAmount);
    const finalCashLabel = finalCashAmount < 0 ? 'Inversión' : 'Fondo para la siguiente semana';

    after.liquidation = {
      ...liquidation,
      recoveryAmount,
      subtotalAmount,
      totalToDeliver,
      commissionBaseAmount,
      commissionAmount,
      finalCashAmount,
      finalCashLabel,
    };
  }

  after.items = items;
  after.rowsSnapshot = rowsSnapshot;
  after.groupFingerprint = buildGroupFingerprint(after);

  await prisma.auditLog.update({
    where: { id: AUDIT_ID },
    data: {
      afterJson: after as Prisma.InputJsonValue,
    },
  });

  console.log(
    JSON.stringify(
      {
        auditId: audit.id,
        entityId: audit.entityId,
        creditoId: CREDITO_ID,
        removedHistoricalRecoveryAmount: originalRecoveryAmount,
        updatedItem: items[itemIndex],
        updatedRow: rowIndex === -1 ? null : rowsSnapshot[rowIndex],
        updatedLiquidation: after.liquidation ?? null,
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
