import { prisma } from '@/lib/prisma';
import { registerPago } from '@/server/services/pagos-service';

const CREDIT_FOLIO = 'CRED-20250407-0294';

const TARGETS = [
  {
    date: '2025-07-07',
    amount: 375,
    expectedWeek: 4,
    note: 'AJUSTE CONTROLADO ARELI 2025-07-07: 375 recuperado semana 4',
  },
  {
    date: '2025-07-14',
    amount: 375,
    expectedWeek: 6,
    note: 'AJUSTE CONTROLADO ARELI 2025-07-14: 375 recuperado semana 6',
  },
] as const;

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function toDayRange(dateKey: string) {
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

async function getFallbackUserId(createdByUserId: string | null) {
  if (createdByUserId) return createdByUserId;

  const user = await prisma.user.findFirst({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!user) {
    throw new Error('No encontré un usuario activo para registrar el ajuste.');
  }

  return user.id;
}

async function loadCreditoState(creditoId: string) {
  return prisma.credito.findUnique({
    where: { id: creditoId },
    select: {
      id: true,
      folio: true,
      createdByUserId: true,
      cliente: { select: { code: true, fullName: true } },
      payments: {
        where: { isReversed: false },
        orderBy: [{ receivedAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
          notes: true,
          allocations: {
            orderBy: [{ createdAt: 'asc' }],
            select: {
              id: true,
              amount: true,
              allocationType: true,
              defaultEventId: true,
              extraWeekEventId: true,
              schedule: { select: { installmentNumber: true } },
            },
          },
        },
      },
      defaults: {
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          amountMissed: true,
          schedule: {
            select: {
              id: true,
              installmentNumber: true,
              dueDate: true,
              installmentStatus: { select: { code: true, name: true } },
            },
          },
          recoveries: {
            orderBy: [{ createdAt: 'asc' }],
            select: {
              id: true,
              recoveredAmount: true,
              createdAt: true,
              paymentEventId: true,
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
      extraWeek: {
        select: {
          id: true,
          dueDate: true,
          extraWeekNumber: true,
          expectedAmount: true,
          paidAmount: true,
          status: true,
          paidAt: true,
          allocations: {
            where: { paymentEvent: { isReversed: false } },
            select: {
              id: true,
              amount: true,
              paymentEvent: { select: { id: true, receivedAt: true, amountReceived: true } },
            },
          },
        },
      },
      schedules: {
        where: { installmentNumber: { in: [4, 6, 11] } },
        orderBy: [{ installmentNumber: 'asc' }],
        select: {
          id: true,
          installmentNumber: true,
          dueDate: true,
          expectedAmount: true,
          paidAmount: true,
          installmentStatus: { select: { code: true, name: true } },
          allocations: {
            where: { paymentEvent: { isReversed: false } },
            orderBy: [{ createdAt: 'asc' }],
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
      recoveries: {
        where: { paymentEvent: { isReversed: false } },
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          recoveredAmount: true,
          createdAt: true,
          defaultEventId: true,
          paymentEventId: true,
          paymentEvent: { select: { receivedAt: true, amountReceived: true } },
          defaultEvent: { select: { schedule: { select: { installmentNumber: true } } } },
        },
      },
    },
  });
}

async function main() {
  const firstTarget = TARGETS[0];
  const lastTarget = TARGETS[TARGETS.length - 1];

  if (!firstTarget || !lastTarget) {
    throw new Error('No hay fechas objetivo configuradas para el ajuste.');
  }

  const credito = await prisma.credito.findFirst({
    where: { folio: CREDIT_FOLIO },
    select: {
      id: true,
      folio: true,
      createdByUserId: true,
      cliente: { select: { code: true, fullName: true } },
      defaults: {
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          amountMissed: true,
          schedule: { select: { installmentNumber: true } },
          recoveries: {
            orderBy: [{ createdAt: 'asc' }],
            select: {
              id: true,
              recoveredAmount: true,
              paymentEvent: { select: { isReversed: true } },
            },
          },
        },
      },
      payments: {
        where: {
          isReversed: false,
          receivedAt: {
            gte: new Date(`${firstTarget.date}T00:00:00.000Z`),
            lte: new Date(`${lastTarget.date}T23:59:59.999Z`),
          },
        },
        orderBy: [{ receivedAt: 'asc' }],
        select: {
          id: true,
          receivedAt: true,
          amountReceived: true,
        },
      },
    },
  });

  if (!credito) {
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}.`);
  }

  const fallbackUserId = await getFallbackUserId(credito.createdByUserId);

  for (const target of TARGETS) {
    const { start, end } = toDayRange(target.date);
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
      },
    });

    if (existingPayment) {
      throw new Error(
        `Ya existe un PaymentEvent activo para ${target.date}: ${existingPayment.id}. No voy a duplicarlo.`,
      );
    }

    const beforeState = await loadCreditoState(credito.id);
    if (!beforeState) {
      throw new Error(`No pude recargar el crédito ${CREDIT_FOLIO}.`);
    }

    const unresolvedDefaults = beforeState.defaults
      .map((defaultEvent) => {
        const recovered = defaultEvent.recoveries
          .filter((recovery) => !recovery.paymentEvent.isReversed)
          .reduce((sum, recovery) => sum + toMoney(recovery.recoveredAmount), 0);
        const pending = Math.max(0, toMoney(defaultEvent.amountMissed) - recovered);
        return {
          ...defaultEvent,
          recovered,
          pending,
        };
      })
      .filter((defaultEvent) => defaultEvent.pending > 0.001);

    const firstUnresolved = unresolvedDefaults[0];
    if (!firstUnresolved) {
      throw new Error(`Ya no hay fallas pendientes para aplicar el ajuste del ${target.date}.`);
    }

    if (firstUnresolved.schedule.installmentNumber !== target.expectedWeek) {
      throw new Error(
        `El destino esperado para ${target.date} no cuadra. Esperaba semana ${target.expectedWeek} y encontré semana ${firstUnresolved.schedule.installmentNumber}.`,
      );
    }

    if (Math.abs(firstUnresolved.pending - target.amount) > 0.001) {
      throw new Error(
        `El saldo pendiente de la semana ${target.expectedWeek} no cuadra para ${target.date}. Esperaba ${target.amount.toFixed(2)} y encontré ${firstUnresolved.pending.toFixed(2)}.`,
      );
    }

    const paymentResult = await registerPago(
      {
        creditoId: credito.id,
        receivedAt: target.date,
        amountReceived: target.amount,
        penaltyChargeIds: [],
        notes: target.note,
      },
      fallbackUserId,
    );

    if (!paymentResult.id || paymentResult.duplicateSkipped) {
      throw new Error(paymentResult.duplicateReason || `No se pudo registrar el pago del ${target.date}.`);
    }
  }

  const finalState = await loadCreditoState(credito.id);
  if (!finalState) {
    throw new Error(`No pude cargar el estado final de ${CREDIT_FOLIO}.`);
  }

  const targetDates = new Set<string>(TARGETS.map((target) => target.date));
  const createdPayments = finalState.payments
    .filter((payment) => targetDates.has(payment.receivedAt.toISOString().slice(0, 10)))
    .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
  const createdRecoveries = finalState.recoveries
    .filter((recovery) => targetDates.has(recovery.paymentEvent.receivedAt.toISOString().slice(0, 10)))
    .sort((left, right) => left.paymentEvent.receivedAt.getTime() - right.paymentEvent.receivedAt.getTime());

  const pendingRecoveryAmount = finalState.defaults.reduce((sum, defaultEvent) => {
    const recovered = defaultEvent.recoveries
      .filter((recovery) => !recovery.paymentEvent.isReversed)
      .reduce((recoverySum, recovery) => recoverySum + toMoney(recovery.recoveredAmount), 0);
    return sum + Math.max(0, toMoney(defaultEvent.amountMissed) - recovered);
  }, 0);
  const pendingExtraWeekAmount = finalState.extraWeek
    ? Math.max(0, toMoney(finalState.extraWeek.expectedAmount) - toMoney(finalState.extraWeek.paidAmount))
    : 0;

  console.log(
    JSON.stringify(
      {
        creditoId: finalState.id,
        folio: finalState.folio,
        cliente: finalState.cliente,
        createdPayments,
        createdRecoveries: createdRecoveries.map((recovery) => ({
          id: recovery.id,
          recoveredAmount: recovery.recoveredAmount,
          createdAt: recovery.createdAt,
          paymentEventId: recovery.paymentEventId,
          installmentNumber: recovery.defaultEvent.schedule.installmentNumber,
          paymentReceivedAt: recovery.paymentEvent.receivedAt,
          paymentAmountReceived: recovery.paymentEvent.amountReceived,
        })),
        schedules: finalState.schedules.map((schedule) => ({
          installmentNumber: schedule.installmentNumber,
          dueDate: schedule.dueDate,
          paidAmount: schedule.paidAmount,
          status: schedule.installmentStatus,
          allocations: schedule.allocations.map((allocation) => ({
            id: allocation.id,
            amount: allocation.amount,
            allocationType: allocation.allocationType,
            defaultEventId: allocation.defaultEventId,
            paymentEventId: allocation.paymentEvent.id,
            paymentReceivedAt: allocation.paymentEvent.receivedAt,
          })),
        })),
        extraWeek: finalState.extraWeek,
        remainingBalance: {
          recovery: pendingRecoveryAmount,
          extraWeek: pendingExtraWeekAmount,
          total: pendingRecoveryAmount + pendingExtraWeekAmount,
        },
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
