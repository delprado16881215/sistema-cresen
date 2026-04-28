import { prisma } from '@/lib/prisma';
import { registerPago } from '@/server/services/pagos-service';

const CREDIT_FOLIO = 'CRED-20240916-0098';
const TARGET_DATE = '2024-12-30';
const TOTAL_AMOUNT = 500;
const TARGET_RECOVERY = 250;
const TARGET_EXTRA_WEEK = 250;

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function toDayRange(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
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
      defaults: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          amountMissed: true,
          scheduleId: true,
          schedule: {
            select: {
              id: true,
              installmentNumber: true,
              dueDate: true,
            },
          },
          recoveries: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              recoveredAmount: true,
              paymentEvent: {
                select: {
                  id: true,
                  receivedAt: true,
                  isReversed: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!credito) {
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}.`);
  }

  const { start, end } = toDayRange(TARGET_DATE);
  const existingPayment = await prisma.paymentEvent.findFirst({
    where: {
      creditoId: credito.id,
      isReversed: false,
      receivedAt: { gte: start, lte: end },
    },
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
  });

  if (existingPayment) {
    throw new Error(
      `Ya existe un PaymentEvent activo el ${TARGET_DATE}: ${existingPayment.id}. No voy a duplicarlo.`,
    );
  }

  const unresolvedDefaults = credito.defaults
    .map((defaultEvent) => {
      const recovered = defaultEvent.recoveries
        .filter((recovery) => !recovery.paymentEvent.isReversed)
        .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
      const pending = Math.max(0, toMoney(defaultEvent.amountMissed) - recovered);
      return { ...defaultEvent, recovered, pending };
    })
    .filter((defaultEvent) => defaultEvent.pending > 0.001);

  if (!unresolvedDefaults.length) {
    throw new Error('No quedan fallas pendientes para recuperar.');
  }

  const targetDefault = unresolvedDefaults[0];
  if (!targetDefault) {
    throw new Error('No encontré la falla objetivo para aplicar el recuperado.');
  }
  if (Math.abs(targetDefault.pending - TARGET_RECOVERY) > 0.001) {
    throw new Error(
      `La falla pendiente esperada no cuadra. Esperaba ${TARGET_RECOVERY.toFixed(2)} y encontré ${targetDefault.pending.toFixed(2)} en semana ${targetDefault.schedule.installmentNumber}.`,
    );
  }

  if (!credito.extraWeek) {
    throw new Error('El crédito no tiene semana extra creada.');
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

  const fallbackUser =
    credito.createdByUserId ||
    (
      await prisma.user.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;

  if (!fallbackUser) {
    throw new Error('No encontré un usuario activo para registrar el ajuste.');
  }

  const paymentResult = await registerPago(
    {
      creditoId: credito.id,
      receivedAt: TARGET_DATE,
      amountReceived: TOTAL_AMOUNT,
      penaltyChargeIds: [],
      notes: 'AJUSTE CONTROLADO ANGEL 2024-12-30: 250 recuperado + 250 semana extra',
    },
    fallbackUser,
  );

  if (!paymentResult.id || paymentResult.duplicateSkipped) {
    throw new Error(paymentResult.duplicateReason || 'El pago no se pudo registrar.');
  }

  const impactAudit = await prisma.auditLog.findFirst({
    where: {
      module: 'pagos',
      entity: 'PagoGrupoImpact',
      entityId: { contains: `|${TARGET_DATE}|` },
      afterJson: {
        path: ['items'],
        array_contains: [{ creditoId: credito.id }],
      } as never,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, afterJson: true },
  });

  if (impactAudit) {
    const after = ((impactAudit.afterJson ?? {}) as Record<string, any>);
    const items = Array.isArray(after.items) ? [...after.items] : [];
    const rowsSnapshot = Array.isArray(after.rowsSnapshot) ? [...after.rowsSnapshot] : [];
    const liquidation = typeof after.liquidation === 'object' && after.liquidation ? { ...after.liquidation } : null;

    const itemIndex = items.findIndex((item) => item?.creditoId === credito.id);
    if (itemIndex >= 0) {
      items[itemIndex] = {
        ...items[itemIndex],
        recoveryAmount: TARGET_RECOVERY,
        extraWeekAmount: TARGET_EXTRA_WEEK,
      };
    }

    const rowIndex = rowsSnapshot.findIndex((row) => row?.creditoId === credito.id);
    if (rowIndex >= 0) {
      rowsSnapshot[rowIndex] = {
        ...rowsSnapshot[rowIndex],
        historicalRecoveryAmount: TARGET_RECOVERY,
        historicalExtraWeekCollectedAmount: TARGET_EXTRA_WEEK,
      };
    }

    if (liquidation) {
      liquidation.recoveryAmount = Math.max(0, toMoney(liquidation.recoveryAmount) - TARGET_EXTRA_WEEK);
      liquidation.subtotalAmount = toMoney(liquidation.deAmount) - toMoney(liquidation.failureAmount) + toMoney(liquidation.recoveryAmount);
      liquidation.extraWeekAmount = toMoney(liquidation.extraWeekAmount) + TARGET_EXTRA_WEEK;
      liquidation.totalToDeliver =
        toMoney(liquidation.subtotalAmount) +
        toMoney(liquidation.incomingAdvanceAmount) -
        toMoney(liquidation.outgoingAdvanceAmount) +
        toMoney(liquidation.extraWeekAmount);
    }

    await prisma.auditLog.update({
      where: { id: impactAudit.id },
      data: {
        afterJson: {
          ...after,
          items,
          rowsSnapshot,
          liquidation: liquidation ?? after.liquidation,
        },
      },
    });
  }

  const after = await prisma.credito.findUnique({
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
              paymentEvent: { select: { id: true, receivedAt: true, amountReceived: true } },
            },
          },
        },
      },
      schedules: {
        where: { installmentNumber: { in: [targetDefault.schedule.installmentNumber] } },
        select: {
          installmentNumber: true,
          dueDate: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
          allocations: {
            where: { paymentEvent: { isReversed: false, receivedAt: { gte: start, lte: end } } },
            select: {
              id: true,
              amount: true,
              allocationType: true,
              defaultEventId: true,
              paymentEvent: { select: { id: true, receivedAt: true, amountReceived: true } },
            },
          },
        },
      },
      defaults: {
        where: { id: targetDefault.id },
        select: {
          id: true,
          amountMissed: true,
          schedule: { select: { installmentNumber: true, dueDate: true } },
          recoveries: {
            where: { paymentEvent: { isReversed: false, receivedAt: { gte: start, lte: end } } },
            select: {
              id: true,
              recoveredAmount: true,
              paymentEventId: true,
              paymentEvent: { select: { id: true, receivedAt: true, amountReceived: true } },
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
          recoveryAmount: TARGET_RECOVERY,
          extraWeekAmount: TARGET_EXTRA_WEEK,
        },
        paymentResult,
        after,
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
