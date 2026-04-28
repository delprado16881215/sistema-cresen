import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { registerPago } from '@/server/services/pagos-service';

const CREDIT_FOLIO = 'CRED-20240916-0095';
const TARGET_DATE = '2025-01-13';
const TARGET_EXTRA_WEEK = 312.5;
const AUDIT_ID = 'cmndl5m3t08shvmtfw3dgabwn';

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function toDayRange(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

function buildGroupFingerprint(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.items) ? [...payload.items] : [];
  const rowsSnapshot = Array.isArray(payload.rowsSnapshot) ? [...payload.rowsSnapshot] : [];
  const rowsByCredito = new Map(
    rowsSnapshot.map((row) => [String((row as Record<string, unknown>).creditoId ?? ''), row as Record<string, unknown>]),
  );

  const sortedItems = items.sort((left, right) =>
    String((left as Record<string, unknown>).creditoId ?? '').localeCompare(
      String((right as Record<string, unknown>).creditoId ?? ''),
    ),
  );

  return [
    String(payload.promotoriaId ?? ''),
    String(payload.occurredAt ?? ''),
    String(payload.scope ?? 'active'),
    ...sortedItems.map((item) => {
      const record = item as Record<string, unknown>;
      const row = rowsByCredito.get(String(record.creditoId ?? ''));
      return `${String(record.creditoId ?? '')}:${String(record.action ?? 'PAY')}:${String(row?.scheduleId ?? row?.extraWeekEventId ?? 'none')}:${toMoney(record.recoveryAmount)}:${toMoney(record.advanceAmount)}:${toMoney(record.extraWeekAmount)}:${toMoney(record.partialFailureAmount)}`;
    }),
  ].join('|');
}

async function main() {
  const credito = await prisma.credito.findFirst({
    where: { folio: CREDIT_FOLIO },
    select: {
      id: true,
      folio: true,
      loanNumber: true,
      createdByUserId: true,
      cliente: { select: { fullName: true, code: true } },
      extraWeek: {
        select: {
          id: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          status: true,
        },
      },
      payments: {
        where: {
          isReversed: false,
          receivedAt: {
            gte: new Date(`${TARGET_DATE}T00:00:00.000Z`),
            lte: new Date(`${TARGET_DATE}T23:59:59.999Z`),
          },
        },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          notes: true,
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
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}.`);
  }

  if (!credito.extraWeek) {
    throw new Error('El crédito no tiene semana extra creada.');
  }

  const { start, end } = toDayRange(TARGET_DATE);

  if (credito.payments.length > 0) {
    throw new Error(
      `Ya existe un PaymentEvent activo para ${TARGET_DATE}: ${credito.payments.map((p) => p.id).join(', ')}`,
    );
  }

  const extraWeekPending = Math.max(
    0,
    toMoney(credito.extraWeek.expectedAmount) - toMoney(credito.extraWeek.paidAmount),
  );

  if (Math.abs(extraWeekPending - TARGET_EXTRA_WEEK) > 0.001) {
    throw new Error(
      `La semana extra pendiente no cuadra. Esperaba ${TARGET_EXTRA_WEEK.toFixed(2)} y encontré ${extraWeekPending.toFixed(2)}.`,
    );
  }

  const fallbackUserId =
    credito.createdByUserId ||
    (
      await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;

  if (!fallbackUserId) {
    throw new Error('No encontré un usuario activo para registrar el ajuste.');
  }

  const paymentResult = await registerPago(
    {
      creditoId: credito.id,
      receivedAt: TARGET_DATE,
      amountReceived: TARGET_EXTRA_WEEK,
      penaltyChargeIds: [],
      notes: 'AJUSTE CONTROLADO BRENDA 2025-01-13: 312.5 semana extra',
    },
    fallbackUserId,
  );

  if (!paymentResult.id || paymentResult.duplicateSkipped) {
    throw new Error(paymentResult.duplicateReason || 'El pago no se pudo registrar.');
  }

  const impactAudit = await prisma.auditLog.findUnique({
    where: { id: AUDIT_ID },
    select: { id: true, afterJson: true },
  });

  if (!impactAudit?.afterJson || typeof impactAudit.afterJson !== 'object' || Array.isArray(impactAudit.afterJson)) {
    throw new Error(`No encontré el snapshot histórico ${AUDIT_ID} para ajustar.`);
  }

  const after = structuredClone(impactAudit.afterJson as Record<string, unknown>);
  const items = Array.isArray(after.items) ? [...after.items] : [];
  const rowsSnapshot = Array.isArray(after.rowsSnapshot) ? [...after.rowsSnapshot] : [];
  const liquidation =
    after.liquidation && typeof after.liquidation === 'object' && !Array.isArray(after.liquidation)
      ? ({ ...(after.liquidation as Record<string, unknown>) } as Record<string, unknown>)
      : null;

  const itemIndex = items.findIndex((item) => (item as Record<string, unknown>)?.creditoId === credito.id);
  if (itemIndex >= 0) {
    const current = items[itemIndex] as Record<string, unknown>;
    items[itemIndex] = {
      ...current,
      recoveryAmount: 0,
      extraWeekAmount: TARGET_EXTRA_WEEK,
    };
  }

  const rowIndex = rowsSnapshot.findIndex((row) => (row as Record<string, unknown>)?.creditoId === credito.id);
  if (rowIndex >= 0) {
    const current = rowsSnapshot[rowIndex] as Record<string, unknown>;
    rowsSnapshot[rowIndex] = {
      ...current,
      historicalRecoveryAmount: 0,
      historicalExtraWeekCollectedAmount: TARGET_EXTRA_WEEK,
    };
  }

  if (liquidation) {
    const deAmount = toMoney(liquidation.deAmount);
    const failureAmount = toMoney(liquidation.failureAmount);
    const recoveryAmount = toMoney(liquidation.recoveryAmount);
    const incomingAdvanceAmount = toMoney(liquidation.incomingAdvanceAmount);
    const outgoingAdvanceAmount = toMoney(liquidation.outgoingAdvanceAmount);
    const saleAmount = toMoney(liquidation.saleAmount);
    const bonusAmount = toMoney(liquidation.bonusAmount);
    const commissionRate = toMoney(liquidation.commissionRate);
    const commissionBase = String(liquidation.commissionBase ?? 'SALE');
    const extraWeekAmount = roundMoney(toMoney(liquidation.extraWeekAmount) + TARGET_EXTRA_WEEK);
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
      extraWeekAmount,
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
    data: { afterJson: after as Prisma.InputJsonValue },
  });

  const afterCredito = await prisma.credito.findUnique({
    where: { id: credito.id },
    select: {
      id: true,
      folio: true,
      cliente: { select: { fullName: true } },
      extraWeek: {
        select: {
          id: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          status: true,
          allocations: {
            where: { paymentEvent: { isReversed: false, receivedAt: { gte: start, lte: end } } },
            select: {
              id: true,
              amount: true,
              allocationType: true,
              extraWeekEventId: true,
              paymentEvent: { select: { id: true, receivedAt: true, amountReceived: true, notes: true } },
            },
          },
        },
      },
      payments: {
        where: { isReversed: false, receivedAt: { gte: start, lte: end } },
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          notes: true,
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

  console.log(
    JSON.stringify(
      {
        creditoId: credito.id,
        folio: credito.folio,
        cliente: credito.cliente,
        targetDate: TARGET_DATE,
        expectedSplit: {
          recoveryAmount: 0,
          extraWeekAmount: TARGET_EXTRA_WEEK,
        },
        paymentResult,
        afterCredito,
        updatedSnapshotItem: itemIndex >= 0 ? items[itemIndex] : null,
        updatedSnapshotRow: rowIndex >= 0 ? rowsSnapshot[rowIndex] : null,
        updatedSnapshotLiquidation: after.liquidation ?? null,
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
