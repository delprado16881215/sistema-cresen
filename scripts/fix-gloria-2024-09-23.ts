import { prisma } from '@/lib/prisma';
import { registerPago } from '@/server/services/pagos-service';

const CREDIT_FOLIO = 'CRED-20240617-0030';
const TARGET_DATE = '2024-09-23';
const TARGET_RECOVERY = 500;
const TARGET_EXTRA_WEEK = 250;
const TOTAL_AMOUNT = TARGET_RECOVERY + TARGET_EXTRA_WEEK;

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
        orderBy: [{ createdAt: 'asc' }],
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
            orderBy: [{ createdAt: 'asc' }],
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
        },
      },
    },
  });

  if (!credito) {
    throw new Error(`No encontré el crédito ${CREDIT_FOLIO}.`);
  }

  if (credito.payments.length > 0) {
    throw new Error(
      `Ya existe un PaymentEvent activo para ${TARGET_DATE}: ${credito.payments
        .map((payment) => payment.id)
        .join(', ')}`,
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

  const unresolvedTotal = unresolvedDefaults.reduce((sum, item) => sum + item.pending, 0);
  if (Math.abs(unresolvedTotal - TARGET_RECOVERY) > 0.001) {
    throw new Error(
      `Las fallas pendientes no cuadran con el recuperado esperado. Esperaba ${TARGET_RECOVERY.toFixed(2)} y encontré ${unresolvedTotal.toFixed(2)}.`,
    );
  }

  if (unresolvedDefaults.length !== 2) {
    throw new Error(`Esperaba 2 fallas pendientes; encontré ${unresolvedDefaults.length}.`);
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
      amountReceived: TOTAL_AMOUNT,
      penaltyChargeIds: [],
      notes: 'AJUSTE CONTROLADO GLORIA 2024-09-23: 500 recuperado + 250 semana extra',
    },
    fallbackUserId,
  );

  if (!paymentResult.id || paymentResult.duplicateSkipped) {
    throw new Error(paymentResult.duplicateReason || 'El pago no se pudo registrar.');
  }

  const { start, end } = toDayRange(TARGET_DATE);
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
        where: { installmentNumber: { in: unresolvedDefaults.map((item) => item.schedule.installmentNumber) } },
        orderBy: { installmentNumber: 'asc' },
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
        where: { id: { in: unresolvedDefaults.map((item) => item.id) } },
        orderBy: { createdAt: 'asc' },
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
        targetDefaults: unresolvedDefaults.map((item) => ({
          defaultEventId: item.id,
          installmentNumber: item.schedule.installmentNumber,
          dueDate: item.schedule.dueDate.toISOString().slice(0, 10),
          pending: item.pending,
        })),
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
